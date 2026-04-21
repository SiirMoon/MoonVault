const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),
  
  // Settings
  getSettings:       ()    => ipcRenderer.invoke('get-settings'),
  saveSettings:      (s)   => ipcRenderer.invoke('save-settings', s),
  selectFolder:      (key) => ipcRenderer.invoke('select-folder', key),
  selectFolderTemp:  ()    => ipcRenderer.invoke('select-folder-temp'),
  selectCookiesFile: ()    => ipcRenderer.invoke('select-cookies-file'),

  // Analysis
  analyzeUrl:      (url) => ipcRenderer.invoke('analyze-url', url),
  analyzePlaylist: (url) => ipcRenderer.invoke('analyze-playlist', url),
  cancelAnalyze:   ()    => ipcRenderer.invoke('cancel-analyze'),

  // Downloads
  startDownload:  (opts) => ipcRenderer.invoke('start-download', opts),
  cancelDownload: (id)   => ipcRenderer.invoke('cancel-download', id),

  // Shell
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
  openFile:   (path) => ipcRenderer.invoke('open-file', path),
  openUrl:    (url)  => ipcRenderer.invoke('open-url', url),

  // Utilities
  getDiskSpace:    (path) => ipcRenderer.invoke('get-disk-space', path),
  getAppVersion:   ()     => ipcRenderer.invoke('get-app-version'),
  getRuntimeVersions: () => ({
  electron: process.versions.electron || null,
  node: process.versions.node || null,
  chrome: process.versions.chrome || null,
}),
  showConfirm: (opts) => ipcRenderer.invoke('show-confirm', opts),

  // Queue persistence
  saveQueue: (items) => ipcRenderer.invoke('save-queue', items),
  loadQueue: ()      => ipcRenderer.invoke('load-queue'),

  // history persistence via electron-store (replaces localStorage)
  saveHistory: (items) => ipcRenderer.invoke('save-history', items),
  loadHistory: ()      => ipcRenderer.invoke('load-history'),

  // yt-dlp management
  checkYtDlp:      () => ipcRenderer.invoke('check-ytdlp'),
  updateYtDlp:     () => ipcRenderer.invoke('update-ytdlp'),
  checkForUpdates:         () => ipcRenderer.invoke('check-for-updates'),
  updaterConfirmDownload:  () => ipcRenderer.invoke('updater-confirm-download'),
  updaterConfirmInstall:   () => ipcRenderer.invoke('updater-confirm-install'),

  // IPC event subscriptions
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_, d) => cb(d)),
  onDownloadComplete: (cb) => ipcRenderer.on('download-complete', (_, d) => cb(d)),
  onDownloadFailed:   (cb) => ipcRenderer.on('download-failed',   (_, d) => cb(d)),
  onDownloadError:    (cb) => ipcRenderer.on('download-error',    (_, d) => cb(d)),
  onConsoleLog:       (cb) => ipcRenderer.on('console-log',       (_, d) => cb(d)),
  onYtdlpUpdateLog:   (cb) => ipcRenderer.on('ytdlp-update-log',  (_, d) => cb(d)),
  onUpdaterStatus:    (cb) => ipcRenderer.on('updater-status',    (_, d) => cb(d)),

  // cleanup: called by App.jsx useEffect teardown
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
