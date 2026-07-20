// Digital Twin Neural Map — center neuron → sources → branches → (on-demand) sub-branches.
// Click a leaf to dynamically expand it: backend returns deeper data,
// new spokes sprout outward from that leaf.

// i18n helper: translated string if DDI18n is loaded, German fallback otherwise
function vt(key, fallback, vars) {
  let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
  if (!v || v === key) v = fallback;
  if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
  return v;
}

(function (global) {

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
  function shortAddr(a) {
    return (a && a.length > 12) ? a.slice(0,6) + "…" + a.slice(-4) : (a || "—");
  }
  function fmtCount(n) { return Number(n).toLocaleString("de-DE"); }

  function seedRng(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return () => {
      h = (h * 1664525 + 1013904223) >>> 0;
      return h / 4294967296;
    };
  }

  function bezierPoints(p0, p1, p2, p3, n) {
    const out = [];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const u = 1 - t;
      const x = u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0];
      const y = u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1];
      out.push([x, y]);
    }
    return out;
  }

  // ===== Expansion state =====
  // Set of "source|branchKey" strings currently expanded.
  // expandedData[key] = list of sub-branches from /api/vault/branch-detail.
  const expandedSet  = new Set();
  const expandedData = {};
  let _lastSummary = null;
  let _container   = null;

  async function toggleExpand(source, branchKey) {
    const key = source + "|" + branchKey;
    if (expandedSet.has(key)) {
      expandedSet.delete(key);
      rerender();
      return;
    }
    if (!(key in expandedData)) {
      try {
        const r = await fetch(`/api/vault/branch-detail?source=${encodeURIComponent(source)}&branch=${encodeURIComponent(branchKey)}`, { credentials: "include" });
        if (r.ok) {
          const j = await r.json();
          expandedData[key] = j.sub_branches || [];
        } else {
          expandedData[key] = [];
        }
      } catch {
        expandedData[key] = [];
      }
    }
    if ((expandedData[key] || []).length === 0) {
      flash(vt("mm.noBreakdown", "Keine weitere Aufschlüsselung verfügbar"));
      return;
    }
    expandedSet.add(key);
    rerender();
  }

  function flash(msg) {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;top:1rem;left:50%;transform:translateX(-50%);z-index:300;background:rgba(15,18,23,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:999px;padding:0.5rem 1rem;font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:rgba(255,255,255,0.8);";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function rerender() {
    if (!_container || !_lastSummary) return;
    renderInto(_container, _lastSummary);
  }

  // ===== SVG render =====
  function renderSvg({ archetypes, address, totalActivities }) {
    if (!archetypes || archetypes.length === 0) {
      return `
        <div class="rounded-xl border border-dashed border-white/10 p-6 text-center">
          <div class="text-3xl mb-2 opacity-50">🌀</div>
          <div class="text-sm text-white/60">Noch keine Quellen importiert</div>
        </div>
      `;
    }
    // Dynamic canvas — expand when sub-branches are open so labels don't clip.
    const anyExpanded = expandedSet.size > 0;
    const W = anyExpanded ? 1240 : 960;
    const H = anyExpanded ? 920  : 680;
    const cx = W / 2, cy = H / 2;
    const R1 = Math.min(W, H) * 0.20;   // sources
    const R2 = Math.min(W, H) * 0.36;   // branches
    const R3 = Math.min(W, H) * 0.50;   // sub-branches (when expanded)
    const N = archetypes.length;
    const sourceAngles = archetypes.map((_, i) => (-Math.PI/2) + (2*Math.PI * i) / N);
    const rng = seedRng(address || "anon");

    // 1) Ambient particles
    let ambient = "";
    for (let i = 0; i < 130; i++) {
      const x = rng() * W, y = rng() * H;
      const r = 0.3 + rng() * 1.0;
      const op = 0.05 + rng() * 0.18;
      ambient += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#50e3c2" opacity="${op.toFixed(2)}"/>`;
    }

    let mainEdges = "", branchEdges = "", subEdges = "", dendrites = "", synapses = "";
    let sourceCards = "", branchNodes = "", subBranchNodes = "";

    archetypes.forEach((a, i) => {
      const ang = sourceAngles[i];
      const sx = cx + Math.cos(ang) * R1;
      const sy = cy + Math.sin(ang) * R1;

      // center → source
      const dx = sx - cx, dy = sy - cy;
      const len = Math.sqrt(dx*dx+dy*dy);
      const nx = -dy/len, ny = dx/len;
      const c1 = [cx + dx*0.35 + nx*(rng()-0.5)*len*0.2, cy + dy*0.35 + ny*(rng()-0.5)*len*0.2];
      const c2 = [cx + dx*0.65 + nx*(rng()-0.5)*len*0.2, cy + dy*0.65 + ny*(rng()-0.5)*len*0.2];
      const mainD = `M${cx.toFixed(1)},${cy.toFixed(1)} C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${sx.toFixed(1)},${sy.toFixed(1)}`;
      mainEdges += `
        <path d="${mainD}" fill="none" stroke="${a.color}" stroke-opacity="0.55" stroke-width="0.9" stroke-linecap="round"/>
        <path class="dt-flow" d="${mainD}" fill="none" stroke="${a.color}" stroke-opacity="0.95" stroke-width="0.5" stroke-linecap="round" stroke-dasharray="3 12" style="animation-delay:${(i*0.6).toFixed(2)}s"/>
      `;
      bezierPoints([cx,cy], c1, c2, [sx,sy], 5).forEach(p => {
        synapses += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${(0.6 + rng()*0.6).toFixed(2)}" fill="${a.color}" opacity="${(0.4 + rng()*0.3).toFixed(2)}"/>`;
      });

      // Branch fan
      const branches = a.branches || [];
      const M = branches.length;
      const arcSpread = Math.min(Math.PI * 0.85 / Math.max(N, 1), Math.PI / 1.6);

      branches.forEach((b, j) => {
        const t = M === 1 ? 0 : (j / (M - 1)) - 0.5;
        const branchAng = ang + t * arcSpread;
        const bx = cx + Math.cos(branchAng) * R2;
        const by = cy + Math.sin(branchAng) * R2;

        const bdx = bx - sx, bdy = by - sy;
        const blen = Math.sqrt(bdx*bdx+bdy*bdy);
        const bnx = -bdy/blen, bny = bdx/blen;
        const bc1 = [sx + bdx*0.4 + bnx*(rng()-0.5)*blen*0.15, sy + bdy*0.4 + bny*(rng()-0.5)*blen*0.15];
        const bc2 = [sx + bdx*0.7 + bnx*(rng()-0.5)*blen*0.15, sy + bdy*0.7 + bny*(rng()-0.5)*blen*0.15];
        branchEdges += `<path d="M${sx.toFixed(1)},${sy.toFixed(1)} C${bc1[0].toFixed(1)},${bc1[1].toFixed(1)} ${bc2[0].toFixed(1)},${bc2[1].toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}" fill="none" stroke="${a.color}" stroke-opacity="0.32" stroke-width="0.7" stroke-linecap="round"/>`;
        bezierPoints([sx,sy], bc1, bc2, [bx,by], 4).forEach(p => {
          if (rng() > 0.55) {
            const dlen = 5 + rng() * 10;
            const dang = Math.atan2(by-sy, bx-sx) + (rng()<0.5?-1:1)*(Math.PI/2 + (rng()-0.5)*0.6);
            const ex = p[0] + Math.cos(dang) * dlen;
            const ey = p[1] + Math.sin(dang) * dlen;
            dendrites += `<path d="M${p[0].toFixed(1)},${p[1].toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}" fill="none" stroke="${a.color}" stroke-opacity="${(0.18+rng()*0.18).toFixed(2)}" stroke-width="0.4"/>`;
          }
          synapses += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${(0.4+rng()*0.4).toFixed(2)}" fill="${a.color}" opacity="${(0.3+rng()*0.3).toFixed(2)}"/>`;
        });

        // Branch leaf
        const isExpanded = expandedSet.has(a.source + "|" + b.key);
        const leafSize = isExpanded ? 26 : 22;
        const isRight = Math.cos(branchAng) > 0;
        const labelX = bx + Math.cos(branchAng) * (leafSize + 4);
        const labelY = by + Math.sin(branchAng) * (leafSize + 4);
        const labelDx = isRight ? 4 : -4;
        const labelAnchor = isRight ? "start" : "end";
        const expandIndicator = isExpanded ? "⊖" : "⊕";

        branchNodes += `
          <g class="dt-leaf" data-source="${escapeHtml(a.source)}" data-branch="${escapeHtml(b.key)}" data-color="${a.color}" style="cursor:pointer">
            <circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${leafSize/2 + 4}" fill="${a.color}" opacity="${isExpanded ? 0.18 : 0.06}"/>
            <circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${leafSize/2}" fill="rgba(15,18,23,0.85)" stroke="${a.color}" stroke-opacity="${isExpanded ? 1 : 0.65}" stroke-width="${isExpanded ? 1.4 : 0.8}"/>
            <text x="${bx.toFixed(1)}" y="${(by + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${isExpanded ? 14 : 13}" pointer-events="none">${b.icon || "•"}</text>
            <text x="${(bx + leafSize/2 + 2).toFixed(1)}" y="${(by - leafSize/2 - 2).toFixed(1)}" font-size="9" fill="${a.color}" font-weight="700" pointer-events="none">${expandIndicator}</text>
            <g pointer-events="none" transform="translate(${(labelX + labelDx).toFixed(1)},${labelY.toFixed(1)})">
              <text text-anchor="${labelAnchor}" font-size="9.5" fill="rgba(255,255,255,0.85)" dominant-baseline="middle" font-weight="600">${escapeHtml(b.label)}</text>
              <text text-anchor="${labelAnchor}" y="11" font-size="8.5" fill="${a.color}" opacity="0.85" font-family="JetBrains Mono, monospace">${fmtCount(b.count)}</text>
            </g>
          </g>
        `;

        // Sub-branches if expanded
        if (isExpanded) {
          const subs = expandedData[a.source + "|" + b.key] || [];
          const K = subs.length;
          const subArcSpread = Math.min(Math.PI * 0.7, K * 0.18);
          subs.forEach((sb, k) => {
            const u = K === 1 ? 0 : (k / (K - 1)) - 0.5;
            const subAng = branchAng + u * subArcSpread;
            const subDist = R3 - R2;
            const subX = bx + Math.cos(subAng) * subDist;
            const subY = by + Math.sin(subAng) * subDist;

            // Edge
            const sdx = subX - bx, sdy = subY - by;
            const slen = Math.sqrt(sdx*sdx+sdy*sdy);
            const snx = -sdy/slen, sny = sdx/slen;
            const sc1 = [bx + sdx*0.4 + snx*(rng()-0.5)*slen*0.15, by + sdy*0.4 + sny*(rng()-0.5)*slen*0.15];
            const sc2 = [bx + sdx*0.7 + snx*(rng()-0.5)*slen*0.15, by + sdy*0.7 + sny*(rng()-0.5)*slen*0.15];
            subEdges += `<path d="M${bx.toFixed(1)},${by.toFixed(1)} C${sc1[0].toFixed(1)},${sc1[1].toFixed(1)} ${sc2[0].toFixed(1)},${sc2[1].toFixed(1)} ${subX.toFixed(1)},${subY.toFixed(1)}" fill="none" stroke="${a.color}" stroke-opacity="0.35" stroke-width="0.7" stroke-linecap="round" class="dt-sub-edge"/>`;

            // Sub-leaf
            const subSize = 18;
            const subIsRight = Math.cos(subAng) > 0;
            const subLabelX = subX + Math.cos(subAng) * (subSize + 3);
            const subLabelY = subY + Math.sin(subAng) * (subSize + 3);
            const subLabelDx = subIsRight ? 3 : -3;
            const subAnchor = subIsRight ? "start" : "end";

            subBranchNodes += `
              <g class="dt-sub-leaf" data-color="${a.color}" style="opacity:0;animation:dt-sub-fade-in 350ms ease-out ${(k*60)}ms forwards">
                <circle cx="${subX.toFixed(1)}" cy="${subY.toFixed(1)}" r="${subSize/2}" fill="rgba(15,18,23,0.92)" stroke="${a.color}" stroke-opacity="0.55" stroke-width="0.7"/>
                <text x="${subX.toFixed(1)}" y="${(subY + 1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="11">${sb.icon || "•"}</text>
                <g transform="translate(${(subLabelX + subLabelDx).toFixed(1)},${subLabelY.toFixed(1)})">
                  <text text-anchor="${subAnchor}" font-size="8.5" fill="rgba(255,255,255,0.85)" dominant-baseline="middle" font-weight="600">${escapeHtml(sb.label)}</text>
                  ${sb.stat ? `
                    <text text-anchor="${subAnchor}" y="10" font-size="7.5" fill="${a.color}" opacity="0.75" font-family="JetBrains Mono, monospace">${escapeHtml(sb.stat)}</text>
                  ` : `
                    <text text-anchor="${subAnchor}" y="10" font-size="7.5" fill="${a.color}" opacity="0.75" font-family="JetBrains Mono, monospace">${fmtCount(sb.count)}</text>
                  `}
                </g>
              </g>
            `;
          });
        }
      });

      // Source card
      const cardW = 110, cardH = 46;
      const cardX = sx - cardW/2;
      const cardY = sy - cardH/2;
      sourceCards += `
        <g transform="translate(${cardX.toFixed(1)},${cardY.toFixed(1)})">
          <rect width="${cardW}" height="${cardH}" rx="10" fill="rgba(15,18,23,0.88)" stroke="${a.color}" stroke-opacity="0.55" stroke-width="0.9" filter="url(#dt-card-glow)"/>
          <text x="${cardW/2}" y="15" text-anchor="middle" font-size="14" dominant-baseline="middle">${a.icon}</text>
          <text x="${cardW/2}" y="29" text-anchor="middle" font-size="8" fill="${a.color}" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="1">${escapeHtml(a.source_label.toUpperCase())}</text>
          <text x="${cardW/2}" y="40" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.85)" font-weight="600">${escapeHtml(a.label)}</text>
        </g>
      `;
    });

    // Center node
    const centerNode = `
      <g>
        <circle cx="${cx}" cy="${cy}" r="78" fill="url(#dt-center-glow)"/>
        <circle cx="${cx}" cy="${cy}" r="44" fill="rgba(80,227,194,0.06)" stroke="rgba(80,227,194,0.35)" stroke-width="0.7"/>
        <circle cx="${cx}" cy="${cy}" r="36" fill="#0c0d10" stroke="rgba(80,227,194,0.6)" stroke-width="1"/>
        <circle class="dt-pulse" cx="${cx}" cy="${cy}" r="36" fill="none" stroke="#50e3c2" stroke-width="1" opacity="0"/>
        <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="20" dominant-baseline="middle">🧬</text>
        <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="6.5" fill="rgba(255,255,255,0.7)" font-family="JetBrains Mono, monospace" font-weight="700" letter-spacing="2">DIGITAL TWIN</text>
        <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="6.5" fill="rgba(255,255,255,0.4)" font-family="JetBrains Mono, monospace">${escapeHtml(shortAddr(address))}</text>
        ${totalActivities ? `
          <text x="${cx}" y="${cy + 34}" text-anchor="middle" font-size="6" fill="rgba(80,227,194,0.7)" font-family="JetBrains Mono, monospace">${fmtCount(totalActivities)} events</text>
        ` : ""}
      </g>
    `;

    return `
      <style>
        .dt-flow { animation: dt-flow 6s linear infinite; }
        @keyframes dt-flow { from { stroke-dashoffset: 0 } to { stroke-dashoffset: -60 } }
        .dt-pulse { animation: dt-pulse 3.5s ease-out infinite; }
        @keyframes dt-pulse { 0% { r: 36; opacity: 0.5 } 100% { r: 78; opacity: 0 } }
        .dt-leaf:hover circle:nth-child(1) { opacity: 0.18; transition: opacity 200ms; }
        .dt-leaf:hover circle:nth-child(2) { stroke-opacity: 1; transition: stroke-opacity 200ms; }
        @keyframes dt-sub-fade-in { from { opacity: 0; transform: scale(0.6) } to { opacity: 1; transform: scale(1) } }
        .dt-sub-leaf { transform-origin: center; transform-box: fill-box; }
        .dt-sub-edge { animation: dt-sub-edge-in 350ms ease-out; }
        @keyframes dt-sub-edge-in { from { stroke-dasharray: 3 200; stroke-dashoffset: 200 } to { stroke-dasharray: 1 0; stroke-dashoffset: 0 } }
      </style>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block;overflow:visible">
        <defs>
          <radialGradient id="dt-center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#50e3c2" stop-opacity="0.4"/>
            <stop offset="40%" stop-color="#50e3c2" stop-opacity="0.1"/>
            <stop offset="100%" stop-color="#50e3c2" stop-opacity="0"/>
          </radialGradient>
          <filter id="dt-card-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        ${ambient}
        ${dendrites}
        ${branchEdges}
        ${subEdges}
        ${mainEdges}
        ${synapses}
        ${centerNode}
        ${sourceCards}
        ${branchNodes}
        ${subBranchNodes}
      </svg>
    `;
  }

  function renderInto(container, summary) {
    const archetypes = summary.archetypes || [];
    const address    = summary.address;
    const totalActivities = archetypes.reduce((s, a) => s + (a.rows || 0), 0);

    container.innerHTML = `
      <div class="rounded-xl border border-white/10 bg-gradient-to-br from-neon-500/[0.04] to-transparent p-4 md:p-6">
        <div class="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <div>
            <div class="text-[10px] font-mono text-neon-500 uppercase tracking-widest">Digital Twin · Neural Map</div>
            <div class="text-base md:text-lg font-semibold mt-0.5">Du — als verzweigter Datenstrom</div>
          </div>
          <div class="text-[10px] font-mono text-white/40">${archetypes.length} ${vt("mm.sources", "Quellen")} · ${fmtCount(totalActivities)} Events · klick zum Aufschlüsseln</div>
        </div>
        ${renderSvg({ archetypes, address, totalActivities })}
        ${archetypes.length === 0 ? "" : `
          <div class="mt-3 text-[11px] text-white/40 font-mono leading-relaxed text-center">
            <span class="text-neon-500">⊕</span> aufklappen · <span class="text-neon-500">⊖</span> zuklappen — alles bleibt in deiner Wallet gebündelt.
          </div>
        `}
      </div>
    `;
  }

  async function loadAndRender(container) {
    if (!container) return;
    _container = container;
    try {
      const r = await fetch("/api/vault/archetype-summary", { credentials: "include" });
      if (r.ok) {
        _lastSummary = await r.json();
      } else {
        _lastSummary = { archetypes: [], address: null };
      }
    } catch {
      _lastSummary = { archetypes: [], address: null };
    }
    renderInto(container, _lastSummary);

    if (!global.__dwinityMindmapWired) {
      global.__dwinityMindmapWired = true;
      document.addEventListener("click", (e) => {
        const leaf = e.target.closest(".dt-leaf");
        if (!leaf) return;
        const src = leaf.dataset.source;
        const br  = leaf.dataset.branch;
        if (src && br) toggleExpand(src, br);
      });
    }
  }

  global.DwinityMindMap = { loadAndRender };
})(window);
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "mm.sources": "sources",
} });
