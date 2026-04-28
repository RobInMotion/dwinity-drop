(function () {
  const API = "/api/identity";

  const $ = (id) => document.getElementById(id);

  const gateNoLogin = $("gate-nologin");
  const gateOptIn   = $("gate-optin");
  const panel       = $("rank-panel");

  let currentAddress = null;
  let refCode = null;

  function hide(el) { if (el) el.classList.add("hidden"); }
  function show(el) { if (el) el.classList.remove("hidden"); }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function shortAddr(a) {
    if (!a) return "—";
    return a.slice(0, 6) + "…" + a.slice(-4);
  }

  function fmtNum(n) {
    return (n || 0).toLocaleString("de-DE");
  }

  async function fetchRankMe() {
    try {
      const r = await fetch(API + "/rank/me", { credentials: "include" });
      if (r.status === 401) return { loggedIn: false };
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      return { loggedIn: true, data };
    } catch { return { loggedIn: false }; }
  }

  async function fetchMe() {
    try {
      const r = await fetch(API + "/me", { credentials: "include" });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  async function optIn() {
    const errEl = $("opt-in-error");
    errEl.classList.add("hidden");
    const btn = $("opt-in-btn");
    btn.disabled = true;
    btn.textContent = "// aktiviere …";
    try {
      const r = await fetch(API + "/rank/opt-in", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      await boot();
    } catch (e) {
      errEl.textContent = "Fehler: " + (e.message || e);
      errEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "🐉 Dragon Rank aktivieren";
    }
  }

  function buildShareLink(code) {
    return location.origin + "/?ref=" + encodeURIComponent(code);
  }

  async function copyRefLink() {
    if (!refCode) return;
    const link = buildShareLink(refCode);
    const btn = $("copy-ref");
    try {
      await navigator.clipboard.writeText(link);
      btn.textContent = "✓ Link kopiert";
      setTimeout(() => btn.textContent = "Link kopieren", 1500);
    } catch {
      prompt("Ref-Link kopieren:", link);
    }
  }

  function renderXpBreakdown(counts, xp) {
    const el = $("xp-breakdown");
    const rows = [
      ["📦", "Drops erstellt",   counts.drops_created,       xp.drops_created],
      ["⬇",  "Drop-Downloads",   counts.drops_downloaded,    xp.drops_downloaded],
      ["💬", "Chat-Messages",    counts.chat_messages,       xp.chat_messages],
      ["🏠", "Chat-Rooms",       counts.chat_rooms_created,  xp.chat_rooms_created],
      ["⭐", "Pro-Aktivierungen", counts.pro_activations,     xp.pro_activations],
    ];
    el.innerHTML = rows.map(([icon, label, count, xpv]) => `
      <div class="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-b-0">
        <div class="flex items-center gap-3">
          <span class="text-lg">${icon}</span>
          <span class="text-white/70">${label}</span>
          <span class="font-mono text-xs text-white/40">×${fmtNum(count)}</span>
        </div>
        <span class="font-mono text-sm text-neon-500 shrink-0">+${fmtNum(xpv)} XP</span>
      </div>
    `).join("");
  }

  function renderTiers(tiers, currentMin) {
    const el = $("tier-ladder");
    el.innerHTML = tiers.map((t) => {
      const isCurrent = t.min_xp === currentMin;
      const isPast = t.min_xp < currentMin;
      const cls = isCurrent ? "active" : (isPast ? "" : "locked");
      return `
        <div class="tier-card ${cls} p-3 md:p-4 rounded-xl border border-white/10 bg-void-800/40 flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="font-sans font-600 text-sm md:text-base truncate">${escapeHtml(t.name)}</div>
            <div class="text-[11px] font-mono text-white/50 truncate">${t.perk || "—"}</div>
          </div>
          <div class="font-mono text-[11px] md:text-xs text-white/60 shrink-0 text-right">
            ${t.min_xp === 0 ? "Start" : fmtNum(t.min_xp) + " XP"}
          </div>
        </div>
      `;
    }).join("");
  }

  async function renderLeaderboard() {
    const el = $("leaderboard");
    try {
      const r = await fetch(API + "/rank/leaderboard");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (!data.leaderboard.length) {
        el.innerHTML = '<div class="text-white/40 text-sm font-mono py-3">// noch keine Einträge — sei der erste!</div>';
        return;
      }
      el.innerHTML = data.leaderboard.map((e, i) => {
        const isMe = currentAddress && e.wallet.toLowerCase() === currentAddress.toLowerCase();
        const rowCls = isMe
          ? "bg-neon-500/10 border-neon-500/40"
          : "bg-void-800/40 border-white/5";
        return `
          <div class="p-3 rounded-lg border ${rowCls} flex items-center gap-3">
            <div class="shrink-0 w-8 h-8 rounded-full bg-void-900 grid place-items-center font-mono text-xs ${i < 3 ? 'text-neon-500' : 'text-white/50'}">
              ${i + 1}
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-sans text-sm font-600 truncate">${escapeHtml(e.rank_name)}</div>
              <div class="font-mono text-[10px] text-white/40 truncate">${shortAddr(e.wallet)}${isMe ? ' · <span class="text-neon-500">du</span>' : ''}</div>
            </div>
            <div class="shrink-0 text-right">
              <div class="font-mono text-sm text-neon-500">${fmtNum(e.total_xp)}</div>
              <div class="font-mono text-[9px] text-white/30 uppercase">XP</div>
            </div>
          </div>
        `;
      }).join("");
    } catch {
      el.innerHTML = '<div class="text-red-400 text-sm font-mono">Leaderboard nicht verfügbar</div>';
    }
  }

  async function boot() {
    const me = await fetchMe();
    if (!me || !me.address) {
      hide(gateOptIn); hide(panel);
      show(gateNoLogin);
      return;
    }
    currentAddress = me.address;

    const result = await fetchRankMe();
    if (!result.loggedIn) {
      show(gateNoLogin); hide(gateOptIn); hide(panel);
      return;
    }

    const data = result.data;
    if (!data.opted_in) {
      hide(gateNoLogin); hide(panel);
      show(gateOptIn);
      return;
    }

    // Panel
    hide(gateNoLogin); hide(gateOptIn);
    show(panel);

    refCode = data.ref_code;
    $("current-rank").textContent = data.rank.current.name;
    $("current-perk").textContent = data.rank.current.perk || "Starter-Rang · keine Perks";
    $("total-xp").textContent = fmtNum(data.total_xp);
    $("progress-bar").style.width = data.rank.progress_pct + "%";
    $("ref-code").textContent = refCode;

    if (data.rank.next && data.rank.next.name) {
      $("next-rank").textContent = `${data.rank.next.name} ab ${fmtNum(data.rank.next.min_xp)} XP`;
    } else {
      $("next-rank").textContent = "🏆 höchster Rang erreicht";
    }

    renderXpBreakdown(data.counts, data.xp_per_type);
    renderTiers(data.tiers, data.rank.current.min_xp);
    renderReferralsPanel(data);
    renderLeaderboard();

    $("copy-ref").addEventListener("click", copyRefLink);
    const exportBtn = $("data-export-btn");
    if (exportBtn) exportBtn.addEventListener("click", doDataExport);
  }

  async function doDataExport() {
    const btn = $("data-export-btn");
    btn.disabled = true;
    btn.textContent = "// lade …";
    try {
      const r = await fetch(API + "/me/data-export", { credentials: "include" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dwinity-data-" + (currentAddress || "export").slice(0,10) + "-" + new Date().toISOString().slice(0,10) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      btn.textContent = "✓ heruntergeladen";
      setTimeout(() => { btn.textContent = "JSON herunterladen"; btn.disabled = false; }, 2000);
    } catch (e) {
      alert("Fehler: " + e.message);
      btn.disabled = false;
      btn.textContent = "JSON herunterladen";
    }
  }

  function renderReferralsPanel(data) {
    // Build or update the referrals panel (sits between ref-code + XP breakdown)
    let panel = document.getElementById("referrals-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "referrals-panel";
      panel.className = "rounded-2xl bg-void-900/60 border border-white/10 p-5 md:p-6 mb-6";
      const breakdown = document.getElementById("xp-breakdown").closest(".rounded-2xl");
      breakdown.parentNode.insertBefore(panel, breakdown);
    }

    const refBy = data.referred_by;
    const refs = data.my_referrals || [];
    const signupCount = data.counts.referrals_signup || 0;
    const paidCount = data.counts.referrals_paid || 0;

    const refByBlock = refBy ? `
      <div class="mb-4 p-3 rounded-lg bg-void-800/60 text-xs font-mono">
        <span class="text-white/40">du wurdest eingeladen von:</span>
        <span class="text-white/70 break-all">${escapeHtml(refBy.referrer_wallet.slice(0,10))}…</span>
        <span class="text-white/40">via</span>
        <span class="text-neon-500">${escapeHtml(refBy.ref_code)}</span>
      </div>
    ` : "";

    const refsList = refs.length ? refs.map(r => {
      const reward = r.rewarded_gb ? ` · +${r.rewarded_gb} GB` : '';
      return `
      <div class="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-b-0">
        <div class="font-mono text-xs text-white/70 truncate">${escapeHtml(r.referred_wallet.slice(0,10))}…${escapeHtml(r.referred_wallet.slice(-4))}</div>
        <div class="shrink-0 text-[10px] font-mono ${r.paid > 0 ? 'text-neon-500' : 'text-white/40'}">
          ${r.paid > 0 ? '✓ Pro · +500 XP' + reward : 'Signup · +100 XP'}
        </div>
      </div>
    `; }).join("") : `<div class="text-white/40 text-sm font-mono py-3">// noch keine Referrals — teile deinen Link oben</div>`;

    const earnedGb = data.earned_credits_gb || 0;

    const T = (k, fb) => {
      const v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(k);
      return (v && v !== k) ? v : fb;
    };
    panel.innerHTML = `
      <div class="flex items-baseline justify-between mb-4">
        <div class="font-mono text-[10px] uppercase tracking-widest text-white/50">${T("rank.refs.heading", "Referrals")}</div>
        <div class="text-[10px] font-mono text-white/40">${T("rank.refs.bonusHint", "je paid Sub: 50–1250 GB Bonus")}</div>
      </div>
      ${refByBlock}
      ${earnedGb > 0 ? `
        <div class="mb-4 p-3 rounded-lg bg-gradient-to-br from-neon-500/15 to-cyan-400/10 border border-neon-500/30">
          <div class="flex items-baseline justify-between gap-3">
            <div class="text-[10px] font-mono uppercase tracking-widest text-neon-500">${T("rank.refs.earnedHero", "Egress-Credits durch Referrals")}</div>
            <div class="text-[10px] font-mono text-white/40">${T("rank.refs.availInDash", "verfügbar im Dashboard")}</div>
          </div>
          <div class="font-sans text-2xl font-700 text-neon-500 mt-1">+${fmtNum(earnedGb)} GB</div>
        </div>
      ` : ''}
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="p-3 rounded-lg bg-void-800/60 border border-white/5">
          <div class="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">${T("rank.refs.signups", "Signups")}</div>
          <div class="font-sans text-xl font-600 text-white/90">${fmtNum(signupCount)}</div>
          <div class="text-[10px] font-mono text-neon-500">+${fmtNum(signupCount * 100)} XP</div>
        </div>
        <div class="p-3 rounded-lg bg-void-800/60 border border-white/5">
          <div class="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">${T("rank.refs.ofPaid", "Davon Pro")}</div>
          <div class="font-sans text-xl font-600 text-neon-500">${fmtNum(paidCount)}</div>
          <div class="text-[10px] font-mono text-neon-500">+${fmtNum(paidCount * 500)} XP</div>
        </div>
        <div class="p-3 rounded-lg bg-void-800/60 border border-white/5">
          <div class="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">${T("rank.refs.earnedGb", "Earned GB")}</div>
          <div class="font-sans text-xl font-600 text-cyan-400">${fmtNum(earnedGb)}</div>
          <div class="text-[10px] font-mono text-cyan-400">${T("rank.refs.egressCredits", "Egress-Credits")}</div>
        </div>
      </div>
      <div class="space-y-1">
        ${refsList}
      </div>
    `;
  }

  // Event bindings
  $("opt-in-btn").addEventListener("click", optIn);
  window.addEventListener("dwinity:wallet-changed", boot);
  window.addEventListener("dwinity:pro-updated", boot);

  boot();
})();
