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
    menu.classList.add("hidden");
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
      (window.DDI18n && window.DDI18n.lang === "en") ? "en-US" : "de-DE"
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
          '<a href="#" data-action="open-upgrade" class="text-neon-500 hover:underline text-[11px] font-mono">' + upgradeText + ' →</a>' +
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
      '<div class="mb-3 p-3 rounded-lg bg-gradient-to-br from-neon-500/10 to-cyan-400/5 border border-neon-500/20">' +
        '<div class="flex items-center justify-between gap-2">' +
          '<span class="text-sm">' + rank.name + '</span>' +
          '<span class="text-[10px] font-mono text-white/50">' + (rankData.total_xp || 0) + ' XP</span>' +
        '</div>' +
        '<div class="text-[10px] font-mono text-white/60 mt-1">' + rank.perk + '</div>' +
        (earned > 0 ? '<div class="text-[10px] font-mono text-cyan-400 mt-1">+' + earned + ' GB ' + t("nav.rank.earned", "earned") + '</div>' : '') +
      '</div>'
    );
  }

  async function renderLoggedIn(me) {
    if (!hasHeader) return;
    label.textContent = short(me.address);
    btn.dataset.state = "in";

    // Tier-coloured header dot
    const tier = me.tier || (me.pro ? "pro" : "free");
    const cfg = TIER_CONFIG[tier] || TIER_CONFIG.free;
    dot.className = "w-1.5 h-1.5 rounded-full " + cfg.dot + " pulse-dot shrink-0";

    // Build menu sections
    menuAddr.textContent = me.address;
    const tierBlock = renderTierBlock(me);
    const egressBlock = renderEgressBlock(me);
    menuPro.innerHTML = tierBlock + egressBlock +
      '<a href="/dashboard" class="block text-[11px] font-mono text-white/60 hover:text-neon-500 transition">→ ' +
      t("nav.dashboard", "Dashboard") + '</a>';

    // Add rank link below dashboard, will fill async
    let rankSlot = document.getElementById("wallet-menu-rank");
    if (!rankSlot) {
      rankSlot = document.createElement("div");
      rankSlot.id = "wallet-menu-rank";
      menuPro.appendChild(rankSlot);
    }
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

  async function refreshMe() {
    try {
      const r = await fetch(API + "/me", { credentials: "include" });
      if (!r.ok) { renderLoggedOut(); return null; }
      const me = await r.json();
      if (me.address) renderLoggedIn(me);
      else renderLoggedOut();
      return me;
    } catch {
      renderLoggedOut();
      return null;
    }
  }

  async function requestChallenge() {
    const r = await fetch(API + "/siwe/challenge", { credentials: "include" });
    if (!r.ok) throw new Error("Konnte Challenge nicht holen (HTTP " + r.status + ")");
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

  async function connect() {
    if (!window.ethereum) {
      alert(
        "Keine Wallet erkannt.\n\n" +
        "Installiere MetaMask (oder eine kompatible Wallet wie Rabby/Trust) " +
        "und lade die Seite neu."
      );
      return;
    }

    if (hasHeader) {
      label.textContent = t("nav.walletConnecting", "// verbinden …");
      btn.disabled = true;
    }

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const raw = (accounts && accounts[0]) || "";
      if (!raw) throw new Error("Kein Wallet-Account");
      const address = toChecksumAddress(raw);

      const { nonce } = await requestChallenge();
      const message = buildSiweMessage({ address, nonce });

      const signature = await window.ethereum.request({
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
        alert("Wallet-Login: " + msg);
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
    renderLoggedOut();
  }

  // --- Global triggers (work on ALL pages, with or without header) ---
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest('[data-action="connect-wallet"]');
    if (trigger) {
      e.preventDefault();
      connect();
    }
  });
  window.connectWallet = connect;

  // --- Header-specific wiring: only if #wallet-btn exists ---
  if (hasHeader) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (btn.dataset.state === "in") {
        menu.classList.toggle("hidden");
      } else {
        connect();
      }
    });

    menuLogout.addEventListener("click", (e) => {
      e.preventDefault();
      menu.classList.add("hidden");
      logout();
    });

    // click outside closes menu
    document.addEventListener("click", (e) => {
      if (!btn.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.add("hidden");
      }
    });
  }

  // Re-fetch /me when the upgrade flow says a payment landed.
  window.addEventListener("dwinity:pro-updated", (e) => {
    if (e && e.detail && e.detail.address) renderLoggedIn(e.detail);
  });

  // boot — only refresh/render the header if it exists
  if (hasHeader) refreshMe();
})();
