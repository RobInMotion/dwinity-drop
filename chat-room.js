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

  let roomId = null;
  let roomKey = null;
  let currentAddress = null;
  let lastSeq = 0;
  let sse = null;
  let roomMeta = null;
  let expiryTimer = null;

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

  function renderMessage(msg, decoded) {
    const isMe = msg.sender === currentAddress;
    const row = document.createElement("div");
    row.className = "flex " + (isMe ? "justify-end" : "justify-start");
    row.dataset.seq = msg.seq;
    const nameColor = isMe ? "text-neon-500" : "text-white/70";
    const bg = isMe ? "bg-neon-500/10 border-neon-500/30" : "bg-void-800/70 border-white/5";
    const kind = decoded?.kind;
    let contentHtml;
    if (kind === "error") {
      contentHtml = '<span class="italic text-red-400">' + escapeHtml(decoded.text) + '</span>';
    } else {
      contentHtml = escapeHtml(decoded?.text || "").replace(/\n/g, "<br>");
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
      showStatus(t("room.status.reconnect", "// Verbindung verloren — versuche in 5s erneut …"));
      try { sse.close(); } catch {}
      sse = null;
      setTimeout(async () => {
        // Catch up via history in case we missed messages
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

  async function boot() {
    roomId = parseRoomId();
    if (!roomId) {
      errText.textContent = t("room.err.noId", "Kein Room-ID in URL");
      errScreen.classList.remove("hidden");
      return;
    }

    const me = await fetchMe();
    if (!me || !me.address) {
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

    chatPanel.classList.remove("hidden");
    roomNameEl.textContent = roomMeta.name || t("room.defaultName", "Room");
    roomMembersEl.textContent = roomMeta.member_count + " " + (roomMeta.member_count === 1 ? t("room.memberOne", "Member") : t("room.memberMany", "Members"));
    updateExpiry();
    expiryTimer = setInterval(updateExpiry, 30_000);

    // History
    loadingEl.remove();
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
