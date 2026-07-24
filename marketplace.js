(function () {
  // --- i18n: page-scoped strings, registered order-proof (i18n.js may load after this) ---
  const MP_I18N = {
    de: {
      "mp.badge": "Daten-Marktplatz",
      "mp.h1": 'Kaufe Einblick.<br class="hidden md:inline"> Nie <span class="fx-glow-text">einzelne Menschen.</span>',
      "mp.lead": 'Jeder Pool liefert nur <span class="text-white">k-anonyme Aggregate</span> über viele Beitragende — kein einzelner Datensatz verlässt je den Tresor. Bezahlt wird in DWIN; 70&nbsp;% gehen direkt an die Menschen, deren Daten den Pool speisen.',
      "mp.note": "Aggregate schalten erst ab 5 Beitragenden frei (k-Anonymität). Frühe Phase · Testnetz.",
      "mp.loading": "Pools werden geladen …",
      "mp.active": "aktiv",
      "mp.filling": "füllt sich",
      "mp.buy": "Zugang kaufen — in DWIN",
      "mp.locked": "Aggregat ab {k} Beitragenden freigeschaltet",
      "mp.contributors": "Beitragende",
      "mp.dataType": "Datentyp",
      "mp.timeRange": "Zeitraum",
      "mp.contribs": "Beiträge",
      "mp.purchases": "Käufe",
      "mp.dwinPaid": "DWIN ausgez.",
      "mp.priceHistory": "Preishistorie",
      "mp.noPurchases": "Noch keine Käufe — füllt sich mit Nutzung.",
      "mp.unreachable": "Marktplatz derzeit nicht erreichbar.",
      "mp.noPools": "Noch keine Pools konfiguriert.",
      "mp.buySoon": "Kauf-Flow (eigene Wallet, on-chain) folgt als nächster Schritt.",
      "mp.buyNoWallet": "Keine Wallet erkannt. Verbinde deine Wallet und versuch es erneut.",
      "mp.buyPreparing": "vorbereiten …",
      "mp.buyApproving": "DWIN freigeben …",
      "mp.buyPurchasing": "Kauf senden …",
      "mp.buyConfirming": "bestätige …",
      "mp.buyReverted": "Transaktion fehlgeschlagen",
      "mp.buyDone": "gekauft",
      "mp.buyDoneMsg": "Zugang gekauft! Das k-anonyme Aggregat erscheint in Kürze in deiner Inbox, sobald die Freigabe on-chain indexiert ist.",
      "mp.buyErr": "Kauf fehlgeschlagen: "
    },
    en: {
      "mp.badge": "Data marketplace",
      "mp.h1": 'Buy insight.<br class="hidden md:inline"> Never <span class="fx-glow-text">individual people.</span>',
      "mp.lead": 'Every pool returns only <span class="text-white">k-anonymous aggregates</span> across many contributors — no single record ever leaves the vault. Paid in DWIN; 70&nbsp;% goes straight to the people whose data feeds the pool.',
      "mp.note": "Aggregates unlock only from 5 contributors (k-anonymity). Early phase · testnet.",
      "mp.loading": "Loading pools …",
      "mp.active": "active",
      "mp.filling": "filling up",
      "mp.buy": "Buy access — in DWIN",
      "mp.locked": "Aggregate unlocks at {k} contributors",
      "mp.contributors": "Contributors",
      "mp.dataType": "Data type",
      "mp.timeRange": "Time range",
      "mp.contribs": "Contributions",
      "mp.purchases": "Purchases",
      "mp.dwinPaid": "DWIN paid",
      "mp.priceHistory": "Price history",
      "mp.noPurchases": "No purchases yet — grows with use.",
      "mp.unreachable": "Marketplace currently unreachable.",
      "mp.noPools": "No pools configured yet.",
      "mp.buySoon": "Purchase flow (own wallet, on-chain) is the next build step.",
      "mp.buyNoWallet": "No wallet detected. Connect your wallet and try again.",
      "mp.buyPreparing": "preparing …",
      "mp.buyApproving": "approving DWIN …",
      "mp.buyPurchasing": "purchasing …",
      "mp.buyConfirming": "confirming …",
      "mp.buyReverted": "transaction failed",
      "mp.buyDone": "purchased",
      "mp.buyDoneMsg": "Access purchased! The k-anonymous aggregate will appear in your inbox shortly, once the grant is indexed on-chain.",
      "mp.buyErr": "Purchase failed: "
    }
  };
  if (window.DDI18n && window.DDI18n.register) window.DDI18n.register(MP_I18N);
  else { (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(MP_I18N); }
  const T = (k) => (window.DDI18n && window.DDI18n.t) ? window.DDI18n.t(k) : k;
  const LANG = () => (window.DDI18n && window.DDI18n.getLang) ? window.DDI18n.getLang() : "de";

  const KIND_ICON = { workout: "i-run", music: "i-note", music_play: "i-note",
    health_metric: "i-heart", health: "i-heart", place_visit: "i-pin",
    location: "i-pin", search: "i-vault", default: "i-pool" };
  const POOL_ICON = { "running-data": "i-run", "music-data": "i-note",
    "health-data": "i-heart", "location-data": "i-pin", default: "i-pool" };

  function fmtRange(tr) {
    if (!tr || !tr.earliest_ts) return "—";
    const o = { month: "short", year: "numeric" };
    const loc = LANG() === "de" ? "de-DE" : "en-US";
    const a = new Date(tr.earliest_ts * 1000).toLocaleDateString(loc, o);
    const b = new Date(tr.latest_ts * 1000).toLocaleDateString(loc, o);
    return a === b ? a : a + " – " + b;
  }

  function card(pool, s) {
    const k = s.k_threshold || 5;
    const n = s.contributors || 0;
    const purchasable = !!s.purchasable;
    const pct = Math.min(100, Math.round((n / k) * 100));
    const icon = POOL_ICON[pool.slug] || POOL_ICON.default;
    const kinds = (s.data_kinds || []).map(x => x.replace(/_/g, " ")).join(" · ") || "—";

    const statusBadge = purchasable
      ? `<span class="chip bg-neon-500/10 border border-neon-500/30 text-neon-500 font-mono uppercase tracking-widest text-[10px]"><svg class="ic w-3 h-3"><use href="#i-check"/></svg> ${T("mp.active")}</span>`
      : `<span class="chip bg-white/5 border border-white/10 text-white/50 font-mono uppercase tracking-widest text-[10px]">🌱 ${T("mp.filling")}</span>`;

    const cta = purchasable
      ? `<button data-buy="${pool.slug}" class="fx-halo w-full mt-4 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-neon-500 text-void-950 font-semibold text-sm hover:brightness-110 transition"><svg class="ic w-4 h-4" style="stroke-width:2"><use href="#i-cart"/></svg> ${T("mp.buy")}</button>`
      : `<div class="mt-4 px-4 py-3 rounded-xl border border-white/10 bg-void-950/40 text-center text-white/40 font-mono text-xs"><svg class="ic w-4 h-4 mr-1"><use href="#i-lock"/></svg> ${T("mp.locked").replace("{k}", k)}</div>`;

    return `
      <div class="rounded-2xl border ${purchasable ? "border-neon-500/25" : "border-white/10"} bg-void-900/60 p-6 flex flex-col">
        <div class="flex items-start justify-between gap-3">
          <div class="w-11 h-11 rounded-xl border border-white/10 flex items-center justify-center text-purple-300"><svg class="ic w-5 h-5"><use href="#${icon}"/></svg></div>
          ${statusBadge}
        </div>
        <h3 class="mt-4 text-lg font-semibold">${pool.name}</h3>
        <p class="mt-1 text-sm text-white/50">${pool.description || ""}</p>

        <div class="mt-5">
          <div class="flex items-center justify-between text-xs font-mono text-white/50 mb-1.5">
            <span class="flex items-center gap-1.5"><svg class="ic w-3.5 h-3.5"><use href="#i-users"/></svg> ${T("mp.contributors")}</span>
            <span class="${purchasable ? "text-neon-500" : "text-white/70"}">${n} / ${k}</span>
          </div>
          <div class="h-2 rounded-full bg-white/10 overflow-hidden">
            <div class="h-full rounded-full ${purchasable ? "bg-neon-500" : "bg-purple-300/60"}" style="width:${pct}%"></div>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div><div class="font-mono uppercase tracking-widest text-white/35 mb-0.5">${T("mp.dataType")}</div><div class="text-white/70">${kinds}</div></div>
          <div><div class="font-mono uppercase tracking-widest text-white/35 mb-0.5 flex items-center gap-1"><svg class="ic w-3 h-3"><use href="#i-clock"/></svg> ${T("mp.timeRange")}</div><div class="text-white/70">${fmtRange(s.time_range)}</div></div>
        </div>

        <div class="mt-4 grid grid-cols-3 gap-2 text-center">
          <div class="rounded-lg bg-void-950/50 border border-white/5 py-2"><div class="font-mono text-sm text-white/90">${s.n_contributions || 0}</div><div class="font-mono text-[9px] uppercase tracking-widest text-white/35">${T("mp.contribs")}</div></div>
          <div class="rounded-lg bg-void-950/50 border border-white/5 py-2"><div class="font-mono text-sm text-white/90">${s.purchases || 0}</div><div class="font-mono text-[9px] uppercase tracking-widest text-white/35">${T("mp.purchases")}</div></div>
          <div class="rounded-lg bg-void-950/50 border border-white/5 py-2"><div class="font-mono text-sm text-purple-300">${Math.round(s.rewards_dwin || 0)}</div><div class="font-mono text-[9px] uppercase tracking-widest text-white/35">${T("mp.dwinPaid")}</div></div>
        </div>

        <div class="mt-3">
          <div class="font-mono text-[9px] uppercase tracking-widest text-white/35 mb-1.5 flex items-center gap-1"><svg class="ic w-3 h-3"><use href="#i-coin"/></svg> ${T("mp.priceHistory")}</div>
          ${(s.recent_purchases && s.recent_purchases.length)
            ? `<div class="flex flex-wrap gap-1.5">${s.recent_purchases.slice(0, 8).map(p => `<span class="font-mono text-[10px] px-2 py-1 rounded bg-purple-300/10 border border-purple-300/20 text-purple-200">${Math.round(p.amount)} ${p.asset}</span>`).join("")}</div>`
            : `<div class="font-mono text-[10px] text-white/30">${T("mp.noPurchases")}</div>`}
        </div>
        ${cta}
      </div>`;
  }

  // Poll for a tx receipt so we only advance on a mined, successful tx.
  async function waitReceipt(provider, txHash, tries) {
    tries = tries || 60; // ~120s @ 2s (Fuji ~2s blocks)
    for (var i = 0; i < tries; i++) {
      try {
        var r = await provider.request({ method: "eth_getTransactionReceipt", params: [txHash] });
        if (r) return r;
      } catch (e) {}
      await new Promise(function (res) { setTimeout(res, 2000); });
    }
    return null;
  }

  // Buyer purchase (A2): sign approve + purchaseAccess with the buyer's OWN wallet.
  // WalletConnect-safe. Testnet (Fuji/mDWIN) — no real funds.
  async function buyAccess(slug, btn) {
    const orig = btn.textContent;
    const setBtn = (t) => { btn.textContent = t; };
    btn.disabled = true;
    const provider = (window.dwinityWC && window.dwinityWC.resolveProvider)
      ? await window.dwinityWC.resolveProvider() : (window.ethereum || null);
    if (!provider || !provider.request) {
      alert(T("mp.buyNoWallet")); btn.disabled = false; setBtn(orig); return;
    }
    try {
      setBtn(T("mp.buyPreparing"));
      const pr = await fetch("/api/marketplace/purchase/prepare?pool_slug=" + encodeURIComponent(slug),
        { method: "POST", credentials: "include" });
      if (!pr.ok) throw new Error("HTTP " + pr.status);
      const prep = await pr.json();

      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const from = accounts[0];

      const chainHex = "0x" + prep.chain_id.toString(16);
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
      } catch (e) {
        if (e && e.code === 4902 && prep.chain_id === 43113) {
          await provider.request({ method: "wallet_addEthereumChain", params: [{
            chainId: chainHex, chainName: "Avalanche Fuji C-Chain",
            nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
            rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
            blockExplorerUrls: ["https://testnet.snowtrace.io/"],
          }] });
        } else if (!e || e.code !== 4001) { throw e; }
      }

      // Step 1 approve → Step 2 purchaseAccess, each mined before the next.
      for (let s = 0; s < prep.steps.length; s++) {
        const step = prep.steps[s];
        setBtn(step.label === "approve" ? T("mp.buyApproving") : T("mp.buyPurchasing"));
        const txHash = await provider.request({
          method: "eth_sendTransaction",
          params: [{ from, to: step.to, data: step.data, value: step.value || "0x0" }],
        });
        setBtn(T("mp.buyConfirming"));
        const rcpt = await waitReceipt(provider, txHash);
        if (!rcpt || rcpt.status !== "0x1") throw new Error(T("mp.buyReverted"));
      }

      setBtn("✓ " + T("mp.buyDone"));
      if (window.DwinityFx) { try { window.DwinityFx.confetti({ count: 100, duration: 3000 }); } catch {} }
      alert(T("mp.buyDoneMsg"));
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (!(e && e.code === 4001)) alert(T("mp.buyErr") + msg.slice(0, 200));
      setBtn(orig); btn.disabled = false;
    }
  }

  let _pools = [], _stats = [];
  function render() {
    const grid = document.getElementById("pools");
    if (!grid || !_pools.length) return;
    grid.innerHTML = _pools.map((p, i) => card(p, _stats[i] || {})).join("");
    grid.querySelectorAll("[data-buy]").forEach(btn => {
      btn.addEventListener("click", () => buyAccess(btn.getAttribute("data-buy"), btn));
    });
  }

  async function load() {
    const grid = document.getElementById("pools");
    let pools = [];
    try {
      const r = await fetch("/api/marketplace/pools", { credentials: "include" });
      const j = await r.json();
      pools = j.pools || [];
    } catch (e) {
      grid.innerHTML = `<div class="col-span-full text-center text-white/40 font-mono text-sm py-16">${T("mp.unreachable")}</div>`;
      return;
    }
    if (!pools.length) {
      grid.innerHTML = `<div class="col-span-full text-center text-white/40 font-mono text-sm py-16">${T("mp.noPools")}</div>`;
      return;
    }
    _stats = await Promise.all(pools.map(p =>
      fetch("/api/marketplace/pools/" + p.slug + "/stats", { credentials: "include" })
        .then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ));
    _pools = pools;
    render();
  }
  // Re-render dynamic cards when the language changes (static [data-i18n] is handled by i18n.js).
  window.addEventListener("dd:lang-changed", render);
  load();
})();
