// "→ In Chat" handler + auto-return when arriving from a chat-room context.
// Two modes:
//  (1) User clicks "→ In Chat" on a fresh upload → /chat (room picker)
//  (2) User clicked "+Drop" inside a chat-room → return directly to that room
(function () {
  const btn = document.getElementById("drop-share-chat-btn");
  const urlInput = document.getElementById("drop-share-url");

  // Mode 2: came from a specific chat-room — observe the share-input getting populated,
  // then auto-redirect back to the room with the link prefilled.
  let chatReturn = null;
  try {
    const raw = localStorage.getItem("dd_chat_return");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Expire after 30 minutes to avoid stale redirects
      if (parsed && parsed.roomId && Date.now() - (parsed.ts || 0) < 30 * 60 * 1000) {
        chatReturn = parsed;
      } else {
        localStorage.removeItem("dd_chat_return");
      }
    }
  } catch {}

  if (chatReturn && urlInput) {
    // Watch for share-URL to be filled (set by app.js post-upload), then auto-route back.
    const observer = new MutationObserver(() => {
      const link = (urlInput.value || "").trim();
      if (link && /\/d\/[\w-]+#/.test(link)) {
        try {
          localStorage.setItem("dd_pending_share", link);
          localStorage.removeItem("dd_chat_return");
        } catch {}
        observer.disconnect();
        // Show inline confirmation before redirect
        const banner = document.createElement("div");
        banner.className = "mt-3 p-3 rounded-xl bg-neon-500/15 border border-neon-500/40 text-sm text-neon-500 font-mono text-center";
        banner.textContent = "⚡ → zurück in den Chat-Room (1s)…";
        urlInput.parentNode.parentNode.insertBefore(banner, urlInput.parentNode.parentNode.firstChild);
        setTimeout(() => {
          window.location.href = "/chat/r/" + encodeURIComponent(chatReturn.roomId) +
            "#k=" + chatReturn.keyB64;
        }, 1100);
      }
    });
    observer.observe(urlInput, { attributes: true, attributeFilter: ["value"] });
    // Polling fallback for browsers that don't fire mutation on .value (most don't)
    const poll = setInterval(() => {
      const link = (urlInput.value || "").trim();
      if (link && /\/d\/[\w-]+#/.test(link)) {
        clearInterval(poll);
        observer.disconnect();
        try {
          localStorage.setItem("dd_pending_share", link);
          localStorage.removeItem("dd_chat_return");
        } catch {}
        window.location.href = "/chat/r/" + encodeURIComponent(chatReturn.roomId) +
          "#k=" + chatReturn.keyB64;
      }
    }, 500);
  }

  // Mode 1: explicit "→ In Chat" button after upload
  if (!btn || !urlInput) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const link = (urlInput.value || "").trim();
    if (!link) return;
    try { localStorage.setItem("dd_pending_share", link); } catch {}
    window.location.href = "/chat";
  });
})();
