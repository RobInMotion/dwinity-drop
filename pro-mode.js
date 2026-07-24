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

  // There can be more than one toggle in the DOM (desktop nav + mobile menu),
  // so target them all by data-hook rather than a single id.
  function eachToggle(fn) {
    document.querySelectorAll("[data-pro-mode-toggle]").forEach(fn);
  }

  function refreshToggleLabel() {
    const on = get();
    const state = on
      ? vt("pm.stateOn", "AN")
      : vt("pm.stateOff", "AUS");
    const label = vt("pm.label", "Pro-Mode:");
    eachToggle((btn) => {
      btn.innerHTML = `🔧 <span class="hidden md:inline">${label}</span> ${state}`;
      btn.title = on
        ? vt("pm.on", "Technische Details werden angezeigt — Klick zum Verstecken")
        : vt("pm.off", "Klick um technische Details (Tx-Hashes, Contract-Adressen, Commitments) sichtbar zu machen");
    });
  }

  // Wire every toggle on DOMContentLoaded (or immediately if already loaded).
  function wire() {
    eachToggle((btn) => {
      if (!btn.dataset.wired) {
        btn.dataset.wired = "1";
        btn.addEventListener("click", () => set(!get()));
      }
    });
    refreshToggleLabel();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  // pro-mode.js is loaded before i18n.js on some pages, and the label text is
  // translated — re-render it whenever the active language changes.
  window.addEventListener("dd:lang-changed", refreshToggleLabel);

  global.DwinityProMode = { get, set, init };
  init();
})(window);
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "pm.on": "Technical details shown — click to hide",
  "pm.off": "Click to reveal technical details (tx hashes, contract addresses, commitments)",
} });
