import { useState } from 'react';
import { Search, Trash2, RefreshCw, Activity } from 'lucide-react';
import { formatDate2 } from '../utils.js';

export default function History({ history, onClear, onRepeat }) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const items = q
    ? history.filter(
        (i) => i.title?.toLowerCase().includes(q) || i.url?.toLowerCase().includes(q)
      )
    : history;

  function Highlighted({ text }) {
    if (!q || !text) return <>{text || ''}</>;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="hl">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  let countText = '';
  if (q && items.length !== history.length) {
    countText = `${items.length} de ${history.length} resultado(s)`;
  } else {
    countText = history.length ? `${history.length} item(s)` : '';
  }

  // Group items by day
  function groupByDay(list) {
    const groups = [];
    const seen = new Map();
    for (const item of list) {
      const d = item.date ? new Date(item.date) : new Date(0);
      const today = new Date();
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      let label;
      if (d.toDateString() === today.toDateString()) label = 'Hoje';
      else if (d.toDateString() === yesterday.toDateString()) label = 'Ontem';
      else label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      if (!seen.has(label)) { seen.set(label, []); groups.push({ label, items: seen.get(label) }); }
      seen.get(label).push(item);
    }
    return groups;
  }

  const groups = items.length ? groupByDay(items) : [];

  function ItemThumb({ item }) {
    if (item.thumbnail) {
      return (
        <div className="hist-thumb">
          <img
            src={item.thumbnail}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.parentElement.classList.add('hist-thumb-err');
              e.currentTarget.style.display = 'none';
            }}
          />
          {item.failed && <span className="hist-thumb-fail-overlay"/>}
        </div>
      );
    }
    return (
      <div className="hist-thumb hist-thumb-empty">
        <span className={`hist-dot ${item.failed ? 'hist-dot-error' : item.type === 'audio' ? 'hist-dot-audio' : 'hist-dot-video'}`}/>
      </div>
    );
  }

  return (
    <section className="page active" id="page-history">
      <div className="page-header">
        <h1>Histórico</h1>
      </div>

      <div className="history-toolbar">
        <div className="history-search-wrap">
          <Search size={14} />
          <input
            type="text"
            placeholder="Buscar no histórico..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="history-toolbar-right">
          <span className="history-count">{countText}</span>
          <button className="btn-clear-history" onClick={onClear} title="Limpar histórico">
            <Trash2 size={14} />
            Limpar
          </button>
        </div>
      </div>

      <div className="history-list">
        {items.length === 0 ? (
          q ? (
            <div className="empty-state">
              <p>Nenhum resultado para "<strong>{q}</strong>"</p>
            </div>
          ) : (
            <div className="empty-state">
              <Activity size={48} strokeWidth={1.5} />
              <p>Nenhum download no histórico ainda</p>
            </div>
          )
        ) : (
          groups.map(({ label, items: groupItems }) => (
            <div key={label} className="history-group">
              <div className="history-group-label">{label}</div>
              {groupItems.map((item) => (
                <div key={item.id} className={`history-item${item.failed ? ' failed' : ''}`}>
                  <ItemThumb item={item} />
                  <div className="history-info">
                    <div className="history-title" title={item.title}>
                      <Highlighted text={item.title || ''} />
                    </div>
                    <div className="history-meta">
                      {item.failed ? 'Falhou · ' : ''}
                      {item.type?.toUpperCase()} · {item.format?.toUpperCase()} · {formatDate2(item.date)}
                    </div>
                  </div>
                  <button
                    className="history-repeat-btn"
                    title="Repetir download"
                    onClick={() => onRepeat(item.url, item.type, item.format)}
                  >
                    <RefreshCw size={13} />
                    Repetir
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
