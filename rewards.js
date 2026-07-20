// Early Data Rewards page — i18n registration + live pot stats.
// (External file: the site CSP script-src 'self' forbids inline scripts.)
// Übersetzungen über die Order-proof-Queue registrieren (i18n.js lädt am Seitenende)
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({
  en: {
    "rw.pageTitle": "Early Data Rewards — 250,000 DWIN · Dead Drop Vault",
    "rw.kicker": "Vault · Bootstrap program · until Dec 31, 2026",
    "rw.title": "250,000 DWIN for the people who show up first.",
    "rw.lead": "Data pools only become valuable once people contribute. So until real buyers arrive, Dwinity itself is the anchor buyer — and rewards every early contributor from a fixed pot of 250,000 DWIN. No lottery, no vague points: fixed rules, a hard budget, on-chain payouts.",
    "rw.honest.title": "The honest fine print, first",
    "rw.honest.body": "Vault runs on the Avalanche Fuji testnet. Everything you earn now is credited as mDWIN (test tokens) and recorded in the program ledger. At mainnet launch — which happens only after the external smart-contract audit passes — your program balance converts 1:1 into real DWIN. No audit, no mainnet. That order is the point.",
    "rw.now": "Live right now",
    "rw.mult": "Early-bird multiplier",
    "rw.multNote": "Jul–Aug ×1.5 · Sep–Oct ×1.25 · Nov–Dec ×1.0 — earlier pays more.",
    "rw.ends": "Program ends",
    "rw.spent": "paid out",
    "rw.of": "of",
    "rw.pot.anchor": "Anchor purchases",
    "rw.pot.upload": "Upload bonus",
    "rw.pot.streak": "Streaks & diversity",
    "rw.pot.reserve": "Community reserve",
    "rw.how": "Four ways to earn",
    "rw.way1.title": "Contribute data — instant bonus",
    "rw.way1.body": "Every pool contribution pays an instant bonus: base 10 DWIN plus a size component with square-root weighting (10× the data ≈ 3× the bonus — quality beats bulk), times the current early-bird multiplier. Cap: 250 DWIN per upload.",
    "rw.way2.title": "Anchor purchases — Dwinity buys first",
    "rw.way2.body": "Every week Dwinity buys pool insights through the exact same on-chain flow a real customer would use: 40 DWIN per active contributor and pool (cap 1,500/pool/week, from 3 contributors up). The contract splits every purchase automatically: 70% to contributors, 20% pool treasury, 10% platform. Your share scales with your contribution size.",
    "rw.way3.title": "Stay active — streaks & diversity",
    "rw.way3.body": "+25 DWIN for every week your Live-Sync stays connected and syncing (up to 8 weeks). +100 DWIN once for every additional pool you contribute to, from the second up to the fifth.",
    "rw.way4.title": "Bring a friend — referrals",
    "rw.way4.body": "When someone you referred makes their first pool contribution, you both get +50 DWIN.",
    "rw.rules": "Rules & caps",
    "rw.rule1": "Fixed total budget: 250,000 DWIN. When a pot is empty, it's empty — first come, first served.",
    "rw.rule2": "Per-wallet cap for direct bonuses: 2,500 DWIN (1% of the program). Anchor purchases distribute proportionally on-chain and sit outside this cap.",
    "rw.rule3": "Each dataset counts once — the on-chain commitment hash prevents duplicate uploads from earning twice.",
    "rw.rule4": "Program ends Dec 31, 2026, 23:59 UTC. Earned balances stay recorded in the ledger for the mainnet conversion.",
    "rw.me.title": "Your program balance",
    "rw.me.earned": "direct bonuses earned",
    "rw.me.headroom": "headroom to wallet cap",
    "rw.me.connect": "Connect your wallet to see your balance.",
    "rw.cta": "Start contributing →",
    "rw.back": "← Back to Vault",
  }
});

(function () {
  function t(key, fb) {
    const v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(key);
    return (v && v !== key) ? v : fb;
  }
  const POT_LABELS = {
    anchor:  () => t("rw.pot.anchor", "Anker-Käufe"),
    upload:  () => t("rw.pot.upload", "Upload-Bonus"),
    streak:  () => t("rw.pot.streak", "Streaks & Vielfalt"),
    reserve: () => t("rw.pot.reserve", "Community-Reserve"),
  };
  function fmt(n) {
    const lang = (window.DDI18n && window.DDI18n.getLang && window.DDI18n.getLang()) || "de";
    return Math.round(n).toLocaleString(lang === "en" ? "en-US" : "de-DE");
  }
  let DATA = null;
  function render() {
    if (!DATA) return;
    document.getElementById("rw-mult").textContent = "×" + DATA.multiplier_now.toLocaleString(
      (window.DDI18n && window.DDI18n.getLang() === "en") ? "en-US" : "de-DE");
    const days = Math.max(0, Math.floor((DATA.end_ts * 1000 - Date.now()) / 86400000));
    document.getElementById("rw-days").textContent = days + " d";
    document.getElementById("rw-pots").innerHTML = Object.entries(DATA.pots).map(([k, p]) => {
      const pct = Math.min(100, Math.round(p.spent / p.budget * 100));
      return `
        <div class="rounded-xl border border-white/10 bg-void-900/50 p-4">
          <div class="flex items-baseline justify-between mb-2">
            <div class="font-600 text-sm">${(POT_LABELS[k] || (() => k))()}</div>
            <div class="font-mono text-[11px] text-white/50">${fmt(p.spent)} ${t("rw.of", "von")} ${fmt(p.budget)} DWIN ${t("rw.spent", "ausgezahlt")}</div>
          </div>
          <div class="h-2 rounded-full bg-void-800 overflow-hidden">
            <div class="h-full bg-neon-500" style="width:${Math.max(pct, p.spent > 0 ? 2 : 0)}%"></div>
          </div>
        </div>`;
    }).join("");
    if (DATA.me) {
      document.getElementById("rw-me").classList.remove("hidden");
      document.getElementById("rw-me-earned").textContent = fmt(DATA.me.direct_earned) + " DWIN";
      document.getElementById("rw-me-headroom").textContent = fmt(DATA.me.direct_headroom) + " DWIN";
    }
  }
  fetch("/api/marketplace/rewards", { credentials: "include" })
    .then((r) => r.ok ? r.json() : null)
    .then((j) => { if (j) { DATA = j; render(); } })
    .catch(() => {});
  window.addEventListener("dd:lang-changed", render);
})();
