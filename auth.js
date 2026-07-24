(function () {
  // Wallet login via SIWE. Populates the #wallet-btn area in the header
  // IF present, but also exposes a global [data-action="connect-wallet"]
  // handler + window.connectWallet that works on pages without the header
  // (e.g. chat-room gate screen).

  const API = "/api/identity";
  const CHAIN_ID = 43114; // Avalanche C-Chain

  const btn = document.getElementById("wallet-btn");
  const label = document.getElementById("wallet-btn-label");
  const dot = document.getElementById("wallet-btn-dot");
  const menu = document.getElementById("wallet-menu");
  const menuAddr = document.getElementById("wallet-menu-addr");
  const menuPro = document.getElementById("wallet-menu-pro");
  const menuLogout = document.getElementById("wallet-menu-logout");

  const hasHeader = !!btn;
  let lastAddr = null;

  function short(addr) {
    if (!addr) return "";
    return addr.slice(0, 6) + "…" + addr.slice(-4);
  }

  // EIP-55 checksum address (required by siwe). Uses js-sha3's keccak256.
  function toChecksumAddress(address) {
    const kec = (window.sha3 && window.sha3.keccak256) || window.keccak256;
    if (!kec) return address; // fallback: hope wallet already checksummed
    const lower = address.toLowerCase().replace(/^0x/, "");
    const hash = kec(lower);
    let out = "0x";
    for (let i = 0; i < lower.length; i++) {
      out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
    }
    return out;
  }

  function renderLoggedOut() {
    if (!hasHeader) return;
    const tt = (window.DDI18n && window.DDI18n.t && window.DDI18n.t("nav.walletConnect"));
    label.textContent = (tt && tt !== "nav.walletConnect") ? tt : "Wallet verbinden";
    dot.className = "w-1.5 h-1.5 rounded-full bg-white/50";
    if (menu) menu.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
    btn.dataset.state = "out";
  }

  // Tier visual config — color-coded membership tiers
  const TIER_CONFIG = {
    free:    { label: "Free",    dot: "bg-white/50",   text: "text-white/60",  bg: "bg-white/5",     border: "border-white/15",     icon: "·",  ring: "" },
    pro:     { label: "Pro",     dot: "bg-neon-500",   text: "text-neon-500",  bg: "bg-neon-500/10", border: "border-neon-500/40",  icon: "◆",  ring: "ring-neon-500/20" },
    proplus: { label: "Pro+",    dot: "bg-cyan-400",   text: "text-cyan-400",  bg: "bg-cyan-400/10", border: "border-cyan-400/50",  icon: "⚡", ring: "ring-cyan-400/30" },
  };

  function fmtBytesShort(n) {
    if (n == null) return "—";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(0) + " MB";
    return (n / 1024 / 1024 / 1024).toFixed(1) + " GB";
  }

  function fmtDate(ts) {
    return new Date(ts * 1000).toLocaleDateString(
      (window.DDI18n && window.DDI18n.getLang && window.DDI18n.getLang() === "en") ? "en-US" : "de-DE"
    );
  }

  function t(key, fallback) {
    const v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(key);
    return (v && v !== key) ? v : fallback;
  }

  async function fetchRank() {
    try {
      const r = await fetch("/api/identity/rank/me", { credentials: "include" });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  function renderTierBlock(me) {
    const tier = me.tier || (me.pro ? "pro" : "free");
    const cfg = TIER_CONFIG[tier] || TIER_CONFIG.free;
    const expTs = (tier === "proplus" && me.proplus_until) ? me.proplus_until
                : (tier === "pro" && me.pro_until) ? me.pro_until
                : null;

    const tierLabel = t("nav.tier." + tier, cfg.label);
    const expText = expTs ? t("nav.tier.until", "bis") + " " + fmtDate(expTs) : "";
    const upgradeText = t("nav.tier.upgrade", "Pro freischalten");

    if (tier === "free") {
      return (
        '<div class="p-3 rounded-lg ' + cfg.bg + ' border ' + cfg.border + ' mb-3">' +
          '<div class="flex items-center gap-2 mb-1">' +
            '<span class="' + cfg.text + ' text-base font-extrabold">' + cfg.icon + '</span>' +
            '<span class="' + cfg.text + ' font-semibold text-sm">' + tierLabel + '</span>' +
          '</div>' +
          '<a href="/#preise" data-action="open-upgrade" class="text-neon-500 hover:underline text-[11px] font-mono">' + upgradeText + ' →</a>' +
        '</div>'
      );
    }
    return (
      '<div class="p-3 rounded-lg ' + cfg.bg + ' border ' + cfg.border + ' ring-1 ' + cfg.ring + ' mb-3">' +
        '<div class="flex items-center justify-between gap-2">' +
          '<div class="flex items-center gap-2">' +
            '<span class="' + cfg.text + ' text-base font-extrabold">' + cfg.icon + '</span>' +
            '<span class="' + cfg.text + ' font-bold text-sm">' + tierLabel + ' ' + t("nav.tier.active", "aktiv") + '</span>' +
          '</div>' +
        '</div>' +
        (expText ? '<div class="text-[10px] font-mono text-white/50 mt-1">' + expText + '</div>' : '') +
      '</div>'
    );
  }

  function renderEgressBlock(me) {
    if (!me.egress) return "";
    const eg = me.egress;
    const used = eg.bytes_used || 0;
    const quota = eg.bytes_quota || 1;
    const credits = eg.bytes_credits || 0;
    const pct = Math.min(100, Math.round(used / quota * 100));
    const barColor = pct >= 90 ? "from-amber-400 to-red-500" : "from-neon-500 to-cyan-400";
    return (
      '<div class="mb-3 p-3 rounded-lg bg-void-800/60 border border-white/5">' +
        '<div class="flex items-center justify-between text-[10px] font-mono text-white/50 mb-1.5">' +
          '<span>' + t("nav.egress.label", "Egress") + ' (30d)</span>' +
          (credits > 0 ? '<span class="text-cyan-400">+' + fmtBytesShort(credits) + '</span>' : '') +
        '</div>' +
        '<div class="h-1.5 rounded-full bg-void-900 overflow-hidden mb-1">' +
          '<div class="h-full bg-gradient-to-r ' + barColor + '" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<div class="flex items-center justify-between text-[10px] font-mono text-white/40">' +
          '<span>' + fmtBytesShort(used) + ' / ' + fmtBytesShort(quota) + '</span>' +
          '<a href="/topup" class="text-neon-500 hover:underline">+ ' + t("nav.egress.topup", "Top-up") + '</a>' +
        '</div>' +
      '</div>'
    );
  }

  async function renderRankBlock(rankData) {
    if (!rankData || !rankData.opted_in) return "";
    const rank = rankData.rank && rankData.rank.current;
    if (!rank) return "";
    const earned = rankData.earned_credits_gb || 0;
    return (
      '<a href="/rank" class="block mb-3 p-3 rounded-lg bg-gradient-to-br from-neon-500/10 to-cyan-400/5 border border-neon-500/20 hover:border-neon-500/50 transition">' +
        '<div class="flex items-center justify-between gap-2">' +
          '<span class="text-sm">' + rank.name + '</span>' +
          '<span class="text-[10px] font-mono text-white/50">' + (rankData.total_xp || 0) + ' XP</span>' +
        '</div>' +
        '<div class="text-[10px] font-mono text-white/60 mt-1">' + rank.perk + '</div>' +
        (earned > 0 ? '<div class="text-[10px] font-mono text-cyan-400 mt-1">+' + earned + ' GB ' + t("nav.rank.earned", "earned") + '</div>' : '') +
        '<div class="text-[10px] font-mono text-neon-500 mt-1.5">🐉 ' + t("nav.rank.viewLink", "Dragon Rank") + ' →</div>' +
      '</a>'
    );
  }

  // Prefer a display name over the raw address wherever the user is shown.
  function displayName(me) {
    return (me && me.username) ? me.username : short(me && me.address);
  }

  async function renderLoggedIn(me) {
    if (!hasHeader) return;
    lastAddr = me.address;
    label.textContent = displayName(me);
    btn.dataset.state = "in";

    // Tier-coloured header dot
    const tier = me.tier || (me.pro ? "pro" : "free");
    const cfg = TIER_CONFIG[tier] || TIER_CONFIG.free;
    dot.className = "w-1.5 h-1.5 rounded-full " + cfg.dot + " pulse-dot shrink-0";

    // Build menu sections
    if (menuAddr) menuAddr.textContent = me.address;
    renderUsernameEditor(me);
    const tierBlock = renderTierBlock(me);
    const egressBlock = renderEgressBlock(me);
    if (menuPro) menuPro.innerHTML = tierBlock + egressBlock +
      '<a href="/dashboard" class="block text-[11px] font-mono text-white/60 hover:text-neon-500 transition">→ ' +
      t("nav.dashboard", "Dashboard") + '</a>';

    // Add rank link below dashboard, will fill async (menu markup may be
    // absent on gate-style pages like /topup — skip the slot there)
    let rankSlot = document.getElementById("wallet-menu-rank");
    if (!rankSlot && menuPro) {
      rankSlot = document.createElement("div");
      rankSlot.id = "wallet-menu-rank";
      menuPro.appendChild(rankSlot);
    }
    if (!rankSlot) { probeAdmin(); return; }
    rankSlot.innerHTML = "";

    // Probe admin + fetch rank async
    probeAdmin();
    const rd = await fetchRank();
    if (rd && rd.opted_in) {
      rankSlot.innerHTML = '<div class="mt-3">' + await renderRankBlock(rd) + '</div>';
    } else {
      rankSlot.innerHTML = '<a href="/rank" class="block mt-2 text-[11px] font-mono text-white/40 hover:text-neon-500 transition">🐉 ' + t("nav.rank.viewLink", "Dragon Rank") + ' →</a>';
    }
  }

  function unameMsgCls(kind) {
    return "text-[10px] font-mono mt-1 min-h-[12px] " +
      (kind === "err" ? "text-red-400" : kind === "ok" ? "text-neon-500" : "text-white/40");
  }

  // Inline "display name" editor in the wallet dropdown. Injected once, right
  // under the address; value refreshed on each render (unless the field is focused).
  function renderUsernameEditor(me) {
    if (!menuAddr) return;
    let box = document.getElementById("wallet-menu-username");
    if (!box) {
      box = document.createElement("div");
      box.id = "wallet-menu-username";
      box.className = "mb-3";
      box.innerHTML =
        '<div class="flex items-center gap-1.5">' +
          '<input id="uname-input" type="text" maxlength="20" spellcheck="false" autocomplete="off" ' +
            'class="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-void-800 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-neon-500/40" />' +
          '<button id="uname-save" type="button" class="shrink-0 px-2.5 py-1.5 rounded-lg bg-neon-500/15 text-neon-500 text-[11px] font-mono hover:bg-neon-500/25 transition"></button>' +
        '</div>' +
        '<div id="uname-msg" class="' + unameMsgCls() + '"></div>';
      menuAddr.insertAdjacentElement("afterend", box);
      wireUsername();
    }
    const input = document.getElementById("uname-input");
    const saveBtn = document.getElementById("uname-save");
    const msg = document.getElementById("uname-msg");
    if (input && document.activeElement !== input) input.value = me.username || "";
    if (input) input.placeholder = t("nav.username.placeholder", "Anzeigename (optional)");
    if (saveBtn) saveBtn.textContent = t("nav.username.save", "Speichern");
    if (msg) { msg.textContent = ""; msg.className = unameMsgCls(); }
  }

  function wireUsername() {
    const input = document.getElementById("uname-input");
    const saveBtn = document.getElementById("uname-save");
    const msg = document.getElementById("uname-msg");
    if (!input || !saveBtn) return;
    async function save() {
      const val = input.value.trim();
      saveBtn.disabled = true;
      if (msg) { msg.textContent = t("nav.username.saving", "…"); msg.className = unameMsgCls(); }
      try {
        const r = await fetch(API + "/username", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: val }),
        });
        if (r.status === 409) { if (msg) { msg.textContent = t("nav.username.taken", "Name schon vergeben"); msg.className = unameMsgCls("err"); } return; }
        if (r.status === 400) { if (msg) { msg.textContent = t("nav.username.invalid", "3–20 Zeichen: Buchstaben, Zahlen, _"); msg.className = unameMsgCls("err"); } return; }
        if (!r.ok) { if (msg) { msg.textContent = t("nav.username.failed", "Speichern fehlgeschlagen"); msg.className = unameMsgCls("err"); } return; }
        const data = await r.json();
        if (label) label.textContent = data.username || (lastAddr ? short(lastAddr) : label.textContent);
        input.value = data.username || "";
        if (msg) { msg.textContent = data.username ? t("nav.username.saved", "✓ gespeichert") : t("nav.username.cleared", "✓ entfernt"); msg.className = unameMsgCls("ok"); }
      } catch {
        if (msg) { msg.textContent = t("nav.username.failed", "Speichern fehlgeschlagen"); msg.className = unameMsgCls("err"); }
      } finally {
        saveBtn.disabled = false;
      }
    }
    saveBtn.addEventListener("click", save);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  }

  async function probeAdmin() {
    try {
      const r = await fetch("/api/identity/admin/wallets", { credentials: "include" });
      if (!r.ok) {
        const existing = document.getElementById("wallet-menu-admin");
        if (existing) existing.remove();
        return;
      }
      if (!document.getElementById("wallet-menu-admin")) {
        const link = document.createElement("a");
        link.id = "wallet-menu-admin";
        link.href = "/admin";
        link.className = "block mb-3 text-xs font-mono text-red-400 hover:text-red-300 transition";
        link.textContent = "🛡 Admin Center →";
        if (menuLogout && menuLogout.parentNode) {
          menuLogout.parentNode.insertBefore(link, menuLogout);
        }
      }
    } catch {}
  }

  async function fetchMeOnce() {
    // { ok:true, me } on a clean response; { ok:false } on a transient failure
    // (network error / 5xx) where the login state is unknown.
    try {
      const r = await fetch(API + "/me", { credentials: "include" });
      if (!r.ok) return { ok: false };
      return { ok: true, me: await r.json() };
    } catch {
      return { ok: false };
    }
  }

  async function refreshMe() {
    // /me returns 200 {address:null} when logged out, so a non-OK/throw is a
    // server/network blip — NOT a logout. Retry once; if it still fails, keep
    // the current button state instead of falsely flashing "connect wallet".
    let res = await fetchMeOnce();
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 1200));
      res = await fetchMeOnce();
    }
    if (!res.ok) return null;            // transient failure — leave state as-is
    const me = res.me;
    if (me && me.address) renderLoggedIn(me);
    else renderLoggedOut();
    return me;
  }

  async function requestChallenge() {
    const r = await fetch(API + "/siwe/challenge", { credentials: "include" });
    if (!r.ok) throw new Error(t("wallet.challengeFailed", "Konnte Challenge nicht holen") + " (HTTP " + r.status + ")");
    return r.json();
  }

  function buildSiweMessage({ address, nonce }) {
    const origin = location.origin;
    const host = location.host;
    const issuedAt = new Date().toISOString();
    return (
      `${host} wants you to sign in with your Ethereum account:\n` +
      `${address}\n\n` +
      `Sign in to Dead Drop, powered by Dwinity.\n\n` +
      `URI: ${origin}\n` +
      `Version: 1\n` +
      `Chain ID: ${CHAIN_ID}\n` +
      `Nonce: ${nonce}\n` +
      `Issued At: ${issuedAt}`
    );
  }

  async function connect(opts) {
    opts = opts || {};
    const forceWC = !!opts.walletConnect;
    const useWC = forceWC || !window.ethereum;

    if (hasHeader) {
      label.textContent = t("nav.walletConnecting", "// verbinden …");
      btn.disabled = true;
    }

    let provider;
    if (useWC) {
      if (!window.dwinityWC) {
        alert(t("nav.noWalletNoWC", "Keine Wallet erkannt und WalletConnect nicht geladen.\n\nInstalliere MetaMask (Chrome/Edge/Firefox) oder lade die Seite neu."));
        renderLoggedOut();
        if (hasHeader) btn.disabled = false;
        return;
      }
      try {
        provider = await window.dwinityWC.ensureConnected();
      } catch (e) {
        const msg = (e && e.message) || String(e);
        if (!/reject|cancel|user closed|modal closed/i.test(msg)) {
          alert(t("wallet.connectFailed", "Wallet-Verbindung fehlgeschlagen: ") + msg);
        }
        renderLoggedOut();
        if (hasHeader) btn.disabled = false;
        return;
      }
    } else {
      provider = window.ethereum;
    }

    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const raw = (accounts && accounts[0]) || "";
      if (!raw) throw new Error(t("wallet.noAccount", "Kein Wallet-Account"));
      const address = toChecksumAddress(raw);

      const { nonce } = await requestChallenge();
      const message = buildSiweMessage({ address, nonce });

      const signature = await provider.request({
        method: "personal_sign",
        params: [message, address],
      });

      // Pick up pending ref-code (set by ref-capture.js) to attribute referral
      const refCode = (typeof window.dwinityReadRef === "function") ? window.dwinityReadRef() : null;
      const body = { message, signature };
      if (refCode) body.ref_code = refCode;

      const r = await fetch(API + "/siwe/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.text();
        throw new Error("Login fehlgeschlagen: " + err);
      }
      const me = await r.json();
      renderLoggedIn(me);
      // Clear ref cookie — attribution already done server-side (idempotent anyway)
      if (typeof window.dwinityClearRef === "function") window.dwinityClearRef();
      // Tell page-scripts that need to re-boot (chat, admin) a login happened
      window.dispatchEvent(new CustomEvent("dwinity:wallet-changed", { detail: me }));
    } catch (err) {
      const msg = (err && err.message) || String(err);
      // user-rejected in MetaMask has code 4001
      if (err && (err.code === 4001 || /reject|cancel/i.test(msg))) {
        renderLoggedOut();
      } else {
        alert(t("wallet.loginFailed", "Wallet-Login: ") + msg);
        renderLoggedOut();
      }
    } finally {
      if (hasHeader) btn.disabled = false;
    }
  }

  async function logout() {
    try {
      await fetch(API + "/logout", { method: "POST", credentials: "include" });
    } catch {}
    // If we're connected via WalletConnect, drop that session too — otherwise
    // the user stays "connected" in the WC sense even after our cookie is gone.
    if (window.dwinityWC && window.ethereum && window.ethereum.__dwinityWC) {
      try { await window.dwinityWC.disconnect(); } catch {}
    }
    renderLoggedOut();
  }

  // --- Global triggers (work on ALL pages, with or without header) ---
  document.addEventListener("click", (e) => {
    const wcTrigger = e.target.closest('[data-action="connect-wallet-qr"]');
    if (wcTrigger) {
      e.preventDefault();
      connect({ walletConnect: true });
      return;
    }
    const trigger = e.target.closest('[data-action="connect-wallet"]');
    if (trigger) {
      e.preventDefault();
      connect();
    }
  });
  window.connectWallet = connect;
  window.connectWalletQR = () => connect({ walletConnect: true });

  // --- Header-specific wiring: only if #wallet-btn exists ---
  if (hasHeader) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (btn.dataset.state === "in") {
        if (!menu) return;
        const willOpen = menu.classList.contains("hidden");
        menu.classList.toggle("hidden");
        btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      } else {
        connect();
      }
    });

    if (menuLogout) menuLogout.addEventListener("click", (e) => {
      e.preventDefault();
      if (menu) menu.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
      logout();
    });

    // click outside closes menu
    document.addEventListener("click", (e) => {
      if (menu && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.add("hidden");
        btn.setAttribute("aria-expanded", "false");
      }
    });

    // Escape key closes menu (a11y best practice for popups)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu && !menu.classList.contains("hidden")) {
        menu.classList.add("hidden");
        btn.setAttribute("aria-expanded", "false");
        btn.focus();
      }
    });
  }

  // Re-fetch /me when the upgrade flow says a payment landed.
  window.addEventListener("dwinity:pro-updated", (e) => {
    if (e && e.detail && e.detail.address) renderLoggedIn(e.detail);
  });

  // Re-render the logged-out label after a language switch (the label is
  // JS-managed, so applyAll() can't translate it without clobbering the
  // connected-state address).
  window.addEventListener("dd:lang-changed", () => {
    if (hasHeader && btn.dataset.state === "out") renderLoggedOut();
  });

  // Return-to-room: a user who opened a chat-room link while logged out can be bounced
  // to the homepage after a mobile WalletConnect round-trip (the wallet returns to the
  // dApp origin, not the room path). Once the session is live, send them back in.
  // Only ever redirect to a site-relative path on our own origin — never an
  // absolute/protocol-relative URL. Guards against the stored target being an
  // open-redirect vector if anything other than chat-room.js ever writes it.
  function isSafeLocalPath(u) {
    if (typeof u !== "string" || !u) return false;
    if (u[0] !== "/" || u[1] === "/") return false;          // must be "/path", not "//host" or a scheme
    try { return new URL(u, location.origin).origin === location.origin; }
    catch { return false; }
  }

  async function maybeReturnToRoom() {
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem("dd_return_room") || "null"); } catch {}
    if (!pending || !isSafeLocalPath(pending.url)) {
      try { localStorage.removeItem("dd_return_room"); } catch {}
      return;
    }
    if (!pending.at || Date.now() - pending.at > 300000) {   // expire after 5 min
      try { localStorage.removeItem("dd_return_room"); } catch {}
      return;
    }
    if (location.pathname === String(pending.url).split("#")[0]) return; // already there
    try {
      const r = await fetch(API + "/me", { credentials: "include" });
      if (!r.ok) return;
      const me = await r.json();
      if (!me.address) return;                               // only once logged in
    } catch { return; }
    try { localStorage.removeItem("dd_return_room"); } catch {}
    location.replace(pending.url);
  }
  maybeReturnToRoom();

  // boot — only refresh/render the header if it exists
  if (hasHeader) refreshMe();
})();
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "nav.noWalletNoWC": "No wallet detected and WalletConnect not loaded.\n\nInstall MetaMask (Chrome/Edge/Firefox) or reload the page.",
  "nav.username.placeholder": "Display name (optional)",
  "nav.username.save": "Save",
  "nav.username.saving": "…",
  "nav.username.saved": "✓ saved",
  "nav.username.cleared": "✓ removed",
  "nav.username.taken": "Name already taken",
  "nav.username.invalid": "3–20 chars: letters, numbers, _",
  "nav.username.failed": "Save failed",
} });
