(function () {
  // Floating panic button — 2-click wipe for the logged-in wallet.
  // Click 1: arm (10s cooldown, red pulse).
  // Click 2 while armed: fullscreen overlay → sequential wipes:
  //   POST /api/chat/panic
  //   POST /api/drops/panic
  //   POST /api/identity/panic   (kills session last)
  //   clear localStorage + sessionStorage + redirect to /
  //
  // Hides itself when no wallet session.

  const ARM_TIMEOUT_MS = 10_000;
  const IDENTITY_ME = "/api/identity/me";

  let armedUntil = 0;
  let btn = null;
  let loggedIn = false;

  function build() {
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = "panic-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Panic — alles löschen");
    // On chat-room pages the input bar is pinned to the viewport bottom;
    // shift the panic button above it so it can't collide with "Senden".
    const isChatRoom = /^\/chat\/r\//.test(location.pathname);
    const btnBottom = isChatRoom ? "90px" : "16px";
    const tipBottom = isChatRoom ? "142px" : "68px";
    btn.dataset.chatRoom = isChatRoom ? "1" : "0";

    btn.style.cssText = [
      "position: fixed",
      "bottom: " + btnBottom,
      "right: 16px",
      "z-index: 1000",
      "width: 44px",
      "height: 44px",
      "border-radius: 9999px",
      "background: rgba(5, 6, 10, 0.9)",
      "backdrop-filter: blur(12px)",
      "border: 1.5px solid rgba(239, 68, 68, 0.4)",
      "color: rgba(239, 68, 68, 0.9)",
      "font-size: 16px",
      "font-weight: 600",
      "cursor: pointer",
      "display: none",
      "align-items: center",
      "justify-content: center",
      "transition: all 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      "font-family: 'JetBrains Mono', monospace",
      "box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4)",
    ].join(";");
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    `;
    btn.title = "Panic-Wipe · 1. Klick scharf stellen, 2. Klick löscht alles";
    document.body.appendChild(btn);

    // Tooltip (shown while armed) — anchored above the button
    const tip = document.createElement("div");
    tip.id = "panic-tip";
    tip.style.cssText = [
      "position: fixed",
      "bottom: " + tipBottom,
      "right: 16px",
      "z-index: 1000",
      "padding: 6px 12px",
      "border-radius: 8px",
      "background: rgba(239, 68, 68, 0.95)",
      "color: #fff",
      "font-family: 'JetBrains Mono', monospace",
      "font-size: 11px",
      "font-weight: 600",
      "letter-spacing: 0.06em",
      "text-transform: uppercase",
      "pointer-events: none",
      "display: none",
      "box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4)",
      "white-space: nowrap",
    ].join(";");
    document.body.appendChild(tip);

    btn.addEventListener("click", onClick);
    btn._tip = tip;
    return btn;
  }

  function armed() {
    return Date.now() < armedUntil;
  }

  function showArmed() {
    if (!btn) return;
    btn.style.borderColor = "rgba(239, 68, 68, 1)";
    btn.style.background = "rgba(239, 68, 68, 0.25)";
    btn.style.color = "#fff";
    btn.style.animation = "panic-pulse 0.9s ease-in-out infinite";
    btn._tip.style.display = "block";
    btn._tip.textContent = "NOCHMAL KLICKEN = WIPE";
  }

  function showNormal() {
    if (!btn) return;
    btn.style.borderColor = "rgba(239, 68, 68, 0.35)";
    btn.style.background = "rgba(5, 6, 10, 0.85)";
    btn.style.color = "rgba(239, 68, 68, 0.8)";
    btn.style.animation = "";
    btn._tip.style.display = "none";
  }

  function onClick() {
    if (armed()) {
      executeWipe();
    } else {
      armedUntil = Date.now() + ARM_TIMEOUT_MS;
      showArmed();
      setTimeout(() => {
        if (!armed()) showNormal();
      }, ARM_TIMEOUT_MS + 100);
    }
  }

  function showOverlay(text) {
    let ov = document.getElementById("panic-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "panic-overlay";
      ov.style.cssText = [
        "position: fixed",
        "inset: 0",
        "z-index: 10000",
        "background: rgba(5, 6, 10, 0.97)",
        "backdrop-filter: blur(20px)",
        "display: flex",
        "align-items: center",
        "justify-content: center",
        "flex-direction: column",
        "font-family: 'Space Grotesk', sans-serif",
        "color: #fff",
        "padding: 24px",
        "text-align: center",
      ].join(";");
      document.body.appendChild(ov);
    }
    ov.innerHTML = `
      <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.25em; color: rgba(239,68,68,0.9); margin-bottom: 20px;">
        · Panic Wipe aktiv ·
      </div>
      <div style="font-size: 32px; font-weight: 700; max-width: 520px; line-height: 1.1; margin-bottom: 24px;">
        ${text}
      </div>
      <div style="width: 280px; height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden;">
        <div id="panic-progress" style="height: 100%; width: 0%; background: linear-gradient(90deg, #ef4444, #f87171, #ef4444); transition: width 300ms ease-out;"></div>
      </div>
    `;
    return ov;
  }

  async function executeWipe() {
    armedUntil = 0;
    const ov = showOverlay("Lösche Chat-Daten …");
    const prog = document.getElementById("panic-progress");
    const set = (pct) => { if (prog) prog.style.width = pct + "%"; };

    async function tryPost(url) {
      try {
        await fetch(url, { method: "POST", credentials: "include" });
      } catch {}
    }

    await tryPost("/api/chat/panic");
    set(33);
    ov.querySelector("div:nth-child(2)").textContent = "Lösche Drops …";
    await tryPost("/api/drops/panic");
    set(66);
    ov.querySelector("div:nth-child(2)").textContent = "Lösche Identität …";
    await tryPost("/api/identity/panic");
    set(100);
    ov.querySelector("div:nth-child(2)").textContent = "Wipe abgeschlossen.";

    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}

    // Tiny delay so user can see 100%, then redirect
    setTimeout(() => {
      location.replace("/");
    }, 800);
  }

  async function checkAuth() {
    try {
      const r = await fetch(IDENTITY_ME, { credentials: "include" });
      if (!r.ok) return false;
      const data = await r.json();
      return !!data.address;
    } catch { return false; }
  }

  async function boot() {
    build();
    // keyframe for pulse
    if (!document.getElementById("panic-style")) {
      const s = document.createElement("style");
      s.id = "panic-style";
      s.textContent = `
        @keyframes panic-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
        }
        #panic-btn:hover { transform: scale(1.06); }
      `;
      document.head.appendChild(s);
    }
    loggedIn = await checkAuth();
    if (loggedIn) {
      btn.style.display = "flex";
      // Slide-in from right on reveal
      btn.style.transform = "translateX(80px)";
      btn.style.opacity = "0";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          btn.style.transform = "translateX(0)";
          btn.style.opacity = "1";
        });
      });
    } else {
      btn.style.display = "none";
    }
  }

  window.addEventListener("dwinity:wallet-changed", boot);
  window.addEventListener("dwinity:pro-updated", boot);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
