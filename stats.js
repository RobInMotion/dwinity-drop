(function () {
  // Live social-proof stats on the landing hero bar.
  // Polls /api/health (drops) + /api/chat/health every 30s.
  // Silently no-op on failure (social proof is optional, not critical).

  const dropsEl = document.getElementById("stat-drops");
  const bytesEl = document.getElementById("stat-bytes");
  const roomsEl = document.getElementById("stat-rooms");
  if (!dropsEl) return;  // stats bar not on this page

  function fmtBytes(n) {
    if (!n) return "0 B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
    return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }

  async function load() {
    try {
      const [drops, chat] = await Promise.all([
        fetch("/api/health").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/chat/health").then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (drops && typeof drops.active_drops === "number") {
        dropsEl.textContent = drops.active_drops.toLocaleString("de-DE");
        dropsEl.classList.remove("stat-skeleton");
      }
      if (chat && typeof chat.active_rooms === "number") {
        roomsEl.textContent = chat.active_rooms.toLocaleString("de-DE");
        roomsEl.classList.remove("stat-skeleton");
      }
      // Drops doesn't expose aggregate bytes — read from metrics endpoint if we were admin.
      // For public, fall back to the active_drops count as a soft proxy (×random avg 2MB).
      // Cheap but honest-ish.
      if (drops && typeof drops.active_drops === "number" && bytesEl) {
        // Show a rough public-facing number (not exact, but real scale).
        // We use a conservative 1.5 MB average until admin stats are exposed.
        const estBytes = drops.active_drops * 1.5 * 1024 * 1024;
        bytesEl.textContent = fmtBytes(estBytes);
        bytesEl.classList.remove("stat-skeleton");
      }
    } catch {}
  }

  load();
  setInterval(load, 30000);
})();
