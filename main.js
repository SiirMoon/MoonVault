const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

const store = new Store({
  defaults: {
    videoDownloadPath: app.getPath('videos'),
    audioDownloadPath: app.getPath('music'),
    cookiesFile: '',
    cookiesFromBrowser: '',
    maxConcurrent: 2,
    preferredVideoFormat: 'mp4',
    preferredAudioFormat: 'mp3',
    saveHistory: true,
    theme: 'dark',
    persistedQueue: [],
  },
});

const activeDownloads = new Map();
const downloadPercents = new Map();
let activeAnalyzeProc = null;
let activePlaylistProc = null;

let mainWindow;
const isDev = process.argv.includes('--dev');
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

function killProcess(proc) {
  if (!proc) return;
  try {
    if (isWin) {
      spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { detached: true, stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  } catch {}
}


function ensureExecutable(p) {
  if (isWin) return;
  try { fs.chmodSync(p, 0o755); } catch {}
}

function resolveBinary(name) {
  const exe = isWin ? `${name}.exe` : name;
  const candidates = [
    path.join(process.resourcesPath, 'bin', exe),
    path.join(process.resourcesPath, 'bin', name),
    path.join(__dirname, 'bin', exe),
    path.join(__dirname, 'bin', name),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) { ensureExecutable(p); return p; } } catch {}
  }
  return null;
}

function getYtDlpPath() {
  const bundled = resolveBinary('yt-dlp');
  if (bundled) return bundled;
  const systemPaths = isWin
    ? []
    : ['/usr/bin/yt-dlp', '/usr/local/bin/yt-dlp', '/opt/homebrew/bin/yt-dlp', '/snap/bin/yt-dlp', `${process.env.HOME}/.local/bin/yt-dlp`];
  for (const p of systemPaths) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'yt-dlp';
}

function getFfmpegPath() {
  const bundled = resolveBinary('ffmpeg');
  if (bundled) return bundled;
  const systemPaths = isWin
    ? []
    : ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/snap/bin/ffmpeg', '/var/lib/flatpak/exports/bin/ffmpeg'];
  for (const p of systemPaths) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'ffmpeg';
}

function updateTaskbarProgress() {
  if (!mainWindow) return;
  if (downloadPercents.size === 0) { mainWindow.setProgressBar(-1); return; }
  const avg = [...downloadPercents.values()].reduce((s, v) => s + v, 0) / downloadPercents.size;
  mainWindow.setProgressBar(avg / 100);
}

function buildCookieArgs(settings, overrideFile, overrideBrowser) {
  const file = overrideFile || settings.cookiesFile;
  if (file) { try { if (fs.existsSync(file)) return ['--cookies', file]; } catch {} }
  const browser = overrideBrowser || settings.cookiesFromBrowser;
  if (browser) return ['--cookies-from-browser', browser];
  return [];
}

function buildYouTubeArgs(url) {
  return /youtube\.com|youtu\.be/.test(url)
    ? ['--extractor-args', 'youtube:player_client=web,default']
    : [];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 750, minWidth: 800, minHeight: 600,
    frame: false, titleBarStyle: 'hidden',
    backgroundColor: '#0a0d16',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  if (!isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const ctrl = input.control || input.meta;
      if (
        (ctrl && input.shift && ['i', 'j', 'c'].includes(input.key.toLowerCase())) ||
        (ctrl && input.key.toLowerCase() === 'u') ||
        input.key === 'F12'
      ) event.preventDefault();
    });

    mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools());
  }

  setupAutoUpdater();

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('close', (e) => {
    if (activeDownloads.size === 0) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Sair mesmo assim', 'Cancelar'],
      defaultId: 1, cancelId: 1,
      title: 'Downloads em andamento',
      message: `Há ${activeDownloads.size} download(s) em andamento.`,
      detail: 'Se sair agora os downloads serão interrompidos e os arquivos parciais serão perdidos.',
    });
    if (choice === 0) {
      for (const [, proc] of activeDownloads) killProcess(proc);
      activeDownloads.clear();
      mainWindow.destroy();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}
app.setAppUserModelId('MoonVault');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

function setupAutoUpdater() {
if (!app.isPackaged) {
  ipcMain.handle('check-for-updates', () => ({ success: false, error: 'dev mode' }));
  return;
}

  autoUpdater.logger = require('electron-log');
  autoUpdater.logger.transports.file.level = 'info';
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const stripHtml = (s) => typeof s === 'string' ? s.replace(/<[^>]*>/g, '').trim() : '';
  const getNotes = (info) => {
    if (!info.releaseNotes) return '';
    return typeof info.releaseNotes === 'string'
      ? stripHtml(info.releaseNotes)
      : info.releaseNotes.map?.((n) => n.note).join('\n');
  };
  const broadcast = (status, extras = {}) =>
    mainWindow?.webContents.send('updater-status', { status, ...extras });

  autoUpdater.on('checking-for-update', () => { broadcast('checking'); });
  autoUpdater.on('update-not-available', (i) => { broadcast('not-available', { version: i.version }); });
  autoUpdater.on('error', (err) => { broadcast('error', { message: err.message }); });

  autoUpdater.on('update-available', (info) => {
    const notes = getNotes(info);
    broadcast('available', { version: info.version, notes });
  });

  autoUpdater.on('download-progress', (p) => {
    broadcast('downloading', { percent: Math.round(p.percent), speed: p.bytesPerSecond });
  });

  autoUpdater.on('update-downloaded', (info) => {
    const notes = getNotes(info);
    broadcast('downloaded', { version: info.version, notes });
  });

  ipcMain.handle('check-for-updates', async () => {
    try { await autoUpdater.checkForUpdates(); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  ipcMain.handle('updater-confirm-download', () => {
    broadcast('downloading', { percent: 0 });
    autoUpdater.downloadUpdate().catch((err) => broadcast('error', { message: err.message }));
  });

  ipcMain.handle('updater-confirm-install', () => {
    autoUpdater.quitAndInstall();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => autoUpdater.checkForUpdates().catch((err) => {
      console.error('updater startup check failed', err.message);
    }), 3000);
  });
}

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.handle('get-settings', () => store.store);
ipcMain.handle('save-settings', (_, s) => {
  Object.entries(s).forEach(([k, v]) => store.set(k, v));
  return { success: true };
});
ipcMain.handle('select-folder', async (_, key) => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: 'Selecionar Pasta de Download' });
  if (r.canceled || !r.filePaths[0]) return null;
  store.set(key, r.filePaths[0]);
  return r.filePaths[0];
});
ipcMain.handle('select-folder-temp', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: 'Pasta para este download (não altera o padrão)' });
  return (!r.canceled && r.filePaths[0]) ? r.filePaths[0] : null;
});
ipcMain.handle('select-cookies-file', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], title: 'Selecionar cookies.txt', filters: [{ name: 'Text Files', extensions: ['txt'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  store.set('cookiesFile', r.filePaths[0]);
  return r.filePaths[0];
});
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('open-folder', (_, p) => shell.openPath(p));
ipcMain.handle('open-file', (_, p) => shell.openPath(p));
ipcMain.handle('open-url', async (_, url) => { if (/^https?:/i.test(url)) await shell.openExternal(url); });

ipcMain.handle('get-disk-space', async (_, folderPath) => {
  const stat = async (p) => {
    const s = await fs.promises.statfs(p);
    return { free: s.bfree * s.bsize, total: s.blocks * s.bsize, available: s.bavail * s.bsize };
  };
  try { return await stat(folderPath); }
  catch { try { return await stat(isWin ? folderPath.slice(0, 3) : '/'); } catch { return { free: null, total: null, available: null }; } }
});
ipcMain.handle('save-queue', (_, items) => {
  try { store.set('persistedQueue', items); return { success: true }; }
  catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('load-queue', () => {
  try { return store.get('persistedQueue', []); } catch { return []; }
});

ipcMain.handle('load-history', () => {
  return store.get('history', []);
});

ipcMain.handle('save-history', (_, items) => {
  store.set('history', Array.isArray(items) ? items.slice(0, 100) : []);
  return true;
});

ipcMain.handle('show-confirm', async (event, opts) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    title: opts.title || 'Confirmar',
    message: opts.message || 'Tem certeza?',
    detail: opts.detail || '',
    buttons: opts.buttons || ['OK', 'Cancelar'],
    defaultId: opts.defaultId ?? 0,
    cancelId: opts.cancelId ?? 1,
    noLink: true,
  });
  return result.response === (opts.defaultId ?? 0);
});

ipcMain.handle('cancel-analyze', () => {
  if (activeAnalyzeProc) { killProcess(activeAnalyzeProc); activeAnalyzeProc = null; }
  if (activePlaylistProc) { killProcess(activePlaylistProc); activePlaylistProc = null; }
  return { success: true };
});

ipcMain.handle('analyze-url', async (_, url) => {
  if (activeAnalyzeProc) { killProcess(activeAnalyzeProc); activeAnalyzeProc = null; }

  return new Promise((resolve) => {
    const args = ['--dump-json', '--no-warnings', '--no-playlist', ...buildYouTubeArgs(url), ...buildCookieArgs(store.store, '', ''), url];
    let stdout = '', stderr = '';

    const proc = spawn(getYtDlpPath(), args, { env: { ...process.env } });
    activeAnalyzeProc = proc;

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('close', (code) => {
      if (activeAnalyzeProc === proc) activeAnalyzeProc = null;
      if (code !== 0) {
        resolve({ success: false, error: stderr || 'Failed to analyze URL', isPlaylist: /\?list=/.test(url) });
        return;
      }
      try {
        const info = JSON.parse(stdout.trim().split('\n').filter(Boolean)[0]);
        const isPlaylist = info._type === 'playlist' || /\?list=/.test(url) || /playlist/.test(url);
        if (info._type === 'playlist') {
          resolve({ success: true, isPlaylist: true, playlistTitle: info.title, playlistCount: info.entries?.length });
        } else {
          resolve({ success: true, info, isPlaylist });
        }
      } catch {
        resolve({ success: false, error: 'Failed to parse video information' });
      }
    });

    proc.on('error', (err) => {
      if (activeAnalyzeProc === proc) activeAnalyzeProc = null;
      resolve({ success: false, error: `yt-dlp not found: ${err.message}` });
    });
  });
});

ipcMain.handle('analyze-playlist', async (_, url) => {
  if (activePlaylistProc) { killProcess(activePlaylistProc); activePlaylistProc = null; }

  return new Promise((resolve) => {
    const args = ['--flat-playlist', '--dump-json', '--no-warnings', '--yes-playlist', ...buildYouTubeArgs(url), ...buildCookieArgs(store.store, '', ''), url];
    const proc = spawn(getYtDlpPath(), args, { env: { ...process.env } });
    activePlaylistProc = proc;
    const entries = [];
    let lineBuffer = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const e = JSON.parse(trimmed);
          entries.push({
            title: e.title || e.id || 'Sem título',
            url: e.url || e.webpage_url || e.original_url,
            thumbnail: e.thumbnail || e.thumbnails?.[0]?.url || null,
            duration: e.duration || null,
            id: e.id,
          });
        } catch {
        }
      }
    });

    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('close', (code) => {
      if (activePlaylistProc === proc) activePlaylistProc = null;
      if (lineBuffer.trim()) {
        try {
          const e = JSON.parse(lineBuffer.trim());
          entries.push({
            title: e.title || e.id || 'Sem título',
            url: e.url || e.webpage_url || e.original_url,
            thumbnail: e.thumbnail || e.thumbnails?.[0]?.url || null,
            duration: e.duration || null,
            id: e.id,
          });
        } catch {}
      }

      if (code !== 0 && entries.length === 0) {
        resolve({ success: false, error: stderr || 'Failed to analyze playlist' });
        return;
      }
      resolve({ success: true, entries });
    });

    proc.on('error', (err) => {
      if (activePlaylistProc === proc) activePlaylistProc = null;
      resolve({ success: false, error: err.message });
    });
  });
});

function classifyError(stderr, code, stalled) {
  if (stalled)
    return 'O download travou — sem progresso por mais de 60 segundos. Verifique sua conexão ou tente novamente.';

  const s = stderr.toLowerCase();

  if (/unrecognized arguments|invalid option|no such option|error: option/.test(s))
    return 'Comando inválido nos campos avançados. Verifique os argumentos inseridos e tente novamente.';

  if (/invalid time|invalid section|unable to download/.test(s) && code !== 0)
    return 'O tempo de recorte especificado é inválido ou está fora da duração do vídeo.';

  if (/fragment.*not found|incomplete.*download|requested format.*not available/.test(s))
    return 'O download foi interrompido antes de terminar — o arquivo pode estar incompleto.';

  if (/codec not currently supported|unknown encoder|invalid codec/.test(s))
    return 'O codec especificado não é suportado pelo ffmpeg instalado.';

  if (/sign in|login required|private video|age.restrict|members.only/.test(s))
    return 'Este vídeo requer autenticação. Configure cookies nas Configurações.';

  if (/not available in your country|geo.?block|region.?restrict/.test(s))
    return 'Este conteúdo não está disponível na sua região.';

  if (/too many requests|429|rate.?limit/.test(s))
    return 'Limite de requisições atingido. Aguarde alguns minutos e tente novamente.';

  if (/unable to connect|connection reset|timed? out|network.*error|no route to host/.test(s))
    return 'Erro de rede. Verifique sua conexão com a internet.';

  if (/no video formats found|no matching formats/.test(s))
    return 'Nenhum formato de vídeo compatível foi encontrado para este link.';

  if (code === 1)
    return 'O download falhou. Abra o Console para detalhes.';

  return null; 
}

function sendLog(downloadId, text, type = 'info') {
  if (!text.trim()) return;
  mainWindow?.webContents.send('console-log', { id: downloadId, text: text.trim(), type, ts: Date.now() });
}

function trimWithFfmpeg({ inputFile, start, end, fast, downloadId }) {
  return new Promise((resolve) => {
    const ext  = path.extname(inputFile);
    const base = inputFile.slice(0, -ext.length);
    const tmp  = `${base}__trim${ext}`;
    const ffArgs = [];
    if (fast) {
      if (start) ffArgs.push('-ss', start);
      if (end && end !== 'inf') ffArgs.push('-to', end);
      ffArgs.push('-i', inputFile, '-c', 'copy', '-y', tmp);
    } else {
      ffArgs.push('-i', inputFile);
      if (start) ffArgs.push('-ss', start);
      if (end && end !== 'inf') ffArgs.push('-to', end);
      const vCodec = 'libx264';
      ffArgs.push('-c:v', vCodec, '-c:a', 'copy', '-y', tmp);
    }

    sendLog(downloadId, `✂ ffmpeg ${ffArgs.join(' ')}`, 'cmd');

    const proc = spawn(getFfmpegPath(), ffArgs, { env: { ...process.env } });

    proc.stderr.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (line.trim()) sendLog(downloadId, line, 'stderr');
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          fs.renameSync(tmp, inputFile);
        } catch {
          try { fs.copyFileSync(tmp, inputFile); fs.unlinkSync(tmp); } catch {}
        }
        resolve({ success: true });
      } else {
        try { fs.unlinkSync(tmp); } catch {}
        resolve({ success: false, error: `ffmpeg saiu com código ${code}` });
      }
    });

    proc.on('error', (err) => {
      try { fs.unlinkSync(tmp); } catch {}
      resolve({ success: false, error: err.message });
    });
  });
}

ipcMain.handle('start-download', async (_, opts) => {
  const {
    url, formatId, isAudioOnly, audioFormat, videoFormat, downloadId,
    embedChapters, embedSubs, subLangs, saveThumbnail, saveDescription,
    cookiesFile, cookiesFromBrowser, outputDirOverride, customFilename, noOverwrites,
    advDlSubs, advSubsLangs,
    startTimestamp, endTimestamp, fastTrim,
    extraArgs,
  } = opts;

  const settings = store.store;
  const ffmpeg = getFfmpegPath();
  const outputDir = outputDirOverride?.trim()
    ? outputDirOverride
    : (isAudioOnly ? settings.audioDownloadPath : settings.videoDownloadPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const outName = customFilename?.trim() ? `${customFilename.trim()}.%(ext)s` : '%(title)s.%(ext)s';
  const isTrimmed = !!(startTimestamp || endTimestamp);
  const args = isTrimmed
    ? ['--newline', '--progress', '--ffmpeg-location', ffmpeg, '-o', path.join(outputDir, outName), '--no-part']
    : ['--newline', '--progress', '--ffmpeg-location', ffmpeg, '-o', path.join(outputDir, outName), '--no-part', '--continue'];

  if (noOverwrites) args.push('--no-overwrites');
  args.push(...buildYouTubeArgs(url));

  const isYT = /youtube\.com|youtu\.be/.test(url);
  const noHls = isYT ? '[protocol!=m3u8][protocol!=m3u8_native]' : '';
  const outFmt = (videoFormat || 'mp4').toLowerCase();

  if (isAudioOnly) {
    const fmt = formatId
      ? `${formatId}+bestaudio[ext=m4a]${noHls}/bestaudio${noHls}/bestaudio/best`
      : `bestaudio[ext=m4a]${noHls}/bestaudio${noHls}/bestaudio/best`;
    args.push('-f', fmt, '-x', '--audio-format', audioFormat || 'mp3', '--audio-quality', '0', '--no-keep-video');
  } else {
    let fmt;
    if (formatId) {
      fmt = `${formatId}+bestaudio[ext=m4a]${noHls}/${formatId}+bestaudio/best`;
    } else if (outFmt === 'mp4') {
      fmt = `bestvideo[ext=mp4]${noHls}+bestaudio[ext=m4a]${noHls}/bestvideo+bestaudio/best`;
    } else if (outFmt === 'webm') {
      fmt = `bestvideo[ext=webm]${noHls}+bestaudio[ext=webm]/bestvideo+bestaudio/best`;
    } else {
      fmt = `bestvideo${noHls}+bestaudio/bestvideo+bestaudio/best`;
    }
    args.push('-f', fmt, '--merge-output-format', outFmt);
  }

  if (embedChapters) args.push('--embed-chapters');
  if (embedSubs && subLangs?.length) args.push('--write-subs', '--embed-subs', '--sub-langs', subLangs.join(','));
  if (saveThumbnail) args.push('--write-thumbnail', '--embed-thumbnail', '--convert-thumbnails', 'jpg');
  if (saveDescription) args.push('--write-description');

  if (advDlSubs) {
    const langs = (advSubsLangs || 'all').trim() || 'all';
    args.push(
      '--write-subs', '--embed-subs', '--sub-langs', langs,
      '--ignore-errors', '--no-abort-on-unavailable-fragment'
    );
  }

  if (Array.isArray(extraArgs) && extraArgs.length) {
    const safe = extraArgs.filter((a) => a && !a.match(/^https?:\/\//i));
    args.push(...safe);
  }

  args.push(...buildCookieArgs(settings, cookiesFile, cookiesFromBrowser));
  args.push(url);

  sendLog(downloadId, `yt-dlp ${args.join(' ')}`, 'cmd');

  return new Promise((resolve) => {
    const proc = spawn(getYtDlpPath(), args, { env: { ...process.env } });
    activeDownloads.set(downloadId, proc);
    downloadPercents.set(downloadId, 0);

    let lastProgressAt = Date.now();
    let stalled = false;
    const stallTimer = setInterval(() => {
      const dl = downloadPercents.get(downloadId);
      if (dl != null && dl > 0 && dl < 100) {
        if (Date.now() - lastProgressAt > 60_000) {
          stalled = true;
          sendLog(downloadId, '⚠ Sem progresso há 60 s — download pode estar travado.', 'warn');
          mainWindow?.webContents.send('download-progress', { id: downloadId, status: 'stalled' });
        }
      }
    }, 10_000);

    const stderrLines = [];
    let finalOutputFile = null; 

    proc.stdout.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (!line.trim()) continue;
        sendLog(downloadId, line, 'stdout');
        const m = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\S+)\s+at\s+([\d.]+\S+)\s+ETA\s+(\S+)/);
        if (m) {
          const pct = parseFloat(m[1]);
          downloadPercents.set(downloadId, pct);
          lastProgressAt = Date.now();
          stalled = false;
          mainWindow?.webContents.send('download-progress', { id: downloadId, percent: pct, size: m[2], speed: m[3], eta: m[4] });
          updateTaskbarProgress();
        }
        const done = line.match(/\[download\]\s+100%\s+of\s+~?([\d.]+\S+)/);
        if (done) mainWindow?.webContents.send('download-progress', { id: downloadId, percent: 100, size: done[1], speed: '--', eta: '00:00' });

        const dest = line.match(/\[download\] Destination: (.+)/);
        if (dest) {
          finalOutputFile = dest[1].trim();
          mainWindow?.webContents.send('download-progress', { id: downloadId, file: finalOutputFile });
        }

        const merger  = line.match(/\[Merger\] Merging formats into "(.+)"/);
        if (merger)  finalOutputFile = merger[1].trim();
        const extract = line.match(/\[ExtractAudio\] Destination: (.+)/);
        if (extract) finalOutputFile = extract[1].trim();

        if (line.includes('[Merger]') || line.includes('[ExtractAudio]') || line.includes('[ffmpeg]'))
          mainWindow?.webContents.send('download-progress', { id: downloadId, status: 'processing' });
      }
    });

    proc.stderr.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (!line.trim()) continue;
        sendLog(downloadId, line, 'stderr');
        mainWindow?.webContents.send('download-error', { id: downloadId, message: line });
        stderrLines.push(line);
        if (stderrLines.length > 80) stderrLines.shift();
      }
    });

    const cleanup = () => {
      clearInterval(stallTimer);
      activeDownloads.delete(downloadId);
      downloadPercents.delete(downloadId);
      updateTaskbarProgress();
    };

    proc.on('close', async (code) => {
      cleanup();
      if (code === null) {
        sendLog(downloadId, 'Download cancelado pelo usuário', 'warn');
        resolve({ success: false, cancelled: true });
        return;
      }
      if (code !== 0) {
        const stderrFull = stderrLines.join('\n');
        const reason = classifyError(stderrFull, code, stalled) ||
          'O download falhou. Abra o Console para detalhes completos.';
        sendLog(downloadId, `✗ ${reason}`, 'error');
        mainWindow?.webContents.send('download-failed', { id: downloadId, code, reason });
        resolve({ success: false, error: reason });
        return;
      }
      sendLog(downloadId, '✓ Download concluído', 'success');

      if (isTrimmed && finalOutputFile) {
        if (!fs.existsSync(finalOutputFile)) {
          sendLog(downloadId, `⚠ Arquivo não encontrado para recorte: ${finalOutputFile}`, 'warn');
        } else {
          mainWindow?.webContents.send('download-progress', { id: downloadId, status: 'trimming' });
          sendLog(downloadId, '✂ Recortando arquivo...', 'info');

          const trimResult = await trimWithFfmpeg({
            inputFile: finalOutputFile,
            start: startTimestamp || null,
            end:   endTimestamp   || null,
            fast:  !!fastTrim,
            downloadId,
          });

          if (trimResult.success) {
            sendLog(downloadId, '✓ Recorte concluído', 'success');
          } else {
            sendLog(downloadId, `⚠ Recorte falhou: ${trimResult.error}`, 'warn');
          }
        }
      }

      mainWindow?.webContents.send('download-complete', { id: downloadId });
      resolve({ success: true });
    });

    proc.on('error', (err) => {
      cleanup();
      const reason = `Não foi possível iniciar o yt-dlp: ${err.message}`;
      sendLog(downloadId, reason, 'error');
      mainWindow?.webContents.send('download-failed', { id: downloadId, code: -1, reason });
      resolve({ success: false, error: reason });
    });
  });
});

ipcMain.handle('cancel-download', (_, id) => {
  const proc = activeDownloads.get(id);
  if (!proc) return { success: false, error: 'not found' };
  killProcess(proc);
  activeDownloads.delete(id);
  downloadPercents.delete(id);
  updateTaskbarProgress();
  return { success: true };
});

ipcMain.handle('check-ytdlp', () =>
  new Promise((resolve) => {
    const proc = spawn(getYtDlpPath(), ['--version']);
    let version = '';
    proc.stdout.on('data', (d) => { version += d.toString().trim(); });
    proc.on('close', (code) => resolve(code === 0 ? { installed: true, version } : { installed: false }));
    proc.on('error', () => resolve({ installed: false }));
  })
);

ipcMain.handle('update-ytdlp', () =>
  new Promise((resolve) => {
    const proc = spawn(getYtDlpPath(), ['-U'], { env: { ...process.env } });
    let output = '';
    const relay = (d) => {
      output += d;
      mainWindow?.webContents.send('ytdlp-update-log', d.toString());
    };
    proc.stdout.on('data', relay);
    proc.stderr.on('data', relay);
    proc.on('close', (code) => resolve({ success: code === 0, output }));
    proc.on('error', (err) => resolve({ success: false, error: err.message }));
  })
);