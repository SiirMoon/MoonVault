import { RefreshCw, Download, RotateCcw, X, Sparkles } from 'lucide-react';

export default function UpdateModal({ modal, onDownload, onInstall, onDismiss }) {
  if (!modal.open) return null;

  const isDownloading = modal.status === 'downloading';
  const isDownloaded  = modal.status === 'downloaded';
  const isAvailable   = modal.status === 'available';

  return (
    <>
      <div
        className="update-modal-backdrop"
        onClick={isDownloading ? undefined : onDismiss}
      />
      <div className="update-modal" role="dialog" aria-modal="true">
        <div className="update-modal-header">
          <div className="update-modal-icon-wrap">
            {isDownloaded
              ? <RotateCcw size={20} strokeWidth={2} />
              : <Sparkles size={20} strokeWidth={2} />
            }
          </div>
          <div className="update-modal-titles">
            <h2 className="update-modal-title">
              {isDownloaded ? 'Pronto para instalar' : 'Atualização disponível'}
            </h2>
            {modal.version && (
              <span className="update-modal-version">v{modal.version}</span>
            )}
          </div>
          {!isDownloading && (
            <button className="update-modal-close" onClick={onDismiss} title="Fechar">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="update-modal-body">
          {isDownloaded && (
            <p className="update-modal-desc">
              O download foi concluído. Reinicie o app agora para aplicar a atualização.
            </p>
          )}
          {isAvailable && (
            <p className="update-modal-desc">
              Uma nova versão do MoonVault está disponível. Deseja baixar e instalar?
            </p>
          )}
          {isDownloading && (
            <p className="update-modal-desc">
              Baixando atualização, aguarde...
            </p>
          )}

          {modal.notes && (
            <div className="update-modal-notes">
              <span className="update-modal-notes-label">O que há de novo</span>
              <pre className="update-modal-notes-body">{modal.notes}</pre>
            </div>
          )}

          {isDownloading && (
            <div className="update-modal-progress-wrap">
              <div className="update-modal-progress-track">
                <div
                  className="update-modal-progress-fill"
                  style={{ width: `${modal.percent ?? 0}%` }}
                />
              </div>
              <span className="update-modal-progress-label">{modal.percent ?? 0}%</span>
            </div>
          )}
        </div>

        {!isDownloading && (
          <div className="update-modal-actions">
            <button className="update-modal-btn-ghost" onClick={onDismiss}>
              {isDownloaded ? 'Instalar depois' : 'Agora não'}
            </button>
            {isAvailable && (
              <button className="update-modal-btn-primary" onClick={onDownload}>
                <Download size={14} />
                Baixar e instalar
              </button>
            )}
            {isDownloaded && (
              <button className="update-modal-btn-primary" onClick={onInstall}>
                <RotateCcw size={14} />
                Reiniciar e instalar
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
