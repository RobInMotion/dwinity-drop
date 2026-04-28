(function () {
  // Easter egg: gentle data-dragons floating across /rank background.
  // Looks for <canvas id="dragons-bg"> OR reuses <canvas id="netstream-bg">
  // on pages where we want them (opt-in via data attribute on <body>).
  //
  // Dragons are rendered as emoji via ctx.fillText — low-fi, low-cost,
  // respects prefers-reduced-motion.

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!document.body.dataset.dragons && !document.getElementById("dragons-bg")) return;

  let canvas = document.getElementById("dragons-bg");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "dragons-bg";
    canvas.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 0",
      "pointer-events: none",
      "width: 100%",
      "height: 100%",
      "opacity: 0.35",
    ].join(";");
    // Prepend so it's behind everything but the body bg
    document.body.insertBefore(canvas, document.body.firstChild);
  }

  const ctx = canvas.getContext("2d");
  const emojis = ["🐉", "🐲", "🐍"];
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0;

  function fit() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  fit();
  window.addEventListener("resize", fit);

  function makeDragon() {
    return {
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      x: -50,
      y: 100 + Math.random() * Math.max(100, H - 200),
      vx: 0.3 + Math.random() * 0.7,         // slow drift
      amp: 15 + Math.random() * 30,          // wavelength amplitude
      freq: 0.002 + Math.random() * 0.003,   // wave frequency
      phase: Math.random() * Math.PI * 2,
      size: 20 + Math.random() * 18,
      rot: -0.1 + Math.random() * 0.2,
      alpha: 0.25 + Math.random() * 0.4,
      t: 0,
    };
  }

  const dragons = [];
  const MAX_DRAGONS = 5;
  function maybeSpawn() {
    if (dragons.length < MAX_DRAGONS && Math.random() < 0.01) {
      dragons.push(makeDragon());
    }
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    maybeSpawn();

    for (let i = dragons.length - 1; i >= 0; i--) {
      const d = dragons[i];
      d.x += d.vx;
      d.t += 1;
      const y = d.y + Math.sin(d.phase + d.t * d.freq * 12) * d.amp;

      ctx.save();
      ctx.translate(d.x, y);
      ctx.rotate(d.rot + Math.sin(d.t * d.freq * 8) * 0.12);
      ctx.globalAlpha = d.alpha;
      ctx.font = `${d.size}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(d.emoji, 0, 0);
      ctx.restore();

      if (d.x > W + 50) dragons.splice(i, 1);
    }

    requestAnimationFrame(frame);
  }
  // seed 2 dragons so something shows immediately
  dragons.push(makeDragon(), makeDragon());
  dragons[0].x = W * 0.3;
  dragons[1].x = W * 0.6;
  frame();
})();
