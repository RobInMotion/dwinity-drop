// Egress meter for the dashboard. Standalone — does not depend on
// dashboard.js, so Robin's WIP there stays untouched. Hooked up in
// dashboard.html via plain <script>.
(function () {
  const $ = (id) => document.getElementById(id);
  const PERIOD_SEC = 30 * 24 * 3600;

  function fmtBytes(n) {
    if (n == null) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
    return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }

  function fmtRemain(secs) {
    if (secs <= 0) return "jetzt";
    const d = Math.floor(secs / 86400);
    if (d > 0) return d + "d " + Math.floor((secs % 86400) / 3600) + "h";
    const h = Math.floor(secs / 3600);
    if (h > 0) return h + "h " + Math.floor((secs % 3600) / 60) + "min";
    return Math.floor(secs / 60) + "min";
  }

  async function loadAndRender() {
    let me;
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      if (!r.ok) return;
      me = await r.json();
    } catch { return; }
    if (!me || !me.address || !me.egress) return;

    const sec = $("egress-section");
    if (!sec) return;
    sec.classList.remove("hidden");

    const eg = me.egress;
    const used = eg.bytes_used || 0;
    const quota = eg.bytes_quota || 1;
    const credits = eg.bytes_credits || 0;
    const pct = Math.min(100, Math.round((used / quota) * 100));

    $("egress-used").textContent = fmtBytes(used);
    $("egress-quota").textContent = fmtBytes(quota);
    $("egress-credits").textContent = "+" + fmtBytes(credits);
    $("egress-bar").style.width = pct + "%";
    $("egress-pct").textContent = pct + " %";

    const resetAt = (eg.period_start || 0) + PERIOD_SEC;
    const remain = resetAt - Math.floor(Date.now() / 1000);
    $("egress-reset-in").textContent = fmtRemain(remain);

    // Color shift on near-empty
    const bar = $("egress-bar");
    bar.classList.remove("from-neon-500", "to-cyan-400", "from-amber-400", "to-red-500");
    if (pct >= 90) {
      bar.classList.add("from-amber-400", "to-red-500");
    } else {
      bar.classList.add("from-neon-500", "to-cyan-400");
    }
  }

  // Load once, refresh every 60s while page is open
  loadAndRender();
  setInterval(loadAndRender, 60_000);
})();
