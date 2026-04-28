(function () {
  // Aggressive discount popup for the LAUNCH50 campaign.
  // Triggers: 15s on page, or exit-intent (mouse leaves top on desktop).
  // Cooldown: dismissed → 7 days silence. Claimed (clicked CTA) → 30 days silence.

  const PROMO_CODE = "LAUNCH50";
  const DISCOUNT_PCT = 50;
  const VALID_UNTIL = Date.UTC(2026, 4, 15, 23, 59, 59);  // 2026-05-15 23:59:59 UTC
  const DELAY_MS = 15_000;
  const COOLDOWN_DISMISS_MS = 7 * 24 * 3600 * 1000;
  const COOLDOWN_CLAIMED_MS = 30 * 24 * 3600 * 1000;

  const LS = {
    SEEN:      "dwinity_promo_launch50_seen_at",
    DISMISSED: "dwinity_promo_launch50_dismissed_at",
    CLAIMED:   "dwinity_promo_launch50_claimed_at",
  };

  function now() { return Date.now(); }

  function shouldShow() {
    // If campaign is over, never show
    if (now() > VALID_UNTIL) return false;

    const claimed = parseInt(localStorage.getItem(LS.CLAIMED) || "0", 10);
    if (claimed && now() - claimed < COOLDOWN_CLAIMED_MS) return false;

    const dismissed = parseInt(localStorage.getItem(LS.DISMISSED) || "0", 10);
    if (dismissed && now() - dismissed < COOLDOWN_DISMISS_MS) return false;

    return true;
  }

  function fmtRemaining() {
    const diff = VALID_UNTIL - now();
    if (diff <= 0) return "abgelaufen";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  let overlay = null;
  let countdownTimer = null;

  function build() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "launch-promo-overlay";
    overlay.className = "fixed inset-0 z-[70] overflow-y-auto overscroll-contain hidden";
    overlay.innerHTML = `
      <div id="launch-promo-backdrop" class="fixed inset-0 bg-black/85 backdrop-blur-md"></div>
      <div class="relative max-w-md mx-auto my-4 md:my-20 px-3 md:px-4">
        <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-neon-500/20 via-void-900 to-void-900 border-2 border-neon-500/60"
             style="box-shadow: 0 0 60px rgba(0,255,157,0.25), 0 0 120px rgba(0,255,157,0.12);">

          <!-- Close -->
          <button id="launch-promo-close" aria-label="Schließen" class="absolute top-2.5 right-2.5 md:top-3 md:right-3 z-10 w-10 h-10 md:w-9 md:h-9 rounded-full bg-void-950/70 hover:bg-void-800 text-white/60 hover:text-white grid place-items-center transition text-xl leading-none">
            ×
          </button>

          <!-- Header ribbon -->
          <div class="px-5 md:px-6 pt-14 md:pt-12 pb-5 md:pb-6 text-center">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/50 text-red-300 text-[10px] font-mono uppercase tracking-widest mb-5 md:mb-6">
              <span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping shrink-0"></span>
              <span class="relative z-10">Launch Deal · Limitiert</span>
            </div>

            <div class="font-sans text-[3.25rem] sm:text-6xl md:text-7xl font-700 leading-none mb-3"
                 style="background: linear-gradient(135deg, #00FF9D 0%, #00E5FF 50%, #4DFFB8 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 20px rgba(0,255,157,0.4));">
              −${DISCOUNT_PCT}%
            </div>

            <h3 class="font-sans text-xl sm:text-2xl md:text-3xl font-600 tracking-tight mb-3">
              auf Dead Drop <span class="text-neon-500">Pro</span>
            </h3>

            <p class="text-white/70 text-[13px] sm:text-sm leading-relaxed mb-5 md:mb-6">
              Self-Custody Pro für <span class="line-through text-white/40">7,50 USDC</span>
              <span class="text-neon-500 font-600">3,75 USDC / Monat</span>.
              Gilt für USDC und DWIN. Nur solange der Launch läuft.
            </p>

            <!-- Countdown -->
            <div class="mb-5 md:mb-6 p-3 md:p-4 rounded-xl bg-void-950/50 border border-white/10">
              <div class="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">Endet in</div>
              <div id="launch-promo-countdown" class="font-sans text-xl sm:text-2xl font-600 text-neon-500">—</div>
            </div>

            <!-- Code display -->
            <div class="mb-4 p-3 rounded-xl border-2 border-dashed border-neon-500/50 bg-neon-500/5">
              <div class="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1">Dein Code</div>
              <div class="font-mono text-xl sm:text-2xl font-700 text-neon-500 tracking-widest select-all break-all">${PROMO_CODE}</div>
            </div>

            <!-- CTA -->
            <button id="launch-promo-cta" class="w-full px-6 py-3.5 md:py-4 rounded-full bg-neon-500 text-void-950 font-bold hover:bg-neon-600 transition text-sm md:text-lg">
              Jetzt einlösen →
            </button>

            <button id="launch-promo-later" class="mt-2 md:mt-3 w-full text-xs font-mono text-white/40 hover:text-white/70 py-2">
              // Später erinnern
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#launch-promo-close").addEventListener("click", dismiss);
    overlay.querySelector("#launch-promo-later").addEventListener("click", dismiss);
    overlay.querySelector("#launch-promo-backdrop").addEventListener("click", dismiss);
    overlay.querySelector("#launch-promo-cta").addEventListener("click", claim);
    return overlay;
  }

  function startCountdown() {
    const el = overlay.querySelector("#launch-promo-countdown");
    function tick() {
      el.textContent = fmtRemaining();
      if (now() >= VALID_UNTIL) {
        clearInterval(countdownTimer);
        hide();
      }
    }
    tick();
    countdownTimer = setInterval(tick, 30_000);
  }

  function show() {
    if (!shouldShow()) return;
    build();
    overlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    localStorage.setItem(LS.SEEN, now().toString());
    startCountdown();
  }

  function hide() {
    if (!overlay) return;
    overlay.classList.add("hidden");
    document.body.style.overflow = "";
    if (countdownTimer) clearInterval(countdownTimer);
  }

  function dismiss() {
    localStorage.setItem(LS.DISMISSED, now().toString());
    hide();
  }

  function claim() {
    localStorage.setItem(LS.CLAIMED, now().toString());
    // Stash the code so upgrade.js picks it up automatically
    sessionStorage.setItem("dwinity_pending_promo", PROMO_CODE);
    hide();
    // Open upgrade modal if available, otherwise go to /#preise
    if (typeof window.openUpgrade === "function") {
      window.openUpgrade();
      // Prefill the code after the modal renders
      setTimeout(() => {
        const input = document.getElementById("upgrade-promo-input");
        if (input) {
          input.value = PROMO_CODE;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          const check = document.getElementById("upgrade-promo-check");
          if (check) check.click();
        }
      }, 200);
    } else {
      location.href = "/#preise";
    }
  }

  // --- Triggers ---

  let armed = false;
  let delayTimer = null;

  function scheduleDelay() {
    if (armed) return;
    if (!shouldShow()) return;
    delayTimer = setTimeout(() => { armed = true; show(); }, DELAY_MS);
  }

  function setupExitIntent() {
    if (window.matchMedia("(pointer: coarse)").matches) return;  // skip on touch
    let triggered = false;
    document.addEventListener("mouseout", (e) => {
      if (triggered || armed) return;
      if (!shouldShow()) return;
      // Fired when mouse leaves the viewport upward (likely → tab bar)
      if (e.clientY <= 0 && !e.relatedTarget) {
        triggered = true;
        armed = true;
        if (delayTimer) clearTimeout(delayTimer);
        show();
      }
    });
  }

  // Expose manual trigger for debugging / CTA buttons in page content
  window.dwinityShowPromo = show;

  // Kickoff after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scheduleDelay();
      setupExitIntent();
    });
  } else {
    scheduleDelay();
    setupExitIntent();
  }
})();
