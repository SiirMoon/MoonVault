import { escHtml, formatDuration } from '../utils.js';
import { Trash2, Play, Clock, Check, XCircle, X, Video, Folder, List } from 'lucide-react';

export default function Queue({ queue, queueRunning, onStart, onClear, onRemove }) {
  const total    = queue.length;
  const pending  = queue.filter((i) => i.status === 'pending').length;
  const done     = queue.filter((i) => i.status === 'done' || i.status === 'error').length;
  const pct      = total > 0 ? (done / total) * 100 : 0;
  const hasPending  = pending > 0;
  const showProgress = queueRunning || done > 0;

  const countLabel = total === 0 ? '0 itens na fila' : `${total} item${total !== 1 ? 's' : ''} na fila`;

  const StatusIcon = ({ status }) => {
    if (status === 'pending') return <Clock size={16} color="var(--t3)" />;
    if (status === 'active') return (
      <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}/>
    );
    if (status === 'done') return <Check size={16} color="var(--ok)" strokeWidth={2.5} />;
    if (status === 'error') return <XCircle size={16} color="var(--bad)" />;
    return null;
  };

  return (
    <section className="page active" id="page-queue">
      <div className="page-header">
        <h1>Fila de Downloads</h1>
        <p className="page-subtitle">Adicione vídeos à fila e baixe todos de uma vez</p>
      </div>

      <div className="queue-toolbar">
        <div className="queue-toolbar-left">
          <span className="queue-count-label">{countLabel}</span>
        </div>
        <div className="queue-toolbar-right">
          <button
            className="btn-queue-clear"
            onClick={onClear}
            disabled={total === 0 || queueRunning}
          >
<Trash2 size={13} />
            Limpar Fila
          </button>
          <button
            className={`btn-start-queue${queueRunning ? ' running' : ''}`}
            onClick={onStart}
            disabled={!hasPending || queueRunning}
          >
<Play size={15} />
            <span>{queueRunning ? 'Processando...' : 'Iniciar Fila'}</span>
          </button>
        </div>
      </div>

      {showProgress && (
        <div className="queue-overall-progress">
          <div className="queue-progress-track">
            <div className="queue-progress-fill" style={{ width: `${pct}%` }}/>
          </div>
          <span className="queue-progress-label">{done} / {total} concluídos</span>
        </div>
      )}

      <div id="queue-list">
        {total === 0 ? (
          <div className="empty-state" id="queue-empty">
<List size={48} strokeWidth={1.5} />
            <p>Nenhum item na fila</p>
            <span className="empty-hint">Analise um link no Downloader e clique em "Adicionar à Fila"</span>
          </div>
        ) : (
          queue.map((item) => {
            const isActive  = item.status === 'active';
            const canRemove = item.status !== 'active';
            const barClass  = item.status === 'done' ? ' done' : item.status === 'error' ? ' error' : '';
            const statusText = {
              pending: 'Aguardando',
              active:  item.percent > 0 ? `${item.percent.toFixed(1)}%` : 'Iniciando...',
              done:    'Concluído',
              error:   'Erro',
            }[item.status] || '';
            const speedStr = item.status === 'active' && item.speed !== '--' ? ` · ${item.speed}` : '';

            return (
              <div key={item.id} className={`queue-item qi-${item.status}`} id={`qi-el-${item.id}`}>
                <div className="qi-thumb">
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.parentElement.innerHTML =
                          '<div class="qi-thumb-placeholder"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div>';
                      }}
                    />
                  ) : (
                    <div className="qi-thumb-placeholder"><Video size={18} /></div>
                  )}
                </div>

                <div className="qi-info">
                  <div className="qi-title" title={item.title}>{item.title}</div>
                  <div className="qi-meta">
                    <span className="qi-tag">{item.type?.toUpperCase()}</span>
                    <span className="qi-tag">{item.fmt}</span>
                    {item.outputDirOverride && (
                      <span className="qi-folder-tag" title={item.outputDirOverride}>
<Folder size={10} />
                        {item.outputDirOverride.split(/[/\\]/).pop()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="qi-progress-wrap">
                  <div className="qi-status-text">{statusText}{speedStr}</div>
                  <div className="qi-bar-track">
                    <div className={`qi-bar-fill${barClass}`} style={{ width: `${item.percent}%` }}/>
                  </div>
                </div>

                <div className="qi-actions">
                  <div className="qi-status-icon">
                    <StatusIcon status={item.status}/>
                  </div>
                  {canRemove && (
                    <button className="btn-qi-remove" onClick={() => onRemove(item.id)} title="Remover da fila"><X size={13} /></button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
