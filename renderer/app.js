/* Lógica do processo de renderização 
 * Gerencia todas as interações da interface, o gerenciamento de estado e a comunicação via IPC
 */

'use strict';

// ─── App State ────────────────────────────────────────────────────────────────
const state = {
  currentPage: 'downloader',
  mode: 'video',
  videoInfo: null,
  selectedFormat: null,
  audioFmt: 'mp3',
  settings: {},
  downloads: new Map(),
  history: [],
  downloadCounter: 0,
  consoleLogs: [],
  consoleOpen: false,
  queue: [],
  queueRunning: false,
  queueCounter: 0,
  customOutputDir: null,
  playlistEntries: [],
  playlistUrl:     '',
  playlistMode:    'video',  
  playlistAudioFmt: 'mp3'
};

// indicador de velocidade na titlebar
function updateTitlebarSpeed() {
  const speedEl = document.getElementById('titlebar-speed');
  const valueEl = document.getElementById('titlebar-speed-value');
  if (!speedEl || !valueEl) return;

  // pega a velocidade de todos os downloads ativos
  const speeds = [];
  for (const dl of state.downloads.values()) {
    if (dl.status === 'downloading' && dl.speed && dl.speed !== '--') {
      speeds.push(dl.speed);
    }
  }

  if (speeds.length === 0) {
    speedEl.style.display = 'none';
    return;
  }

  // se houver apenas um download, exibe a velocidade dele diretamente
  if (speeds.length === 1) {
    speedEl.style.display = 'flex';
    valueEl.textContent = speeds[0];
    return;
  }

  //  múltiplos downloads => soma os valores numéricos e mantém a unidade da maior grandeza
  let totalBytes = 0;
  for (const s of speeds) {
    const m = s.match(/([\d.]+)\s*([KMGTk]i?B\/s)/i);
    if (!m) continue;
    const val  = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if      (unit.startsWith('g')) totalBytes += val * 1024 ** 3;
    else if (unit.startsWith('m')) totalBytes += val * 1024 ** 2;
    else if (unit.startsWith('k')) totalBytes += val * 1024;
    else                            totalBytes += val;
  }

  let display;
  if      (totalBytes >= 1024 ** 3) display = `${(totalBytes / 1024 ** 3).toFixed(1)} GiB/s`;
  else if (totalBytes >= 1024 ** 2) display = `${(totalBytes / 1024 ** 2).toFixed(1)} MiB/s`;
  else if (totalBytes >= 1024)      display = `${(totalBytes / 1024).toFixed(1)} KiB/s`;
  else                               display = `${totalBytes.toFixed(0)} B/s`;

  speedEl.style.display = 'flex';
  valueEl.textContent = `${speeds.length}× ${display}`;
}

// auto-update do app

async function checkAppUpdate() {
  const btn   = document.getElementById('btn-check-app-update');
  const label = document.getElementById('btn-check-app-update-label');
  const log   = document.getElementById('app-update-log');
  if (!btn) return;

  btn.disabled = true;
  if (label) label.textContent = 'Verificando...';
  if (log)   { log.style.display = 'block'; log.textContent = 'Conectando ao GitHub...'; }

  const result = await window.api.checkForUpdates();
  if (!result.success && result.error) {
    if (label) label.textContent = 'Verificar atualizações do app';
    if (log)   log.textContent = `Erro: ${result.error}`;
    btn.disabled = false;
  }
}

function handleUpdaterStatus(data) {
  const btn   = document.getElementById('btn-check-app-update');
  const label = document.getElementById('btn-check-app-update-label');
  const log   = document.getElementById('app-update-log');

  switch (data.status) {
    case 'checking':
      if (btn)   btn.disabled = true;
      if (label) label.textContent = 'Verificando...';
      if (log)   { log.style.display = 'block'; log.textContent = 'Verificando atualizações...'; }
      break;
    case 'not-available':
      if (btn)   btn.disabled = false;
      if (label) label.textContent = 'Verificar atualizações do app';
      if (log)   log.textContent = `✓ Você já está na versão mais recente (v${data.version || ''}).`;
      break;
    case 'available':
      if (btn)   btn.disabled = false;
      if (label) label.textContent = 'Verificar atualizações do app';
      if (log)   log.textContent = `Nova versão v${data.version} disponível. Aguardando confirmação...`;
      break;
    case 'downloading':
      if (btn)   btn.disabled = true;
      if (label) label.textContent = `Baixando... ${data.percent ?? 0}%`;
      if (log)   log.textContent = `Baixando atualização: ${data.percent ?? 0}%`;
      break;
    case 'downloaded':
      if (btn)   btn.disabled = false;
      if (label) label.textContent = 'Verificar atualizações do app';
      if (log)   log.textContent = `✓ v${data.version} baixado. Reinicie para instalar.`;
      break;
    case 'error':
      if (btn)   btn.disabled = false;
      if (label) label.textContent = 'Verificar atualizações do app';
      if (log)   log.textContent = `Erro: ${data.message || 'Falha ao verificar atualizações.'}`;
      break;
    default:
      if (btn)   btn.disabled = false;
      if (label) label.textContent = 'Verificar atualizações do app';
      break;
  }
}

/**
 * reproduz um breve tom sintetizado usando a Web Audio API sem precisar de arquivos de áudio
 * @param {'success'|'error'} type
 */
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    if (type === 'success') {
      const notes = [
        { freq: 523.25, start: 0,    duration: 0.12 },  // C5
        { freq: 783.99, start: 0.13, duration: 0.18 }   // G5
      ];
      notes.forEach(({ freq, start, duration }) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration + 0.05);
      });

    } else {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(392, ctx.currentTime);          // G4
      osc.frequency.linearRampToValueAtTime(261.63, ctx.currentTime + 0.2); // C4
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
    setTimeout(() => ctx.close(), 800);
  } catch (e) {
// falha silenciosamente
  }
}

/**
 * envia uma notificação nativa do sistema operacional.
 * @param {'success'|'error'} type
 * @param {string} title
 * @param {string} body
 */
function sendNotification(type, title, body) {
  if (!('Notification' in window)) return;

  const show = () => {
    new Notification(title, {
      body,
      silent: true 
    });
  };

  if (Notification.permission === 'granted') {
    show();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => { if (p === 'granted') show(); });
  }
}

/**
 * chamado quando um único download (fora da fila) é concluído ou falha.
 * @param {'success'|'error'} type
 * @param {string} title  — video/audio title
 */
function onSingleDownloadFinished(type, title) {
  // a fila está em execução → permanece em silêncio, o handler de término da fila cuida disso.
  if (state.queueRunning) return;

  playSound(type);
  if (type === 'success') {
    sendNotification('success', 'Download concluído', title || 'Arquivo salvo com sucesso.');
  } else {
    sendNotification('error', 'Falha no download', title || 'Ocorreu um erro durante o download.');
  }
}

function onQueueFinished() {
  const total   = state.queue.length;
  const errors  = state.queue.filter(i => i.status === 'error').length;
  const success = total - errors;

  if (errors === 0) {
    playSound('success');
    sendNotification('success', 'Fila concluída',
      `${total} download${total !== 1 ? 's' : ''} concluído${total !== 1 ? 's' : ''} com sucesso.`
    );
  } else if (success === 0) {
    playSound('error');
    sendNotification('error', 'Fila finalizada com erros',
      `${errors} download${errors !== 1 ? 's' : ''} falhou.`
    );
  } else {
    playSound('success');
    sendNotification('success', 'Fila finalizada',
      `${success} concluído${success !== 1 ? 's' : ''}, ${errors} com erro.`
    );
  }
}


document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadSettings();
    applyTheme(state.settings.theme || 'dark');

    await checkYtDlp();
    setupEventListeners();
    loadHistory();
    await loadPersistedQueue();
    const ver = await window.api.getAppVersion();
    if (ver) {
      const sidebarEl  = document.getElementById('app-version');
      const settingsEl = document.getElementById('info-app-version');
      if (sidebarEl)  sidebarEl.textContent  = `v${ver}`;
      if (settingsEl) settingsEl.textContent  = `v${ver}`;
    }
    window.api.onUpdaterStatus(handleUpdaterStatus);
  } catch (err) {
    console.error('Init error:', err);
  }
});

// Temas

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
}

function toggleTheme() {
  const isLight = document.documentElement.classList.contains('light');
  const next = isLight ? 'dark' : 'light';
  applyTheme(next);
  window.api.saveSettings({ theme: next }).catch(() => {});
}

// navegação entre as páginas
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  state.currentPage = page;

  if (page === 'settings') refreshSettingsUI();
  if (page === 'history') renderHistory();
}

// configurações
async function loadSettings() {
  state.settings = await window.api.getSettings();
  refreshSettingsUI();
}

function refreshSettingsUI() {
  const s = state.settings;
  setInputVal('setting-video-path', s.videoDownloadPath);
  setInputVal('setting-audio-path', s.audioDownloadPath);
  setInputVal('setting-cookies-file', s.cookiesFile || '');
  setSelectVal('setting-video-format', s.preferredVideoFormat);
  setSelectVal('setting-audio-format', s.preferredAudioFormat);
  setSelectVal('setting-max-concurrent', String(s.maxConcurrent || 1));
  setSelectVal('setting-cookies-browser', s.cookiesFromBrowser || '');
  updateOutputPathLabel();
}

async function saveSettingImmediate(key, value) {
  state.settings[key] = value;
  await window.api.saveSettings({ [key]: value });
  updateOutputPathLabel();
}

async function selectFolder(key, inputId) {
  const result = await window.api.selectFolder(key);
  if (result) {
    state.settings[key] = result;
    setInputVal(inputId, result);
    updateOutputPathLabel();
  }
}

async function selectCookiesFile() {
  const result = await window.api.selectCookiesFile();
  if (result) {
    state.settings.cookiesFile = result;
    setInputVal('setting-cookies-file', result);
  }
}

function updateOutputPathLabel() {
  const label    = document.getElementById('output-path-label');
  const row      = document.querySelector('.output-folder-row');
  const resetBtn = document.getElementById('btn-reset-folder');
  if (!label) return;

  const displayPath = state.customOutputDir || (
    state.mode === 'audio' ? state.settings.audioDownloadPath : state.settings.videoDownloadPath
  );

  if (state.customOutputDir) {
    label.textContent = state.customOutputDir;
    label.classList.add('custom');
    row?.classList.add('custom-folder');
    if (resetBtn) resetBtn.style.display = 'flex';
  } else {
    label.textContent = displayPath || 'Pasta não configurada';
    label.classList.remove('custom');
    row?.classList.remove('custom-folder');
    if (resetBtn) resetBtn.style.display = 'none';
  }
  // Fetch and show free disk space for the current folder
  updateDiskSpaceLabel(displayPath);
}

async function updateDiskSpaceLabel(folderPath) {
  const el = document.getElementById('disk-space-label');
  if (!el || !folderPath) return;
  el.textContent = '';
  try {
    const info = await window.api.getDiskSpace(folderPath);
    if (info?.available == null) return;
    const gb = info.available / (1024 ** 3);
    const label = gb >= 1
      ? `${gb.toFixed(1)} GB livres`
      : `${(info.available / (1024 ** 2)).toFixed(0)} MB livres`;
    el.textContent = label;
    el.className = 'disk-space-label' + (gb < 2 ? ' disk-warn' : '');
  } catch {
    el.textContent = '';
  }
}

function onRenameInput(input) {
  const clearBtn = document.getElementById('btn-rename-clear');
  const row      = document.getElementById('rename-row');
  const hasValue = input.value.trim().length > 0;
  if (clearBtn) clearBtn.style.display = hasValue ? 'flex' : 'none';
  row?.classList.toggle('has-value', hasValue);
}

function clearRename() {
  const input    = document.getElementById('rename-input');
  const clearBtn = document.getElementById('btn-rename-clear');
  const row      = document.getElementById('rename-row');
  if (input)    { input.value = ''; }
  if (clearBtn) { clearBtn.style.display = 'none'; }
  row?.classList.remove('has-value');
}

/** verifica um nome de arquivo e remove caracteres não permitidos no Windows/Linux/macOS */
function sanitiseFilename(name) {
  return name
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\.+$/, '')
    .trim()
    .slice(0, 200);
}

async function pickDownloadFolder() {
  const result = await window.api.selectFolderTemp();
  if (result) {
    state.customOutputDir = result;
    updateOutputPathLabel();
  }
}

function resetDownloadFolder() {
  state.customOutputDir = null;
  updateOutputPathLabel();
}

// yt-dlp check
async function checkYtDlp() {
  try {
    const result = await window.api.checkYtDlp();
    const dot = document.querySelector('.status-dot');
    const label = document.getElementById('ytdlp-version');
    const infoVal = document.getElementById('info-ytdlp');

    if (result.installed) {
      dot.classList.add('ok');
      label.textContent = `yt-dlp ${result.version}`;
      if (infoVal) infoVal.textContent = result.version;
    } else {
      dot.classList.add('error');
      label.textContent = 'yt-dlp não encontrado';
      if (infoVal) infoVal.textContent = 'Não instalado — instale via pip ou winget';
    }
  } catch (err) {
    const label = document.getElementById('ytdlp-version');
    if (label) label.textContent = 'yt-dlp não encontrado';
    console.error('checkYtDlp error:', err);
  }
}

// input da URL
function clearUrl() {
  document.getElementById('url-input').value = '';
  hideResults();
}

function hideResults() {
  hide('results-area');
  hide('error-card');
  hide('analyze-loading');
  hide('cookie-notice');
  state.videoInfo = null;
  state.selectedFormat = null;
}

// verificação da URL
async function analyzeUrl() {
  const urlInput = document.getElementById('url-input');
  const url = urlInput.value.trim();

  if (!url) {
    showError('Por favor, insira uma URL válida');
    return;
  }

  // validação da URL simples
  try { new URL(url); } catch {
    showError('URL inválida. Por favor, insira uma URL completa.');
    return;
  }

  hide('results-area');
  hide('error-card');
  show('analyze-loading');

  // reseta após cada download
  state.customOutputDir = null;
  state.playlistEntries = [];
  unlockRenameField();
  updateOutputPathLabel();

  const analyzeBtn = document.getElementById('analyze-btn');
  analyzeBtn.disabled = true;

  if (/instagram|twitter|x\.com|facebook|tiktok/.test(url)) {
    show('cookie-notice');
  } else {
    hide('cookie-notice');
  }

  const result = await window.api.analyzeUrl(url);

  hide('analyze-loading');
  analyzeBtn.disabled = false;

  if (!result.success) {
    showError(result.error || 'Não foi possível analisar o link.');
    return;
  }

  // detecção de playlist
  if (result.isPlaylist) {
    state.videoInfo = null;
    state.selectedFormat = null;
    state.playlistEntries = [];
    state.playlistMode = 'video';
    state.playlistAudioFmt = 'mp3';

    show('results-area');
    const metaCard  = document.getElementById('video-meta-card');
    const dlPanel   = document.getElementById('download-panel');
    const stepLabel2 = document.getElementById('step-label-2');
    const stepLabel3 = document.getElementById('step-label-3');
    if (metaCard)   metaCard.style.display   = 'none';
    if (dlPanel)    dlPanel.style.display    = 'none';
    if (stepLabel2) stepLabel2.style.display = 'none';
    if (stepLabel3) stepLabel3.style.display = 'none';
    document.getElementById('playlist-card').style.display = 'block';
    document.getElementById('playlist-footer').style.display = 'none';
    document.getElementById('playlist-loading').style.display = 'flex';
    document.getElementById('playlist-items').innerHTML = '';
    document.getElementById('playlist-title').textContent = 'Playlist';
    document.getElementById('playlist-count').textContent = 'Carregando itens...';

    const renameRow = document.getElementById('rename-row');
    if (renameRow) {
      renameRow.style.opacity = '0.35';
      renameRow.style.pointerEvents = 'none';
      const renameInput = document.getElementById('rename-input');
      if (renameInput) { renameInput.value = ''; renameInput.placeholder = 'Indisponível para playlists'; }
    }

    const plResult = await window.api.analyzePlaylist(url);
    document.getElementById('playlist-loading').style.display = 'none';

    if (!plResult.success || !plResult.entries?.length) {
      document.getElementById('playlist-count').textContent = 'Erro ao carregar — tente novamente.';
      unlockRenameField();
      return;
    }

    state.playlistEntries = plResult.entries;
    renderPlaylistItems(plResult.entries);
    document.getElementById('playlist-title').textContent = 'Playlist';
    document.getElementById('playlist-count').textContent =
      `${plResult.entries.length} vídeo${plResult.entries.length !== 1 ? 's' : ''}`;
    document.getElementById('playlist-footer').style.display = 'flex';
    updatePlaylistSelectedCount();
    updateOutputPathLabel();
    return;
  }

  // if = vídeo único -> restaura completamente todos os painéis
  const metaCard   = document.getElementById('video-meta-card');
  const dlPanel    = document.getElementById('download-panel');
  const stepLabel2 = document.getElementById('step-label-2');
  const stepLabel3 = document.getElementById('step-label-3');
  if (metaCard)   metaCard.style.display   = '';
  if (dlPanel)    dlPanel.style.display    = '';
  if (stepLabel2) stepLabel2.style.display = '';
  if (stepLabel3) stepLabel3.style.display = '';
  document.getElementById('playlist-card').style.display = 'none';
  unlockRenameField();
  state.videoInfo = result.info;
  renderVideoInfo(result.info);
  renderQualityTable(result.info);
  show('results-area');
  updateOutputPathLabel();
}

function renderVideoInfo(info) {
  setTextContent('video-title', info.title || 'Sem título');
  setTextContent('channel-name', info.uploader || info.channel || 'Desconhecido');
  setTextContent('views-count', info.view_count ? formatNumber(info.view_count) + ' visualizações' : '');
  setTextContent('upload-date', formatDate(info.upload_date));
  setTextContent('video-duration', formatDuration(info.duration));

  // thumbnail
  const thumb = document.getElementById('video-thumb');
  const thumbUrl = info.thumbnail || (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : null);
  if (thumbUrl) {
    thumb.src = thumbUrl;
    thumb.style.display = 'block';
  } else {
    thumb.style.display = 'none';
  }

  // legendas
  const allSubs = { ...(info.subtitles || {}), ...(info.automatic_captions || {}) };
  const langsList = document.getElementById('langs-list');
  langsList.innerHTML = '';
  const langs = Object.keys(allSubs).slice(0, 20);
  langs.forEach(lang => {
    const label = document.createElement('label');
    label.className = 'lang-chip';
    label.innerHTML = `<input type="checkbox" value="${lang}"><span>${lang}</span>`;
    langsList.appendChild(label);
  });
  document.getElementById('subs-section').style.display = langs.length > 0 ? 'block' : 'none';
}

// tabela de qualidades disponíveis
function renderQualityTable(info) {
  const tbody = document.getElementById('quality-tbody');
  tbody.innerHTML = '';

  const formats = (info.formats || []).slice().reverse();
  const isAudio = state.mode === 'audio';

  let filtered = isAudio
    ? formats.filter(f => !f.vcodec || f.vcodec === 'none')
    : formats.filter(f => f.vcodec && f.vcodec !== 'none');

  if (filtered.length === 0) filtered = formats;

  let firstSelected = false;

  filtered.forEach((fmt, i) => {
    const tr = document.createElement('tr');
    const qualityLabel = getQualityLabel(fmt, isAudio);
    const ext = (fmt.ext || 'N/A').toUpperCase();
    const resolution = fmt.resolution || (fmt.width && fmt.height ? `${fmt.width}x${fmt.height}` : (fmt.vcodec === 'none' ? 'Só áudio' : 'N/A'));
    const filesize = fmt.filesize ? formatBytes(fmt.filesize) : (fmt.filesize_approx ? `~${formatBytes(fmt.filesize_approx)}` : 'N/A');
    const codec = isAudio ? (fmt.acodec || 'N/A') : (fmt.vcodec || 'N/A');
    const fps = fmt.fps ? `${fmt.fps}fps` : 'N/A';
    const hdr = fmt.dynamic_range && fmt.dynamic_range !== 'SDR' ? fmt.dynamic_range : 'SDR';

    const isDefault = !firstSelected && i === 0;
    if (isDefault) {
      firstSelected = true;
      state.selectedFormat = fmt.format_id;
      tr.classList.add('selected');
    }

    tr.innerHTML = `
      <td><input type="radio" class="quality-radio" name="format" value="${fmt.format_id}" ${isDefault ? 'checked' : ''}></td>
      <td><span class="${qualityLabel.cls}">${qualityLabel.text}</span></td>
      <td><span style="font-family:var(--mono);font-size:11px">${ext}</span></td>
      <td><span style="font-family:var(--mono);font-size:12px">${resolution}</span></td>
      <td><span style="font-family:var(--mono);font-size:12px">${filesize}</span></td>
      <td><span style="font-family:var(--mono);font-size:11px;color:var(--t3)">${codec.slice(0, 14)}</span></td>
      <td><span style="font-size:12px;color:var(--t3)">${fps}</span></td>
      <td><span style="font-size:12px;color:${hdr !== 'SDR' ? 'var(--warning)' : 'var(--t3)'}">${hdr}</span></td>
    `;

    tr.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) {
        state.selectedFormat = e.target.value;
        document.querySelectorAll('.quality-table tbody tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
      }
    });

    tr.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        tr.querySelector('input').checked = true;
        state.selectedFormat = fmt.format_id;
        document.querySelectorAll('.quality-table tbody tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
      }
    });

    tbody.appendChild(tr);
  });
}

function getQualityLabel(fmt, isAudio) {
  if (isAudio) {
    const abr = fmt.abr || 0;
    if (abr >= 192) return { text: 'Alta', cls: 'ql-best' };
    if (abr >= 128) return { text: 'Média', cls: 'ql-high' };
    return { text: 'Baixa', cls: 'ql-low' };
  }
  const h = fmt.height || 0;
  if (h >= 2160) return { text: `Melhor (4K)`, cls: 'ql-best' };
  if (h >= 1440) return { text: `Melhor (2K)`, cls: 'ql-best' };
  if (h >= 1080) return { text: `Alta (1080p)`, cls: 'ql-high' };
  if (h >= 720)  return { text: `Alta (720p)`, cls: 'ql-high' };
  if (h >= 480)  return { text: `Média (480p)`, cls: 'ql-medium' };
  if (h >= 360)  return { text: `Baixa (360p)`, cls: 'ql-low' };
  return { text: 'Desconhecida', cls: 'ql-low' };
}

function setMode(mode) {
  state.mode = mode;
  document.getElementById('mode-video').classList.toggle('active', mode === 'video');
  document.getElementById('mode-audio').classList.toggle('active', mode === 'audio');
  document.getElementById('audio-format-section').style.display = mode === 'audio' ? 'flex' : 'none';
  document.getElementById('subs-section').style.display = mode === 'video' ? '' : 'none';
  updateOutputPathLabel();
  if (state.videoInfo) renderQualityTable(state.videoInfo);
}

function selectAudioFmt(btn) {
  document.querySelectorAll('.fmt-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  state.audioFmt = btn.dataset.fmt;
}

function toggleSubsPanel() {
  const checked = document.getElementById('opt-subs').checked;
  document.getElementById('subs-langs').style.display = checked ? 'flex' : 'none';
}

// iniciar download
async function startDownload() {
  if (!state.videoInfo) return;

  const url = document.getElementById('url-input').value.trim();
  const isAudio = state.mode === 'audio';
  const embedChapters = document.getElementById('opt-chapters').checked;
  const saveThumbnail = document.getElementById('opt-thumbnail').checked;
  const saveDescription = document.getElementById('opt-description').checked;
  const embedSubs = document.getElementById('opt-subs').checked;
  const noOverwrites = document.getElementById('opt-no-overwrites')?.checked !== false;

  const selectedLangs = [];
  if (embedSubs) {
    document.querySelectorAll('#langs-list input:checked').forEach(inp => selectedLangs.push(inp.value));
  }
  const downloadId = `dl_${++state.downloadCounter}_${Date.now()}`;
  const title = state.videoInfo.title || 'Vídeo';
  state.downloads.set(downloadId, {
    title, percent: 0, speed: '--', eta: '--',
    status: 'downloading', file: null
  });
  show('active-downloads');
  renderDownloadItem(downloadId);

  // adicionar ao histórico (on por padrão)
  const shouldSave = document.getElementById('opt-save-history')?.checked !== false;
  if (shouldSave) {
    state.history.unshift({
      id: downloadId, title, url, date: new Date().toISOString(),
      type: isAudio ? 'audio' : 'video',
      format: isAudio ? state.audioFmt : 'video',
      thumbnail: state.videoInfo?.thumbnail || null,
      failed: false
    });
    saveHistory();
  }
  // lê o nome de arquivo personalizado (remove caracteres proibidos e, se ficar vazio, usa null = usar o título original)
  const rawName = document.getElementById('rename-input')?.value.trim() || '';
  const customFilename = rawName ? sanitiseFilename(rawName) : null;
  // começa a baixar
  const options = {
    url,
    formatId: state.selectedFormat,
    isAudioOnly: isAudio,
    audioFormat: state.audioFmt,
    videoFormat: state.settings.preferredVideoFormat || 'mp4',
    downloadId,
    embedChapters,
    embedSubs,
    subLangs: selectedLangs,
    saveThumbnail,
    saveDescription,
    noOverwrites,
    outputDirOverride: state.customOutputDir || null,
    customFilename
  };
  state.customOutputDir = null;
  clearRename();
  updateOutputPathLabel();

  window.api.startDownload(options);
}
function renderDownloadItem(id) {
  const dl = state.downloads.get(id);
  if (!dl) return;

  const container = document.getElementById('downloads-list');
  let item = document.getElementById(`dl-item-${id}`);

  if (!item) {
    item = document.createElement('div');
    item.className = 'download-item';
    item.id = `dl-item-${id}`;
    item.innerHTML = `
      <div class="dl-item-header">
        <span class="dl-title" title="${escHtml(dl.title)}">${escHtml(dl.title)}</span>
        <span class="dl-status downloading" id="dl-status-${id}">Baixando</span>
        <button class="btn-cancel-dl" onclick="cancelDownload('${id}')" title="Cancelar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="dl-progress-bar-wrap">
        <div class="dl-progress-bar" id="dl-bar-${id}"></div>
      </div>
      <div class="dl-meta-row">
        <span id="dl-percent-${id}">0%</span>
        <span id="dl-speed-${id}">--</span>
        <span id="dl-eta-${id}">ETA --</span>
      </div>
    `;
    container.appendChild(item);
  }
}

function updateDownloadItem(id) {
  const dl = state.downloads.get(id);
  if (!dl) return;

  const bar = document.getElementById(`dl-bar-${id}`);
  const pct = document.getElementById(`dl-percent-${id}`);
  const spd = document.getElementById(`dl-speed-${id}`);
  const eta = document.getElementById(`dl-eta-${id}`);
  const status = document.getElementById(`dl-status-${id}`);

  if (bar) bar.style.width = `${dl.percent}%`;
  if (pct) pct.textContent = `${dl.percent.toFixed(1)}%`;
  if (spd) spd.textContent = dl.speed;
  if (eta) eta.textContent = `ETA ${dl.eta}`;

  if (status) {
    status.className = `dl-status ${dl.status}`;
    const labels = { downloading: 'Baixando', processing: 'Processando', done: 'Concluído', error: 'Erro', cancelled: 'Cancelado' };
    status.textContent = labels[dl.status] || dl.status;
  }
}

async function cancelDownload(id) {
  await window.api.cancelDownload(id);
  const dl = state.downloads.get(id);
  if (dl) {
    dl.status = 'cancelled';
    dl.percent = 0;
    updateDownloadItem(id);
  }
  setTimeout(() => removeDownloadItem(id), 2000);
}

function removeDownloadItem(id) {
  state.downloads.delete(id);
  const item = document.getElementById(`dl-item-${id}`);
  if (item) item.remove();
  if (state.downloads.size === 0) hide('active-downloads');
}

// eventos IPC
function setupEventListeners() {
  // progresso do download, atualiza tanto o painel de downloads ativos quanto o item da fila
  window.api.onDownloadProgress((data) => {
    // painel de downloads ativos
    const dl = state.downloads.get(data.id);
    if (dl) {
      if (typeof data.percent === 'number') dl.percent = data.percent;
      if (data.speed) dl.speed = data.speed;
      if (data.eta)   dl.eta   = data.eta;
      if (data.file)  dl.file  = data.file;
      if (data.status) dl.status = data.status;
      updateDownloadItem(data.id);
    }
    const qi = state.queue.find(i => i.id === data.id);
    if (qi && qi.status === 'active') {
      if (typeof data.percent === 'number') qi.percent = data.percent;
      if (data.speed) qi.speed = data.speed;
      if (data.eta)   qi.eta   = data.eta;
      if (data.status === 'processing') qi.speed = 'Processando...';
      updateQueueItemUI(data.id);
      updateQueueProgress();
    }
    updateTitlebarSpeed();
  });
  window.api.onDownloadComplete((data) => {
    const dl = state.downloads.get(data.id);
    if (dl) {
      dl.status = 'done';
      dl.percent = 100;
      updateDownloadItem(data.id);
    }
    onSingleDownloadFinished('success', dl?.title);
    setTimeout(() => {
      removeDownloadItem(data.id);
      updateTitlebarSpeed();
    }, 5000);
  });
  window.api.onDownloadFailed((data) => {
    const dl = state.downloads.get(data.id);
    if (dl) { dl.status = 'error'; updateDownloadItem(data.id); }

    const histEntry = state.history.find(h => h.id === data.id);
    if (histEntry) { histEntry.failed = true; saveHistory(); }

    const qi = state.queue.find(i => i.id === data.id);
    if (qi) { qi.status = 'error'; updateQueueItemUI(data.id); updateQueueProgress(); }

    onSingleDownloadFinished('error', dl?.title);
    updateTitlebarSpeed();
    setTimeout(() => {
      removeDownloadItem(data.id);
      updateTitlebarSpeed();
    }, 8000);
  });
  window.api.onConsoleLog((data) => {
    addConsoleLine(data);
  });
  // yt-dlp update log
  window.api.onYtdlpUpdateLog((text) => {
    const logEl = document.getElementById('update-log');
    if (logEl) {
      logEl.style.display = 'block';
      logEl.textContent += text;
      logEl.scrollTop = logEl.scrollHeight;
    }
  });
  document.getElementById('url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') analyzeUrl();
  });
  document.getElementById('url-input').addEventListener('paste', (e) => {
    setTimeout(() => {
      const val = document.getElementById('url-input').value.trim();
      if (val.startsWith('http')) analyzeUrl();
    }, 50);
  });

  // drag e drop
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    let url = '';
    if (e.dataTransfer.types.includes('text/uri-list')) {
      url = e.dataTransfer.getData('text/uri-list').split('\n')[0].trim();
    }
    if (!url) {
      url = e.dataTransfer.getData('text/plain').trim();
    }

    if (url && url.startsWith('http')) {
      switchPage('downloader');
      document.getElementById('url-input').value = url;
      analyzeUrl();
    }
  });

  const urlField = document.querySelector('.url-field');
  document.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types?.includes('text/plain') ||
        e.dataTransfer?.types?.includes('text/uri-list')) {
      urlField?.classList.add('drag-over');
    }
  });
  document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) urlField?.classList.remove('drag-over');
  });
  document.addEventListener('drop', () => urlField?.classList.remove('drag-over'));
}

function renderPlaylistItems(entries) {
  const container = document.getElementById('playlist-items');
  if (!entries.length) { container.innerHTML = ''; return; }

  container.innerHTML = entries.map((e, idx) => `
    <label class="playlist-item" data-idx="${idx}">
      <input type="checkbox" class="playlist-check" data-idx="${idx}" checked
             onchange="updatePlaylistSelectedCount()">
      <div class="pl-thumb">
        ${e.thumbnail
          ? `<img src="${escHtml(e.thumbnail)}" alt="" loading="lazy"
               onerror="this.style.display='none'">`
          : ''}
        ${e.duration ? `<span class="pl-dur">${formatDuration(e.duration)}</span>` : ''}
      </div>
      <div class="pl-info">
        <div class="pl-title">${escHtml(e.title)}</div>
        <div class="pl-url">${escHtml(e.url || '')}</div>
      </div>
    </label>
  `).join('');
}
function selectAllPlaylistItems(checked) {
  document.querySelectorAll('.playlist-check').forEach(cb => { cb.checked = checked; });
  updatePlaylistSelectedCount();
}
function updatePlaylistSelectedCount() {
  const total    = document.querySelectorAll('.playlist-check').length;
  const selected = document.querySelectorAll('.playlist-check:checked').length;
  const el = document.getElementById('playlist-selected-count');
  if (el) el.textContent = `${selected} de ${total} selecionados`;
  const addBtn = document.querySelector('.btn-add-playlist-queue');
  if (addBtn) addBtn.disabled = selected === 0;
}

function unlockRenameField() {
  const renameRow = document.getElementById('rename-row');
  if (renameRow) {
    renameRow.style.opacity = '';
    renameRow.style.pointerEvents = '';
    const renameInput = document.getElementById('rename-input');
    if (renameInput) renameInput.placeholder = 'Nome do arquivo (opcional — deixe vazio para usar o título original)';
  }
}

function setPlaylistMode(mode) {
  state.playlistMode = mode;
  document.getElementById('pl-mode-video')?.classList.toggle('active', mode === 'video');
  document.getElementById('pl-mode-audio')?.classList.toggle('active', mode === 'audio');
  const videoRow = document.getElementById('pl-video-quality-row');
  const audioRow = document.getElementById('pl-audio-format-row');
  if (videoRow) videoRow.style.display = mode === 'video' ? '' : 'none';
  if (audioRow) audioRow.style.display = mode === 'audio' ? '' : 'none';
}
function setPlaylistAudioFmt(btn) {
  document.querySelectorAll('[data-plfmt]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.playlistAudioFmt = btn.dataset.plfmt;
}
function addPlaylistToQueue() {
  const checks = [...document.querySelectorAll('.playlist-check:checked')];
  if (!checks.length) return;

  const isAudio      = state.playlistMode === 'audio';
  const audioFmt     = state.playlistAudioFmt || 'mp3';
  const qualityPreset = isAudio ? null : (document.getElementById('pl-quality-preset')?.value || null);
  let added = 0;

  checks.forEach(cb => {
    const idx   = parseInt(cb.dataset.idx);
    const entry = state.playlistEntries[idx];
    if (!entry) return;

    const item = {
      id:              `qi_${++state.queueCounter}`,
      url:             entry.url,
      title:           entry.title,
      thumbnail:       entry.thumbnail || null,
      isAudioOnly:     isAudio,
      audioFormat:     audioFmt,
      formatId:        qualityPreset || null,
      embedChapters:   document.getElementById('opt-chapters')?.checked || false,
      embedSubs:       document.getElementById('opt-subs')?.checked     || false,
      subLangs:        [...document.querySelectorAll('#langs-list input:checked')].map(i => i.value),
      saveThumbnail:   document.getElementById('opt-thumbnail')?.checked    || false,
      saveDescription: document.getElementById('opt-description')?.checked  || false,
      noOverwrites:    document.getElementById('opt-no-overwrites')?.checked !== false,
      type:            isAudio ? 'audio' : 'video',
      fmt:             isAudio ? audioFmt.toUpperCase() : (state.settings.preferredVideoFormat || 'MP4').toUpperCase(),
      status:          'pending',
      percent:         0,
      speed:           '--',
      eta:             '--',
      outputDirOverride: state.customOutputDir || null,
      customFilename:  null
    };

    state.queue.push(item);
    added++;
  });

  if (added === 0) return;

  state.customOutputDir = null;
  updateOutputPathLabel();
  saveQueue();
  updateQueueBadge();
  renderQueueList();

  const btn = document.querySelector('.btn-add-playlist-queue');
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${added} adicionados!`;
    btn.disabled = true;
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; updatePlaylistSelectedCount(); }, 2000);
  }

  switchPage('queue');
}

function addToQueue() {
  if (!state.videoInfo) return;

  const url      = document.getElementById('url-input').value.trim();
  const isAudio  = state.mode === 'audio';
  const info     = state.videoInfo;

  const item = {
    id:           `qi_${++state.queueCounter}`,
    url,
    title:        info.title || url,
    thumbnail:    info.thumbnail || null,
    isAudioOnly:  isAudio,
    audioFormat:  state.audioFmt,
    formatId:     state.selectedFormat,
    embedChapters: document.getElementById('opt-chapters').checked,
    embedSubs:    document.getElementById('opt-subs').checked,
    subLangs:     [...document.querySelectorAll('#langs-list input:checked')].map(i => i.value),
    saveThumbnail: document.getElementById('opt-thumbnail').checked,
    saveDescription: document.getElementById('opt-description').checked,
    noOverwrites: document.getElementById('opt-no-overwrites')?.checked !== false,
    type:         isAudio ? 'audio' : 'video',
    fmt:          isAudio ? state.audioFmt.toUpperCase() : (state.settings.preferredVideoFormat || 'MP4').toUpperCase(),
    status:       'pending',
    percent:      0,
    speed:        '--',
    eta:          '--',
    outputDirOverride: state.customOutputDir || null,
    customFilename: (() => {
      const raw = document.getElementById('rename-input')?.value.trim() || '';
      return raw ? sanitiseFilename(raw) : null;
    })()
  };

  state.queue.push(item);
  saveQueue();
  state.customOutputDir = null;
  clearRename();
  updateOutputPathLabel();
  updateQueueBadge();
  renderQueueList();

  const btn = document.getElementById('queue-btn');
  btn.classList.add('added');
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Adicionado!`;
  setTimeout(() => {
    btn.classList.remove('added');
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar à Fila`;
  }, 1800);
}

function removeFromQueue(id) {
  const idx = state.queue.findIndex(i => i.id === id);
  if (idx === -1) return;
  if (state.queue[idx].status === 'active') return; // don't remove running item
  state.queue.splice(idx, 1);
  saveQueue();
  updateQueueBadge();
  renderQueueList();
}

function clearQueue() {
  if (state.queueRunning) {
    state.queue = state.queue.filter(i => i.status === 'active');
  } else {
    state.queue = [];
  }
  saveQueue();
  updateQueueBadge();
  renderQueueList();
}

function updateQueueBadge() {
  const badge   = document.getElementById('queue-badge');
  const pending = state.queue.filter(i => i.status === 'pending').length;
  if (pending > 0) {
    badge.textContent = pending;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
  const hasItems  = state.queue.length > 0;
  const hasPending = state.queue.some(i => i.status === 'pending');
  document.getElementById('btn-queue-clear').disabled = !hasItems || state.queueRunning;
  document.getElementById('btn-start-queue').disabled = !hasPending || state.queueRunning;
}

function renderQueueList() {
  const container   = document.getElementById('queue-list');
  const emptyEl     = document.getElementById('queue-empty');
  const countLabel  = document.getElementById('queue-count-label');
  const total       = state.queue.length;

  countLabel.textContent = total === 0 ? '0 itens na fila'
    : `${total} item${total !== 1 ? 's' : ''} na fila`;
  [...container.children].forEach(el => {
    if (el.id !== 'queue-empty') el.remove();
  });

  if (total === 0) {
    emptyEl.style.display = 'flex';
    return;
  }
  emptyEl.style.display = 'none';

  state.queue.forEach(item => {
    const el = document.createElement('div');
    el.className = `queue-item qi-${item.status}`;
    el.id = `qi-el-${item.id}`;

    const statusIcon = {
      pending: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      active:  `<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>`,
      done:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    }[item.status] || '';

    const canRemove = item.status !== 'active';
    const barClass  = item.status === 'done' ? 'done' : item.status === 'error' ? 'error' : '';
    const statusText = {
      pending: 'Aguardando',
      active:  item.percent > 0 ? `${item.percent.toFixed(1)}%` : 'Iniciando...',
      done:    'Concluído',
      error:   'Erro'
    }[item.status] || '';

    el.innerHTML = `
      <div class="qi-thumb">
        ${item.thumbnail
          ? `<img src="${escHtml(item.thumbnail)}" alt="" onerror="this.parentElement.innerHTML='<div class=qi-thumb-placeholder><svg width=18 height=18 viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><polygon points=\\'23 7 16 12 23 17 23 7\\'/><rect x=\\'1\\' y=\\'5\\' width=\\'15\\' height=\\'14\\' rx=\\'2\\'/></svg></div>'">`
          : `<div class="qi-thumb-placeholder"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div>`
        }
      </div>
      <div class="qi-info">
        <div class="qi-title" title="${escHtml(item.title)}">${escHtml(item.title)}</div>
        <div class="qi-meta">
          <span class="qi-tag">${escHtml(item.type.toUpperCase())}</span>
          <span class="qi-tag">${escHtml(item.fmt)}</span>
          ${item.outputDirOverride
            ? `<span class="qi-folder-tag" title="${escHtml(item.outputDirOverride)}">
                 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                 ${escHtml(item.outputDirOverride.split(/[\\/]/).pop())}
               </span>`
            : ''
          }
        </div>
      </div>
      <div class="qi-progress-wrap">
        <div class="qi-status-text">${statusText}${item.status === 'active' && item.speed !== '--' ? ` · ${item.speed}` : ''}</div>
        <div class="qi-bar-track"><div class="qi-bar-fill ${barClass}" style="width:${item.percent}%"></div></div>
      </div>
      <div class="qi-actions">
        <div class="qi-status-icon">${statusIcon}</div>
        ${canRemove ? `<button class="btn-qi-remove" onclick="removeFromQueue('${item.id}')" title="Remover da fila">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg></button>` : ''}
      </div>`;

    container.appendChild(el);
  });
}

function updateQueueItemUI(id) {
  const item = state.queue.find(i => i.id === id);
  if (!item) return;
  const el = document.getElementById(`qi-el-${id}`);
  if (!el) { renderQueueList(); return; }
  el.className = `queue-item qi-${item.status}`;
  const statusText = {
    pending: 'Aguardando',
    active:  item.percent > 0 ? `${item.percent.toFixed(1)}%` : 'Iniciando...',
    done:    'Concluído',
    error:   'Erro'
  }[item.status] || '';

  const speedStr = (item.status === 'active' && item.speed !== '--') ? ` · ${item.speed}` : '';
  el.querySelector('.qi-status-text').textContent = statusText + speedStr;

  const fill = el.querySelector('.qi-bar-fill');
  fill.style.width = `${item.percent}%`;
  fill.className = `qi-bar-fill${item.status === 'done' ? ' done' : item.status === 'error' ? ' error' : ''}`;

  const iconEl = el.querySelector('.qi-status-icon');
  iconEl.innerHTML = {
    pending: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    active:  `<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>`,
    done:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
  }[item.status] || '';
}
function updateQueueProgress() {
  const total    = state.queue.length;
  const done     = state.queue.filter(i => i.status === 'done' || i.status === 'error').length;
  const pct      = total > 0 ? (done / total) * 100 : 0;
  const progressEl = document.getElementById('queue-overall-progress');
  const fillEl     = document.getElementById('queue-progress-fill');
  const labelEl    = document.getElementById('queue-progress-label');

  if (state.queueRunning || done > 0) {
    progressEl.style.display = 'flex';
    fillEl.style.width = `${pct}%`;
    labelEl.textContent = `${done} / ${total} concluídos`;
  } else {
    progressEl.style.display = 'none';
  }
}
async function startQueue() {
  if (state.queueRunning) return;
  const pending = state.queue.filter(i => i.status === 'pending');
  if (pending.length === 0) return;

  state.queueRunning = true;
  const startBtn   = document.getElementById('btn-start-queue');
  const startLabel = document.getElementById('btn-start-queue-label');
  startBtn.disabled = false;
  startBtn.classList.add('running');
  startLabel.textContent = 'Processando...';
  document.getElementById('btn-queue-clear').disabled = true;
  switchPage('queue');

  const maxConcurrent = Math.max(1, Math.min(5, state.settings.maxConcurrent || 2));
  const runItem = async (item) => {
    item.status  = 'active';
    item.percent = 0;
    updateQueueItemUI(item.id);
    updateQueueBadge();
    updateQueueProgress();

    const downloadId = item.id;
    state.downloads.set(downloadId, {
      title: item.title, percent: 0, speed: '--', eta: '--',
      status: 'downloading', file: null
    });

    if (document.getElementById('opt-save-history')?.checked !== false) {
      state.history.unshift({
        id: downloadId, title: item.title, url: item.url,
        date: new Date().toISOString(),
        type: item.type, format: item.isAudioOnly ? item.audioFormat : 'video',
        thumbnail: item.thumbnail || null,
        failed: false
      });
      saveHistory();
    }

    await window.api.startDownload({
      url:              item.url,
      formatId:         item.formatId,
      isAudioOnly:      item.isAudioOnly,
      audioFormat:      item.audioFormat,
      videoFormat:      state.settings.preferredVideoFormat || 'mp4',
      downloadId,
      embedChapters:    item.embedChapters,
      embedSubs:        item.embedSubs,
      subLangs:         item.subLangs,
      saveThumbnail:    item.saveThumbnail,
      saveDescription:  item.saveDescription,
      noOverwrites:     item.noOverwrites !== false,
      outputDirOverride: item.outputDirOverride || null,
      customFilename:   item.customFilename   || null
    });

    if (item.status !== 'error') {
      item.status  = 'done';
      item.percent = 100;
    }
    updateQueueItemUI(item.id);
    updateQueueProgress();
    state.downloads.delete(downloadId);
  };

  const items = state.queue.filter(i => i.status === 'pending');
  for (let i = 0; i < items.length; i += maxConcurrent) {
    const batch = items.slice(i, i + maxConcurrent);
    await Promise.all(batch.map(runItem));
  }

  state.queueRunning = false;
  startBtn.classList.remove('running');
  startLabel.textContent = 'Iniciar Fila';
  updateQueueBadge();
  saveQueue(); 
  onQueueFinished();
}


function loadHistory() {
  try {
    const raw = localStorage.getItem('streamvault_history');
    state.history = raw ? JSON.parse(raw) : [];
  } catch { state.history = []; }
}

function saveHistory() {
  try {
    localStorage.setItem('streamvault_history', JSON.stringify(state.history.slice(0, 100)));
  } catch {}
}

async function saveQueue() {
  try {
    const persistable = state.queue
      .filter(i => i.status === 'pending')
      .map(i => ({ ...i })); 
    await window.api.saveQueue(persistable);
  } catch {}
}

async function loadPersistedQueue() {
  try {
    const items = await window.api.loadQueue();
    if (!items?.length) return;
    items.forEach(item => {
      item.id = `qi_${++state.queueCounter}`;
      item.status  = 'pending';
      item.percent = 0;
      item.speed   = '--';
      item.eta     = '--';
      state.queue.push(item);
    });
    if (state.queue.length) {
      updateQueueBadge();
      renderQueueList();
    }
  } catch {}
}

async function clearHistory() {
  if (!confirm('Limpar todo o histórico de downloads?\nOs arquivos físicos do histórico também serão apagados do disco.')) return;
  state.history = [];
  renderHistory();
  try { localStorage.removeItem('streamvault_history'); } catch {}
  await window.api.clearHistoryStorage();
}

function filterHistory(query) {
  renderHistory(query);
}

function renderHistory(query = '') {
  const container = document.getElementById('history-list');
  const countEl   = document.getElementById('history-count');
  const q = query.trim().toLowerCase();

  const items = q
    ? state.history.filter(i => i.title?.toLowerCase().includes(q) || i.url?.toLowerCase().includes(q))
    : state.history;

  if (countEl) {
    if (q && items.length !== state.history.length) {
      countEl.textContent = `${items.length} de ${state.history.length} resultado(s)`;
    } else {
      countEl.textContent = state.history.length ? `${state.history.length} item(s)` : '';
    }
  }

  if (!items.length) {
    container.innerHTML = q
      ? `<div class="empty-state"><p>Nenhum resultado para "<strong>${escHtml(q)}</strong>"</p></div>`
      : `<div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <p>Nenhum download no histórico ainda</p>
        </div>`;
    return;
  }

  const hl = (text) => {
    if (!q) return escHtml(text);
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return escHtml(text);
    return escHtml(text.slice(0, idx)) +
      `<mark class="hl">${escHtml(text.slice(idx, idx + q.length))}</mark>` +
      escHtml(text.slice(idx + q.length));
  };

  container.innerHTML = items.map(item => `
    <div class="history-item${item.failed ? ' failed' : ''}">
      <div class="history-thumb">
        ${item.thumbnail
          ? `<img src="${escHtml(item.thumbnail)}" alt="" loading="lazy"
               onerror="this.parentElement.classList.add('no-thumb')">`
          : ''
        }
        ${!item.thumbnail ? `<div class="history-thumb-icon">
          ${item.failed
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
            : item.type === 'audio'
              ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
              : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`
          }
        </div>` : ''}
      </div>
      <div class="history-info">
        <div class="history-title" title="${escHtml(item.title)}">${hl(item.title || '')}</div>
        <div class="history-meta">${item.failed ? '❌ Falhou · ' : ''}${item.type?.toUpperCase()} · ${item.format?.toUpperCase()} · ${formatDate2(item.date)}</div>
      </div>
      <div class="history-actions">
        <button class="history-repeat-btn" onclick="repeatHistoryDownload('${escHtml(item.url)}', '${item.type}', '${item.format}')"
                title="Repetir download">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
          </svg>
          Repetir
        </button>
        <button class="history-open-btn" onclick="window.api.openUrl('${escHtml(item.url)}')">Abrir URL</button>
      </div>
    </div>
  `).join('');
}

/**
 * repete um download do histórico — navega até a página Downloader,
 * preenche a URL e inicia a análise automaticamente.
 * @param {string} url   - url original
 * @param {string} type  - 'audio' | 'video'
 * @param {string} fmt   - string do formato 
 */
async function repeatHistoryDownload(url, type, fmt) {
  switchPage('downloader');
  const input = document.getElementById('url-input');
  if (input) input.value = url;
  if (type === 'audio') {
    setMode('audio');
    const knownAudio = ['mp3', 'm4a', 'opus', 'flac', 'wav'];
    if (fmt && knownAudio.includes(fmt.toLowerCase())) {
      const pill = document.querySelector(`.fmt-pill[data-fmt="${fmt.toLowerCase()}"]`);
      if (pill) selectAudioFmt(pill);
    }
  } else {
    setMode('video');
  }
  await analyzeUrl();
}

// console
function toggleConsole() {  state.consoleOpen ? closeConsole() : openConsole();
}

function openConsole() {
  state.consoleOpen = true;
  document.getElementById('console-panel').classList.add('visible');
  document.getElementById('console-overlay').classList.add('visible');
  document.getElementById('console-toggle-btn').classList.add('active');
}

function closeConsole() {
  state.consoleOpen = false;
  document.getElementById('console-panel').classList.remove('visible');
  document.getElementById('console-overlay').classList.remove('visible');
  document.getElementById('console-toggle-btn').classList.remove('active');
}

function clearConsole() {
  state.consoleLogs = [];
  const body = document.getElementById('console-body');
  body.innerHTML = '<div class="console-empty">Console limpo.</div>';
}

function addConsoleLine(data) {
  state.consoleLogs.push(data);
  const body = document.getElementById('console-body');
  const empty = body.querySelector('.console-empty');
  if (empty) empty.remove();
  const isProgress = /\[download\]\s+\d+/.test(data.text);
  const type = isProgress ? 'progress' : (data.type || 'stdout');

  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  line.innerHTML = `
    <span class="console-ts">${formatTime(data.ts)}</span>
    <span class="console-text">${escHtml(data.text)}</span>
  `;
  body.appendChild(line);

  body.scrollTop = body.scrollHeight;

  // limite
  if (state.consoleLogs.length > 2000) {
    state.consoleLogs.shift();
    body.removeChild(body.firstElementChild);
  }
}

// updates do yt-dlp
async function updateYtDlp() {
  const btn = document.getElementById('btn-update-ytdlp');
  const label = document.getElementById('update-ytdlp-label');
  const logEl = document.getElementById('update-log');

  btn.disabled = true;
  btn.className = 'btn-update-ytdlp updating';
  label.textContent = 'Atualizando...';
  if (logEl) { logEl.style.display = 'block'; logEl.textContent = ''; }

  const result = await window.api.updateYtDlp();

  btn.disabled = false;
  if (result.success) {
    btn.className = 'btn-update-ytdlp success';
    label.textContent = 'Atualizado com sucesso!';
    await checkYtDlp();
    setTimeout(() => {
      btn.className = 'btn-update-ytdlp';
      label.textContent = 'Atualizar yt-dlp agora';
    }, 4000);
  } else {
    btn.className = 'btn-update-ytdlp error';
    label.textContent = 'Falha na atualização';
    if (logEl && result.error) logEl.textContent += '\n' + result.error;
    setTimeout(() => {
      btn.className = 'btn-update-ytdlp';
      label.textContent = 'Atualizar yt-dlp agora';
    }, 5000);
  }
}

function formatTime(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2,'0');
  const m = String(d.getMinutes()).padStart(2,'0');
  const s = String(d.getSeconds()).padStart(2,'0');
  return `${h}:${m}:${s}`;
}

// helpers
function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function setTextContent(id, text) { const el = document.getElementById(id); if (el) el.textContent = text || ''; }
function setInputVal(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; }
function setSelectVal(id, val) { const el = document.getElementById(id); if (el && val) el.value = val; }

function showError(msg) {
  document.getElementById('error-message').textContent = msg;
  show('error-card');
  hide('results-area');
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatNumber(n) {
  if (!n) return '';
  if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return n.toString();
}

function formatBytes(bytes) {
  if (!bytes) return 'N/A';
  if (bytes >= 1e9) return (bytes/1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes/1e6).toFixed(2) + ' MB';
  if (bytes >= 1e3) return (bytes/1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

function formatDuration(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function formatDate(d) {
  if (!d || d.length < 8) return '';
  return `${d.slice(0,4)}/${d.slice(4,6)}/${d.slice(6,8)}`;
}

function formatDate2(isoStr) {
  try {
    return new Date(isoStr).toLocaleDateString('pt-BR');
  } catch { return ''; }
}
