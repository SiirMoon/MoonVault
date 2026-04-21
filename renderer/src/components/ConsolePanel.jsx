import { useEffect, useRef } from 'react';
import { Terminal, Trash2, X } from 'lucide-react';
import { formatTime, escHtml } from '../utils.js';

export default function ConsolePanel({ open, logs, onClose, onClear }) {
  const bodyRef = useRef(null);
  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [open, logs]);

  return (
    <>
      <div
        className={`console-overlay${open ? ' visible' : ''}`}
        onClick={onClose}
      />
      <div className={`console-panel${open ? ' visible' : ''}`}>
        <div className="console-header">
          <div className="console-header-left">
<Terminal size={15} />
            <span>Console de Eventos</span>
          </div>
          <div className="console-header-right">
            <button className="console-clear-btn" onClick={onClear} title="Limpar console">
<Trash2 size={13} />
              Limpar
            </button>
            <button className="console-close-btn" onClick={onClose} title="Fechar">
<X size={14} />
            </button>
          </div>
        </div>

        <div className="console-body" ref={bodyRef}>
          {logs.length === 0 ? (
            <div className="console-empty">Aguardando eventos de download...</div>
          ) : (
            logs.map((data, i) => {
              const isProgress = /\[download\]\s+\d+/.test(data.text);
              const type = isProgress ? 'progress' : (data.type || 'stdout');
              return (
                <div key={i} className={`console-line ${type}`}>
                  <span className="console-ts">{formatTime(data.ts)}</span>
                  <span
                    className="console-text"
                    dangerouslySetInnerHTML={{ __html: escHtml(data.text) }}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
