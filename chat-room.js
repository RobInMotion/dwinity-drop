(function () {
  const API = "/api/chat";
  const LS_ROOMS_PREFIX = "dwinity_chat_rooms_";

  const $ = (id) => document.getElementById(id);
  const t = (key, fallback) => {
    const v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(key);
    return (v && v !== key) ? v : fallback;
  };

  const gate = $("gate");
  const errScreen = $("err-screen");
  const errText = $("err-text");
  const chatPanel = $("chat-panel");
  const messagesEl = $("chat-messages");
  const loadingEl = $("chat-loading");
  const statusEl = $("chat-status");
  const input = $("msg-input");
  const sendBtn = $("send-btn");
  const roomNameEl = $("room-name");
  const roomMembersEl = $("room-members");
  const roomExpiryEl = $("room-expiry");
  const shareBtn = $("share-btn");
  const shareToast = $("share-toast");
  const deleteBtn = $("delete-btn");

  let roomId = null;
  let roomKey = null;
  let currentAddress = null;
  let lastSeq = 0;
  let sse = null;
  let roomMeta = null;
  let expiryTimer = null;
  let roomEnded = false;

  // Mobile keyboard fix: the on-screen keyboard overlays the viewport but 100dvh does
  // NOT shrink for it, so the sticky composer ends up hidden behind the keyboard. Track
  // the visual viewport (the space actually visible above the keyboard) and size the app
  // to exactly that, compensating for iOS shifting the layout viewport up (offsetTop).
  (function keyboardFix() {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    function apply() {
      raf = 0;
      document.body.style.height = vv.height + "px";
      document.body.style.transform = vv.offsetTop
        ? "translateY(" + vv.offsetTop + "px)"
        : "";
    }
    function schedule() {
      if (!raf) raf = requestAnimationFrame(apply);
    }
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    apply();
  })();

  // ---------- URL / storage helpers ----------

  function parseRoomId() {
    const m = location.pathname.match(/^\/chat\/r\/([A-Za-z0-9_-]+)\/?$/);
    return m ? m[1] : null;
  }
  function parseFragmentKey() {
    const frag = location.hash.replace(/^#/, "");
    const params = new URLSearchParams(frag);
    return params.get("k");
  }
  function b64UrlToU8(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
    s += "=".repeat(pad);
    const bin = atob(s);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function u8ToB64(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  function lsKey(addr) { return LS_ROOMS_PREFIX + addr.toLowerCase(); }
  function getStore(addr) {
    try { return JSON.parse(localStorage.getItem(lsKey(addr)) || "{}"); } catch { return {}; }
  }
  function setStore(addr, data) {
    localStorage.setItem(lsKey(addr), JSON.stringify(data));
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function shortAddr(a) {
    if (!a) return "???";
    return a.slice(0, 6) + "…" + a.slice(-4);
  }

  function fmtTime(ts) {
    const d = new Date(ts * 1000);
    const locale = (window.DDI18n && window.DDI18n.getLang && window.DDI18n.getLang() === "en") ? "en-GB" : "de-DE";
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }

  function fmtRemaining(sec) {
    if (sec <= 0) return t("chat.room.expired", "abgelaufen");
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h " + m + "m";
    return m + "m";
  }

  // ---------- Crypto ----------

  async function importKey(rawU8) {
    return crypto.subtle.importKey(
      "raw", rawU8, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }

  async function encryptPlaintext(cryptoKey, plaintextBytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, cryptoKey, plaintextBytes
    ));
    const envelope = new Uint8Array(iv.length + ct.length);
    envelope.set(iv, 0);
    envelope.set(ct, iv.length);
    return envelope;
  }

  async function decryptEnvelope(cryptoKey, envelopeU8) {
    const iv = envelopeU8.slice(0, 12);
    const ct = envelopeU8.slice(12);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv }, cryptoKey, ct
    );
    return new Uint8Array(plain);
  }

  async function encodeMessage(cryptoKey, text) {
    const obj = { kind: "text", text, at: Math.floor(Date.now() / 1000) };
    const plainBytes = new TextEncoder().encode(JSON.stringify(obj));
    const envelope = await encryptPlaintext(cryptoKey, plainBytes);
    return u8ToB64(envelope);
  }

  // Encrypt an arbitrary structured object (used by the Tracker Sweep mini-game),
  // same envelope format as text messages so it rides the E2E pipe unchanged.
  async function encodeObject(cryptoKey, obj) {
    const plainBytes = new TextEncoder().encode(JSON.stringify(obj));
    const envelope = await encryptPlaintext(cryptoKey, plainBytes);
    return u8ToB64(envelope);
  }

  async function decodeMessage(cryptoKey, b64) {
    try {
      const envelope = b64UrlToU8(b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
      const plain = await decryptEnvelope(cryptoKey, envelope);
      const text = new TextDecoder().decode(plain);
      return JSON.parse(text);
    } catch (e) {
      return { kind: "error", text: t("room.msg.undecryptable", "[nicht entschlüsselbar]") };
    }
  }

  // ---------- Rendering ----------

  // Detect Dead Drop share-links (own domains only) and render as rich cards.
  // Pattern: https://<host>/d/<id>#k=<key>[&v=<v>&n=<name>...]
  // Matches both deaddrop.digital (current) and *.mkwt-strategy.tech (legacy).
  const DROP_LINK_RE = /(https?:\/\/(?:[\w-]+\.)*(?:deaddrop\.digital|mkwt-strategy\.tech)\/d\/[\w-]+#[^\s<]+)/gi;

  function dropCardHtml(url) {
    let filename = t("room.encryptedDrop", "Verschlüsselter Drop");
    let chunked = false;
    try {
      const u = new URL(url);
      const params = new URLSearchParams(u.hash.slice(1));
      if (params.get("n")) {
        const decoded = decodeURIComponent(params.get("n"));
        filename = decoded.length > 48 ? decoded.slice(0, 45) + "…" : decoded;
      }
      if (params.get("v") === "2") chunked = true;
    } catch {}
    const safeUrl = escapeHtml(url);
    return (
      '<a href="' + safeUrl + '" target="_blank" rel="noopener" ' +
      'class="block mt-2 p-3 rounded-xl bg-void-900/80 border border-neon-500/30 ' +
      'hover:border-neon-500/60 hover:bg-void-900 transition group no-underline">' +
        '<div class="flex items-center gap-3">' +
          '<div class="shrink-0 w-9 h-9 rounded-lg bg-neon-500/15 grid place-items-center text-neon-500 text-base">⚡</div>' +
          '<div class="min-w-0 flex-1">' +
            '<div class="font-mono text-[10px] uppercase tracking-widest text-neon-500 mb-0.5">' +
              'Dead Drop' + (chunked ? ' · chunked' : '') +
            '</div>' +
            '<div class="text-sm text-white/90 truncate">' + escapeHtml(filename) + '</div>' +
          '</div>' +
          '<div class="shrink-0 text-xs font-mono text-neon-500 group-hover:translate-x-0.5 transition">' +
            t("room.open", "Öffnen →") +
          '</div>' +
        '</div>' +
      '</a>'
    );
  }

  function renderMessage(msg, decoded) {
    const isMe = msg.sender === currentAddress;
    const row = document.createElement("div");
    row.className = "flex " + (isMe ? "justify-end" : "justify-start");
    row.dataset.seq = msg.seq;
    const nameColor = isMe ? "text-neon-500" : "text-white/70";
    const bg = isMe ? "bg-neon-500/10 border-neon-500/30" : "bg-void-800/70 border-white/5";
    const kind = decoded?.kind;
    if (kind === "sweep") {
      // Tracker Sweep game events: invites render as a special bubble, moves silently
      // drive the game panel. Never a normal chat bubble.
      const node = window.TrackerSweep
        ? window.TrackerSweep.onEvent(decoded, msg, isMe)
        : null;
      return node || document.createComment("sweep");
    }
    let contentHtml;
    if (kind === "error") {
      contentHtml = '<span class="italic text-red-400">' + escapeHtml(decoded.text) + '</span>';
    } else {
      const text = decoded?.text || "";
      const dropLinks = text.match(DROP_LINK_RE) || [];
      if (dropLinks.length) {
        // Strip drop-URLs from inline text, render rich cards instead
        let stripped = text;
        let cardsHtml = "";
        for (const link of dropLinks) {
          stripped = stripped.split(link).join("").trim();
          cardsHtml += dropCardHtml(link);
        }
        const textPart = stripped
          ? escapeHtml(stripped).replace(/\n/g, "<br>") + (cardsHtml ? "" : "")
          : "";
        contentHtml = textPart + cardsHtml;
      } else {
        contentHtml = escapeHtml(text).replace(/\n/g, "<br>");
      }
    }
    row.innerHTML = `
      <div class="max-w-[80%] msg-bubble">
        <div class="text-[10px] font-mono ${nameColor} mb-1 ${isMe ? 'text-right' : ''}">
          ${shortAddr(msg.sender)} · ${fmtTime(msg.created_at)}
        </div>
        <div class="px-3.5 py-2 rounded-2xl border ${bg} text-sm leading-relaxed">
          ${contentHtml}
        </div>
      </div>
    `;
    return row;
  }

  function isScrolledToBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 60;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function appendMessage(msg) {
    if (msg.seq <= lastSeq) return;
    const wasAtBottom = isScrolledToBottom();
    const decoded = await decodeMessage(roomKey, msg.ciphertext_b64);
    const row = renderMessage(msg, decoded);
    messagesEl.appendChild(row);
    lastSeq = msg.seq;
    if (wasAtBottom) scrollToBottom();
  }

  function showStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = (cls || "text-yellow-400 bg-yellow-500/5 border-yellow-500/20")
      + " px-4 py-1 text-center text-[11px] font-mono border-t";
    statusEl.classList.remove("hidden");
  }
  function hideStatus() { statusEl.classList.add("hidden"); }

  // ---------- API ----------

  async function fetchMe() {
    try {
      const r = await fetch(API + "/me", { credentials: "include" });
      if (!r.ok) return null;
      const data = await r.json();
      return data.address ? data : null;
    } catch { return null; }
  }

  async function fetchRoom() {
    const r = await fetch(API + "/rooms/" + encodeURIComponent(roomId), { credentials: "include" });
    if (r.status === 404) throw new Error(t("room.err.notFound", "Room nicht gefunden"));
    if (r.status === 410) throw new Error(t("room.err.expiredThrow", "Room abgelaufen"));
    if (r.status === 403) throw new Error(t("room.err.banned", "Du bist aus diesem Room gebannt"));
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function fetchHistory(since) {
    const r = await fetch(API + "/rooms/" + encodeURIComponent(roomId) +
      "/messages?since_seq=" + since + "&limit=200", { credentials: "include" });
    if (!r.ok) return { messages: [] };
    return r.json();
  }

  async function sendMessage(text) {
    const ctB64 = await encodeMessage(roomKey, text);
    const r = await fetch(API + "/rooms/" + encodeURIComponent(roomId) + "/messages", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ciphertext_b64: ctB64 }),
    });
    if (r.status === 429) throw new Error(t("room.err.rateLimit", "Free-Limit: 100 Messages/24h erreicht"));
    if (r.status === 410) throw new Error(t("room.err.expiredThrow", "Room abgelaufen"));
    if (r.status === 413) throw new Error(t("room.err.tooLarge", "Message zu groß"));
    if (!r.ok) {
      const body = await r.json().catch(() => ({ detail: "HTTP " + r.status }));
      throw new Error(body.detail || t("room.err.sendFailed", "Send fehlgeschlagen"));
    }
    return r.json();
  }

  // Tracker Sweep sends its moves as encrypted kind:"sweep" messages on the same pipe.
  async function sendGameEvent(obj) {
    const ctB64 = await encodeObject(roomKey, Object.assign({ kind: "sweep" }, obj));
    const r = await fetch(API + "/rooms/" + encodeURIComponent(roomId) + "/messages", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ciphertext_b64: ctB64 }),
    });
    if (!r.ok) throw new Error("sweep send " + r.status);
    return r.json();
  }

  // ---------- Room end / delete ----------

  // Terminal state: room is gone (creator deleted it, it expired, or we were
  // removed). Stop all live activity, lock the composer, tell the user why.
  function endRoom(msg) {
    if (roomEnded) return;
    roomEnded = true;
    if (sse) { try { sse.close(); } catch {} sse = null; }
    if (expiryTimer) { clearInterval(expiryTimer); expiryTimer = null; }
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    if (deleteBtn) deleteBtn.classList.add("hidden");
    showStatus(msg, "text-red-400 bg-red-500/10 border-red-500/20");
  }

  // Authoritative liveness check via the room endpoint. Returns the HTTP status
  // (0 on a network error, so we can tell "server unreachable" from "gone").
  async function probeRoom() {
    try {
      const r = await fetch(API + "/rooms/" + encodeURIComponent(roomId), { credentials: "include" });
      return r.status;
    } catch { return 0; }
  }

  // Creator-only: wipe the room server-side (messages/members/room) for everyone.
  async function onDeleteRoom() {
    const ok = window.confirm(t("room.delete.confirm",
      "Diesen Chat für ALLE endgültig löschen? Das kann nicht rückgängig gemacht werden."));
    if (!ok) return;
    deleteBtn.disabled = true;
    try {
      const r = await fetch(API + "/rooms/" + encodeURIComponent(roomId), {
        method: "DELETE", credentials: "include",
      });
      // 404 = already gone → treat as success.
      if (!r.ok && r.status !== 404) throw new Error("HTTP " + r.status);
      try {
        const store = getStore(currentAddress);
        delete store[roomId];
        setStore(currentAddress, store);
      } catch {}
      roomEnded = true;
      if (sse) { try { sse.close(); } catch {} sse = null; }
      if (expiryTimer) { clearInterval(expiryTimer); expiryTimer = null; }
      location.href = "/chat";
    } catch (e) {
      deleteBtn.disabled = false;
      showStatus("// " + (e.message || t("room.delete.failed", "Löschen fehlgeschlagen")),
        "text-red-400 bg-red-500/10 border-red-500/20");
      setTimeout(hideStatus, 4000);
    }
  }

  // ---------- SSE ----------

  function connectSSE() {
    if (sse) { try { sse.close(); } catch {} sse = null; }
    const url = API + "/rooms/" + encodeURIComponent(roomId) + "/subscribe";
    sse = new EventSource(url, { withCredentials: true });
    sse.onopen = hideStatus;
    sse.addEventListener("message", async (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        await appendMessage(payload);
      } catch {}
    });
    sse.onerror = () => {
      if (roomEnded) return;
      showStatus(t("room.status.reconnect", "// Verbindung verloren — versuche in 5s erneut …"));
      try { sse.close(); } catch {}
      sse = null;
      setTimeout(async () => {
        if (roomEnded) return;
        // Before reconnecting, check whether the room is actually gone — the
        // creator may have deleted it (404), it expired (410), or we were
        // removed (403). Only a live room (or a transient blip) reconnects.
        const st = await probeRoom();
        if (st === 404) { endRoom(t("room.status.ended", "// Dieser Chat wurde vom Ersteller beendet.")); return; }
        if (st === 410) { endRoom(t("room.status.expired", "// Room ist abgelaufen — keine neuen Nachrichten möglich")); return; }
        if (st === 403) { endRoom(t("room.status.removed", "// Du bist kein Mitglied dieses Chats mehr.")); return; }
        // Catch up via history in case we missed messages, then reconnect.
        const hist = await fetchHistory(lastSeq);
        for (const m of hist.messages) await appendMessage(m);
        connectSSE();
      }, 5000);
    };
  }

  // ---------- Boot ----------

  function updateExpiry() {
    if (!roomMeta || !roomMeta.expires_at) {
      roomExpiryEl.textContent = t("room.persistent", "persistent");
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const remaining = roomMeta.expires_at - now;
    if (remaining <= 0) {
      roomExpiryEl.textContent = t("chat.room.expired", "abgelaufen");
      showStatus(t("room.status.expired", "// Room ist abgelaufen — keine neuen Nachrichten möglich"), "text-red-400 bg-red-500/10 border-red-500/20");
      input.disabled = true;
      sendBtn.disabled = true;
      if (sse) { try { sse.close(); } catch {} sse = null; }
    } else {
      roomExpiryEl.textContent = t("chat.room.expiresPrefix", "läuft in") + " " + fmtRemaining(remaining);
    }
  }

  function persistRoomKey() {
    if (!currentAddress || !roomKey) return;
    const store = getStore(currentAddress);
    const raw = new Uint8Array(roomKey);
    // roomKey here is CryptoKey object; we can only store raw bytes. Skip if not available.
    // (We persist right after importKey — callers set from fragment.)
  }

  // Paste-invite-link recovery on the "key missing" screen (iOS home-screen / PWA case).
  function setupKeyRecovery() {
    const box = $("err-recover");
    if (!box) return;
    box.classList.remove("hidden");
    const input = $("err-recover-input");
    const btn = $("err-recover-btn");
    const err = $("err-recover-err");
    if (!btn || btn._wired) return;
    btn._wired = true;
    const go = () => {
      const raw = (input.value || "").trim();
      if (!raw) return;
      const m = raw.match(/\/chat\/r\/([A-Za-z0-9_-]+)/);
      const hi = raw.indexOf("#");
      const hash = hi >= 0 ? raw.slice(hi + 1) : "";
      let k = null;
      try { k = new URLSearchParams(hash).get("k"); } catch {}
      if (!k && /^[A-Za-z0-9_-]{40,}$/.test(raw)) k = raw; // pasted just the key
      if (!k) {
        if (err) { err.textContent = t("room.recover.bad", "Kein Schlüssel im Link gefunden."); err.classList.remove("hidden"); }
        return;
      }
      // Navigate to the (correct) room WITH the key in the fragment → boot() picks it up.
      location.href = (m ? "/chat/r/" + m[1] : location.pathname) + "#k=" + encodeURIComponent(k);
    };
    btn.addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }

  async function boot() {
    // Reset terminal state — boot() re-runs after a wallet-change.
    roomEnded = false;
    if (input) input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    roomId = parseRoomId();
    if (!roomId) {
      errText.textContent = t("room.err.noId", "Kein Room-ID in URL");
      errScreen.classList.remove("hidden");
      return;
    }

    const me = await fetchMe();
    if (!me || !me.address) {
      // Remember where we wanted to go: after a mobile WalletConnect round-trip the
      // wallet returns to the dApp origin (homepage), not this room. auth.js reads this
      // and bounces the user back into the room once the session is live.
      try {
        localStorage.setItem("dd_return_room", JSON.stringify({
          url: location.pathname + location.hash, at: Date.now(),
        }));
      } catch {}
      gate.classList.remove("hidden");
      return;
    }
    currentAddress = me.address;

    // Load room-key: URL fragment → localStorage → error
    let keyB64 = parseFragmentKey();
    const store = getStore(currentAddress);
    const localEntry = store[roomId];
    if (!keyB64 && localEntry && localEntry.key_b64) {
      keyB64 = localEntry.key_b64;
    }
    if (!keyB64) {
      errText.textContent = t("room.err.noKey", "Dieser Room-Link enthält keinen Schlüssel. Ohne das #k=… Fragment kannst du die Messages nicht entschlüsseln.");
      errScreen.classList.remove("hidden");
      // Recovery for the iOS home-screen case: adding a room to the home screen drops
      // the #k= fragment AND the PWA has separate storage — let the user paste the
      // full invite link to restore access in-app.
      setupKeyRecovery();
      return;
    }

    // Persist key locally so reloads / dashboard-entries work
    store[roomId] = { ...(localEntry || {}), key_b64: keyB64 };
    setStore(currentAddress, store);

    try {
      const rawKey = b64UrlToU8(keyB64);
      if (rawKey.length !== 32) throw new Error(t("room.err.keyLength", "Key falsche Länge"));
      roomKey = await importKey(rawKey);
    } catch (e) {
      errText.textContent = t("room.err.keyCorrupt", "Schlüssel im Link ist beschädigt.");
      errScreen.classList.remove("hidden");
      return;
    }

    try {
      roomMeta = await fetchRoom();
    } catch (e) {
      errText.textContent = e.message;
      errScreen.classList.remove("hidden");
      return;
    }

    if (roomMeta.name) {
      store[roomId].name = roomMeta.name;
      setStore(currentAddress, store);
    }

    // Made it into the room — clear any pending return target.
    try { localStorage.removeItem("dd_return_room"); } catch {}

    chatPanel.classList.remove("hidden");
    roomNameEl.textContent = roomMeta.name || t("room.defaultName", "Room");
    roomMembersEl.textContent = roomMeta.member_count + " " + (roomMeta.member_count === 1 ? t("room.memberOne", "Member") : t("room.memberMany", "Members"));
    updateExpiry();
    expiryTimer = setInterval(updateExpiry, 30_000);

    // Creator-only delete control
    if (deleteBtn) {
      if (roomMeta.is_creator) {
        deleteBtn.classList.remove("hidden");
        if (!deleteBtn._wired) { deleteBtn._wired = true; deleteBtn.addEventListener("click", onDeleteRoom); }
      } else {
        deleteBtn.classList.add("hidden");
      }
    }

    // History
    loadingEl.remove();

    // Wire the Tracker Sweep mini-game (easter egg: /sweep) before history replays,
    // so it can render any invite bubbles that arrive.
    if (window.TrackerSweep) {
      window.TrackerSweep.init({ send: sendGameEvent, me: () => currentAddress });
    }

    const hist = await fetchHistory(0);
    for (const m of hist.messages) await appendMessage(m);
    scrollToBottom();

    // Realtime
    connectSSE();

    // Auto-grow textarea
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(200, input.scrollHeight) + "px";
    });

    async function doSend() {
      const text = (input.value || "").trim();
      if (!text) return;
      // Easter egg: /sweep starts a co-op Tracker Sweep round instead of sending text.
      if (text.toLowerCase() === "/sweep") {
        input.value = "";
        input.style.height = "auto";
        if (window.TrackerSweep) window.TrackerSweep.invite();
        return;
      }
      sendBtn.disabled = true;
      try {
        await sendMessage(text);
        input.value = "";
        input.style.height = "auto";
      } catch (e) {
        showStatus("// " + e.message, "text-red-400 bg-red-500/10 border-red-500/20");
        setTimeout(hideStatus, 4000);
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    }

    sendBtn.addEventListener("click", doSend);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });

    // Pending Drop-share-link from /upload-flow → prefill + flash button
    try {
      const pending = localStorage.getItem("dd_pending_share");
      if (pending) {
        input.value = pending;
        localStorage.removeItem("dd_pending_share");
        input.focus();
        sendBtn.classList.add("ring-2", "ring-neon-500", "animate-pulse");
        setTimeout(() => sendBtn.classList.remove("animate-pulse"), 2000);
      }
    } catch {}

    // Mobile: scroll send-button into view when input gets focus (keyboard pushes content)
    input.addEventListener("focus", () => {
      setTimeout(() => {
        try { sendBtn.scrollIntoView({ block: "end", behavior: "smooth" }); } catch {}
      }, 300);
    });

    // Drop-from-Chat: attach-button → store room context + redirect to dropzone
    const attachBtn = $("chat-attach-btn");
    if (attachBtn) {
      attachBtn.addEventListener("click", (e) => {
        e.preventDefault();
        try {
          // Mark the room we should return to after upload
          localStorage.setItem("dd_chat_return", JSON.stringify({
            roomId: roomId,
            keyB64: keyB64,
            ts: Date.now(),
          }));
        } catch {}
        // Navigate to dropzone — share-to-chat.js will handle the auto-return
        window.location.href = "/#dropzone";
      });
    }

    shareBtn.addEventListener("click", async () => {
      const url = location.origin + "/chat/r/" + encodeURIComponent(roomId) + "#k=" + keyB64;
      try {
        await navigator.clipboard.writeText(url);
        shareToast.classList.remove("hidden");
        setTimeout(() => shareToast.classList.add("hidden"), 1500);
      } catch {
        prompt(t("room.sharePrompt", "Share-Link kopieren:"), url);
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    if (sse) try { sse.close(); } catch {}
    if (expiryTimer) clearInterval(expiryTimer);
  });

  // After wallet-login from the gate, re-run boot so chat opens without reload
  window.addEventListener("dwinity:wallet-changed", () => {
    // Hide gate if visible; boot() will re-render the panel
    if (gate) gate.classList.add("hidden");
    boot();
  });

  boot();
})();
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "room.encryptedDrop": "Encrypted drop",
} });
