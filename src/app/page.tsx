import Script from "next/script";

// Server Component shell: renders the exact DOM structure app.js expects
// (same ids/classes as the original shell.html) and hands off to the plain
// script in /public/app.js. All real rendering happens client-side inside
// app.js — this file intentionally contains no logic of its own.

// /app.js vive em public/ (sem hash no nome de arquivo, ao contrário do CSS
// e dos chunks do Next, que já são versionados automaticamente). Sem um jeito
// de "quebrar o cache", o celular do usuário pode continuar usando uma cópia
// antiga do app.js por dias depois de um novo deploy — o site parece não ter
// recebido a correção mesmo já publicada. O SHA do commit (Vercel expõe isso
// em build) muda a cada deploy, então usá-lo na query string força o
// navegador a buscar o arquivo novo sempre que o código mudar de verdade.
const APP_JS_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || String(Date.now());

export default function Page() {
  return (
    <>
      <div
        id="readonly-banner"
        className="readonly-banner"
        style={{ display: "none", position: "sticky", top: 0, zIndex: 50, borderRadius: 0, justifyContent: "center" }}
      >
        Você está no modo somente leitura — alterações não serão salvas.
      </div>
      <div id="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-eolen-mark.png" alt="Eolen" />
            </div>
            <div className="brand-text">
              <strong>Controle Eolen</strong>
              <span>Pessoas &amp; Segurança</span>
            </div>
          </div>
          <nav className="nav" id="sidebar-nav" />
          <div className="sidebar-foot">
            <div className="save-state">
              <span className="save-dot" id="save-dot" />
              <span id="save-label">Salvo</span>
            </div>
          </div>
        </aside>
        <div className="brand-banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-eolen.png" alt="Eolen" />
        </div>
        <main id="app-main" />
      </div>

      <div className="overlay" id="drawer-overlay" aria-hidden="true">
        <div className="drawer" id="drawer-content" role="dialog" aria-modal="true" />
      </div>

      <div className="modal-center" id="modal-overlay">
        <div id="modal-content" />
      </div>

      <div className="toast-stack" id="toast-stack" />
      <div className="viz-tooltip" id="viz-tooltip" role="status" aria-hidden="true" />

      <Script src={`/app.js?v=${APP_JS_VERSION}`} strategy="afterInteractive" />
    </>
  );
}
