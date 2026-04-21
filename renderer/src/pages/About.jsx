import { useState, useEffect } from 'react';
import { FaGithub, FaYoutube, FaTwitterSquare } from "react-icons/fa";

export default function About() {
  const [appVersion, setAppVersion] = useState('—');
  const [runtimeVersions, setRuntimeVersions] = useState({
  electron: '—',
  node: '—',
  chrome: '—',
});

  useEffect(() => {
    window.api.getAppVersion().then((v) => { if (v) setAppVersion(`v${v}`); });
    const versions = window.api.getRuntimeVersions?.();
    if (versions) {
      setRuntimeVersions({
        electron: versions.electron ? `v${versions.electron}` : '—',
        node: versions.node ? `v${versions.node}` : '—',
        chrome: versions.chrome ? `v${versions.chrome}` : '—',
  });
}
  }, []);

  return (
    <section className="page active" id="page-about">
      <div className="about-wrap">
        <div className="about-logo-wrap">
          <img src="assets/about-logo.png" className="about-logo-img" alt="MoonVault" />
        </div>

        <p className="about-description">
          MoonVault é um projeto de garagem. Não tenho intenção de lucrar com o aplicativo,
          nem de torná-lo popular, até porque já existem muitos outros que fazem exatamente
          a mesma coisa. Ele foi feito com carinho para uso pessoal, porque eu queria uma
          interface bonita e algumas funções específicas, mas decidi deixá-lo disponível
          publicamente para quem encontrar e quiser baixar.
        </p>

        <div className="about-links">
          <a
            className="about-link-btn"
            href="#"
            onClick={(e) => { e.preventDefault(); window.api.openUrl('https://github.com/SiirMoon'); }}
          >
<FaGithub size={16} />
            GitHub
          </a>
          <a
            className="about-link-btn"
            href="#"
            onClick={(e) => { e.preventDefault(); window.api.openUrl('https://www.youtube.com/@siirmoon'); }}
          >
<FaYoutube size={16} />
            YouTube
          </a>
          <a
            className="about-link-btn"
            href="#"
            onClick={(e) => { e.preventDefault(); window.api.openUrl('https://x.com/SiirMoon'); }}
          >
<FaTwitterSquare size={16} />
            X / Twitter
          </a>
        </div>

        <div className="about-made-with-section">
          <h3 className="about-section-label">Feito com</h3>
          <div className="about-tech-list">
            {[
              { name: 'Electron',       role: 'Framework desktop',    color: '#47848f', url: 'https://www.electronjs.org/' },
              { name: 'React',          role: 'Interface do usuário', color: '#61dafb', url: 'https://react.dev/' },
              { name: 'yt-dlp',         role: 'Motor de download',    color: '#ff4040', url: 'https://github.com/yt-dlp/yt-dlp' },
              { name: 'FFmpeg',         role: 'Processamento A/V',    color: '#00b800', url: 'https://ffmpeg.org/' },
              { name: 'Webpack',        role: 'Bundler',              color: '#8dd6f9', url: 'https://webpack.js.org/' },
              { name: 'electron-store', role: 'Persistência',         color: '#a78bfa', url: 'https://github.com/sindresorhus/electron-store' },
            ].map((t) => (
              <button
                key={t.name}
                className="about-tech-item"
                onClick={() => window.api.openUrl(t.url)}
                title={`Abrir ${t.name}`}
              >
                <span className="about-tech-dot" style={{ background: t.color, color: t.color }} />
                <span className="about-tech-text">
                  <span className="about-tech-name">{t.name}</span>
                  <span className="about-tech-role">{t.role}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="about-made-with-section">
          <h3 className="about-section-label">Versões</h3>
          <div className="about-versions-list">
            <div className="about-version-row"><span>MoonVault</span><code>{appVersion}</code></div>
            <div className="about-version-row"><span>Electron</span><code>{runtimeVersions.electron}</code></div>
            <div className="about-version-row"><span>React</span><code>18</code></div>
            <div className="about-version-row">
              <span>Node.js</span>
              <code>{runtimeVersions.node}</code>
            </div>
            <div className="about-version-row">
              <span>Chromium</span>
              <code>{runtimeVersions.chrome}</code>
            </div>
          </div>
        </div>

        <div className="about-made-with-section">
          <h3 className="about-section-label">Licença</h3>
          <div className="about-license-card">
            <div className="about-license-header">
              <span className="about-license-badge">MIT</span>
              <span className="about-license-copy">Software livre e de código aberto</span>
              <span className="about-license-year">© {new Date().getFullYear()} SiirMoon</span>
            </div>
            <div className="about-license-body">
              Permission is hereby granted, free of charge, to any person obtaining a copy of this
              software and associated documentation files, to deal in the Software without
              restriction — including the rights to use, copy, modify, merge, publish, distribute,
              sublicense, and/or sell copies — subject to the above copyright notice being included
              in all copies or substantial portions of the Software.
              <br /><br />
              THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
            </div>
          </div>
        </div>

        <div className="about-footer">
          <p className="about-made-with">Feito com carinho e muito ☕.</p>
          <p className="about-support">Problemas? Abra um issue no GitHub ou entre em contato pelo X/Twitter.</p>
        </div>
      </div>
    </section>
  );
}
