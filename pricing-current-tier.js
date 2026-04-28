// Highlights the user's current tier on the pricing section.
// Reads /api/me, finds [data-tier="<tier>"] card, injects "Aktuell"-overlay.
(function () {
  const tierGrid = document.getElementById("pricing-tiers");
  if (!tierGrid) return;

  function t(key, fallback) {
    const v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(key);
    return (v && v !== key) ? v : fallback;
  }

  function injectBadge(card, tier) {
    if (card.querySelector(".current-tier-badge")) return;
    const badge = document.createElement("div");
    badge.className = "current-tier-badge absolute top-3 right-3 px-2.5 py-1 rounded-full bg-white text-void-950 text-[10px] font-extrabold uppercase tracking-widest shadow-lg z-20 flex items-center gap-1";
    const icon = tier === "proplus" ? "⚡" : tier === "pro" ? "◆" : "·";
    const label = t("pricing.currentTier", "Dein Tarif");
    badge.innerHTML = '<span>' + icon + '</span><span>' + label + '</span>';
    // The Pro+ card has overflow-hidden — make badge part of inner body if so
    const innerBody = card.querySelector(".bg-gradient-to-br") || card;
    if (card.classList.contains("overflow-hidden")) {
      innerBody.style.position = innerBody.style.position || "relative";
      innerBody.appendChild(badge);
    } else {
      card.appendChild(badge);
    }
    // Highlight the card itself
    card.classList.add("ring-2", "ring-white/30");
  }

  async function detectAndHighlight() {
    let me;
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      if (!r.ok) return;
      me = await r.json();
    } catch { return; }
    if (!me || !me.address) return;
    const tier = me.tier || (me.pro ? "pro" : "free");
    const card = tierGrid.querySelector('[data-tier="' + tier + '"]');
    if (card) injectBadge(card, tier);
  }

  detectAndHighlight();
  window.addEventListener("dwinity:pro-updated", detectAndHighlight);
})();
