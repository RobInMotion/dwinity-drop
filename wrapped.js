// Wrapped Story player. Renders an overlay with N slides, auto-advances every
// SLIDE_MS, supports tap-to-pause/resume, click outside-bottom for skip.
//
// Slide definitions are passed in by the caller (so the same engine handles
// running/music/health stories with different content).
//
// Slide shape:
//   { html: <string>, duration?: <ms>, onShow?: function(overlay) }
//
// The final slide typically has duration: very-large + a [data-wrapped-cta="…"]
// button inside the html — clicking that button resolves the play() promise
// with { skipped: false, action: "<value>" }.

(function (global) {
  const DEFAULT_DURATION_MS = 7000;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function play(slides, opts = {}) {
    return new Promise(resolve => {
      const overlay = el("div", "wrapped-overlay");

      // Progress bars
      const progress = el("div", "wrapped-progress");
      const bars = slides.map(() => {
        const b = el("div", "wrapped-progress-bar");
        b.appendChild(el("span"));
        progress.appendChild(b);
        return b;
      });
      overlay.appendChild(progress);

      // Skip button
      const skip = el("button", "wrapped-skip", "Überspringen ›");
      overlay.appendChild(skip);

      // Slide elements
      const slideEls = slides.map(s => {
        const slideEl = el("div", "wrapped-slide");
        slideEl.innerHTML = s.html;
        overlay.appendChild(slideEl);
        return slideEl;
      });

      const hint = el("div", "wrapped-pause-hint", "Tippen zum Pausieren");
      overlay.appendChild(hint);

      document.body.appendChild(overlay);

      let i = 0;
      let paused = false;
      let elapsedInSlide = 0;
      let lastTick = Date.now();
      let rafId = null;
      let ended = false;

      function showSlide(idx) {
        slideEls.forEach((s, k) => s.classList.toggle("active", k === idx));
        bars.forEach((b, k) => {
          b.querySelector("span").style.width = (k < idx ? 100 : 0) + "%";
        });
        elapsedInSlide = 0;
        lastTick = Date.now();
        if (slides[idx] && slides[idx].onShow) {
          try { slides[idx].onShow(overlay); } catch (e) { console.warn("onShow err", e); }
        }
      }

      function tick() {
        if (ended) return;
        const now = Date.now();
        const dt = now - lastTick;
        lastTick = now;
        if (!paused) {
          elapsedInSlide += dt;
          const ms = slides[i].duration || DEFAULT_DURATION_MS;
          const pct = Math.min(100, (elapsedInSlide / ms) * 100);
          bars[i].querySelector("span").style.width = pct + "%";
          if (elapsedInSlide >= ms) {
            advance();
          }
        }
        rafId = requestAnimationFrame(tick);
      }

      function advance() {
        if (i >= slides.length - 1) {
          // Last slide — wait for explicit user action.
          bars[i].querySelector("span").style.width = "100%";
          paused = true;
          hint.style.display = "none";
          return;
        }
        i++;
        showSlide(i);
        // Hint only shown on first slide.
        if (i > 0) hint.style.display = "none";
      }

      function end(result) {
        if (ended) return;
        ended = true;
        if (rafId) cancelAnimationFrame(rafId);
        overlay.classList.add("wrapped-fading");
        overlay.style.transition = "opacity 250ms";
        overlay.style.opacity = "0";
        setTimeout(() => overlay.remove(), 280);
        resolve(result || { skipped: false });
      }

      // ===== Controls =====
      skip.addEventListener("click", (e) => {
        e.stopPropagation();
        end({ skipped: true });
      });

      // CTA buttons inside slides — listen on overlay (delegation).
      overlay.addEventListener("click", (e) => {
        const cta = e.target.closest("[data-wrapped-cta]");
        if (cta) {
          e.stopPropagation();
          end({ skipped: false, action: cta.dataset.wrappedCta });
          return;
        }
        // Tap outside CTA / skip toggles pause.
        if (e.target.closest(".wrapped-skip,.wrapped-cta-primary,.wrapped-cta-secondary,a,button")) return;
        paused = !paused;
        if (i === 0) hint.style.display = "";
        hint.textContent = paused ? "Pausiert · Tippen zum Fortsetzen" : "Tippen zum Pausieren";
      });

      // Start
      showSlide(0);
      rafId = requestAnimationFrame(tick);
    });
  }

  global.DwinityWrapped = { play };
})(window);
