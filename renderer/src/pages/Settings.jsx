import { useState, useEffect } from 'react';
import { state } from '../state.js';
import { applyTheme } from '../utils.js';
import { SwatchBook, FolderDown, Lock, MonitorCog, Zap, FileDown, Info, RefreshCw } from 'lucide-react';

export default function Settings({ settings, onSettingsChange, appUpdateStatus = {}, onCheckUpdate }) {
  const [ytdlpUpdateLog, setYtdlpUpdateLog] = useState('');
  const [ytdlpUpdating, setYtdlpUpdating]   = useState(false);
  const [ytdlpUpdateState, setYtdlpUpdateState] = useState('idle'); // idle | updating | success | error
  const [infoYtdlp, setInfoYtdlp]          = useState('Verificando...');
  const [appVersion, setAppVersion]         = useState('—');

  useEffect(() => {
    window.api.getAppVersion().then((v) => { if (v) setAppVersion(`v${v}`); });
    window.api.checkYtDlp().then((r) => {
      setInfoYtdlp(r.installed ? r.version : 'Não instalado — instale via pip ou winget');
    });
    window.api.onYtdlpUpdateLog((text) => {
      setYtdlpUpdateLog((prev) => prev + text);
    });
  }, []);

  async function selectFolder(key, field) {
    const result = await window.api.selectFolder(key);
    if (result) {
      onSettingsChange({ [key]: result });
    }
  }

  async function selectCookiesFile() {
    const result = await window.api.selectCookiesFile();
    if (result) onSettingsChange({ cookiesFile: result });
  }

  function saveImmediate(key, value) {
    onSettingsChange({ [key]: value });
    window.api.saveSettings({ [key]: value }).catch(() => {});
  }

  function selectTheme(themeId) {
    applyTheme(themeId);
    state.settings.theme = themeId;
    onSettingsChange({ theme: themeId });
    window.api.saveSettings({ theme: themeId }).catch(() => {});
  }

  function isThemeActive(swatchId) {
    const t = settings.theme || 'default';
    return swatchId === t ||
      (swatchId === 'default' && (t === 'default' || t === 'default-light'));
  }

  async function updateYtDlp() {
    setYtdlpUpdating(true);
    setYtdlpUpdateState('updating');
    setYtdlpUpdateLog('');
    const result = await window.api.updateYtDlp();
    setYtdlpUpdating(false);
    if (result.success) {
      setYtdlpUpdateState('success');
      const r = await window.api.checkYtDlp();
      setInfoYtdlp(r.installed ? r.version : 'Não instalado');
      setTimeout(() => setYtdlpUpdateState('idle'), 4000);
    } else {
      setYtdlpUpdateState('error');
      if (result.error) setYtdlpUpdateLog((p) => p + '\n' + result.error);
      setTimeout(() => setYtdlpUpdateState('idle'), 5000);
    }
  }

  const ytdlpBtnLabel = {
    idle:     'Atualizar yt-dlp agora',
    updating: 'Atualizando...',
    success:  'Atualizado com sucesso!',
    error:    'Falha na atualização',
  }[ytdlpUpdateState];

  const themeGroups = [
    {
      label: 'Especial',
      swatches: [
        { id: 'default',  label: 'Padrão',  dots: [{ bg: '#1e1e2e' }, { bg: '#cba6f7' }] },
        { id: 'amoled',   label: 'AMOLED',  dots: [{ bg: '#000000', border: '1px solid #222' }, { bg: '#a594ff' }] },
        { id: 'system',   label: 'Sistema', dots: [{ bg: 'linear-gradient(135deg,#1e1e2e 50%,#faf4ed 50%)' }, { bg: '#cba6f7' }] },
      ],
    },
    {
      label: 'Nord',
      swatches: [
        { id: 'nord',       label: 'Nord Dark',  dots: [{ bg: '#2e3440' }, { bg: '#88c0d0' }] },
        { id: 'nord-light', label: 'Nord Light', dots: [{ bg: '#eceff4', border: '1px solid #ccc' }, { bg: '#5e81ac' }] },
      ],
    },
    {
      label: 'Everforest',
      swatches: [
        { id: 'everforest',       label: 'Everforest Dark',  dots: [{ bg: '#2d353b' }, { bg: '#a7c080' }] },
        { id: 'everforest-light', label: 'Everforest Light', dots: [{ bg: '#fdf6e3', border: '1px solid #d8d0b8' }, { bg: '#6f8f52' }] },
      ],
    },
    {
      label: 'Tokyo Night',
      swatches: [
        { id: 'tokyo-night',       label: 'Tokyo Night Dark',  dots: [{ bg: '#1a1b26' }, { bg: '#7aa2f7' }] },
        { id: 'tokyo-night-light', label: 'Tokyo Night Light', dots: [{ bg: '#d5d6db', border: '1px solid #b8b9bf' }, { bg: '#2e7de9' }] },
      ],
    },
  ];

  return (
    <section className="page active" id="page-settings">
      <div className="page-header">
        <h1>Configurações</h1>
      </div>

      <div className="settings-list">

        <div className="settings-group">
          <span className="settings-group-label">Downloads</span>
          <div className="settings-rows">
            <div className="settings-row">
              <span className="settings-row-label">Pasta para vídeos</span>
              <div className="settings-row-control path-inline">
                <span className="path-inline-val">{settings.videoDownloadPath || 'Não definida'}</span>
                <button className="btn-browse-sm" onClick={() => selectFolder('videoDownloadPath')}>Procurar</button>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-row-label">Pasta para áudios</span>
              <div className="settings-row-control path-inline">
                <span className="path-inline-val">{settings.audioDownloadPath || 'Não definida'}</span>
                <button className="btn-browse-sm" onClick={() => selectFolder('audioDownloadPath')}>Procurar</button>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-row-label">Downloads simultâneos na fila</span>
              <div className="settings-row-control">
                <div className="concurrent-pills">
                  {[1,2,3,4,5].map((n) => (
                    <button
                      key={n}
                      className={`concurrent-pill${(settings.maxConcurrent || 2) === n ? ' active' : ''}`}
                      onClick={() => saveImmediate('maxConcurrent', n)}
                    >{n}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-group">
          <span className="settings-group-label">Formatos padrão</span>
          <div className="settings-rows">
            <div className="settings-row">
              <span className="settings-row-label">Vídeo</span>
              <div className="settings-row-control">
                <select value={settings.preferredVideoFormat || 'mp4'} onChange={(e) => saveImmediate('preferredVideoFormat', e.target.value)} className="select-sm">
                  <option value="mp4">MP4</option>
                  <option value="webm">WebM</option>
                  <option value="mkv">MKV</option>
                  <option value="mov">MOV</option>
                </select>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-row-label">Áudio</span>
              <div className="settings-row-control">
                <select value={settings.preferredAudioFormat || 'mp3'} onChange={(e) => saveImmediate('preferredAudioFormat', e.target.value)} className="select-sm">
                  <option value="mp3">MP3</option>
                  <option value="m4a">M4A</option>
                  <option value="opus">Opus</option>
                  <option value="flac">FLAC</option>
                  <option value="wav">WAV</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-group">
          <span className="settings-group-label">Aparência</span>
          <div className="settings-rows">
            <div className="settings-row settings-row-block">
              <div className="theme-picker">
                {themeGroups.map((group) => (
                  <div className="theme-picker-group" key={group.label}>
                    <span className="theme-picker-group-label">{group.label}</span>
                    <div className="theme-swatches">
                      {group.swatches.map((s) => (
                        <button
                          key={s.id}
                          className={`theme-swatch${isThemeActive(s.id) ? ' active' : ''}`}
                          data-theme-id={s.id}
                          onClick={() => selectTheme(s.id)}
                        >
                          <div className="theme-swatch-dots">
                            {s.dots.map((d, i) => (
                              <span key={i} style={{ background: d.bg, border: d.border }}></span>
                            ))}
                          </div>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="settings-group">
          <span className="settings-group-label">Autenticação</span>
          <div className="settings-rows">
            <div className="settings-row">
              <span className="settings-row-label">Arquivo cookies.txt</span>
              <div className="settings-row-control path-inline">
                <span className="path-inline-val">{settings.cookiesFile || 'Nenhum'}</span>
                <button className="btn-browse-sm" onClick={selectCookiesFile}>Procurar</button>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-row-label">Cookies do navegador</span>
              <div className="settings-row-control">
                <select value={settings.cookiesFromBrowser || ''} onChange={(e) => saveImmediate('cookiesFromBrowser', e.target.value)} className="select-sm">
                  <option value="">Não usar</option>
                  <option value="chrome">Chrome</option>
                  <option value="firefox">Firefox</option>
                  <option value="chromium">Chromium</option>
                  <option value="brave">Brave</option>
                  <option value="edge">Edge</option>
                  <option value="safari">Safari</option>
                  <option value="opera">Opera</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-group">
          <span className="settings-group-label">Sistema</span>
          <div className="settings-rows">
            <div className="settings-row">
              <span className="settings-row-label">yt-dlp</span>
              <div className="settings-row-control settings-row-sys">
                <span className="sys-val">{infoYtdlp}</span>
                <button
                  className={`btn-sys-action${ytdlpUpdateState !== 'idle' ? ` ${ytdlpUpdateState}` : ''}`}
                  disabled={ytdlpUpdating}
                  onClick={updateYtDlp}
                >
                  <RefreshCw size={12} />
                  {ytdlpBtnLabel}
                </button>
              </div>
            </div>
            {ytdlpUpdateLog && <div className="settings-row"><div className="update-log" style={{flex:1}}>{ytdlpUpdateLog}</div></div>}
            <div className="settings-row">
              <span className="settings-row-label">Versão do app</span>
              <div className="settings-row-control settings-row-sys">
                <span className="sys-val">{appVersion}</span>
                <button
                  className={`btn-sys-action${appUpdateStatus.busy ? ' updating' : ''}`}
                  disabled={appUpdateStatus.busy}
                  onClick={onCheckUpdate}
                >
                  <RefreshCw size={12} />
                  {appUpdateStatus.busy ? 'Verificando...' : 'Verificar atualização'}
                </button>
              </div>
            </div>
            {appUpdateStatus.log && <div className="settings-row"><div className="update-log" style={{flex:1}}>{appUpdateStatus.log}</div></div>}
            <div className="settings-row">
              <span className="settings-row-label">Node.js</span>
              <span className="sys-val" style={{marginLeft:'auto'}}>{typeof process !== 'undefined' && process.versions?.node ? `v${process.versions.node}` : '—'}</span>
            </div>
            <div className="settings-row">
              <span className="settings-row-label">Electron</span>
              <span className="sys-val" style={{marginLeft:'auto'}}>{typeof process !== 'undefined' && process.versions?.electron ? `v${process.versions.electron}` : '—'}</span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
