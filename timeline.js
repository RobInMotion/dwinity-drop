// Digital Twin timeline — horizontal heatmap-style strip per activity kind.
// Renders into a container as a CSS-grid based view. Hover shows day+count.

// i18n helper: translated string if DDI18n is loaded, German fallback otherwise
function vt(key, fallback, vars) {
  let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
  if (!v || v === key) v = fallback;
  if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
  return v;
}

(function (global) {

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    })[c]);
  }

  function fmtDay(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", timeZone: "UTC" });
  }

  function laneCells(lane, days, cells) {
    const dayMap = cells[lane.kind] || {};
    const max = Math.max(1, ...Object.values(dayMap));
    return days.map(day => {
      const n = dayMap[day] || 0;
      if (n === 0) {
        return `<div class="dt-cell dt-empty" data-day="${day}" title="${fmtDay(day)} · ${vt('tl.noActivity', 'keine Aktivität')}"></div>`;
      }
      const intensity = 0.25 + 0.75 * (n / max);
      return `<div class="dt-cell" style="background:${lane.color};opacity:${intensity}" data-day="${day}" data-n="${n}" title="${fmtDay(day)} · ${n}× ${lane.label}"></div>`;
    }).join("");
  }

  function render(container, payload) {
    if (!container) return;
    if (!payload || !payload.lanes || !payload.lanes.length) {
      container.innerHTML = `
        <div class="rounded-xl border border-dashed border-white/10 p-5 text-center">
          <div class="text-3xl mb-2 opacity-60">🌀</div>
          <div class="text-sm text-white/60">Noch keine Activities zum Anzeigen</div>
          <div class="text-xs text-white/40 mt-1">${vt('tl.emptyHint', 'Lade Strava, Apple Health oder Spotify hoch')}</div>
        </div>
      `;
      return;
    }
    const { days, lanes, cells, window_days, anchor_ts } = payload;
    const anchor = new Date(anchor_ts * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });

    container.innerHTML = `
      <style>
        .dt-frame {
          background: linear-gradient(180deg, rgba(80,227,194,0.04), transparent);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 1.25rem;
        }
        .dt-grid {
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 4px 12px;
          align-items: center;
          overflow-x: auto;
        }
        .dt-grid .dt-strip {
          display: grid;
          grid-template-columns: repeat(${days.length}, minmax(8px, 1fr));
          gap: 2px;
          min-width: ${Math.max(360, days.length * 8)}px;
        }
        .dt-cell {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 2px;
          cursor: default;
          transition: transform 100ms;
        }
        .dt-cell:hover { transform: scale(1.7); z-index: 10; position: relative; }
        .dt-empty { background: rgba(255,255,255,0.04); }
        .dt-lane-label {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: rgba(255,255,255,0.7);
          display: flex; flex-direction: column; gap: 2px;
        }
        .dt-lane-stat { font-size: 9px; color: rgba(255,255,255,0.4); }
        .dt-lane-dot {
          display: inline-block; width: 8px; height: 8px; border-radius: 2px;
          margin-right: 6px; vertical-align: middle;
        }
        .dt-axis {
          margin-top: 0.75rem;
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 12px;
          font-size: 10px;
          color: rgba(255,255,255,0.4);
          font-family: 'JetBrains Mono', monospace;
        }
        .dt-axis-marks {
          display: flex;
          justify-content: space-between;
        }
      </style>
      <div class="dt-frame">
        <div class="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div>
            <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">Digital Twin · ${window_days} ${vt('tl.days', 'Tage')}</div>
            <div class="text-base md:text-lg font-semibold mt-0.5">${vt('tl.title', 'Dein Leben in einer Zeile')}</div>
          </div>
          <div class="text-xs text-white/40 font-mono">bis ${escapeHtml(anchor)}</div>
        </div>

        <div class="dt-grid">
          ${lanes.map(lane => `
            <div class="dt-lane-label">
              <span><span class="dt-lane-dot" style="background:${lane.color}"></span>${escapeHtml(lane.label)}</span>
              <span class="dt-lane-stat">${lane.active_days} Tage · ${lane.total_count}×</span>
            </div>
            <div class="dt-strip">${laneCells(lane, days, cells)}</div>
          `).join("")}
        </div>

        <div class="dt-axis">
          <div></div>
          <div class="dt-axis-marks">
            <span>${fmtDay(days[0])}</span>
            ${days.length > 60 ? `<span>${fmtDay(days[Math.floor(days.length/2)])}</span>` : ""}
            <span>${fmtDay(days[days.length - 1])}</span>
          </div>
        </div>
      </div>
    `;
  }

  async function loadAndRender(container, daysOpt) {
    const days = daysOpt || 90;
    try {
      const r = await fetch(`/api/vault/timeline?days=${days}`, { credentials: "include" });
      if (!r.ok) { container.innerHTML = ""; return null; }
      const j = await r.json();
      render(container, j);
      return j;
    } catch (e) {
      console.warn("[timeline] fetch failed", e);
      container.innerHTML = "";
      return null;
    }
  }

  global.DwinityTimeline = { render, loadAndRender };
})(window);
