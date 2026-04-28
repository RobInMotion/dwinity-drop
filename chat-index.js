(function () {
  const API = "/api/chat";
  const LS_ROOMS_PREFIX = "dwinity_chat_rooms_";   // per-wallet: {roomId: {key_b64, name}}

  const $ = (id) => document.getElementById(id);
  const t = (key, fallback) => {
    const v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(key);
    return (v && v !== key) ? v : fallback;
  };

  const gate = $("gate");
  const panel = $("panel");
  const listEl = $("rooms-list");
  const createBtn = $("create-btn");
  const modal = $("create-modal");
  const createSubmit = $("create-submit");
  const createCancel = $("create-cancel");
  const nameInput = $("new-room-name");
  const ttlSelect = $("new-room-ttl");
  const errorEl = $("create-error");

  let currentAddress = null;

  function u8ToB64Url(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function fmtRelative(ts) {
    const diff = ts - Math.floor(Date.now() / 1000);
    if (diff <= 0) return t("chat.room.expired", "abgelaufen");
    if (diff < 3600) return Math.round(diff / 60) + " min";
    if (diff < 86400) return Math.round(diff / 3600) + " h";
    return Math.round(diff / 86400) + " " + t("chat.room.days", "Tage");
  }

  function fmtAgo(ts) {
    if (!ts) return "—";
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return diff + "s";
    if (diff < 3600) return Math.floor(diff / 60) + "min";
    if (diff < 86400) return Math.floor(diff / 3600) + "h";
    return Math.floor(diff / 86400) + "d";
  }

  function lsKey(addr) { return LS_ROOMS_PREFIX + addr.toLowerCase(); }
  function getRoomStore(addr) {
    try { return JSON.parse(localStorage.getItem(lsKey(addr)) || "{}"); } catch { return {}; }
  }
  function setRoomMeta(addr, roomId, data) {
    const store = getRoomStore(addr);
    store[roomId] = { ...(store[roomId] || {}), ...data };
    localStorage.setItem(lsKey(addr), JSON.stringify(store));
  }

  async function loadMe() {
    try {
      const r = await fetch(API + "/me", { credentials: "include" });
      if (!r.ok) return null;
      const data = await r.json();
      return data.address ? data : null;
    } catch { return null; }
  }

  async function loadRooms() {
    listEl.innerHTML = `<div class="text-white/40 font-mono text-sm">${escapeHtml(t("chat.loading", "// lade …"))}</div>`;
    try {
      const r = await fetch(API + "/rooms/mine", { credentials: "include" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (!data.rooms.length) {
        listEl.innerHTML = `
          <div class="p-8 rounded-2xl border border-white/10 bg-void-900/40 text-center">
            <div class="text-white/60 mb-2">${escapeHtml(t("chat.empty.title", "Noch keine Rooms"))}</div>
            <div class="text-white/40 text-sm font-mono">${escapeHtml(t("chat.empty.sub", 'Klick auf "+ Neuer Room" um zu starten'))}</div>
          </div>`;
        return;
      }
      const store = getRoomStore(currentAddress);
      listEl.innerHTML = "";
      for (const room of data.rooms) {
        const local = store[room.id] || {};
        const hasKey = !!local.key_b64;
        const isCreator = room.role === "creator";
        const displayName = escapeHtml(room.name || local.name || t("chat.room.unnamed", "Unnamed Room"));
        const el = document.createElement("a");
        const href = hasKey
          ? `/chat/r/${encodeURIComponent(room.id)}#k=${local.key_b64}`
          : `/chat/r/${encodeURIComponent(room.id)}`;
        el.href = href;
        el.className = "block p-4 rounded-xl bg-void-900/60 border border-white/5 hover:border-neon-500/40 hover:bg-void-800/40 transition";
        const msgLabel = room.message_count === 1 ? t("chat.room.msgOne", "Msg") : t("chat.room.msgMany", "Msgs");
        const lastLabel = t("chat.room.lastPrefix", "letzte: vor");
        const noneLabel = t("chat.room.noneMsgs", "keine Nachrichten");
        const expiresPrefix = t("chat.room.expiresPrefix", "läuft in");
        const keyMissing = t("chat.room.keyMissing", "Schlüssel fehlt");
        el.innerHTML = `
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <div class="font-600 truncate">${displayName}</div>
                ${isCreator ? '<span class="px-2 py-0.5 rounded-full bg-neon-500/15 text-neon-500 text-[10px] font-mono uppercase">Owner</span>' : ''}
                ${!hasKey ? `<span class="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-[10px] font-mono">${escapeHtml(keyMissing)}</span>` : ''}
              </div>
              <div class="text-xs font-mono text-white/50 flex flex-wrap gap-x-4 gap-y-1">
                <span>${room.message_count} ${escapeHtml(msgLabel)}</span>
                ${room.last_message_at ? `<span>${escapeHtml(lastLabel)} ${escapeHtml(fmtAgo(room.last_message_at))}</span>` : `<span class="text-white/30">${escapeHtml(noneLabel)}</span>`}
                ${room.expires_at ? `<span class="text-neon-500">${escapeHtml(expiresPrefix)} ${escapeHtml(fmtRelative(room.expires_at))}</span>` : ''}
              </div>
            </div>
            <div class="text-white/30">→</div>
          </div>
        `;
        listEl.appendChild(el);
      }
    } catch (e) {
      listEl.innerHTML = `<div class="text-red-400 font-mono text-sm">${escapeHtml(t("chat.error", "Fehler"))}: ${escapeHtml(e.message)}</div>`;
    }
  }

  function openModal() {
    errorEl.classList.add("hidden");
    nameInput.value = "";
    modal.classList.remove("hidden");
    setTimeout(() => nameInput.focus(), 50);
  }
  function closeModal() {
    modal.classList.add("hidden");
  }

  async function submitCreate() {
    errorEl.classList.add("hidden");
    const name = nameInput.value.trim();
    const ttl = parseInt(ttlSelect.value, 10);
    createSubmit.disabled = true;
    createSubmit.textContent = t("chat.create.creating", "// erstelle …");
    try {
      const r = await fetch(API + "/rooms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || null, ttl_hours: ttl }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ detail: "HTTP " + r.status }));
        throw new Error(body.detail || t("chat.error", "Fehler"));
      }
      const room = await r.json();
      // Generate AES-256-GCM key client-side (server never sees it)
      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
      );
      const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
      const keyB64 = u8ToB64Url(rawKey);
      setRoomMeta(currentAddress, room.id, { key_b64: keyB64, name: name || null });
      location.href = `/chat/r/${encodeURIComponent(room.id)}#k=${keyB64}`;
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.classList.remove("hidden");
      createSubmit.disabled = false;
      createSubmit.textContent = t("chat.create.submit", "Room erstellen");
    }
  }

  function renderPendingShareBanner() {
    let pending;
    try { pending = localStorage.getItem("dd_pending_share"); } catch { return; }
    if (!pending) return;
    let existing = document.getElementById("pending-share-banner");
    if (existing) existing.remove();
    const banner = document.createElement("div");
    banner.id = "pending-share-banner";
    banner.className = "mb-5 p-4 rounded-xl bg-gradient-to-r from-neon-500/15 to-cyan-400/10 border border-neon-500/40 flex items-center justify-between gap-3 flex-wrap";
    const labelReady = t("chat.share.ready", "Drop-Link bereit");
    const labelChoose = t("chat.share.choose", "Wähle einen Room ↓");
    const labelCancel = t("chat.share.cancel", "verwerfen");
    banner.innerHTML =
      '<div class="flex items-center gap-3 min-w-0 flex-1">' +
        '<div class="shrink-0 w-9 h-9 rounded-lg bg-neon-500/20 grid place-items-center text-neon-500 text-base">⚡</div>' +
        '<div class="min-w-0">' +
          '<div class="font-mono text-[10px] uppercase tracking-widest text-neon-500">' + escapeHtml(labelReady) + '</div>' +
          '<div class="text-xs text-white/70 font-mono truncate">' + escapeHtml(pending) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="flex gap-2 shrink-0">' +
        '<span class="text-[11px] font-mono text-white/60">' + escapeHtml(labelChoose) + '</span>' +
        '<button id="pending-share-cancel" class="text-[11px] font-mono text-white/40 hover:text-red-400 underline underline-offset-2">' + escapeHtml(labelCancel) + '</button>' +
      '</div>';
    listEl.parentNode.insertBefore(banner, listEl);
    const cancelBtn = document.getElementById("pending-share-cancel");
    if (cancelBtn) cancelBtn.addEventListener("click", () => {
      try { localStorage.removeItem("dd_pending_share"); } catch {}
      banner.remove();
    });
  }

  async function boot() {
    const me = await loadMe();
    if (!me || !me.address) {
      panel.classList.add("hidden");
      gate.classList.remove("hidden");
      return;
    }
    currentAddress = me.address;
    gate.classList.add("hidden");
    panel.classList.remove("hidden");
    renderPendingShareBanner();
    await loadRooms();

    createBtn.addEventListener("click", openModal);
    createCancel.addEventListener("click", closeModal);
    createSubmit.addEventListener("click", submitCreate);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitCreate(); });

    // Refresh room list every 60s (cheap, just metadata)
    setInterval(loadRooms, 60_000);
  }

  window.addEventListener("dwinity:pro-updated", boot);
  window.addEventListener("dwinity:wallet-changed", boot);
  boot();
})();
