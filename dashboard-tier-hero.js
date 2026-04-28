// Renders a prominent tier hero on /dashboard — clear "you are X" messaging.
// Independent of Robin's dashboard.js (which still toggles legacy pro-badge / free-badge).
(function () {
  const hero = document.getElementById("tier-hero");
  if (!hero) return;

  function t(key, fallback) {
    const v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(key);
    return (v && v !== key) ? v : fallback;
  }

  function fmtDate(ts) {
    return new Date(ts * 1000).toLocaleDateString(
      (window.DDI18n && window.DDI18n.lang === "en") ? "en-US" : "de-DE"
    );
  }

  const TIER = {
    free: {
      icon: "·", label: "Free",
      borderClass: "border-white/15",
      bgGradient: "from-white/5 to-void-900",
      textColor: "text-white/80",
      accent: "text-white/60",
      headline: t("tierhero.free.title", "Free Tier"),
      sub: t("tierhero.free.sub", "Basic-Funktionen ohne Kosten — 100 MB pro Datei, 7 Tage Retention"),
      ctaText: t("tierhero.free.cta", "Pro freischalten →"),
      ctaHref: "/#preise",
      ctaClass: "bg-neon-500 text-void-950 hover:bg-neon-400",
    },
    pro: {
      icon: "◆", label: "Pro",
      borderClass: "border-neon-500/50",
      bgGradient: "from-neon-500/15 to-void-900",
      textColor: "text-neon-500",
      accent: "text-white/90",
      headline: t("tierhero.pro.title", "Pro · aktiv"),
      sub: t("tierhero.pro.sub", "2 GB pro Datei · 20 GB Storage · 200 GB Egress / Monat · 30 Tage Retention"),
      ctaText: t("tierhero.pro.cta", "Auf Pro+ upgraden →"),
      ctaHref: "/proplus",
      ctaClass: "bg-cyan-400 text-void-950 hover:bg-cyan-300",
    },
    proplus: {
      icon: "⚡", label: "Pro+",
      borderClass: "border-cyan-400/60",
      bgGradient: "from-cyan-400/15 via-void-900 to-cyan-500/5",
      textColor: "text-cyan-400",
      accent: "text-white/90",
      headline: t("tierhero.proplus.title", "Pro+ · Power-User"),
      sub: t("tierhero.proplus.sub", "5 GB pro Datei · 100 GB Storage · 500 GB Egress / Monat · 90 Tage Retention"),
      ctaText: t("tierhero.proplus.cta", "→ Egress nachladen"),
      ctaHref: "/topup",
      ctaClass: "bg-void-800 border border-cyan-400/40 text-cyan-400 hover:border-cyan-400",
    },
  };

  async function render() {
    let me;
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      if (!r.ok) return;
      me = await r.json();
    } catch { return; }
    if (!me || !me.address) return;

    const tier = me.tier || (me.pro ? "pro" : "free");
    const cfg = TIER[tier] || TIER.free;
    const expTs = (tier === "proplus" && me.proplus_until) ? me.proplus_until
                : (tier === "pro" && me.pro_until) ? me.pro_until
                : null;
    const expHtml = expTs
      ? '<div class="text-[10px] md:text-xs font-mono ' + cfg.accent + '/60 mt-1">'
          + t("tierhero.until", "läuft") + ' ' + fmtDate(expTs) + '</div>'
      : '';

    hero.className = "mb-5 md:mb-8 rounded-2xl overflow-hidden border relative " + cfg.borderClass;
    hero.innerHTML =
      '<div class="bg-gradient-to-br ' + cfg.bgGradient + ' p-5 md:p-7 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">' +
        '<div class="flex items-center gap-4 md:gap-5 min-w-0 flex-1">' +
          '<div class="shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-xl bg-white/5 ring-1 ring-white/10 grid place-items-center text-2xl md:text-3xl ' + cfg.textColor + '">' + cfg.icon + '</div>' +
          '<div class="min-w-0 flex-1">' +
            '<div class="font-mono text-[10px] md:text-xs uppercase tracking-widest ' + cfg.textColor + ' mb-0.5">' + t("tierhero.kicker", "Aktueller Tarif") + '</div>' +
            '<div class="font-sans text-xl md:text-2xl font-700 ' + cfg.accent + '">' + cfg.headline + '</div>' +
            '<div class="text-[11px] md:text-xs text-white/50 mt-1 truncate">' + cfg.sub + '</div>' +
            expHtml +
          '</div>' +
        '</div>' +
        '<a href="' + cfg.ctaHref + '" class="shrink-0 inline-flex items-center justify-center px-4 md:px-5 py-2.5 md:py-3 rounded-xl text-sm font-bold transition ' + cfg.ctaClass + '">' + cfg.ctaText + '</a>' +
      '</div>';
    hero.classList.remove("hidden");
  }

  render();
  window.addEventListener("dwinity:pro-updated", render);
  setInterval(render, 60_000);
})();
