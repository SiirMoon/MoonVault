export function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatNumber(n) {
  if (!n) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

export function formatBytes(bytes) {
  if (!bytes) return 'N/A';
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(2) + ' MB';
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

export function formatDuration(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDate(d) {
  if (!d || d.length < 8) return '';
  return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`;
}

export function formatDate2(isoStr) {
  try {
    return new Date(isoStr).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

export function formatTime(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function getQualityLabel(fmt, isAudio) {
  if (isAudio) {
    const abr = fmt.abr || 0;
    if (abr >= 192) return { text: 'Alta', cls: 'ql-best' };
    if (abr >= 128) return { text: 'Média', cls: 'ql-high' };
    return { text: 'Baixa', cls: 'ql-low' };
  }
  const h = fmt.height || 0;
  if (h >= 2160) return { text: 'Melhor (4K)', cls: 'ql-best' };
  if (h >= 1440) return { text: 'Melhor (2K)', cls: 'ql-best' };
  if (h >= 1080) return { text: 'Alta (1080p)', cls: 'ql-high' };
  if (h >= 720) return { text: 'Alta (720p)', cls: 'ql-high' };
  if (h >= 480) return { text: 'Média (480p)', cls: 'ql-medium' };
  if (h >= 360) return { text: 'Baixa (360p)', cls: 'ql-low' };
  return { text: 'Desconhecida', cls: 'ql-low' };
}

export function sanitiseFilename(name) {
  return name
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\.+$/, '')
    .trim()
    .slice(0, 200);
}

export function compactThumb(url) {
  if (!url) return null;
  const yt = url.match(
    /(?:vi\/|\/vi_webp\/|embed\/|ytimg\.com\/vi\/)([a-zA-Z0-9_-]{11})/
  );
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/mqdefault.jpg`;
  return url.length > 200 ? url.slice(0, 200) : url;
}

export const THEME_MAP = {
  default:            { attr: null,          light: false },
  'default-light':    { attr: null,          light: true  },
  amoled:             { attr: 'amoled',      light: false },
  nord:               { attr: 'nord',        light: false },
  'nord-light':       { attr: 'nord',        light: true  },
  everforest:         { attr: 'everforest',  light: false },
  'everforest-light': { attr: 'everforest',  light: true  },
  'tokyo-night':      { attr: 'tokyo-night', light: false },
  'tokyo-night-light':{ attr: 'tokyo-night', light: true  },
};

let _systemThemeListener = null;

export function applyTheme(themeId) {
  const html = document.documentElement;

  if (_systemThemeListener) {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .removeEventListener('change', _systemThemeListener);
    _systemThemeListener = null;
  }

  if (themeId === 'system') {
    html.removeAttribute('data-theme');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = (e) =>
      e.matches ? html.classList.remove('light') : html.classList.add('light');
    sync(mq);
    _systemThemeListener = sync;
    mq.addEventListener('change', _systemThemeListener);
    return;
  }

  const def = THEME_MAP[themeId] || THEME_MAP['default'];
  if (def.attr) html.setAttribute('data-theme', def.attr);
  else html.removeAttribute('data-theme');
  def.light ? html.classList.add('light') : html.classList.remove('light');
}

export function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (type === 'success') {
      const notes = [
        { freq: 523.25, start: 0,    duration: 0.12 },
        { freq: 783.99, start: 0.13, duration: 0.18 },
      ];
      notes.forEach(({ freq, start, duration }) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration + 0.05);
      });
    } else {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(392, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(261.63, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
    setTimeout(() => ctx.close(), 800);
  } catch (_) { /* audio not available */ }
}

export function sendNotification(type, title, body) {
  if (!('Notification' in window)) return;
  const show = () => new Notification(title, { body, silent: true });
  if (Notification.permission === 'granted') {
    show();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((p) => { if (p === 'granted') show(); });
  }
}
