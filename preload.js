const { contextBridge, ipcRenderer } = require('electron');
 
// Expõe uma API restrita para o processo de renderização.
// Nada do Node ou do Electron vaza, apenas estes métodos explicitamente definidos.
contextBridge.exposeInMainWorld('api', {
 
  // Controles da janela
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),
 
  // Configurações
  getSettings:      ()        => ipcRenderer.invoke('get-settings'),
  saveSettings:     (s)       => ipcRenderer.invoke('save-settings', s),
  selectFolder:     (key)     => ipcRenderer.invoke('select-folder', key),
  selectFolderTemp: ()        => ipcRenderer.invoke('select-folder-temp'),
  selectCookiesFile:()        => ipcRenderer.invoke('select-cookies-file'),
 
  // Análise de URL
  analyzeUrl:      (url) => ipcRenderer.invoke('analyze-url', url),
  analyzePlaylist: (url) => ipcRenderer.invoke('analyze-playlist', url),
 
  // Downloads
  startDownload:  (opts) => ipcRenderer.invoke('start-download', opts),
  cancelDownload: (id)   => ipcRenderer.invoke('cancel-download', id),
 
  // Sistema de arquivos
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
  openFile:   (path) => ipcRenderer.invoke('open-file', path),
  openUrl:    (url)  => ipcRenderer.invoke('open-url', url),
 
  // Informações do disco
  getDiskSpace:    (path) => ipcRenderer.invoke('get-disk-space', path),
  getAppVersion:   ()     => ipcRenderer.invoke('get-app-version'),
 
  // Armazenamento do histórico
  clearHistoryStorage: () => ipcRenderer.invoke('clear-history-storage'),
 
  // Persistência da fila
  saveQueue: (items) => ipcRenderer.invoke('save-queue', items),
  loadQueue: ()      => ipcRenderer.invoke('load-queue'),
 
  // yt-dlp
  checkYtDlp:  () => ipcRenderer.invoke('check-ytdlp'),
  updateYtDlp: () => ipcRenderer.invoke('update-ytdlp'),
 
  // Atualizações do app
  checkForUpdates:  ()   => ipcRenderer.invoke('check-for-updates'),
 
  // Assinaturas de eventos
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress',  (_, d) => cb(d)),
  onDownloadComplete: (cb) => ipcRenderer.on('download-complete',  (_, d) => cb(d)),
  onDownloadFailed:   (cb) => ipcRenderer.on('download-failed',    (_, d) => cb(d)),
  onDownloadError:    (cb) => ipcRenderer.on('download-error',     (_, d) => cb(d)),
  onConsoleLog:       (cb) => ipcRenderer.on('console-log',        (_, d) => cb(d)),
  onYtdlpUpdateLog:   (cb) => ipcRenderer.on('ytdlp-update-log',   (_, d) => cb(d)),
  onUpdaterStatus:    (cb) => ipcRenderer.on('updater-status',     (_, d) => cb(d)),
 
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});