import { useState, useEffect } from 'react';
import { Moon, Sun, TrendingUp, Terminal, Minus, Square, X } from 'lucide-react';
import { state, triggers } from '../state.js';
import { applyTheme } from '../utils.js';

export default function Titlebar({ consoleOpen, onToggleConsole }) {
  const [speed, setSpeed] = useState(null);
  useEffect(() => {
    triggers.setTitlebarSpeed = setSpeed;
    return () => { triggers.setTitlebarSpeed = null; };
  }, []);

  function toggleTheme() {
    const saved = state.settings.theme || 'default';
    if (saved === 'system') return;
    const isLight = document.documentElement.classList.contains('light');

    if (saved === 'amoled') {
      if (!isLight) {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.classList.add('light');
      } else {
        applyTheme('amoled');
      }
      return;
    }

    if (saved === 'default' || saved === 'default-light') {
      const next = isLight ? 'default' : 'default-light';
      applyTheme(next);
      state.settings.theme = next;
      window.api.saveSettings({ theme: next }).catch(() => {});
      return;
    }

    const base = saved.replace('-light', '');
    const next = isLight ? base : `${base}-light`;
    applyTheme(next);
    state.settings.theme = next;
    window.api.saveSettings({ theme: next }).catch(() => {});
  }

  return (
    <div className="titlebar" id="titlebar">
      <div className="titlebar-drag">
        <div className="app-logo">
          <img src="assets/logo-icon.png" className="titlebar-logo-icon" alt="" />
          <img src="assets/logo-name.png" className="titlebar-logo-name" alt="MoonVault" />
        </div>
      </div>

      {speed && (
        <div className="titlebar-speed">
<TrendingUp size={12} />
          <span>{speed}</span>
        </div>
      )}

      <div className="titlebar-controls">
        <button className="theme-toggle-btn" onClick={toggleTheme} title="Alternar modo claro/escuro">
          <div className="theme-toggle-track">
            <div className="theme-toggle-thumb">
<Moon size={11} className="theme-icon moon-icon" />
<Sun size={11} className="theme-icon sun-icon" />
            </div>
          </div>
        </button>

        <button
          className={`ctrl-btn console-toggle-btn${consoleOpen ? ' active' : ''}`}
          onClick={onToggleConsole}
          title="Console de Eventos"
        >
<Terminal size={14} />
        </button>

        <button className="ctrl-btn" onClick={() => window.api.minimize()} title="Minimizar">
<Minus size={12} />
        </button>
        <button className="ctrl-btn" onClick={() => window.api.maximize()} title="Maximizar">
<Square size={12} />
        </button>
        <button className="ctrl-btn close-btn" onClick={() => window.api.close()} title="Fechar">
<X size={12} />
        </button>
      </div>
    </div>
  );
}
