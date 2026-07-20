// Pro-Mode toggle — when on, .pro-only elements become visible.
// Persisted in localStorage. Sets <html data-pro-mode="on|off"> for CSS targeting.
//
// CSS conventions (defined in dwinity-shared.css):
//   html[data-pro-mode="off"] .pro-only         { display: none !important; }
//   html[data-pro-mode="on"]  .pro-only-inverse { display: none !important; }

function vt(key, fallback, vars) {
  let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
  if (!v || v === key) v = fallback;
  if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
  return v;
}
(function (global) {
  const KEY = "dwinity_pro_mode";
  const root = document.documentElement;

  function get() { return localStorage.getItem(KEY) === "1"; }
  function set(on) {
    localStorage.setItem(KEY, on ? "1" : "0");
    root.dataset.proMode = on ? "on" : "off";
    document.dispatchEvent(new CustomEvent("dwinity:pro-mode-changed", { detail: { on } }));
    refreshToggleLabel();
  }
  function init() {
    root.dataset.proMode = get() ? "on" : "off";
    refreshToggleLabel();
  }

  function refreshToggleLabel() {
    const btn = document.getElementById("pro-mode-toggle");
    if (!btn) return;
    const on = get();
    btn.innerHTML = on
      ? `🔧 <span class="hidden md:inline">Pro-Mode:</span> AN`
      : `🔧 <span class="hidden md:inline">Pro-Mode:</span> AUS`;
    btn.title = on
      ? vt("pm.on", "Technische Details werden angezeigt — Klick zum Verstecken")
      : vt("pm.off", "Klick um technische Details (Tx-Hashes, Contract-Adressen, Commitments) sichtbar zu machen");
  }

  // Wire the toggle on DOMContentLoaded (or immediately if already loaded).
  function wire() {
    const btn = document.getElementById("pro-mode-toggle");
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = "1";
      btn.addEventListener("click", () => set(!get()));
      refreshToggleLabel();
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  global.DwinityProMode = { get, set, init };
  init();
})(window);
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "pm.on": "Technical details shown — click to hide",
  "pm.off": "Click to reveal technical details (tx hashes, contract addresses, commitments)",
} });
