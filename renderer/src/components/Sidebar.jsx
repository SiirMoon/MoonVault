import { useState, useEffect } from 'react';
import { Download, Activity, List, Settings as SettingsIcon, Info, ClockArrowDown } from 'lucide-react';

export default function Sidebar({ currentPage, onNavigate, queuePendingCount, ytdlpStatus }) {
  const navItems = [
    {
      id: 'downloader',
      label: 'Downloader',
      icon: (
<Download size={18} />
      ),
    },
    {
      id: 'history',
      label: 'Histórico',
      icon: (
<ClockArrowDown size={18} />
      ),
    },
    {
      id: 'queue',
      label: 'Fila',
      icon: (
<List size={18} />
      ),
      badge: queuePendingCount,
    },
    {
      id: 'settings',
      label: 'Configurações',
      icon: (
<SettingsIcon size={18} />
      ),
    },
  ];

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item${currentPage === item.id ? ' active' : ''}`}
            data-page={item.id}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge > 0 && (
              <span className="queue-badge">{item.badge}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          className={`nav-item nav-item-footer${currentPage === 'about' ? ' active' : ''}`}
          data-page="about"
          onClick={() => onNavigate('about')}
        >
<Info size={16} />
          <span>Sobre</span>
        </button>

        <div className="ytdlp-status" id="ytdlp-status">
          <div className={`status-dot${ytdlpStatus.ok ? ' ok' : ytdlpStatus.checked ? ' error' : ''}`}></div>
          <span>{ytdlpStatus.label}</span>
        </div>

        <div className="app-version-row">
          <span id="app-version">{ytdlpStatus.appVersion || 'v2.0'}</span>
        </div>
      </div>
    </aside>
  );
}
