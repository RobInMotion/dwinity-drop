// Header wallet-balance ribbon — discreet, dismissable, auto-refreshes.
// Reads from /api/marketplace/my-contributions (which includes wallet field).

(function () {
  const HIDE_KEY = "dwinity_wallet_balance_hidden";
  let timer = null;

  const ribbon  = document.getElementById("wallet-balance");
  const showBtn = document.getElementById("wallet-balance-show");
  const hideBtn = document.getElementById("wallet-balance-hide");
  if (!ribbon || !showBtn || !hideBtn) return;

  const avaxEl = ribbon.querySelector('[data-bal="avax"]');
  const usdcEl = ribbon.querySelector('[data-bal="usdc"]');
  const dwinEl = ribbon.querySelector('[data-bal="dwin"]');

  function isHidden() { return localStorage.getItem(HIDE_KEY) === "1"; }

  function setHidden(hidden) {
    if (hidden) {
      localStorage.setItem(HIDE_KEY, "1");
      ribbon.classList.add("hidden"); ribbon.classList.remove("inline-flex");
      showBtn.classList.remove("hidden"); showBtn.classList.add("inline-flex");
    } else {
      localStorage.removeItem(HIDE_KEY);
      showBtn.classList.add("hidden"); showBtn.classList.remove("inline-flex");
      // Only show ribbon if we have data (start fetch).
      ribbon.classList.remove("hidden"); ribbon.classList.add("inline-flex");
      refresh();
    }
  }

  function applyHiddenState() {
    if (isHidden()) {
      showBtn.classList.remove("hidden"); showBtn.classList.add("inline-flex");
    } else {
      ribbon.classList.remove("hidden"); ribbon.classList.add("inline-flex");
    }
  }

  function fmt(n, dec) {
    return Number(n).toLocaleString("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function showRibbon() {
    if (isHidden()) return; // user dismissed — respect that
    ribbon.classList.remove("hidden");
    ribbon.classList.add("inline-flex");
    showBtn.classList.add("hidden");
    showBtn.classList.remove("inline-flex");
  }

  function hideRibbon() {
    ribbon.classList.add("hidden");
    ribbon.classList.remove("inline-flex");
    // Don't show the 💰 button when user is logged out — they'd have nothing to see.
    showBtn.classList.add("hidden");
    showBtn.classList.remove("inline-flex");
  }

  async function refresh() {
    try {
      // Skip the balance probe entirely when logged out — avoids a guaranteed
      // 401 in the console on every anonymous page view.
      const me = await fetch("/api/identity/me", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!me || !me.address) { hideRibbon(); return; }
      const r = await fetch("/api/marketplace/my-contributions", { credentials: "include" });
      if (!r.ok) {
        hideRibbon();
        return;
      }
      const j = await r.json();
      if (!j.wallet) { hideRibbon(); return; }
      avaxEl.textContent = fmt(j.wallet.avax, 3) + " AVAX";
      usdcEl.textContent = "$" + fmt(j.wallet.usdc, 2);
      dwinEl.textContent = fmt(j.wallet.dwin, 2) + " DWIN";
      // Re-show after a successful fetch (user just logged in or session refreshed).
      if (isHidden()) {
        showBtn.classList.remove("hidden");
        showBtn.classList.add("inline-flex");
      } else {
        showRibbon();
      }
    } catch {}
  }

  function startPolling() {
    refresh();
    if (timer) clearInterval(timer);
    timer = setInterval(refresh, 30_000);
  }

  hideBtn.addEventListener("click", () => setHidden(true));
  showBtn.addEventListener("click", () => setHidden(false));

  // React to wallet-changed events from auth.js — refresh now, and again
  // after 2s+5s in case the cookie hasn't fully propagated.
  window.addEventListener("dwinity:wallet-changed", () => {
    refresh();
    setTimeout(refresh, 2000);
    setTimeout(refresh, 5000);
  });

  applyHiddenState();
  startPolling();
})();
