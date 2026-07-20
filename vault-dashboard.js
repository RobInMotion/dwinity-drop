// Dashboard for the Vault — appears as a hero card above the imports list
// after a successful contribute. Shows archetype, pool position, inbox events.
//
// Renders into <section id="dashboard-section"> if present, otherwise no-op.
// Caller (vault.js) makes the section visible after Wrapped/Contribute resolves.

// i18n helper: translated string if DDI18n is loaded, German fallback otherwise
function vt(key, fallback, vars) {
  let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
  if (!v || v === key) v = fallback;
  if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
  return v;
}

(function (global) {
  // label resolves lazily via key — vt() at module-eval time would freeze
  // the German fallback before the EN dict is registered.
  const ARCHETYPE_LABELS = {
    "marathonjunkie":     { icon: "🏅", label: "Marathonjunkie" },
    "distance-beast":     { icon: "🦬", label: "Distance Beast" },
    "wochenend-krieger":  { icon: "⚔️", key: "vd.arch.weekend", label: "Wochenend-Krieger" },
    "fruehaufsteher":     { icon: "🌅", key: "vd.arch.early",   label: "Frühaufsteher" },
    "park-dauerlaeufer":  { icon: "🌳", key: "vd.arch.park",    label: "Park-Dauerläufer" },
    "recreational":       { icon: "🌀", label: "Recreational Runner" },
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    })[c]);
  }

  // Wallet balance is now rendered in the header by wallet-balance.js — no
  // longer duplicated in the hero card. Keep the function as a no-op for
  // backwards compat; the call site below renders empty string.
  function renderBalances() { return ""; }

  function renderHero({ archetype, poolName, poolAddress, members, contributionCount, earnings30d, txHash, chainId, wallet }) {
    const a0 = ARCHETYPE_LABELS[archetype];
    const a = a0
      ? { icon: a0.icon, label: a0.key ? vt(a0.key, a0.label) : a0.label }
      : { icon: "🌀", label: vt("vd.poolMember", "Pool-Mitglied") };
    const explorer = chainId === 43114 ? "https://snowtrace.io" : "https://testnet.snowtrace.io";
    return `
      <div class="rounded-2xl border border-neon-500/30 bg-gradient-to-br from-neon-500/15 via-neon-500/5 to-transparent p-6 md:p-8">
        <div class="flex flex-col md:flex-row gap-6 items-start">
          <div class="text-7xl md:text-8xl">${a.icon}</div>
          <div class="flex-1">
            <div class="text-[10px] font-mono text-neon-500 uppercase tracking-widest mb-2">${vt("vd.enrolled", "Du bist eingetragen")}</div>
            <div class="text-3xl md:text-4xl font-bold mb-2">${a.label}</div>
            <div class="text-sm text-white/70 mb-3">
              ${vt("vd.memberOf", "Mitglied im")} <span class="text-white font-medium">${escapeHtml(poolName || "Pool")}</span>
              ${members != null ? ` · ${vt("vd.membersTotal", "{n} Mitglieder gesamt", { n: members })}` : ""}
              ${contributionCount != null ? ` · ${vt("vd.activeContribs", "{n} aktive Contributions", { n: contributionCount })}` : ""}
            </div>
            ${earnings30d != null ? `
              <div class="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-void-900/60 border border-white/10">
                <span class="w-1.5 h-1.5 rounded-full bg-neon-500 animate-pulse"></span>
                <span class="text-xs font-mono text-white/70">Pool earned last 30d:</span>
                <span class="text-sm font-bold text-neon-500">$${earnings30d.toFixed(2)}</span>
              </div>
            ` : ""}
            <div class="flex flex-wrap gap-2">
              <button data-demo-trigger class="px-3 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30 text-xs font-mono transition">
                🧪 ${vt('vd.demoTrigger', 'Demo: Buyer-Tx auslösen')}
              </button>
              <button data-add-token="USDC" class="px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:text-white hover:border-neon-500/40 text-xs font-mono transition" title="${vt('vd.addTokenTitle', '{sym} als sichtbares Token in deiner MetaMask hinzufügen', { sym: 'mUSDC' })}">
                🦊 mUSDC ins Wallet
              </button>
              <button data-add-token="DWIN" class="px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:text-white hover:border-neon-500/40 text-xs font-mono transition" title="${vt('vd.addTokenTitle', '{sym} als sichtbares Token in deiner MetaMask hinzufügen', { sym: 'mDWIN' })}">
                🦊 mDWIN ins Wallet
              </button>
              ${txHash ? `
                <a href="${explorer}/tx/${txHash}" target="_blank" rel="noopener"
                   class="pro-only px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:text-white hover:border-neon-500/40 text-xs font-mono transition">
                  Contribute-Tx ↗
                </a>
              ` : ""}
              ${poolAddress ? `
                <a href="${explorer}/address/${poolAddress}" target="_blank" rel="noopener"
                   class="pro-only px-3 py-1.5 rounded-full border border-white/15 text-white/70 hover:text-white hover:border-neon-500/40 text-xs font-mono transition">
                  Pool-Contract ↗
                </a>
              ` : ""}
            </div>
            ${renderBalances(wallet)}
          </div>
        </div>
      </div>
    `;
  }

  function renderInboxItem(it) {
    const date = new Date(it.ts * 1000).toLocaleString("de-DE");
    if (it.type === "claim_available") {
      const usdc = (it.payload.claimable_usdc || 0);
      const dwin = (it.payload.claimable_dwin || 0);
      const asset = it.payload.asset || (usdc > 0 ? "USDC" : "DWIN");
      const amountStr = (asset === "DWIN")
        ? `${dwin.toFixed(2)} mDWIN`
        : `~$${usdc.toFixed(2)} USDC`;
      return `
        <div class="rounded-xl bg-void-900 border border-white/10 p-4 flex items-center justify-between gap-4">
          <div>
            <div class="font-semibold text-base">💰 ${amountStr} bereit zum Claim</div>
            <div class="text-xs text-white/50 mt-0.5">${escapeHtml(it.pool_slug)} · ${date}</div>
          </div>
          <button data-claim="${it.id}" data-pool="${it.pool_address}"
                  class="px-4 py-2 rounded-full bg-neon-500 text-void-950 text-sm font-bold hover:bg-neon-600 transition shrink-0">
            Claim
          </button>
        </div>
      `;
    }
    if (it.type === "airdrop") {
      const dwin = (it.payload.amount_dwin || 0).toFixed(2);
      const sizeKb = ((it.payload.size_bytes || 0) / 1024).toFixed(1);
      const txUrl = it.payload.tx_hash ? `https://testnet.snowtrace.io/tx/${it.payload.tx_hash}` : null;
      return `
        <div class="rounded-xl bg-gradient-to-r from-purple-500/15 to-transparent border border-purple-500/30 p-4">
          <div class="flex items-center gap-3">
            <div class="text-3xl">🎁</div>
            <div class="flex-1">
              <div class="font-semibold text-base text-purple-300">+${dwin} mDWIN Airdrop</div>
              <div class="text-xs text-white/60 mt-0.5">
                ${vt('vd.airdropLine', 'Reward für {kb} KB Beitrag in {pool}', { kb: sizeKb, pool: escapeHtml(it.pool_slug) })} · ${date}
              </div>
            </div>
            ${txUrl ? `<a href="${txUrl}" target="_blank" rel="noopener" class="pro-only text-[10px] font-mono text-white/50 hover:text-white">tx ↗</a>` : ""}
          </div>
        </div>
      `;
    }
    if (it.type === "purchase") {
      const amount = (it.payload.amount_dwin || it.payload.amount_usdc || it.payload.amount || 0).toFixed(2);
      const asset = it.payload.asset || "USDC";
      return `
        <div class="rounded-xl bg-void-900 border border-white/10 p-4">
          <div class="font-semibold text-base">🛒 Buyer hat Pool-Zugang gekauft</div>
          <div class="text-xs text-white/50 mt-0.5">
            ${escapeHtml(it.pool_slug)} · ${amount} ${asset} · ${date}
          </div>
        </div>
      `;
    }
    if (it.type === "reward") {
      const amt = (it.payload.amount_dwin || 0).toFixed(2);
      const kindLabel = {
        "streak":            vt("vd.rw.streak", "Live-Sync-Streak"),
        "multipool":         vt("vd.rw.multipool", "Pool-Vielfalt"),
        "referral-referrer": vt("vd.rw.referral", "Referral"),
        "referral-referee":  vt("vd.rw.referral", "Referral"),
      }[it.payload.kind] || vt("vd.rw.generic", "Bonus");
      const txUrl = it.payload.tx_hash && it.payload.tx_hash.startsWith("0x")
        ? `https://testnet.snowtrace.io/tx/${it.payload.tx_hash}` : null;
      return `
        <div class="rounded-xl bg-gradient-to-r from-neon-500/15 to-transparent border border-neon-500/30 p-4">
          <div class="flex items-center gap-3">
            <div class="text-3xl">🏆</div>
            <div class="flex-1">
              <div class="font-semibold text-base">+${amt} mDWIN · ${kindLabel}</div>
              <div class="text-xs text-white/60 mt-0.5">${vt("vd.rw.program", "Early Data Rewards")} · ${date}</div>
            </div>
            ${txUrl ? `<a href="${txUrl}" target="_blank" rel="noopener" class="text-[10px] font-mono text-neon-500 hover:underline">tx ↗</a>` : ""}
          </div>
        </div>
      `;
    }
    if (it.type === "member_joined") {
      return `
        <div class="rounded-xl bg-void-900 border border-white/10 p-4">
          <div class="font-semibold text-base">👋 ${vt("vd.newMember", "Neues Pool-Mitglied")}</div>
          <div class="text-xs text-white/50 mt-0.5">${escapeHtml(it.pool_slug)} · ${date}</div>
        </div>
      `;
    }
    return `<div class="rounded-xl bg-void-900 border border-white/10 p-4">
      <div class="font-semibold">${escapeHtml(it.type)}</div>
      <div class="text-xs text-white/50">${date}</div>
    </div>`;
  }

  async function renderInbox(container) {
    try {
      const r = await fetch("/api/marketplace/inbox", { credentials: "include" });
      if (!r.ok) {
        // Endpoint not yet deployed — show empty-state without alarming the user.
        container.innerHTML = emptyInbox();
        return;
      }
      const j = await r.json();
      if (!j.items || !j.items.length) {
        container.innerHTML = emptyInbox();
        return;
      }
      container.innerHTML = `
        <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3">Pool-Events</div>
        <div class="space-y-2">${j.items.map(renderInboxItem).join("")}</div>
      `;
    } catch {
      container.innerHTML = emptyInbox();
    }
  }

  // ===== Multi-source archetype tower =====
  async function renderArchetypeTower(container) {
    if (!container) return;
    try {
      const r = await fetch("/api/vault/archetype-summary", { credentials: "include" });
      if (!r.ok) { container.innerHTML = ""; return; }
      const j = await r.json();
      if (!j.archetypes || j.archetypes.length === 0) {
        container.innerHTML = "";
        return;
      }
      const cards = j.archetypes.map(a => `
        <div class="rounded-xl border p-3 md:p-4 flex flex-col items-center gap-1 text-center"
             style="border-color:${a.color}40; background:linear-gradient(180deg, ${a.color}15, transparent)">
          <div class="text-3xl md:text-4xl leading-none mb-1">${a.icon}</div>
          <div class="text-[10px] font-mono uppercase tracking-widest" style="color:${a.color}">${escapeHtml(a.source_label)}</div>
          <div class="text-sm md:text-base font-semibold leading-tight">${escapeHtml(a.label)}</div>
        </div>
      `).join("");
      container.innerHTML = `
        <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3">Du bist…</div>
        <div class="grid gap-2 md:gap-3" style="grid-template-columns: repeat(${Math.min(4, j.archetypes.length)}, minmax(0, 1fr))">
          ${cards}
        </div>
        ${j.count >= 2 ? `
          <div class="text-[11px] text-white/40 font-mono mt-3 leading-relaxed">
            ✨ <strong class="text-white/60">Multi-Source-Member</strong> — du bringst ${j.count} Datentypen zusammen,
            das ist genau der Wert für Buyer (Cross-Pool-Queries die niemand sonst beantworten kann).
          </div>
        ` : ""}
      `;
    } catch (e) {
      console.warn("[archetype-tower] failed", e);
      container.innerHTML = "";
    }
  }

  // ===== Insights panel — cross-source patterns from Vault data =====
  function renderInsight(it) {
    // Body has **bold** markers — convert to <strong>.
    const body = String(it.body || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');
    return `
      <div class="rounded-xl bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 p-4 md:p-5">
        <div class="flex items-start gap-3">
          <div class="text-3xl shrink-0">${it.icon || "✨"}</div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-base md:text-lg mb-1">${escapeHtml(it.title || "")}</div>
            <div class="text-sm text-white/70 leading-relaxed">${body}</div>
          </div>
        </div>
      </div>
    `;
  }

  async function renderInsights(container) {
    if (!container) return;
    try {
      const r = await fetch("/api/vault/insights", { credentials: "include" });
      if (!r.ok) { container.innerHTML = ""; return; }
      const j = await r.json();
      if (!j.insights || !j.insights.length) {
        container.innerHTML = "";
        return;
      }
      container.innerHTML = `
        <div class="flex items-baseline justify-between mb-3">
          <div class="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">✨ ${vt('vd.insightsTitle', 'Insights aus deinen Daten')}</div>
          <div class="text-[10px] font-mono text-white/30">${j.count} ${vt('vd.insightsCount', 'Erkenntnisse')}</div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${j.insights.map(renderInsight).join("")}</div>
      `;
    } catch {
      container.innerHTML = "";
    }
  }

  // ===== My Contributions panel =====
  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
  }

  function fmtDate(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" }) +
           " · " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  function renderMyContribPool(p) {
    const explorer = "https://testnet.snowtrace.io";
    const sharePct = p.share_pct.toFixed(2);
    const sharePctNum = parseFloat(sharePct);
    return `
      <div class="rounded-xl bg-void-900 border border-white/10 p-5">
        <div class="flex items-center justify-between gap-4 mb-3">
          <div>
            <div class="text-base font-semibold">${escapeHtml(p.name || p.slug)}</div>
            <div class="text-xs text-white/40 font-mono">${escapeHtml(p.slug)}</div>
          </div>
          <div class="text-right">
            <div class="text-2xl font-bold text-neon-500">${sharePct}%</div>
            <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt('vd.yourShare', 'dein Anteil')}</div>
          </div>
        </div>

        <!-- progress bar -->
        <div class="mb-3 h-2 rounded-full bg-white/5 overflow-hidden">
          <div class="h-full bg-gradient-to-r from-neon-500 to-cyan-400" style="width:${Math.min(100, sharePctNum)}%"></div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt('vd.yourStake', 'Dein Einsatz')}</div>
            <div class="font-semibold">${fmtBytes(p.my_active_size)}</div>
          </div>
          <div>
            <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt('vd.poolTotal', 'Pool gesamt')}</div>
            <div class="font-semibold">${fmtBytes(p.pool_total_size)}</div>
          </div>
          <div>
            <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt("vd.contribs", "Beiträge")}</div>
            <div class="font-semibold">${p.contributions.length}</div>
          </div>
        </div>

        ${(p.claimable_usdc > 0 || p.claimable_dwin > 0) ? `
          <div class="mt-3 flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-neon-500/10 to-transparent border border-neon-500/20">
            <div class="text-2xl">💰</div>
            <div class="flex-1">
              <div class="text-sm font-bold text-neon-500">
                ${p.claimable_usdc > 0 ? `$${p.claimable_usdc.toFixed(2)} USDC` : ""}
                ${p.claimable_usdc > 0 && p.claimable_dwin > 0 ? " + " : ""}
                ${p.claimable_dwin > 0 ? `${p.claimable_dwin.toFixed(2)} DWIN` : ""}
                bereit
              </div>
              <div class="text-xs text-white/50">on-chain claimbar</div>
            </div>
            <button data-claim-pool="${p.pool_address}" class="px-4 py-2 rounded-full bg-neon-500 text-void-950 text-sm font-bold hover:bg-neon-600 transition">
              Claim
            </button>
          </div>
        ` : ""}

        <details class="mt-3 pro-only">
          <summary class="cursor-pointer text-xs font-mono text-white/40 hover:text-white/70">Beitrags-Historie ▾</summary>
          <div class="mt-2 space-y-1 text-xs font-mono">
            ${p.contributions.map(c => `
              <div class="flex justify-between gap-2 py-1 border-b border-white/5">
                <span class="text-white/60">#${c.contribution_id} · ${fmtBytes(c.size_bytes)} · ${fmtDate(c.ts)}</span>
                <a href="${explorer}/tx/${c.tx_hash}" target="_blank" rel="noopener" class="text-neon-500/60 hover:text-neon-500">tx ↗</a>
              </div>
            `).join("")}
          </div>
        </details>
      </div>
    `;
  }

  async function renderMyContributions(container) {
    try {
      const r = await fetch("/api/marketplace/my-contributions", { credentials: "include" });
      if (!r.ok) {
        container.innerHTML = "";
        return null;
      }
      const j = await r.json();
      if (!j.pools.length) {
        container.innerHTML = `
          <div class="rounded-xl border border-dashed border-white/10 p-5 text-center">
            <div class="text-3xl mb-2 opacity-60">🌱</div>
            <div class="text-sm text-white/60 mb-1">${vt('vd.noContribs', 'Noch keine Beiträge')}</div>
            <div class="text-xs text-white/40">${vt('vd.noContribsHint', 'Lade einen Datensatz hoch und trag dich on-chain ein.')}</div>
          </div>
        `;
        return j;
      }
      container.innerHTML = `
        <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-3">${vt("vd.yourContribs", "Deine Beiträge")}</div>
        <div class="space-y-3">${j.pools.map(renderMyContribPool).join("")}</div>
        ${(j.total_claimable_usdc > 0 || j.total_claimable_dwin > 0) ? `
          <div class="mt-3 text-xs text-white/50 font-mono text-right">
            Insgesamt claimbar:
            <span class="text-neon-500 font-bold">
              ${j.total_claimable_usdc > 0 ? `$${j.total_claimable_usdc.toFixed(2)}` : ""}
              ${j.total_claimable_usdc > 0 && j.total_claimable_dwin > 0 ? " + " : ""}
              ${j.total_claimable_dwin > 0 ? `${j.total_claimable_dwin.toFixed(2)} DWIN` : ""}
            </span>
          </div>
        ` : ""}
      `;
      return j;
    } catch (e) {
      console.warn("renderMyContributions failed", e);
      container.innerHTML = "";
      return null;
    }
  }

  function emptyInbox() {
    return `
      <div class="rounded-xl border border-dashed border-white/10 p-5 text-center">
        <div class="text-3xl mb-2 opacity-60">📬</div>
        <div class="text-sm text-white/60 mb-1">${vt('vd.noEvents', 'Noch keine Pool-Events')}</div>
        <div class="text-xs text-white/40">${vt('vd.noEventsHint', 'Sobald jemand Pool-Daten kauft, erscheint hier dein Anteil.')}</div>
      </div>
    `;
  }

  // Live-polling state — single setInterval id, replaced on each show().
  let _pollTimer = null;
  function _stopPoll() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }
  function _startPoll() {
    _stopPoll();
    _pollTimer = setInterval(async () => {
      const sect = document.getElementById("dashboard-section");
      if (!sect || sect.classList.contains("hidden")) { _stopPoll(); return; }
      const inbox = sect.querySelector("[data-dashboard-inbox]");
      if (inbox) await renderInbox(inbox);
      const mine = sect.querySelector("[data-dashboard-mine]");
      if (mine) await renderMyContributions(mine);
    }, 10_000);
  }

  async function show({ archetype, poolName, poolAddress, members, contributionCount, earnings30d, txHash, chainId }) {
    const sect = document.getElementById("dashboard-section");
    if (!sect) return;
    // Fetch earnings if not already supplied (separate from members which may
    // also need fetching — caller usually has both but be defensive).
    if (earnings30d == null) {
      try {
        const r = await fetch("/api/marketplace/pools/running-data/stats", { credentials: "include" });
        if (r.ok) {
          const j = await r.json();
          earnings30d = j.earnings_last_30d_usdc;
          if (members == null) members = j.members;
        }
      } catch {}
    }
    // Fetch wallet balance from my-contributions endpoint (which includes it).
    let wallet = null;
    try {
      const r = await fetch("/api/marketplace/my-contributions", { credentials: "include" });
      if (r.ok) {
        const j = await r.json();
        wallet = j.wallet;
      }
    } catch {}

    sect.innerHTML = `
      <div class="space-y-4">
        <div data-dashboard-hero>${renderHero({ archetype, poolName, poolAddress, members, contributionCount, earnings30d, txHash, chainId, wallet })}</div>
        <div data-dashboard-mindmap></div>
        <div data-dashboard-tower></div>
        <div data-dashboard-timeline></div>
        <div data-dashboard-insights></div>
        <div data-dashboard-mine></div>
        <div data-dashboard-inbox></div>
      </div>
    `;
    sect.classList.remove("hidden");
    sect.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.DwinityMindMap) {
      window.DwinityMindMap.loadAndRender(sect.querySelector("[data-dashboard-mindmap]"));
    }
    await renderArchetypeTower(sect.querySelector("[data-dashboard-tower]"));
    if (window.DwinityTimeline) {
      window.DwinityTimeline.loadAndRender(sect.querySelector("[data-dashboard-timeline]"), 90);
    }
    await renderInsights(sect.querySelector("[data-dashboard-insights]"));
    await renderMyContributions(sect.querySelector("[data-dashboard-mine]"));
    await renderInbox(sect.querySelector("[data-dashboard-inbox]"));
    _startPoll();
  }

  async function refreshHeroBalances() {
    const heroBox = document.querySelector("[data-dashboard-hero]");
    if (!heroBox) return;
    try {
      const r = await fetch("/api/marketplace/my-contributions", { credentials: "include" });
      if (!r.ok) return;
      const j = await r.json();
      // Find balance grid and replace its three cells.
      const grid = heroBox.querySelector(".grid.grid-cols-3");
      if (grid && j.wallet) {
        grid.outerHTML = renderBalances(j.wallet);
      }
    } catch {}
  }

  // ===== Claim Handler =====
  // claim() takes no args, just the function selector.
  const CLAIM_SELECTOR = "0x4e71d92d";

  async function handleClaim(itemId, btn) {
    if (!window.ethereum) {
      alert(vt('vd.noWalletSnowtrace', 'Wallet nicht erkannt. Pro-Mode aktivieren um direkt Snowtrace zu nutzen.'));
      return;
    }
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = "…";

    let item;
    try {
      const r = await fetch("/api/marketplace/inbox", { credentials: "include" });
      const j = await r.json();
      item = (j.items || []).find(it => it.id === itemId);
    } catch {}
    if (!item) { btn.textContent = vt('vjs.errWord', 'Fehler'); setTimeout(() => { btn.disabled = false; btn.textContent = orig; }, 2000); return; }

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: accounts[0], to: item.pool_address, data: CLAIM_SELECTOR }],
      });
      btn.textContent = vt('vd.sent', '✓ gesendet');
      // 🎉 — small celebration when user actually pulls money out.
      if (window.DwinityFx) {
        try { window.DwinityFx.confetti({ count: 100, duration: 3000 }); } catch {}
      }
      // Mark dismissed locally so it disappears from the list.
      await fetch(`/api/marketplace/inbox/${itemId}/dismiss`, {
        method: "POST", credentials: "include",
      });
      const url = "https://testnet.snowtrace.io/tx/" + txHash;
      // Re-render inbox.
      const sect = document.getElementById("dashboard-section");
      if (sect) await renderInbox(sect.querySelector("[data-dashboard-inbox]"));
      // Show toast-style confirmation as a temporary item.
      const tmp = document.createElement("div");
      tmp.className = "fixed bottom-6 right-6 z-50 bg-neon-500 text-void-950 font-bold rounded-full px-4 py-2 shadow-2xl";
      tmp.innerHTML = `✓ Claim-Tx: <a href="${url}" target="_blank" rel="noopener" class="underline">${txHash.slice(0,6)}…${txHash.slice(-4)}</a>`;
      document.body.appendChild(tmp);
      setTimeout(() => tmp.remove(), 6000);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = orig;
      if (e && e.code !== 4001) alert(vt('vd.claimFailed', 'Claim fehlgeschlagen: ') + (e.message || e));
    }
  }

  // ===== Demo Buyer Trigger =====
  async function handleDemoTrigger(btn) {
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = vt('vd.buyerTxRunning', '⏳ Buyer-Tx läuft… (~10s)');

    try {
      const r = await fetch("/api/marketplace/demo/trigger-purchase?pool_slug=running-data", {
        method:      "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`HTTP ${r.status}: ${t}`);
      }
      const j = await r.json();
      btn.innerHTML = `✓ Buyer-Tx ${j.tx_hash.slice(0,6)}…${j.tx_hash.slice(-4)}`;

      // Show toast.
      const toast = document.createElement("div");
      toast.className = "fixed bottom-6 right-6 z-50 bg-purple-500 text-white font-bold rounded-2xl px-5 py-3 shadow-2xl max-w-sm";
      toast.innerHTML = `
        <div class="text-sm">🛒 Buyer hat Pool gekauft</div>
        <div class="text-xs opacity-80 mt-1">$${j.amount_usdc.toFixed(2)} USDC · 70% an Contributors verteilt</div>
        <div class="text-xs opacity-60 mt-2 font-mono">⏳ ${vt('vd.inboxRefresh', 'Inbox wird in ~15s aktualisiert')}</div>
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.style.opacity = "0", 5000);
      setTimeout(() => toast.remove(), 6000);

      // Poll inbox for new claim_available item.
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        const sect = document.getElementById("dashboard-section");
        if (sect) await renderInbox(sect.querySelector("[data-dashboard-inbox]"));
        if (attempts >= 8) { // ~25s
          clearInterval(interval);
          btn.disabled = false;
          btn.innerHTML = orig;
        }
      }, 3000);
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = orig;
      alert(vt('vd.demoFailed', 'Demo-Trigger fehlgeschlagen:') + "\n" + e.message);
    }
  }

  // ===== "Add Token to MetaMask" helper =====
  // Demo Fuji addresses — same as the contract deployment.
  const TOKENS = {
    USDC: { address: "0xdCfACc8e135aD5A0803bf5e8d06e8618be298648", symbol: "mUSDC", decimals: 6 },
    DWIN: { address: "0x57247E09aB1f7739ffb75fc6B2785ccF960Be3a8", symbol: "mDWIN", decimals: 18 },
  };

  async function addTokenToMetaMask(symbol) {
    const t = TOKENS[symbol];
    if (!t || !window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: t.address, symbol: t.symbol, decimals: t.decimals } },
      });
    } catch (e) {
      if (e && e.code !== 4001) alert(vt('vd.addTokenFailed', 'Konnte Token nicht hinzufügen: ') + (e.message || e));
    }
  }

  // Send a raw claim() call to a pool — no inbox row, just the contract.
  async function handleClaimPool(poolAddress, btn) {
    if (!window.ethereum) {
      alert(vt('vd.noWallet', 'Wallet nicht erkannt.'));
      return;
    }
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = "…";
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: accounts[0], to: poolAddress, data: CLAIM_SELECTOR }],
      });
      btn.textContent = vt('vd.sent', '✓ gesendet');
      if (window.DwinityFx) { try { window.DwinityFx.confetti({ count: 100, duration: 3000 }); } catch {} }
      const url = "https://testnet.snowtrace.io/tx/" + txHash;
      const tmp = document.createElement("div");
      tmp.className = "fixed bottom-6 right-6 z-50 bg-neon-500 text-void-950 font-bold rounded-full px-4 py-2 shadow-2xl";
      tmp.innerHTML = `✓ Claim-Tx: <a href="${url}" target="_blank" rel="noopener" class="underline">${txHash.slice(0,6)}…${txHash.slice(-4)}</a>`;
      document.body.appendChild(tmp);
      setTimeout(() => tmp.remove(), 6000);
      // Re-render after Tx mines (~5s on Fuji).
      setTimeout(async () => {
        const sect = document.getElementById("dashboard-section");
        if (sect) {
          const mine = sect.querySelector("[data-dashboard-mine]");
          if (mine) await renderMyContributions(mine);
        }
      }, 7000);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = orig;
      if (e && e.code !== 4001) alert(vt('vd.claimFailed', 'Claim fehlgeschlagen: ') + (e.message || e));
    }
  }

  // Delegated click handlers — wired once.
  if (!global.__dwinityClaimWired) {
    global.__dwinityClaimWired = true;
    document.addEventListener("click", (e) => {
      const claimBtn = e.target.closest("[data-claim]");
      if (claimBtn) { handleClaim(parseInt(claimBtn.dataset.claim, 10), claimBtn); return; }
      const claimPoolBtn = e.target.closest("[data-claim-pool]");
      if (claimPoolBtn) { handleClaimPool(claimPoolBtn.dataset.claimPool, claimPoolBtn); return; }
      const demoBtn = e.target.closest("[data-demo-trigger]");
      if (demoBtn) { handleDemoTrigger(demoBtn); return; }
      const addTokBtn = e.target.closest("[data-add-token]");
      if (addTokBtn) { addTokenToMetaMask(addTokBtn.dataset.addToken); return; }
      const refreshBtn = e.target.closest("[data-refresh-balances]");
      if (refreshBtn) {
        const orig = refreshBtn.textContent;
        refreshBtn.textContent = "⏳";
        refreshHeroBalances().then(() => {
          refreshBtn.textContent = "✓";
          setTimeout(() => { refreshBtn.textContent = orig; }, 1500);
        });
        return;
      }
    });
  }

  // ===== Auto-show on page load if user has real data =====
  async function autoShowIfPending() {
    let inbox = null, mine = null;
    try {
      const ri = await fetch("/api/marketplace/inbox", { credentials: "include" });
      if (ri.ok) inbox = await ri.json();
    } catch (e) { console.warn('[dash] inbox fetch failed', e); }
    try {
      const rm = await fetch("/api/marketplace/my-contributions", { credentials: "include" });
      if (rm.ok) mine = await rm.json();
    } catch (e) { console.warn('[dash] mine fetch failed', e); }

    // Not logged in → bail silently.
    if (!inbox && !mine) return;

    const hasMine = mine && mine.pools && mine.pools.length > 0;
    const hasWrappedCtx = !!(window._lastWrappedContext && window._lastWrappedContext.archetype);

    // No real data yet → don't render a fake "demo" dashboard with a default
    // archetype; that confused users into thinking they were already members.
    // The upload UI on the page handles discovery — once they upload + contribute,
    // show() is called with a real archetype.
    if (!hasMine && !hasWrappedCtx) return;

    const archetype = (window._lastWrappedContext && window._lastWrappedContext.archetype) || (hasMine && mine.pools[0].archetype) || null;
    const topPool = hasMine ? mine.pools[0] : null;

    return show({
      archetype,
      poolName:    topPool ? topPool.name         : null,
      poolAddress: topPool ? topPool.pool_address : null,
      chainId:     43113,
    });
  }

  global.DwinityDashboard = { show, renderInbox, autoShowIfPending };
})(window);
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "vd.arch.early": "Early Bird",
  "vd.arch.weekend": "Weekend Warrior",
  "vd.arch.park": "Park Regular",
  "vd.poolMember": "Pool member",
  "vd.enrolled": "You're enrolled",
  "vd.memberOf": "Member of",
  "vd.membersTotal": "{n} members total",
  "vd.activeContribs": "{n} active contributions",
  "vd.newMember": "New pool member",
  "vd.contribs": "Contributions",
  "vd.yourContribs": "Your contributions",
  "vd.rw.streak": "Live-sync streak",
  "vd.rw.multipool": "Pool diversity",
  "vd.rw.referral": "Referral",
  "vd.rw.generic": "Bonus",
  "vd.rw.program": "Early Data Rewards",
} });
