const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const { spawn } = require('child_process');
const Store  = require('electron-store');
const { autoUpdater } = require('electron-updater');
const store = new Store({
  defaults: {
    videoDownloadPath:    app.getPath('videos'),
    audioDownloadPath:    app.getPath('music'),
    cookiesFile:          '',
    cookiesFromBrowser:   '',
    maxConcurrent:        2,
    preferredVideoFormat: 'mp4',
    preferredAudioFormat: 'mp3',
    saveHistory:          true,
    theme:                'dark',
    persistedQueue:       []
  }
});

// "child processes" ativos do yt-dlp, indexados pelo ID do download.
// usado para cancelamento e para rastrear o progresso na barra de tarefas.
const activeDownloads  = new Map(); // id → ChildProcess
const downloadPercents = new Map(); // id → 0..100

let mainWindow;
const isDev   = process.argv.includes('--dev');
const isWin   = process.platform === 'win32';
const isLinux = process.platform === 'linux';

// resolução dos binários
// ordem: pasta bin/ empacotada → caminhos conhecidos do sistema → fallback via PATH

function ensureExecutable(p) {
  // chmod +x após a extração para que o sistema operacional realmente consiga executar o arquivo.
  if (isWin) return;
  try { fs.chmodSync(p, 0o755); } catch {}
}

function resolveBinary(name) {
  const exe = isWin ? `${name}.exe` : name;
  const candidates = [
    path.join(process.resourcesPath, 'bin', exe),
    path.join(process.resourcesPath, 'bin', name),
    path.join(__dirname, 'bin', exe),
    path.join(__dirname, 'bin', name)
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) { ensureExecutable(p); return p; }
    } catch {}
  }
  return null;
}

function getYtDlpPath() {
  const bundled = resolveBinary('yt-dlp');
  if (bundled) return bundled;

  // o sandbox do Electron no Linux pode não herdar o PATH do usuário,
  // então o programa verifica explicitamente os locais de instalação mais comuns, espero não dar problema, necessário mais testes no Linux.
  const systemPaths = isWin ? [] : [
    '/usr/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/opt/homebrew/bin/yt-dlp',
    '/snap/bin/yt-dlp',
    `${process.env.HOME}/.local/bin/yt-dlp`
  ];
  for (const p of systemPaths) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'yt-dlp';
}

function getFfmpegPath() {
  const bundled = resolveBinary('ffmpeg');
  if (bundled) return bundled;

  const systemPaths = isWin ? [] : [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/snap/bin/ffmpeg',
    '/var/lib/flatpak/exports/bin/ffmpeg'
  ];
  for (const p of systemPaths) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'ffmpeg';
}


// progresso na barra de tarefas
// mostra no ícone do app a média de conclusão de todos os downloads em andamento.

function updateTaskbarProgress() {
  if (!mainWindow) return;
  if (downloadPercents.size === 0) { mainWindow.setProgressBar(-1); return; }
  const avg = [...downloadPercents.values()].reduce((s, v) => s + v, 0) / downloadPercents.size;
  mainWindow.setProgressBar(avg / 100);
}


// funções auxiliares usadas tanto pelos handlers de análise quanto pelos de download.

function buildCookieArgs(settings, overrideFile, overrideBrowser) {
  const file = overrideFile || settings.cookiesFile;
  if (file && fs.existsSync(file)) return ['--cookies', file];
  const browser = overrideBrowser || settings.cookiesFromBrowser;
  if (browser) return ['--cookies-from-browser', browser];
  return [];
}

// o YouTube precisa de um client específico para contornar o desafio de assinatura em JS.
function buildYouTubeArgs(url) {
  return /youtube\.com|youtu\.be/.test(url)
    ? ['--extractor-args', 'youtube:player_client=tv_embedded,web,default']
    : [];
}



// Window

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 750,
    minWidth: 800, minHeight: 600,
    frame: false, titleBarStyle: 'hidden',
    backgroundColor: '#0a0d16',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

// qualquer tentativa por parte do user de abrir uma nova janela (clique do meio, window.open, links com _blank)
// é interceptada aqui. Em vez de permitir que o Electron crie uma nova "BrowserWindow",
// redirecionamos a URL para o navegador padrão do sistema, afinal, este não é um projeto de browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && /^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };  // << negando sempre, sem abrir uma exceção.
  });

// também impede que a janela principal navegue para fora do arquivo local.
// isso cobre casos extremos, como arrastar uma URL para dentro da janela.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const ctrl = input.control || input.meta;
    if (
      (ctrl && input.shift && 'ijc'.includes(input.key.toLowerCase())) ||
      (ctrl && input.key.toLowerCase() === 'u') ||
      input.key === 'F12'
    ) event.preventDefault();
  });
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });

  setupAutoUpdater();

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  // aviso ao tentar fechar a janela com um download acontecendo
  mainWindow.on('close', (e) => {
    if (activeDownloads.size === 0) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Sair mesmo assim', 'Cancelar'],
      defaultId: 1, cancelId: 1,
      title: 'Downloads em andamento',
      message: `Há ${activeDownloads.size} download(s) em andamento.`,
      detail: 'Se sair agora os downloads serão interrompidos e os arquivos parciais serão perdidos.'
    });
    if (choice === 0) {
      for (const [, proc] of activeDownloads) try { proc.kill('SIGTERM'); } catch {}
      activeDownloads.clear();
      mainWindow.destroy();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.setAppUserModelId('MoonVault');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (!isWin && process.platform !== 'darwin') app.quit(); if (isWin) app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });


// Atualização
// como funciona > // Verifica as Releases do GitHub na inicialização. Nunca baixa automaticamente — sempre pergunta antes.

function setupAutoUpdater() {
  if (!app.isPackaged) {
    // para que o botão não gere erros.
    ipcMain.handle('check-for-updates', () => ({ success: false, error: 'dev mode' }));
    return;
  }

  autoUpdater.logger = require('electron-log');
  autoUpdater.logger.transports.file.level = 'info';
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const iconPath = path.join(__dirname, 'renderer', 'assets', 'icon.png');
  const stripHtml = (s) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, '').trim() : '');
  const getNotes = (info) => {
    if (!info.releaseNotes) return '';
    return typeof info.releaseNotes === 'string'
      ? stripHtml(info.releaseNotes)
      : (info.releaseNotes.map?.(n => n.note).join('\n') || '');
  };
  const broadcast = (status, payload = {}) =>
    mainWindow?.webContents.send('updater-status', { status, ...payload });

  autoUpdater.on('checking-for-update', () => { console.log('[updater] checking'); broadcast('checking'); });
  autoUpdater.on('update-not-available', (i) => { console.log(`[updater] up to date (${i.version})`); broadcast('not-available', { version: i.version }); });
  autoUpdater.on('error', (err) => { console.error('[updater]', err.message); broadcast('error', { message: err.message }); });

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] new version: ${info.version}`);
    broadcast('available', { version: info.version });
    const notes = getNotes(info);
    dialog.showMessageBox(mainWindow, {
      type: 'info', title: 'Atualização disponível',
      message: `MoonVault ${info.version} está disponível.`,
      detail: notes ? `O que há de novo:\n${notes}\n\nDeseja baixar e instalar agora?` : 'Deseja baixar e instalar a atualização agora?',
      buttons: ['Baixar e instalar', 'Agora não'],
      defaultId: 0, cancelId: 1, icon: iconPath
    }).then(({ response }) => {
      if (response === 0) { broadcast('downloading', { percent: 0 }); autoUpdater.downloadUpdate(); }
      else broadcast('idle');
    }).catch(() => broadcast('idle'));
  });

  autoUpdater.on('download-progress', (p) => {
    const pct = Math.round(p.percent);
    console.log(`[updater] ${pct}%`);
    broadcast('downloading', { percent: pct, speed: p.bytesPerSecond });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] ready: ${info.version}`);
    broadcast('downloaded', { version: info.version });
    const notes = getNotes(info);
    dialog.showMessageBox(mainWindow, {
      type: 'info', title: 'Pronto para instalar',
      message: `MoonVault ${info.version} foi baixado.`,
      detail: notes ? `O que há de novo:\n${notes}\n\nReinicie o app para instalar.` : 'Reinicie agora para instalar a atualização.',
      buttons: ['Reiniciar e instalar', 'Instalar depois'],
      defaultId: 0, cancelId: 1, icon: iconPath
    }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall(); }).catch(() => {});
  });

  ipcMain.handle('check-for-updates', async () => {
    try { await autoUpdater.checkForUpdates(); return { success: true }; }
    catch (err) { return { success: false, error: err.message }; }
  });

  // Verificação passiva na inicialização, espera 3s para que a UI esteja totalmente visível primeiro; você também pode tirar isso se preferir, mas não recomendo.
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => console.error('[updater] startup check failed:', err.message));
    }, 3000);
  });
}


ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('window-close',    () => mainWindow?.close());


ipcMain.handle('get-settings',  () => store.store);
ipcMain.handle('save-settings', (_, s) => { Object.entries(s).forEach(([k, v]) => store.set(k, v)); return { success: true }; });

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
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'], title: 'Selecionar cookies.txt',
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  store.set('cookiesFile', r.filePaths[0]);
  return r.filePaths[0];
});

ipcMain.handle('get-app-version',   () => app.getVersion());
ipcMain.handle('open-folder', (_, p) => shell.openPath(p));
ipcMain.handle('open-file',   (_, p) => shell.openPath(p));

ipcMain.handle('open-url', async (_, url) => {
  if (url && /^https?:\/\//i.test(url)) await shell.openExternal(url);
});

ipcMain.handle('clear-history-storage', async () => {
  try {
    await mainWindow.webContents.session.clearStorageData({ storages: ['localstorage', 'indexeddb'] });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('get-disk-space', async (_, folderPath) => {
  const stat = async (p) => {
    const s = await fs.promises.statfs(p);
    return { free: s.bfree * s.bsize, total: s.blocks * s.bsize, available: s.bavail * s.bsize };
  };
  try { return await stat(folderPath); }
  catch {
    try { return await stat(isWin ? (folderPath.slice(0, 3) || 'C:\\') : '/'); }
    catch { return { free: null, total: null, available: null }; }
  }
});

ipcMain.handle('save-queue', (_, items) => {
  try { store.set('persistedQueue', items); return { success: true }; }
  catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('load-queue', () => {
  try { return store.get('persistedQueue', []); }
  catch { return []; }
});


ipcMain.handle('analyze-url', async (_, url) => {
  return new Promise((resolve) => {
    const args = [
      '--dump-json', '--no-warnings', '--no-playlist',
      ...buildYouTubeArgs(url),
      ...buildCookieArgs(store.store),
      url
    ];
    let stdout = '', stderr = '';
    const proc = spawn(getYtDlpPath(), args, { env: { ...process.env } });
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', (code) => {
      if (code !== 0) { resolve({ success: false, error: stderr || 'Failed to analyze URL', isPlaylist: /[?&]list=/.test(url) }); return; }
      try {
        const info = JSON.parse(stdout.trim().split('\n').filter(Boolean)[0]);
        const isPlaylist = info._type === 'playlist' || /[?&]list=/.test(url) || /\/playlist\?/.test(url);
        if (info._type === 'playlist') resolve({ success: true, isPlaylist: true, playlistTitle: info.title, playlistCount: info.entries?.length });
        else resolve({ success: true, info, isPlaylist });
      } catch { resolve({ success: false, error: 'Failed to parse video information' }); }
    });
    proc.on('error', err => resolve({ success: false, error: `yt-dlp not found: ${err.message}` }));
  });
});

ipcMain.handle('analyze-playlist', async (_, url) => {
  return new Promise((resolve) => {
    const args = [
      '--flat-playlist', '--dump-json', '--no-warnings', '--yes-playlist',
      ...buildYouTubeArgs(url),
      ...buildCookieArgs(store.store),
      url
    ];
    let stdout = '', stderr = '';
    const proc = spawn(getYtDlpPath(), args, { env: { ...process.env } });
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', (code) => {
      if (code !== 0) { resolve({ success: false, error: stderr || 'Failed to analyze playlist' }); return; }
      try {
        const entries = stdout.trim().split('\n').filter(Boolean)
          .map(line => { try { return JSON.parse(line); } catch { return null; } })
          .filter(Boolean)
          .map(e => ({
            title:     e.title || e.id || 'Sem título',
            url:       e.url || e.webpage_url || e.original_url,
            thumbnail: e.thumbnail || e.thumbnails?.[0]?.url || null,
            duration:  e.duration || null,
            id:        e.id
          }));
        resolve({ success: true, entries });
      } catch { resolve({ success: false, error: 'Failed to parse playlist' }); }
    });
    proc.on('error', err => resolve({ success: false, error: err.message }));
  });
});


function sendLog(downloadId, text, type = 'info') {
  if (!text.trim()) return;
  mainWindow?.webContents.send('console-log', { id: downloadId, text: text.trim(), type, ts: Date.now() });
}

ipcMain.handle('start-download', async (_, opts) => {
  const {
    url, formatId, isAudioOnly, audioFormat, videoFormat, downloadId,
    embedChapters, embedSubs, subLangs, saveThumbnail, saveDescription,
    cookiesFile, cookiesFromBrowser, outputDirOverride, customFilename, noOverwrites
  } = opts;

  const settings = store.store;
  const ffmpeg   = getFfmpegPath();
  const outputDir = (outputDirOverride?.trim())
    ? outputDirOverride
    : (isAudioOnly ? settings.audioDownloadPath : settings.videoDownloadPath);

  fs.mkdirSync(outputDir, { recursive: true });

  const outName = customFilename?.trim() ? `${customFilename.trim()}.%(ext)s` : '%(title)s.%(ext)s';

  const args = [
    '--newline', '--progress',
    '--ffmpeg-location', ffmpeg,
    '-o', path.join(outputDir, outName),
    '--no-part', '--continue'
  ];

  if (noOverwrites) args.push('--no-overwrites');
  args.push(...buildYouTubeArgs(url));

  // Para MP4, preferência a H.264 + AAC 
  // VP9/Opus dentro de .mp4 é tecnicamente válido, mas a maioria dos players padrão não aceita.
  const noHls  = '[protocol!=m3u8][protocol!=m3u8_native]';
  const isYT   = /youtube\.com|youtu\.be/.test(url);
  const outFmt = (videoFormat || 'mp4').toLowerCase();

  if (isAudioOnly) {
    const fmt = formatId
      ? formatId
      : `bestaudio[ext=m4a]${isYT ? noHls : ''}/bestaudio${isYT ? noHls : ''}/bestaudio/best`;
    args.push('-f', fmt, '-x', '--audio-format', audioFormat || 'mp3', '--audio-quality', '0', '--no-keep-video');
  } else {
    let fmt;
    if      (formatId)         fmt = `${formatId}+bestaudio[ext=m4a]${isYT ? noHls : ''}/${formatId}+bestaudio/best`;
    else if (outFmt === 'mp4') fmt = `bestvideo[ext=mp4]${isYT ? noHls : ''}+bestaudio[ext=m4a]${isYT ? noHls : ''}/bestvideo+bestaudio/best`;
    else if (outFmt === 'webm')fmt = `bestvideo[ext=webm]${isYT ? noHls : ''}+bestaudio[ext=webm]/bestvideo+bestaudio/best`;
    else                        fmt = `bestvideo${isYT ? noHls : ''}+bestaudio/bestvideo+bestaudio/best`;
    args.push('-f', fmt, '--merge-output-format', outFmt);
  }

  if (embedChapters) args.push('--embed-chapters');
  if (embedSubs && subLangs?.length) args.push('--write-subs', '--embed-subs', '--sub-langs', subLangs.join(','));
  if (saveThumbnail)   args.push('--write-thumbnail');
  if (saveDescription) args.push('--write-description');
  args.push(...buildCookieArgs(settings, cookiesFile, cookiesFromBrowser));
  args.push(url);

  sendLog(downloadId, `▶ yt-dlp ${args.join(' ')}`, 'cmd');

  return new Promise((resolve) => {
    const proc = spawn(getYtDlpPath(), args, { env: { ...process.env } });
    activeDownloads.set(downloadId, proc);
    downloadPercents.set(downloadId, 0);

    proc.stdout.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (!line.trim()) continue;
        sendLog(downloadId, line, 'stdout');

        const m = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/);
        if (m) {
          const pct = parseFloat(m[1]);
          downloadPercents.set(downloadId, pct);
          mainWindow?.webContents.send('download-progress', { id: downloadId, percent: pct, size: m[2], speed: m[3], eta: m[4] });
          updateTaskbarProgress();
        }

        const done = line.match(/\[download\]\s+100%\s+of\s+~?([\d.]+\w+)/);
        if (done) mainWindow?.webContents.send('download-progress', { id: downloadId, percent: 100, size: done[1], speed: '--', eta: '00:00' });

        const dest = line.match(/\[download\] Destination: (.+)/);
        if (dest) mainWindow?.webContents.send('download-progress', { id: downloadId, file: dest[1] });

        if (line.includes('[Merger]') || line.includes('[ExtractAudio]') || line.includes('[ffmpeg]'))
          mainWindow?.webContents.send('download-progress', { id: downloadId, status: 'processing' });
      }
    });

    proc.stderr.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (!line.trim()) continue;
        sendLog(downloadId, line, 'stderr');
        mainWindow?.webContents.send('download-error', { id: downloadId, message: line });
      }
    });

    const cleanup = () => {
      activeDownloads.delete(downloadId);
      downloadPercents.delete(downloadId);
      updateTaskbarProgress();
    };

    proc.on('close', (code) => {
      cleanup();
      if (code === 0) {
        sendLog(downloadId, '✓ Download concluído com sucesso', 'success');
        mainWindow?.webContents.send('download-complete', { id: downloadId });
        resolve({ success: true });
      } else if (code === null) {
        sendLog(downloadId, '⚠ Download cancelado pelo usuário', 'warn');
        resolve({ success: false, cancelled: true });
      } else {
        sendLog(downloadId, `✗ Processo encerrado com código ${code}`, 'error');
        mainWindow?.webContents.send('download-failed', { id: downloadId, code });
        resolve({ success: false, error: `Process exited with code ${code}` });
      }
    });

    proc.on('error', (err) => {
      cleanup();
      sendLog(downloadId, `✗ Erro ao iniciar yt-dlp: ${err.message}`, 'error');
      mainWindow?.webContents.send('download-failed', { id: downloadId, code: -1 });
      resolve({ success: false, error: err.message });
    });
  });
});

ipcMain.handle('cancel-download', (_, id) => {
  const proc = activeDownloads.get(id);
  if (!proc) return { success: false, error: 'not found' };
  proc.kill('SIGTERM');
  activeDownloads.delete(id);
  downloadPercents.delete(id);
  updateTaskbarProgress();
  return { success: true };
});



ipcMain.handle('check-ytdlp', () => new Promise((resolve) => {
  const proc = spawn(getYtDlpPath(), ['--version']);
  let version = '';
  proc.stdout.on('data', d => { version += d.toString().trim(); });
  proc.on('close', code => resolve(code === 0 ? { installed: true, version } : { installed: false }));
  proc.on('error', () => resolve({ installed: false }));
}));

// A flag -U do yt-dlp cuida da autoatualização para binários instalados via pip, winget e standalone.
ipcMain.handle('update-ytdlp', () => new Promise((resolve) => {
  const proc = spawn(getYtDlpPath(), ['-U'], { env: { ...process.env } });
  let output = '';
  const relay = (d) => { output += d; mainWindow?.webContents.send('ytdlp-update-log', d.toString()); };
  proc.stdout.on('data', relay);
  proc.stderr.on('data', relay);
  proc.on('close', code => resolve({ success: code === 0, output }));
  proc.on('error', err => resolve({ success: false, error: err.message }));
}));
