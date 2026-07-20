// Visual delight effects — confetti + count-up. Pure JS, no deps.

(function (global) {

  // ===== Count-Up animation =====
  // Animates a number from 0 to target. Auto-applies to elements with
  // [data-countup] when they become visible (IntersectionObserver).
  function countUp(el, target, opts = {}) {
    const duration = opts.duration || 1500;
    const decimals = opts.decimals != null ? opts.decimals : 0;
    const suffix   = opts.suffix || "";
    const prefix   = opts.prefix || "";
    const fmt = (n) => prefix + n.toLocaleString("de-DE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + suffix;

    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      // ease-out quad
      const eased = 1 - (1 - t) * (1 - t);
      el.textContent = fmt(target * eased);
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = fmt(target);
    }
    requestAnimationFrame(frame);
  }

  // Auto-wire: any element with [data-countup="<number>"] gets animated when it
  // first becomes visible. Useful inside Wrapped slides.
  const seen = new WeakSet();
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      if (seen.has(el)) continue;
      seen.add(el);
      const target = parseFloat(el.dataset.countup);
      const decimals = parseInt(el.dataset.countupDecimals || "0", 10);
      const suffix   = el.dataset.countupSuffix || "";
      const prefix   = el.dataset.countupPrefix || "";
      countUp(el, target, { decimals, suffix, prefix });
    }
  }, { threshold: 0.4 });

  function attachCountUps(root) {
    (root || document).querySelectorAll("[data-countup]").forEach(el => obs.observe(el));
  }
  // Re-scan on DOM mutations (Wrapped overlay creates elements dynamically).
  const mo = new MutationObserver(() => attachCountUps());
  mo.observe(document.documentElement, { childList: true, subtree: true });
  attachCountUps();

  // ===== Confetti =====
  // Lightweight canvas confetti. Burst at coordinate or center.
  function confetti(opts = {}) {
    const count    = opts.count || 80;
    const duration = opts.duration || 3000;
    const colors   = opts.colors || ["#50e3c2", "#facc15", "#a78bfa", "#fb7185", "#60a5fa", "#34d399"];
    const originX  = opts.x != null ? opts.x : window.innerWidth / 2;
    const originY  = opts.y != null ? opts.y : window.innerHeight / 3;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99999";
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    const parts = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI - Math.PI/2; // -90°..90°
      const speed = 5 + Math.random() * 9;
      parts.push({
        x: originX, y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        rotation:  Math.random() * Math.PI * 2,
        rotSpeed:  (Math.random() - 0.5) * 0.3,
        color:     colors[i % colors.length],
        size:      4 + Math.random() * 6,
        life:      1,
      });
    }

    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = 0;
      for (const p of parts) {
        if (p.life <= 0) continue;
        alive++;
        p.vy += 0.18;          // gravity
        p.vx *= 0.99;          // air resistance
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        p.life = Math.max(0, 1 - elapsed / duration);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size * 0.4);
        ctx.restore();
      }
      if (alive > 0 && elapsed < duration) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    }
    requestAnimationFrame(frame);
  }

  global.DwinityFx = { countUp, confetti, attachCountUps };
})(window);
