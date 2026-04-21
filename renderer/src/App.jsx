import { useState, useEffect } from 'react';
import { state, triggers } from './state.js';
import { applyTheme, playSound, sendNotification, compactThumb } from './utils.js';
import Titlebar from './components/Titlebar.jsx';
import Sidebar from './components/Sidebar.jsx';
import ConsolePanel from './components/ConsolePanel.jsx';
import Downloader from './pages/Downloader.jsx';
import History from './pages/History.jsx';
import Queue from './pages/Queue.jsx';
import Settings from './pages/Settings.jsx';
import About from './pages/About.jsx';
import UpdateModal from './components/UpdateModal.jsx';

export default function App() {
  const [page, setPage] = useState('downloader');
  const [settings, setSettings] = useState({});
  const [ytdlpStatus, setYtdlpStatus] = useState({
    ok: false, checked: false, label: 'Verificando yt-dlp...', appVersion: '',
  });

  const [downloads, setDownloads] = useState(new Map());
  const [queue, setQueue] = useState([]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [repeatPayload, setRepeatPayload] = useState(null);
  const [updateModal, setUpdateModal] = useState({ open: false, status: null, version: null, notes: null, percent: 0 });
  const [appUpdateStatus, setAppUpdateStatus] = useState({ busy: false, log: '' });
  const [dlUrl, setDlUrl] = useState('');
  const [dlVideoInfo, setDlVideoInfo] = useState(null);
  const [dlIsPlaylist, setDlIsPlaylist] = useState(false);
  const [dlPlaylistEntries, setDlPlaylistEntries] = useState([]);
  const [dlPlaylistMode, setDlPlaylistMode] = useState('video');
  const [dlPlaylistAudioFmt, setDlPlaylistAudioFmt] = useState('mp3');
  const [dlPlaylistQuality, setDlPlaylistQuality] = useState(
    'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
  );
  const [dlMode, setDlMode] = useState('video');
  const [dlSelectedFormat, setDlSelectedFormat] = useState(null);
  const [dlCustomOutputDir, setDlCustomOutputDir] = useState(null);
  const [dlRenameVal, setDlRenameVal] = useState('');
  const [dlError, setDlError] = useState('');

  useEffect(() => {
    triggers.setPage = setPage;
    triggers.setDownloads = (m) => setDownloads(new Map(m));
    triggers.setQueue = (q) => setQueue([...q]);
    triggers.setQueueRunning = setQueueRunning;
    triggers.setHistory = (h) => setHistory([...h]);
    triggers.setConsoleLogs = (l) => setConsoleLogs([...l]);
    triggers.setConsoleOpen = setConsoleOpen;
    triggers.setSettings = (s) => setSettings((prev) => ({ ...prev, ...s }));

    init();

    return () => {
      [
        'download-progress', 'download-complete', 'download-failed',
        'download-error', 'console-log', 'ytdlp-update-log', 'updater-status',
      ].forEach((ch) => window.api.removeAllListeners(ch));
      Object.keys(triggers).forEach((k) => (triggers[k] = null));
    };
  }, []);

  async function init() {
    try {
      const s = await window.api.getSettings();
      state.settings = s;
      setSettings({ ...s });

      let theme = s.theme || 'default';
      if (theme === 'dark') theme = 'default';
      if (theme === 'light') theme = 'default-light';
      applyTheme(theme);
      state.settings.theme = theme;

      const ytdlp = await window.api.checkYtDlp();
      setYtdlpStatus({
        ok: ytdlp.installed,
        checked: true,
        label: ytdlp.installed ? `yt-dlp ${ytdlp.version}` : 'yt-dlp não encontrado',
        appVersion: '',
      });

      const ver = await window.api.getAppVersion();
      if (ver) setYtdlpStatus((prev) => ({ ...prev, appVersion: `v${ver}` }));

      await loadHistory();
      await loadPersistedQueue();
      setupIpcListeners();

      window.api.onUpdaterStatus((data) => {
        handleUpdaterStatus(data);
      });
    } catch (err) {
      console.error('Init error', err);
    }
  }

  async function loadHistory() {
    try {
      const items = await window.api.loadHistory();
      state.history = Array.isArray(items) ? items : [];
    } catch {
      state.history = [];
    }
    setHistory([...state.history]);
  }

  async function saveHistory() {
    try {
      await window.api.saveHistory(state.history.slice(0, 100));
    } catch {}
  }

  async function addToHistory(entry) {
    state.history.unshift(entry);
    await saveHistory();
    setHistory([...state.history]);
  }

  async function clearHistory() {
    const confirmed = await window.api.showConfirm({
      title: 'Limpar histórico',
      message: 'Limpar todo o histórico de downloads?',
      detail: 'Os arquivos físicos não serão apagados do disco.',
      buttons: ['Limpar', 'Cancelar'],
      defaultId: 0,
      cancelId: 1,
    });
    if (!confirmed) return;
    state.history = [];
    setHistory([]);
    await window.api.saveHistory([]);
  }

  async function saveQueue() {
    try {
      const persistable = state.queue
        .filter((i) => i.status === 'pending')
        .map((i) => ({ ...i }));
      await window.api.saveQueue(persistable);
    } catch {}
  }

  async function loadPersistedQueue() {
    try {
      const items = await window.api.loadQueue();
      if (!items?.length) return;
      items.forEach((item) => {
        item.id = `qi${state.queueCounter++}`;
        item.status = 'pending';
        item.percent = 0;
        item.speed = '--';
        item.eta = '--';
        state.queue.push(item);
        state.queueMap.set(item.id, item);
      });
      if (state.queue.length) setQueue([...state.queue]);
    } catch {}
  }

  function addToQueue(item) {
    state.queue.push(item);
    state.queueMap.set(item.id, item);
    saveQueue();
    setQueue([...state.queue]);
  }

  function removeFromQueue(id) {
    const idx = state.queue.findIndex((i) => i.id === id);
    if (idx === -1) return;
    if (state.queue[idx].status === 'active') return;
    state.queue.splice(idx, 1);
    state.queueMap.delete(id);
    saveQueue();
    setQueue([...state.queue]);
  }

  function clearQueue() {
    if (state.queueRunning) {
      state.queue = state.queue.filter((i) => i.status === 'active');
      state.queueMap.clear();
      state.queue.forEach((i) => state.queueMap.set(i.id, i));
    } else {
      state.queue = [];
      state.queueMap.clear();
    }
    saveQueue();
    setQueue([...state.queue]);
  }

  async function startQueue() {
    if (state.queueRunning) return;
    const pending = state.queue.filter((i) => i.status === 'pending');
    if (!pending.length) return;

    state.queueRunning = true;
    setQueueRunning(true);

    const maxConcurrent = Math.max(1, Math.min(5, state.settings.maxConcurrent ?? 2));

    const runItem = async (item) => {
      item.status = 'active';
      item.percent = 0;
      setQueue([...state.queue]);

      const downloadId = item.id;
      state.downloads.set(downloadId, {
        title: item.title, percent: 0, speed: '--', eta: '--', status: 'downloading', file: null,
      });

      state.history.unshift({
        id: downloadId, title: item.title, url: item.url,
        date: new Date().toISOString(), type: item.type,
        format: item.isAudioOnly ? item.audioFormat : 'video',
        thumbnail: compactThumb(item.thumbnail), failed: false,
      });
      await saveHistory();
      setHistory([...state.history]);

      await window.api.startDownload({
        url: item.url, formatId: item.formatId, isAudioOnly: item.isAudioOnly,
        audioFormat: item.audioFormat, videoFormat: state.settings.preferredVideoFormat || 'mp4',
        downloadId, embedChapters: item.embedChapters, embedSubs: item.embedSubs,
        subLangs: item.subLangs, saveThumbnail: item.saveThumbnail,
        saveDescription: item.saveDescription, noOverwrites: item.noOverwrites !== false,
        outputDirOverride: item.outputDirOverride ?? null,
        customFilename: item.customFilename ?? null,
        advDlSubs:       item.advDlSubs      ?? false,
        advSubsLangs:    item.advSubsLangs   ?? 'all',
        startTimestamp:  item.startTimestamp ?? null,
        endTimestamp:    item.endTimestamp   ?? null,
        extraArgs:       item.extraArgs      ?? [],
      });

      if (item.status !== 'error') { item.status = 'done'; item.percent = 100; }
      setQueue([...state.queue]);
      state.downloads.delete(downloadId);
    };

    const items = state.queue.filter((i) => i.status === 'pending');
    for (let i = 0; i < items.length; i += maxConcurrent) {
      await Promise.all(items.slice(i, i + maxConcurrent).map(runItem));
    }

    state.queueRunning = false;
    setQueueRunning(false);
    saveQueue();

    const total = state.queue.length;
    const errors = state.queue.filter((i) => i.status === 'error').length;
    if (errors === 0) {
      playSound('success');
      sendNotification('success', 'Fila concluída', `${total} download${total !== 1 ? 's' : ''} concluído${total !== 1 ? 's' : ''} com sucesso.`);
    } else if (errors === total) {
      playSound('error');
      sendNotification('error', 'Fila finalizada com erros', `${errors} download${errors !== 1 ? 's' : ''} falhou.`);
    } else {
      playSound('success');
      const ok = total - errors;
      sendNotification('success', 'Fila finalizada', `${ok} concluído${ok !== 1 ? 's' : ''}, ${errors} com erro.`);
    }
  }

  function handleUpdaterStatus(data) {
    switch (data.status) {
      case 'checking':
        setAppUpdateStatus({ busy: true, log: 'Verificando atualizações...' });
        break;
      case 'not-available':
        setAppUpdateStatus({ busy: false, log: `✓ Versão mais recente (v${data.version || ''}).` });
        break;
      case 'available':
        setAppUpdateStatus({ busy: false, log: '' });
        setUpdateModal({ open: true, status: 'available', version: data.version, notes: data.notes || null, percent: 0 });
        break;
      case 'downloading':
        setUpdateModal((prev) => ({ ...prev, open: true, status: 'downloading', percent: data.percent ?? prev.percent }));
        setAppUpdateStatus({ busy: true, log: `Baixando... ${data.percent ?? 0}%` });
        break;
      case 'downloaded':
        setUpdateModal((prev) => ({ ...prev, open: true, status: 'downloaded', version: data.version ?? prev.version, notes: data.notes ?? prev.notes }));
        setAppUpdateStatus({ busy: false, log: `✓ v${data.version} baixado.` });
        break;
      case 'error':
        setAppUpdateStatus({ busy: false, log: `Erro: ${data.message || 'Falha ao verificar.'}` });
        setUpdateModal((prev) => ({ ...prev, open: false }));
        break;
      default:
        setAppUpdateStatus((prev) => ({ ...prev, busy: false }));
    }
  }

  function handleUpdateDownload() {
    window.api.updaterConfirmDownload().catch(() => {});
  }

  function handleUpdateInstall() {
    window.api.updaterConfirmInstall().catch(() => {});
  }

  function dismissUpdateModal() {
    setUpdateModal((prev) => ({ ...prev, open: false }));
  }

  let _speedThrottle = null;
  function _throttledSpeed() {
    if (_speedThrottle) return;
    _speedThrottle = setTimeout(() => { _speedThrottle = null; updateTitlebarSpeed(); }, 100);
  }

  function setupIpcListeners() {
    window.api.onDownloadProgress((data) => {
      const dl = state.downloads.get(data.id);
      if (dl) {
        if (typeof data.percent === 'number') dl.percent = data.percent;
        if (data.speed) dl.speed = data.speed;
        if (data.eta) dl.eta = data.eta;
        if (data.file) dl.file = data.file;
        if (data.status === 'stalled') {
          dl.stalled = true;
        } else if (data.status) {
          dl.status = data.status;
          dl.stalled = false;
        }
        triggers.setDownloads?.(state.downloads);
      }
      const qi = state.queueMap.get(data.id);
      if (qi && qi.status === 'active') {
        if (typeof data.percent === 'number') qi.percent = data.percent;
        if (data.speed) qi.speed = data.speed;
        if (data.eta) qi.eta = data.eta;
        if (data.status === 'processing') qi.speed = 'Processando...';
        if (data.status === 'trimming')   qi.speed = 'Recortando...';
        triggers.setQueue?.(state.queue);
      }
      _throttledSpeed();
    });

    window.api.onDownloadComplete((data) => {
      const dl = state.downloads.get(data.id);
      if (dl) { dl.status = 'done'; dl.percent = 100; triggers.setDownloads?.(state.downloads); }
      if (!state.queueRunning) {
        playSound('success');
        sendNotification('success', 'Download concluído', dl?.title || 'Arquivo salvo com sucesso.');
      }
      setTimeout(() => {
        state.downloads.delete(data.id);
        triggers.setDownloads?.(state.downloads);
        updateTitlebarSpeed();
      }, 5000);
    });

    window.api.onDownloadFailed((data) => {
      const dl = state.downloads.get(data.id);
      if (dl) {
        dl.status = 'error';
        dl.failReason = data.reason || null;
        triggers.setDownloads?.(state.downloads);
      }

      const histEntry = state.history.find((h) => h.id === data.id);
      if (histEntry) {
        histEntry.failed = true;
        saveHistory();
        triggers.setHistory?.(state.history);
      }
      const qi = state.queueMap.get(data.id);
      if (qi) { qi.status = 'error'; triggers.setQueue?.(state.queue); }
      if (!state.queueRunning) {
        playSound('error');
        const notifBody = data.reason || dl?.title || 'Ocorreu um erro durante o download.';
        sendNotification('error', 'Falha no download', notifBody);
      }
      updateTitlebarSpeed();
      setTimeout(() => {
        state.downloads.delete(data.id);
        triggers.setDownloads?.(state.downloads);
        updateTitlebarSpeed();
      }, 8000);
    });
    window.api.onDownloadError((data) => {
      const dl = state.downloads.get(data.id);
      if (dl && dl.status !== 'done' && dl.status !== 'cancelled') {
        dl.lastError = data.message;
        triggers.setDownloads?.(state.downloads);
      }
    });
    let consoleFlushTimer = null;
    window.api.onConsoleLog((data) => {
      state.consoleLogs.push(data);
      if (state.consoleLogs.length > 500) state.consoleLogs.shift();
      if (consoleFlushTimer) return;
      consoleFlushTimer = setTimeout(() => {
        consoleFlushTimer = null;
        triggers.setConsoleLogs?.(state.consoleLogs);
      }, 80);
    });
  }

  function updateTitlebarSpeed() {
    const speeds = [];
    for (const dl of state.downloads.values()) {
      if (dl.status === 'downloading' && dl.speed && dl.speed !== '--') speeds.push(dl.speed);
    }
    if (speeds.length === 0) { triggers.setTitlebarSpeed?.(null); return; }
    if (speeds.length === 1) { triggers.setTitlebarSpeed?.(speeds[0]); return; }

    let totalBytes = 0;
    for (const s of speeds) {
      const m = s.match(/^([\d.]+)\s*([KMGTki]+B)s?$/i);
      if (!m) continue;
      const val = parseFloat(m[1]);
      const unit = m[2].toLowerCase();
      if (unit.startsWith('g')) totalBytes += val * 1024 ** 3;
      else if (unit.startsWith('m')) totalBytes += val * 1024 ** 2;
      else if (unit.startsWith('k')) totalBytes += val * 1024;
      else totalBytes += val;
    }
    let display;
    if (totalBytes >= 1024 ** 3) display = `${(totalBytes / 1024 ** 3).toFixed(1)} GiB/s`;
    else if (totalBytes >= 1024 ** 2) display = `${(totalBytes / 1024 ** 2).toFixed(1)} MiB/s`;
    else if (totalBytes >= 1024) display = `${(totalBytes / 1024).toFixed(1)} KiB/s`;
    else display = `${totalBytes.toFixed(0)} B/s`;
    triggers.setTitlebarSpeed?.(`${speeds.length}× ${display}`);
  }

  let _settingsSaveTimer = null;
  const _pendingSettingsPatch = {};

  function handleSettingsChange(patch) {
    state.settings = { ...state.settings, ...patch };
    setSettings({ ...state.settings });

    Object.assign(_pendingSettingsPatch, patch);
    clearTimeout(_settingsSaveTimer);
    _settingsSaveTimer = setTimeout(() => {
      const toSave = { ..._pendingSettingsPatch };
      for (const k of Object.keys(_pendingSettingsPatch)) delete _pendingSettingsPatch[k];
      window.api.saveSettings(toSave).catch(() => {});
    }, 300);
  }

  const queuePendingCount = queue.filter((i) => i.status === 'pending').length;
  return (
    <>
      <Titlebar consoleOpen={consoleOpen} onToggleConsole={() => setConsoleOpen((o) => !o)} />
      <div className="app-layout">
        <Sidebar
          currentPage={page}
          onNavigate={setPage}
          queuePendingCount={queuePendingCount}
          ytdlpStatus={ytdlpStatus}
        />
        <main className="main-content">
          {page === 'downloader' && (
            <Downloader
              settings={settings}
              onNavigate={setPage}
              onAddToHistory={addToHistory}
              onAddToQueue={addToQueue}
              downloads={downloads}
              setDownloads={setDownloads}
              repeatPayload={repeatPayload}
              onRepeatConsumed={() => setRepeatPayload(null)}
              url={dlUrl}                         setUrl={setDlUrl}
              videoInfo={dlVideoInfo}             setVideoInfo={setDlVideoInfo}
              isPlaylist={dlIsPlaylist}           setIsPlaylist={setDlIsPlaylist}
              playlistEntries={dlPlaylistEntries} setPlaylistEntries={setDlPlaylistEntries}
              playlistMode={dlPlaylistMode}       setPlaylistMode={setDlPlaylistMode}
              playlistAudioFmt={dlPlaylistAudioFmt} setPlaylistAudioFmt={setDlPlaylistAudioFmt}
              playlistQuality={dlPlaylistQuality} setPlaylistQuality={setDlPlaylistQuality}
              mode={dlMode}                       setMode={setDlMode}
              selectedFormat={dlSelectedFormat}   setSelectedFormat={setDlSelectedFormat}
              customOutputDir={dlCustomOutputDir} setCustomOutputDir={setDlCustomOutputDir}
              renameVal={dlRenameVal}             setRenameVal={setDlRenameVal}
              error={dlError}                     setError={setDlError}
            />
          )}
          {page === 'history' && (
            <History
              history={history}
              onClear={clearHistory}
              onRepeat={(url, type, fmt) => {
                setRepeatPayload({ url, type, fmt });
                setPage('downloader');
              }}
            />
          )}
          {page === 'queue' && (
            <Queue
              queue={queue}
              queueRunning={queueRunning}
              onStart={startQueue}
              onClear={clearQueue}
              onRemove={removeFromQueue}
            />
          )}
          {page === 'settings' && (
            <Settings settings={settings} onSettingsChange={handleSettingsChange} appUpdateStatus={appUpdateStatus} onCheckUpdate={async () => { setAppUpdateStatus({ busy: true, log: 'Conectando ao GitHub...' }); const r = await window.api.checkForUpdates(); if (!r.success && r.error) setAppUpdateStatus({ busy: false, log: `Erro: ${r.error}` }); }} />
          )}
          {page === 'about' && <About />}
        </main>
      </div>
      <UpdateModal
        modal={updateModal}
        onDownload={handleUpdateDownload}
        onInstall={handleUpdateInstall}
        onDismiss={dismissUpdateModal}
      />
      <ConsolePanel
        open={consoleOpen}
        logs={consoleLogs}
        onClose={() => setConsoleOpen(false)}
        onClear={() => { state.consoleLogs = []; setConsoleLogs([]); }}
      />
    </>
  );
}
