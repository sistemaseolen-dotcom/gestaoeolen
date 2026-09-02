import Script from "next/script";

// Server Component shell: renders the exact DOM structure app.js expects
// (same ids/classes as the original shell.html) and hands off to the plain
// script in /public/app.js. All real rendering happens client-side inside
// app.js — this file intentionally contains no logic of its own.
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
            <div className="brand-mark">CE</div>
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

      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
