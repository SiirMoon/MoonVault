import React, { useState, useEffect } from 'react';
import { state } from '../state.js';
import {
  Search, X, Info, XCircle, ListOrdered, Plus, User, Eye, Calendar,
  Video, Music, Pencil, Folder, RotateCcw, Download, AlertTriangle, ChevronDown, Clock, Zap
} from 'lucide-react';
import {
  formatNumber, formatDate, formatDuration, formatBytes,
  getQualityLabel, sanitiseFilename, compactThumb, escHtml,
} from '../utils.js';

//Já que você está aqui olhando o código, aproveita e reporta algum erro, ou sugestão, please :))
function DownloadItem({ dl, id, onCancel }) {
  const labels = {
    downloading: 'Baixando', processing: 'Processando',
    trimming: 'Recortando...', done: 'Concluído', error: 'Erro', cancelled: 'Cancelado',
  };
  const isError = dl.status === 'error';
  const statusLabel = dl.stalled && !isError ? 'Travado' : (labels[dl.status] || dl.status);
  const statusClass = dl.stalled && !isError ? 'stalled' : dl.status;
  return (
    <div className={`download-item${isError ? ' has-error' : ''}${dl.stalled && !isError ? ' is-stalled' : ''}`}>
      <div className="dl-item-header">
        <span className="dl-title" title={dl.title}>{dl.title}</span>
        <span className={`dl-status ${statusClass}`}>{statusLabel}</span>
        <button className="btn-cancel-dl" onClick={() => onCancel(id)} title="Cancelar">
          <X size={14}/>
        </button>
      </div>
      <div className="dl-progress-bar-wrap">
        <div className={`dl-progress-bar${dl.stalled ? ' stalled' : ''}`} style={{ width: `${dl.percent}%` }}/>
      </div>
      <div className="dl-meta-row">
        <span>{dl.percent.toFixed(1)}%</span>
        <span>{dl.speed}</span>
        <span>ETA {dl.eta}</span>
      </div>
      {dl.stalled && !isError && (
        <div className="dl-warn-row">
            <AlertTriangle size={15}/>
          <span>Sem progresso há mais de 60 s — download pode estar travado.</span>
        </div>
      )}
      {isError && dl.failReason && (
        <div className="dl-error-reason">
<Info size={13} />
          <span>{dl.failReason}</span>
        </div>
      )}
    </div>
  );
}

export default function Downloader({
  settings, onNavigate, onAddToHistory, onAddToQueue,
  downloads, setDownloads,
  repeatPayload, onRepeatConsumed,
  url, setUrl,
  videoInfo, setVideoInfo,
  isPlaylist, setIsPlaylist,
  playlistEntries, setPlaylistEntries,
  playlistMode, setPlaylistMode,
  playlistAudioFmt, setPlaylistAudioFmt,
  playlistQuality, setPlaylistQuality,
  mode, setMode,
  selectedFormat, setSelectedFormat,
  customOutputDir, setCustomOutputDir,
  renameVal, setRenameVal,
  error, setError,
}) {
  const [analyzing, setAnalyzing]         = useState(false);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [diskSpace, setDiskSpace]         = useState('');
  const [showSubs, setShowSubs]           = useState(false);
  const [audioFmt, setAudioFmt]           = useState(settings.preferredAudioFormat || 'mp3');
  const [optChapters, setOptChapters]     = useState(false);
  const [optThumbnail, setOptThumbnail]   = useState(false);
  const [optDescription, setOptDescription] = useState(false);
  const [optNoOverwrites, setOptNoOverwrites] = useState(true);
  const [optSubs, setOptSubs]             = useState(false);
  const [optSaveHistory, setOptSaveHistory] = useState(true);
  const [selectedLangs, setSelectedLangs] = useState([]);

  const [showAdvanced, setShowAdvanced]   = useState(false);
  const [showExtraOpts, setShowExtraOpts] = useState(false);
  const [showAllFormats, setShowAllFormats] = useState(false);
  const [advExtraArgs, setAdvExtraArgs]   = useState('');        
  const [advDlSubs, setAdvDlSubs]         = useState(false);     
  const [advSubsLangs, setAdvSubsLangs]   = useState('all');     
  const [advStartH, setAdvStartH]         = useState('');
  const [advStartM, setAdvStartM]         = useState('');
  const [advStartS, setAdvStartS]         = useState('');
  const [advEndH, setAdvEndH]             = useState('');
  const [advEndM, setAdvEndM]             = useState('');
  const [advEndS, setAdvEndS]             = useState('');
  const [fastTrim, setFastTrim]           = useState(false);

  useEffect(() => {
    setAudioFmt(settings.preferredAudioFormat || 'mp3');
  }, [settings.preferredAudioFormat]);

  useEffect(() => {
    const folder = customOutputDir || (mode === 'audio' ? settings.audioDownloadPath : settings.videoDownloadPath);
    updateDiskSpace(folder);
  }, [customOutputDir, mode, settings.videoDownloadPath, settings.audioDownloadPath]);

  async function updateDiskSpace(folder) {
    if (!folder) { setDiskSpace(''); return; }
    try {
      const info = await window.api.getDiskSpace(folder);
      if (info?.available == null) { setDiskSpace(''); return; }
      const gb = info.available / (1024 ** 3);
      const label = gb >= 1 ? `${gb.toFixed(1)} GB livres` : `${(info.available / (1024 ** 2)).toFixed(0)} MB livres`;
      setDiskSpace({ label, warn: gb < 2 });
    } catch { setDiskSpace(''); }
  }

  useEffect(() => {
    return () => { window.api.cancelAnalyze(); };
  }, []);

  useEffect(() => {
    if (!repeatPayload) return;
    const { url: repeatUrl, type, fmt } = repeatPayload;
    setUrl(repeatUrl);
    if (type === 'audio') {
      setMode('audio');
      const knownAudio = ['mp3', 'm4a', 'opus', 'flac', 'wav'];
      if (fmt && knownAudio.includes(fmt.toLowerCase())) setAudioFmt(fmt.toLowerCase());
    } else {
      setMode('video');
    }
    onRepeatConsumed();
    setTimeout(() => triggerAnalyze(repeatUrl), 0);
  }, [repeatPayload]);


  useEffect(() => {
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
    const onDrop = (e) => {
      e.preventDefault(); e.stopPropagation();
      let dropped = '';
      if (e.dataTransfer.types.includes('text/uri-list'))
        dropped = e.dataTransfer.getData('text/uri-list').split('\n')[0].trim();
      if (!dropped) dropped = e.dataTransfer.getData('text/plain').trim();
      if (dropped?.startsWith('http')) {
        onNavigate('downloader');
        setUrl(dropped);
        triggerAnalyze(dropped);
      }
    };
    document.addEventListener('dragover', prevent);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragover', prevent);
      document.removeEventListener('drop', onDrop);
    };
  }, []);

  async function triggerAnalyze(urlOverride) {
    const target = (urlOverride || url).trim();
    if (!target) { setError('Por favor, insira uma URL válida'); return; }
    try { new URL(target); } catch { setError('URL inválida. Por favor, insira uma URL completa.'); return; }

    setError('');
    setVideoInfo(null);
    setIsPlaylist(false);
    setPlaylistEntries([]);
    setAnalyzingSync(true);

    const result = await window.api.analyzeUrl(target);
    setAnalyzingSync(false);

    if (!result.success) { setError(result.error || 'Não foi possível analisar o link.'); return; }

    if (result.isPlaylist) {
      setIsPlaylist(true);
      setPlaylistLoading(true);
      setPlaylistMode('video');
      setPlaylistAudioFmt('mp3');

      const plResult = await window.api.analyzePlaylist(target);
      setPlaylistLoading(false);
      if (!plResult.success || !plResult.entries?.length) return;
      setPlaylistEntries(plResult.entries);
        setCheckedItems(new Set(plResult.entries.map((_, i) => i)));
    } else {
      setIsPlaylist(false);
      setVideoInfo(result.info);
      const formats = (result.info.formats || []).slice().reverse();
      const filtered = mode === 'audio'
        ? formats.filter((f) => !f.vcodec || f.vcodec === 'none')
        : formats.filter((f) => f.vcodec && f.vcodec !== 'none');
      const list = filtered.length ? filtered : formats;
      if (list[0]) setSelectedFormat(list[0].format_id);
    }
  }

  function handleUrlKeyDown(e) { if (e.key === 'Enter') triggerAnalyze(); }
  const analyzingRef = React.useRef(false);
  function setAnalyzingSync(val) {
    analyzingRef.current = val;
    setAnalyzing(val);
  }

  function handleUrlPaste() {
    setTimeout(() => {
      if (analyzingRef.current) return;
      const val = document.getElementById('url-input-react')?.value?.trim();
      if (val?.startsWith('http')) triggerAnalyze(val);
    }, 50);
  }

  function handleModeChange(m) {
    setMode(m);
    if (videoInfo) {
      const formats = (videoInfo.formats || []).slice().reverse();
      const filtered = m === 'audio'
        ? formats.filter((f) => !f.vcodec || f.vcodec === 'none')
        : formats.filter((f) => f.vcodec && f.vcodec !== 'none');
      const list = filtered.length ? filtered : formats;
      if (list[0]) setSelectedFormat(list[0].format_id);
    }
  }

  function toggleLang(lang) {
    setSelectedLangs((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  }

  async function pickDownloadFolder() {
    const result = await window.api.selectFolderTemp();
    if (result) setCustomOutputDir(result);
  }

  function buildQualityRows() {
    if (!videoInfo) return [];
    const formats = (videoInfo.formats || []).slice().reverse();
    const isAudio = mode === 'audio';
    let filtered = isAudio
      ? formats.filter((f) => !f.vcodec || f.vcodec === 'none')
      : formats.filter((f) => f.vcodec && f.vcodec !== 'none');
    if (!filtered.length) filtered = formats;
    return filtered;
  }

  async function startDownload() {
    if (!videoInfo) return;
    const isAudio = mode === 'audio';
    const downloadId = `dl_${++state.downloadCounter}_${Date.now()}`;
    const title = videoInfo.title || 'Vídeo';
    const langs = optSubs ? selectedLangs : [];
    const customFilename = renameVal.trim() ? sanitiseFilename(renameVal.trim()) : null;

    state.downloads.set(downloadId, {
      title, percent: 0, speed: '--', eta: '--', status: 'downloading', file: null,
    });
    setDownloads(new Map(state.downloads));

    if (optSaveHistory) {
      onAddToHistory({
        id: downloadId, title, url: url.trim(), date: new Date().toISOString(),
        type: isAudio ? 'audio' : 'video',
        format: isAudio ? audioFmt : 'video',
        thumbnail: compactThumb(videoInfo?.thumbnail),
        failed: false,
      });
    }

    setCustomOutputDir(null);
    setRenameVal('');

    const startTs  = buildTimestamp(advStartH, advStartM, advStartS);
    const endTs    = buildTimestamp(advEndH,   advEndM,   advEndS);
    const extraArgsParsed = parseExtraArgs(advExtraArgs);

    window.api.startDownload({
      url: url.trim(), formatId: selectedFormat,
      isAudioOnly: isAudio, audioFormat: audioFmt,
      videoFormat: settings.preferredVideoFormat || 'mp4',
      downloadId, embedChapters: optChapters,
      embedSubs: optSubs, subLangs: langs,
      saveThumbnail: optThumbnail, saveDescription: optDescription,
      noOverwrites: optNoOverwrites,
      outputDirOverride: customOutputDir || null,
      customFilename,
      advDlSubs, advSubsLangs,
      startTimestamp: startTs,
      endTimestamp:   endTs,
      fastTrim,
      extraArgs:      extraArgsParsed,
    });
  }

  function addToQueue() {
    if (!videoInfo) return;
    const isAudio = mode === 'audio';
    const langs = optSubs ? selectedLangs : [];
    const customFilename = renameVal.trim() ? sanitiseFilename(renameVal.trim()) : null;
    const startTs  = buildTimestamp(advStartH, advStartM, advStartS);
    const endTs    = buildTimestamp(advEndH,   advEndM,   advEndS);
    const extraArgsParsed = parseExtraArgs(advExtraArgs);
    const item = {
      id: `qi_${++state.queueCounter}`,
      url: url.trim(), title: videoInfo.title || url.trim(),
      thumbnail: videoInfo.thumbnail || null,
      isAudioOnly: isAudio, audioFormat: audioFmt,
      formatId: selectedFormat,
      embedChapters: optChapters, embedSubs: optSubs, subLangs: langs,
      saveThumbnail: optThumbnail, saveDescription: optDescription,
      noOverwrites: optNoOverwrites,
      type: isAudio ? 'audio' : 'video',
      fmt: isAudio ? audioFmt.toUpperCase() : (settings.preferredVideoFormat || 'MP4').toUpperCase(),
      status: 'pending', percent: 0, speed: '--', eta: '--',
      outputDirOverride: customOutputDir || null,
      customFilename,
      advDlSubs, advSubsLangs,
      startTimestamp: startTs,
      endTimestamp:   endTs,
      fastTrim,
      extraArgs:      extraArgsParsed,
    };
    setCustomOutputDir(null);
    setRenameVal('');
    onAddToQueue(item);
  }

  function addPlaylistToQueue() {
    const checked = Array.from(checkedItems);
    if (!checked.length) return;

    const isAudio = playlistMode === 'audio';
    checked.forEach((idx) => {
      const entry = playlistEntries[idx];
      if (!entry) return;
      const item = {
        id: `qi_${++state.queueCounter}`,
        url: entry.url, title: entry.title,
        thumbnail: entry.thumbnail || null,
        isAudioOnly: isAudio, audioFormat: playlistAudioFmt,
        formatId: isAudio ? null : (playlistQuality || null),
        embedChapters: optChapters, embedSubs: optSubs, subLangs: selectedLangs,
        saveThumbnail: optThumbnail, saveDescription: optDescription,
        noOverwrites: optNoOverwrites,
        type: isAudio ? 'audio' : 'video',
        fmt: isAudio ? playlistAudioFmt.toUpperCase() : (settings.preferredVideoFormat || 'MP4').toUpperCase(),
        status: 'pending', percent: 0, speed: '--', eta: '--',
        outputDirOverride: customOutputDir || null,
        customFilename: null,
      };
      onAddToQueue(item);
    });
    setCustomOutputDir(null);
  }

  function buildTimestamp(h, m, s) {
    const hh = Math.max(0, parseInt(h) || 0);
    const mm = Math.max(0, parseInt(m) || 0);
    const ss = Math.max(0, parseInt(s) || 0);
    if (hh === 0 && mm === 0 && ss === 0) return null;
    return [hh, mm, ss].map((v) => String(v).padStart(2, '0')).join(':');
  }

  function parseExtraArgs(raw) {
    return raw
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t && !t.match(/^https?:\/\//i));
  }

  async function cancelDownload(id) {
    await window.api.cancelDownload(id);
    const dl = state.downloads.get(id);
    if (dl) { dl.status = 'cancelled'; dl.percent = 0; }
    setDownloads(new Map(state.downloads));
    setTimeout(() => {
      state.downloads.delete(id);
      setDownloads(new Map(state.downloads));
    }, 2000);
  }

  const outputFolder = customOutputDir ||
    (mode === 'audio' ? settings.audioDownloadPath : settings.videoDownloadPath) ||
    'Pasta não configurada';

  const allSubs = { ...(videoInfo?.subtitles || {}), ...(videoInfo?.automatic_captions || {}) };
  const langs = Object.keys(allSubs).slice(0, 20);
  const showCookieNotice = /instagram|twitter|x\.com|facebook|tiktok/.test(url);
  const qualityRows = buildQualityRows();

  function buildQualityPills() {
    if (!videoInfo || mode === 'audio') return [];
    const formats = (videoInfo.formats || []).slice().reverse();
    const video = formats.filter((f) => f.vcodec && f.vcodec !== 'none' && f.height);
    const buckets = [2160, 1440, 1080, 720, 480, 360];
    const pills = [];
    for (const h of buckets) {
      const match = video.filter((f) => f.height === h);
      if (match.length) {
        const best = match.find((f) => f.ext === 'mp4') || match[0];
        const size = best.filesize || best.filesize_approx;
        pills.push({ fmt: best, label: `${h}p`, sub: best.ext?.toUpperCase() || '', size });
      }
    }
    if (!pills.length && video.length) {
      const best = video[0];
      const size = best.filesize || best.filesize_approx;
      pills.push({ fmt: best, label: 'Melhor', sub: best.ext?.toUpperCase() || '', size });
    }
    return pills;
  }
  const qualityPills = buildQualityPills();

  return (
    <section className="page active" id="page-downloader">
      <div className="page-header">
        <h1>Downloader</h1>
        <p className="page-subtitle">Cole o link, escolha a qualidade e baixe</p>
      </div>
    
      <div className="url-card">
        <div className="url-input-row">
          <div className={`url-field${url ? ' has-value' : ''}`}>
<Search size={18} className="url-icon" />
            <input
              id="url-input-react"
              type="url"
              value={url}
              placeholder="https://www.youtube.com/watch?v=..."
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              onPaste={handleUrlPaste}
            />
            {url && (
              <button className="clear-url-btn" onClick={() => {
                setUrl('');
                setVideoInfo(null);
                setError('');
                setIsPlaylist(false);
                setPlaylistEntries([]);
                setCheckedItems(new Set());
                window.api.cancelAnalyze();
              }} title="Limpar URL">
<X size={14} />
              </button>
            )}
          </div>
          <button className="btn-analyze" onClick={() => triggerAnalyze()} disabled={analyzing}>
<Search size={16} />
            <span>Analisar</span>
          </button>
        </div>

        {showCookieNotice && (
          <div className="cookie-notice">
<Info size={14} />
            <span>Sites como Instagram/Twitter podem precisar de cookies.{' '}
              <button onClick={() => onNavigate('settings')}>Configurar cookies →</button>
            </span>
          </div>
        )}
      </div>

      {analyzing && (
        <div className="analyze-loading">
          <div className="spinner"/>
          <span>Analisando URL, aguarde...</span>
        </div>
      )}

      {error && (
        <div className="error-card">
<XCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {(videoInfo || isPlaylist) && !analyzing && (
        <div className="results-area">
          {isPlaylist && (
            <div className="playlist-card">
              <div className="playlist-card-header">
                <div className="playlist-icon">
<ListOrdered size={22} />
                </div>
                <div className="playlist-meta">
                  <div className="playlist-title">Playlist</div>
                  <div className="playlist-count">
                    {playlistLoading ? 'Carregando itens...' :
                      `${playlistEntries.length} vídeo${playlistEntries.length !== 1 ? 's' : ''}`}
                  </div>
                </div>
                {!playlistLoading && (
                  <div className="playlist-header-actions">
                    <button className="btn-select-all" onClick={() =>
                      setCheckedItems(new Set(playlistEntries.map((_, i) => i)))
                    }>Todos</button>
                    <button className="btn-select-all" onClick={() =>
                      setCheckedItems(new Set())
                    }>Nenhum</button>
                  </div>
                )}
              </div>

              {playlistLoading ? (
                <div className="playlist-loading">
                  <div className="spinner"/><span>Carregando itens da playlist...</span>
                </div>
              ) : (
                <>
                  <div className="playlist-items">
                    {playlistEntries.map((e, idx) => (
                      <label key={idx} className="playlist-item" data-idx={idx}>
                        <input
                          type="checkbox"
                          className="playlist-check"
                          data-idx={idx}
                          checked={checkedItems.has(idx)}
                          onChange={() => setCheckedItems(prev => {
                            const next = new Set(prev);
                            next.has(idx) ? next.delete(idx) : next.add(idx);
                            return next;
                          })}
                        />
                        <div className="pl-thumb">
                          {e.thumbnail && (
                            <img src={e.thumbnail} alt="" loading="lazy" onError={(ev) => { ev.currentTarget.style.display = 'none'; }}/>
                          )}
                          {e.duration && <span className="pl-dur">{formatDuration(e.duration)}</span>}
                        </div>
                        <div className="pl-info">
                          <div className="pl-title">{e.title}</div>
                          <div className="pl-url">{e.url || ''}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="playlist-footer">
                    <div className="playlist-footer-options">
                      <div className="playlist-quality-row">
                        <span className="section-label">Modo</span>
                        <div className="playlist-mode-pills">
                          <button className={`fmt-pill${playlistMode === 'video' ? ' active' : ''}`} onClick={() => setPlaylistMode('video')}>Vídeo</button>
                          <button className={`fmt-pill${playlistMode === 'audio' ? ' active' : ''}`} onClick={() => setPlaylistMode('audio')}>Áudio</button>
                        </div>
                      </div>
                      {playlistMode === 'video' && (
                        <div className="playlist-quality-row">
                          <span className="section-label">Qualidade</span>
                          <select className="pl-quality-select" value={playlistQuality} onChange={(e) => setPlaylistQuality(e.target.value)}>
                            <option value="bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best">Melhor disponível</option>
                            <option value="bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best">Até 1080p</option>
                            <option value="bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best">Até 720p</option>
                            <option value="bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best">Até 480p</option>
                            <option value="worstvideo+worstaudio/worst">Menor tamanho</option>
                          </select>
                        </div>
                      )}
                      {playlistMode === 'audio' && (
                        <div className="playlist-quality-row">
                          <span className="section-label">Formato</span>
                          <div className="playlist-mode-pills">
                            {['mp3','m4a','opus','flac'].map((f) => (
                              <button key={f} className={`fmt-pill${playlistAudioFmt === f ? ' active' : ''}`} onClick={() => setPlaylistAudioFmt(f)}>
                                {f.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="playlist-footer-bottom">
                      <span className="playlist-selected-count">
                        {checkedItems.size} de {playlistEntries.length} selecionados
                      </span>
                      <button className="btn-add-playlist-queue" onClick={addPlaylistToQueue}>
<Plus size={14} />
                        Adicionar selecionados à Fila
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {videoInfo && (
            <div className="video-meta-card">
              <div className="video-thumb-wrap">
                {videoInfo.thumbnail && (
                  <img id="video-thumb" src={videoInfo.thumbnail} alt="Thumbnail"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}/>
                )}
                <div className="thumb-overlay">
                  <span className="duration-badge">{formatDuration(videoInfo.duration)}</span>
                </div>
              </div>
              <div className="video-info">
                <h2 className="video-title">{videoInfo.title || 'Sem título'}</h2>
                <div className="video-meta-row">
                  {videoInfo.uploader && (
                    <span className="meta-chip">
<User size={12} />
                      {videoInfo.uploader || videoInfo.channel}
                    </span>
                  )}
                  {videoInfo.view_count && (
                    <span className="meta-chip">
<Eye size={12} />
                      {formatNumber(videoInfo.view_count)} visualizações
                    </span>
                  )}
                  {videoInfo.upload_date && (
                    <span className="meta-chip">
<Calendar size={12} />
                      {formatDate(videoInfo.upload_date)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {videoInfo && (
            <div className="download-panel">
              <div className="mode-toggle-row">
                <div className="mode-toggle">
                  <button className={`mode-btn${mode === 'video' ? ' active' : ''}`} onClick={() => handleModeChange('video')}>
<Video size={15} />
                    Vídeo
                  </button>
                  <button className={`mode-btn${mode === 'audio' ? ' active' : ''}`} onClick={() => handleModeChange('audio')}>
<Music size={15} />
                    Somente Áudio
                  </button>
                </div>

                <button
                  className={`btn-extra-opts${showExtraOpts ? ' open' : ''}`}
                  onClick={() => setShowExtraOpts(v => !v)}
                  title="Opções adicionais"
                >
                  <ChevronDown size={13} />
                  Opções
                </button>
              </div>

              {showExtraOpts && (
                <div className="extra-opts-panel">
                  {[
                    { id: 'chapters',     val: optChapters,     set: setOptChapters,     label: 'Capítulos',        title: 'Incorporar capítulos no arquivo' },
                    { id: 'thumbnail',    val: optThumbnail,    set: setOptThumbnail,    label: 'Thumbnail',        title: 'Salvar thumbnail' },
                    { id: 'description',  val: optDescription,  set: setOptDescription,  label: 'Descrição',        title: 'Salvar descrição em .txt' },
                    { id: 'nooverwrites', val: optNoOverwrites, set: setOptNoOverwrites, label: 'Não sobrescrever', title: 'Não sobrescrever arquivos que já existem na pasta' },
                  ].map(({ id, val, set, label, title }) => (
                    <label key={id} className="opt-toggle" title={title}>
                      <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)}/>
                      <span className="toggle-pill"/>
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}

              {mode === 'audio' && (
                <div className="format-section">
                  <span className="section-label">Formato de Saída</span>
                  <div className="format-pills">
                    {['mp3','m4a','opus','flac','wav'].map((f) => (
                      <button key={f} className={`fmt-pill${audioFmt === f ? ' active' : ''}`} onClick={() => setAudioFmt(f)}>
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="quality-section">
                {mode === 'video' && qualityPills.length > 0 && (
                  <div className="quality-pills-row">
                    {qualityPills.map(({ fmt, label, sub, size }) => {
                      const isSelected = selectedFormat === fmt.format_id;
                      return (
                        <button
                          key={fmt.format_id}
                          className={`quality-pill${isSelected ? ' active' : ''}`}
                          onClick={() => setSelectedFormat(fmt.format_id)}
                        >
                          <span className="qp-label">{label}</span>
                          <span className="qp-sub">{sub}{size ? ` · ${formatBytes(size)}` : ''}</span>
                        </button>
                      );
                    })}
                    <button
                      className="quality-pill quality-pill-more"
                      onClick={() => setShowAllFormats(v => !v)}
                    >
                      <span className="qp-label">{showAllFormats ? 'Menos' : 'Mais'}</span>
                      <span className="qp-sub">formatos</span>
                    </button>
                  </div>
                )}

                {(mode === 'audio' || showAllFormats) && (
                  <div className="quality-table-wrap">
                    <table className="quality-table">
                      <thead>
                        <tr>
                          <th>Sel.</th><th>Qualidade</th><th>Ext</th>
                          <th>Resolução</th><th>Tamanho</th><th>Codec</th><th>FPS</th><th>HDR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qualityRows.map((fmt) => {
                          const isAudio = mode === 'audio';
                          const ql = getQualityLabel(fmt, isAudio);
                          const ext = (fmt.ext || 'N/A').toUpperCase();
                          const resolution = fmt.resolution || (fmt.width && fmt.height ? `${fmt.width}x${fmt.height}` : (fmt.vcodec === 'none' ? 'Só áudio' : 'N/A'));
                          const filesize = fmt.filesize ? formatBytes(fmt.filesize) : (fmt.filesize_approx ? `~${formatBytes(fmt.filesize_approx)}` : 'N/A');
                          const codec = isAudio ? (fmt.acodec || 'N/A') : (fmt.vcodec || 'N/A');
                          const fps = fmt.fps ? `${fmt.fps}fps` : 'N/A';
                          const hdr = fmt.dynamic_range && fmt.dynamic_range !== 'SDR' ? fmt.dynamic_range : 'SDR';
                          const isSelected = selectedFormat === fmt.format_id;
                          return (
                            <tr key={fmt.format_id} className={isSelected ? 'selected' : ''} onClick={() => setSelectedFormat(fmt.format_id)}>
                              <td><input type="radio" name="format" value={fmt.format_id} checked={isSelected} onChange={() => setSelectedFormat(fmt.format_id)}/></td>
                              <td><span className={ql.cls}>{ql.text}</span></td>
                              <td><span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{ext}</span></td>
                              <td><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{resolution}</span></td>
                              <td><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{filesize}</span></td>
                              <td><span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t3)' }}>{codec.slice(0, 14)}</span></td>
                              <td><span style={{ fontSize: 12, color: 'var(--t3)' }}>{fps}</span></td>
                              <td><span style={{ fontSize: 12, color: hdr !== 'SDR' ? 'var(--warn)' : 'var(--t3)' }}>{hdr}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="adv-opts-section">
                <button
                  className={`adv-opts-toggle${showAdvanced ? ' open' : ''}`}
                  onClick={() => setShowAdvanced((v) => !v)}
                  type="button"
                >
<ChevronDown size={14} className="adv-chevron" strokeWidth={2.5} />
                  Opções Avançadas
                </button>

                {showAdvanced && (
                  <div className="adv-opts-body">

                    <div className="adv-field">
                      <label className="adv-label">
                        Comandos extras para yt-dlp
                        <span className="adv-hint">Somente flags — URLs são ignoradas automaticamente</span>
                      </label>
                      <textarea
                        className="adv-textarea"
                        rows={2}
                        value={advExtraArgs}
                        onChange={(e) => setAdvExtraArgs(e.target.value)}
                        placeholder="--sponsorblock-remove all  --no-embed-metadata"
                        spellCheck={false}
                      />
                    </div>

                    <div className="adv-field">
                      <label className="adv-label adv-label-row">
                        <input
                          type="checkbox"
                          checked={advDlSubs}
                          onChange={(e) => setAdvDlSubs(e.target.checked)}
                        />
                        Baixar legendas disponíveis
                      </label>
                      {advDlSubs && (
                        <div className="adv-sub-row">
                          <input
                            type="text"
                            className="adv-input adv-input-sm"
                            value={advSubsLangs}
                            onChange={(e) => setAdvSubsLangs(e.target.value)}
                            placeholder="all"
                          />
                          <span className="adv-hint">Código de idioma (ex: pt, en, es) ou <code>all</code></span>
                        </div>
                      )}
                    </div>

                    <div className="adv-field">
                      <label className="adv-label">Recortar — Tempo de início</label>
                      <span className="adv-hint">Lembre-se de que quanto maior o tamanho do arquivo, mais tempo o recorte irá demorar</span>
                      <div className="adv-time-row">
                        <div className="adv-time-field">
                          <input
                            type="number" min="0" max="99"
                            className="adv-time-input"
                            value={advStartH}
                            onChange={(e) => setAdvStartH(e.target.value)}
                            placeholder="00"
                          />
                          <span className="adv-time-unit">h</span>
                        </div>
                        <span className="adv-time-sep">:</span>
                        <div className="adv-time-field">
                          <input
                            type="number" min="0" max="59"
                            className="adv-time-input"
                            value={advStartM}
                            onChange={(e) => setAdvStartM(e.target.value)}
                            placeholder="00"
                          />
                          <span className="adv-time-unit">m</span>
                        </div>
                        <span className="adv-time-sep">:</span>
                        <div className="adv-time-field">
                          <input
                            type="number" min="0" max="59"
                            className="adv-time-input"
                            value={advStartS}
                            onChange={(e) => setAdvStartS(e.target.value)}
                            placeholder="00"
                          />
                          <span className="adv-time-unit">s</span>
                        </div>
                        {(advStartH || advStartM || advStartS) && (
                          <button className="adv-time-clear" type="button" title="Limpar" onClick={() => { setAdvStartH(''); setAdvStartM(''); setAdvStartS(''); }}>
<X size={11} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="adv-field">
                      <label className="adv-label">Recortar — Tempo de fim</label>
                      <div className="adv-time-row">
                        <div className="adv-time-field">
                          <input
                            type="number" min="0" max="99"
                            className="adv-time-input"
                            value={advEndH}
                            onChange={(e) => setAdvEndH(e.target.value)}
                            placeholder="00"
                          />
                          <span className="adv-time-unit">h</span>
                        </div>
                        <span className="adv-time-sep">:</span>
                        <div className="adv-time-field">
                          <input
                            type="number" min="0" max="59"
                            className="adv-time-input"
                            value={advEndM}
                            onChange={(e) => setAdvEndM(e.target.value)}
                            placeholder="00"
                          />
                          <span className="adv-time-unit">m</span>
                        </div>
                        <span className="adv-time-sep">:</span>
                        <div className="adv-time-field">
                          <input
                            type="number" min="0" max="59"
                            className="adv-time-input"
                            value={advEndS}
                            onChange={(e) => setAdvEndS(e.target.value)}
                            placeholder="00"
                          />
                          <span className="adv-time-unit">s</span>
                        </div>
                        {(advEndH || advEndM || advEndS) && (
                          <button className="adv-time-clear" type="button" title="Limpar" onClick={() => { setAdvEndH(''); setAdvEndM(''); setAdvEndS(''); }}>
<X size={11} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </div>
                    {(advStartH || advStartM || advStartS || advEndH || advEndM || advEndS) && (
                      <div className="adv-field">
                        <label className="adv-label">Modo de corte</label>
                        <div className="adv-trim-mode">
                          <label className={`adv-trim-btn${!fastTrim ? ' active' : ''}`}>
                            <input type="radio" name="trimMode" checked={!fastTrim}
                              onChange={() => setFastTrim(false)} />
                            <Clock size={16}/>
                            Preciso
                            <span className="adv-trim-hint">Re-encodifica o corte — áudio garantido, porém demorado</span>
                          </label>
                          <label className={`adv-trim-btn${fastTrim ? ' active' : ''}`}>
                            <input type="radio" name="trimMode" checked={fastTrim}
                              onChange={() => setFastTrim(true)} />
                            <Zap size={16}/>
                            Rápido
                            <span className="adv-trim-hint">Keyframe mais próximo, sem re-encode</span>
                          </label>
                        </div>
                
                      </div>
                    )}

                  </div>
                )}
              </div>
              <div className="download-action-row">
                <div className="dl-history-toggle-row">
                  <label className="opt-toggle">
                    <input type="checkbox" checked={optSaveHistory} onChange={(e) => setOptSaveHistory(e.target.checked)}/>
                    <span className="toggle-pill"/>
                    <span>Salvar no histórico</span>
                  </label>
                </div>

                <div className={`rename-row${renameVal.trim() ? ' has-value' : ''}`}>
<Pencil size={13} style={{ flexShrink: 0, color: 'var(--t3)' }} />
                  <input
                    type="text"
                    className="rename-input"
                    value={renameVal}
                    placeholder="Nome do arquivo (opcional — deixe vazio para usar o título original)"
                    onChange={(e) => setRenameVal(e.target.value)}
                  />
                  {renameVal.trim() && (
<button className="btn-rename-clear" onClick={() => setRenameVal('')} title="Limpar nome"><X size={12} /></button>
                  )}
                </div>

                <div className={`output-folder-row${customOutputDir ? ' custom-folder' : ''}`}>
<Folder size={14} style={{ flexShrink: 0, color: 'var(--t3)' }} />
                  <span className={`output-path-text${customOutputDir ? ' custom' : ''}`}>{outputFolder}</span>
                  {diskSpace && (
                    <span className={`disk-space-label${diskSpace.warn ? ' disk-warn' : ''}`}>{diskSpace.label}</span>
                  )}
                  <button className="btn-pick-folder" onClick={pickDownloadFolder} title="Escolher pasta para este download">
<Pencil size={13} />
                    Trocar pasta
                  </button>
                  {customOutputDir && (
                    <button className="btn-reset-folder" onClick={() => setCustomOutputDir(null)} title="Voltar para a pasta padrão">
<RotateCcw size={13} />
                    </button>
                  )}
                </div>

                <div className="action-btns">
                  <button className="btn-add-queue" onClick={addToQueue} title="Adicionar à fila de downloads">
<Plus size={15} />
                    Adicionar à Fila
                  </button>
                  <button className="btn-download" onClick={startDownload}>
<Download size={16} />
                    <span>Iniciar Download</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {downloads.size > 0 && (
        <div className="active-downloads">
          <div className="section-label-row">
            <span className="section-label">Downloads Ativos</span>
          </div>
          <div>
            {[...downloads.entries()].map(([id, dl]) => (
              <DownloadItem key={id} id={id} dl={dl} onCancel={cancelDownload}/>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}