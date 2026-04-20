(function () {
  // Dashboard: shows this wallet's drops, storage usage, and a fragment map.

  const API = "/api";
  const LS_KEY_PREFIX = "dwinity_drop_meta_";  // per-wallet metadata store

  const noLogin = document.getElementById("nologin-screen");
  const dash = document.getElementById("dashboard-screen");
  const connectBtn = document.getElementById("nologin-connect");

  const proBadge = document.getElementById("pro-badge");
  const proBadgeText = document.getElementById("pro-badge-text");
  const freeBadge = document.getElementById("free-badge");

  const statActive = document.getElementById("stat-active");
  const statTotal = document.getElementById("stat-total");
  const statUsed = document.getElementById("stat-used");
  const statQuota = document.getElementById("stat-quota");
  const statBar = document.getElementById("stat-bar");

  const listEl = document.getElementById("drops-list");
  const emptyEl = document.getElementById("drops-empty");

  let currentAddress = null;
  let allDrops = [];
  let selectedDropId = null;
  let map = null;
  let nodeMarkers = [];

  // ——— utils ———
  function fmtBytes(n) {
    if (n === 0) return "0 B";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
    return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }
  function fmtDate(ts) {
    return new Date(ts * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
  }
  function fmtRelative(ts) {
    const d = ts - Math.floor(Date.now() / 1000);
    if (d <= 0) return "abgelaufen";
    if (d < 3600) return Math.round(d / 60) + " min";
    if (d < 86400) return Math.round(d / 3600) + " h";
    return Math.round(d / 86400) + " Tage";
  }
  function lsKey(addr) { return LS_KEY_PREFIX + addr.toLowerCase(); }
  function getMeta(addr) {
    try { return JSON.parse(localStorage.getItem(lsKey(addr)) || "{}"); } catch { return {}; }
  }

  // ——— node coordinates (representative global distribution) ———
  // 80 points, roughly weighted: N-America 30%, Europe 25%, Asia 20%, rest 25%
  const NODE_COORDS = [
    // North America (24)
    [37.77,-122.41],[40.71,-74.00],[34.05,-118.24],[41.88,-87.63],[29.76,-95.37],
    [33.75,-84.39],[47.61,-122.33],[45.50,-73.57],[43.65,-79.38],[49.28,-123.12],
    [25.76,-80.19],[39.74,-104.99],[44.98,-93.26],[32.78,-96.80],[42.36,-71.06],
    [38.90,-77.03],[35.23,-80.84],[30.27,-97.74],[36.16,-86.78],[51.05,-114.07],
    [45.52,-122.68],[33.44,-112.07],[39.95,-75.17],[41.50,-81.69],
    // Europe (20)
    [52.52,13.40],[48.85,2.35],[51.51,-0.13],[52.37,4.90],[55.68,12.57],
    [59.91,10.75],[59.33,18.07],[60.17,24.94],[50.08,14.43],[48.21,16.37],
    [47.37,8.54],[45.46,9.19],[41.90,12.50],[40.42,-3.70],[38.72,-9.14],
    [50.85,4.35],[45.76,4.84],[52.23,21.01],[50.45,30.52],[55.75,37.62],
    // Asia (16)
    [35.68,139.69],[37.57,126.98],[31.23,121.47],[22.32,114.17],[1.35,103.81],
    [28.61,77.21],[19.08,72.88],[13.75,100.49],[3.14,101.69],[14.60,120.98],
    [-6.20,106.85],[35.18,129.08],[23.13,113.26],[39.90,116.40],[25.03,121.56],
    [24.48,54.35],
    // South America + Oceania + Africa (20)
    [-23.55,-46.63],[-34.60,-58.38],[-12.04,-77.04],[4.71,-74.07],[-33.44,-70.67],
    [10.48,-66.90],[-15.79,-47.88],[-22.91,-43.17],
    [-33.87,151.21],[-37.81,144.96],[-36.85,174.76],[-27.47,153.03],
    [-33.92,18.42],[-26.20,28.04],[-1.29,36.82],[30.04,31.24],
    [6.52,3.38],[33.57,-7.59],[14.72,-17.47],[9.02,38.75],
  ];

  // Deterministic per-drop shard selection so the "active" 29/80 don't reshuffle each re-render.
  function shardsFor(dropId) {
    let seed = 0;
    for (let i = 0; i < dropId.length; i++) seed = (seed * 31 + dropId.charCodeAt(i)) | 0;
    function next() { seed = (seed * 1103515245 + 12345) | 0; return (seed >>> 0) / 4294967296; }
    const pool = Array.from({ length: NODE_COORDS.length }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return new Set(pool.slice(0, 29));
  }

  // ——— map ———
  function initMap() {
    if (map) return;
    map = L.map("drop-map", {
      worldCopyJump: false,
      zoomControl: false,
      attributionControl: false,
      minZoom: 1, maxZoom: 5,
    }).setView([20, 0], 1.3);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 5,
    }).addTo(map);

    renderMapMarkers();
  }

  function renderMapMarkers() {
    nodeMarkers.forEach((m) => m.remove());
    nodeMarkers = [];
    const active = selectedDropId ? shardsFor(selectedDropId) : null;

    NODE_COORDS.forEach((coord, idx) => {
      const isActive = active && active.has(idx);
      const icon = L.divIcon({
        className: "node-dot" + (isActive ? " active" : ""),
        iconSize: [isActive ? 10 : 6, isActive ? 10 : 6],
        iconAnchor: [isActive ? 5 : 3, isActive ? 5 : 3],
      });
      const m = L.marker(coord, { icon, interactive: false }).addTo(map);
      nodeMarkers.push(m);
    });
  }

  // ——— data ———
  async function loadMine() {
    try {
      const r = await fetch(API + "/drops/mine", { credentials: "include" });
      if (r.status === 401) {
        show(noLogin);
        hide(dash);
        return null;
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      return data;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  function render(data) {
    currentAddress = data.address;
    allDrops = data.drops.filter((d) => d.status === "active");

    // badges
    if (data.pro) {
      const untilStr = new Date(data.pro_until * 1000).toLocaleDateString("de-DE");
      proBadgeText.textContent = "Pro aktiv bis " + untilStr;
      show(proBadge); hide(freeBadge);
    } else {
      show(freeBadge); hide(proBadge);
    }

    // stats
    statActive.textContent = data.stats.active_count;
    statTotal.textContent = data.stats.total_count;
    statUsed.textContent = fmtBytes(data.stats.storage_used);
    statQuota.textContent = fmtBytes(data.stats.storage_quota);
    const pct = Math.min(100, Math.round((data.stats.storage_used / Math.max(1, data.stats.storage_quota)) * 100));
    statBar.style.width = pct + "%";

    // list
    renderList();

    show(dash);
    hide(noLogin);
    initMap();
    if (!selectedDropId && allDrops[0]) {
      selectedDropId = allDrops[0].id;
      renderMapMarkers();
    }

    // bubbles: canvas is now visible, measure + build
    fitCanvas();
    if (allDrops.length === 0) bubbleEmpty.classList.remove("hidden");
    else bubbleEmpty.classList.add("hidden");
    buildBubbles(allDrops);
    startBubbles();
  }

  function renderList() {
    listEl.innerHTML = "";
    if (allDrops.length === 0) {
      show(emptyEl);
      return;
    }
    hide(emptyEl);

    const meta = getMeta(currentAddress);
    allDrops.forEach((d) => {
      const m = meta[d.id] || {};
      const isOpen = d.id === selectedDropId;
      const wrapper = document.createElement("div");
      wrapper.className = (isOpen ? "bg-void-800/40" : "") + " transition";
      wrapper.dataset.id = d.id;

      // row summary
      const row = document.createElement("div");
      row.className = "p-4 hover:bg-void-800/60 transition cursor-pointer flex items-start gap-4";
      row.dataset.row = "1";
      const isBurn = d.max_downloads === 1;
      const downloaded = (d.download_count || 0) > 0;
      const burnBadge = isBurn
        ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-500/40 text-orange-300 text-[10px] font-mono">🔥 ${d.download_count}/1</span>`
        : "";
      const dlInfo = downloaded
        ? `<span class="text-white/70">⬇ ${d.download_count} · zuletzt ${fmtRelative(d.last_download_at)} her</span>`
        : `<span class="text-white/40">noch nicht geladen</span>`;

      row.innerHTML = `
        <div class="shrink-0 w-10 h-10 rounded-lg bg-neon-500/10 text-neon-500 grid place-items-center font-mono text-xs">29/80</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <div class="font-600 text-sm truncate">${escapeHtml(m.filename || "Drop")}</div>
            ${burnBadge}
            <span class="font-mono text-[10px] text-white/40">${d.id.slice(0,10)}…</span>
          </div>
          <div class="text-xs text-white/50 mt-1 font-mono flex flex-wrap gap-x-4 gap-y-1">
            <span>${fmtBytes(d.size)} verschlüsselt</span>
            <span>erstellt ${fmtDate(d.created_at)}</span>
            <span class="text-neon-500">Ablauf in ${fmtRelative(d.expires_at)}</span>
            ${dlInfo}
          </div>
        </div>
        <div class="shrink-0 flex items-center gap-1">
          <div class="text-white/40 text-xs mr-1 select-none">${isOpen ? "▲" : "▼"}</div>
          <button data-act="delete" class="p-2 rounded-md hover:bg-red-500/10 text-white/60 hover:text-red-400" title="Drop löschen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      `;
      wrapper.appendChild(row);

      // expanded share panel (only if selected)
      if (isOpen) {
        const share = document.createElement("div");
        share.className = "px-4 pb-5 border-b border-white/10";
        if (m.share_link) {
          share.innerHTML = `
            <div class="font-mono text-[10px] uppercase tracking-widest text-neon-500 mb-3">Teilen</div>
            <div class="flex flex-col md:flex-row items-stretch md:items-start gap-4">
              <div class="shrink-0 p-2 rounded-xl bg-white" style="width:136px;height:136px;">
                <canvas data-qr="${d.id}" width="120" height="120"></canvas>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex gap-2 mb-2">
                  <input data-share-input value="${escapeAttr(m.share_link)}" readonly class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-void-800 border border-white/10 text-neon-400 font-mono text-xs focus:outline-none focus:border-neon-500/60" />
                  <button data-act="copy-full" class="px-4 py-2 rounded-lg bg-neon-500 text-void-950 font-bold text-xs hover:bg-neon-600 transition whitespace-nowrap">Kopieren</button>
                </div>
                <p class="text-[11px] text-white/40 font-mono leading-relaxed">
                  Alles nach dem <span class="text-neon-500">#</span> bleibt im Browser des Empfängers — der Schlüssel geht nie an unseren Server.
                  Link funktioniert bis zum Ablauf.
                </p>
              </div>
            </div>
          `;
        } else {
          share.innerHTML = `
            <div class="font-mono text-[10px] uppercase tracking-widest text-white/50 mb-3">Teilen</div>
            <div class="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/30 text-sm">
              <div class="font-600 text-yellow-400 mb-2">Share-Link nicht verfügbar auf diesem Gerät</div>
              <div class="text-white/70 text-[13px] leading-relaxed">
                Dieser Drop wurde auf einem anderen Browser erstellt. Der Decryption-Schlüssel lebt nur dort im Speicher —
                <strong>wir können ihn nicht rekonstruieren</strong>, das ist das Self-Custody-Prinzip.
                <br/><br/>
                Hast du den Link noch per Nachricht / E-Mail? Den kannst du direkt weiterschicken. Alternativ: diesen Drop löschen und neu hochladen.
              </div>
            </div>
          `;
        }
        wrapper.appendChild(share);

        // render QR into the canvas after it's in the DOM
        queueMicrotask(() => {
          const c = wrapper.querySelector('canvas[data-qr]');
          if (c && m.share_link && typeof QRious !== "undefined") {
            try {
              new QRious({ element: c, value: m.share_link, size: 120, level: "M",
                background: "#ffffff", foreground: "#05060A" });
            } catch {}
          }
        });
      }

      listEl.appendChild(wrapper);
    });
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;").replace(/&/g, "&amp;");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  async function deleteDrop(id) {
    if (!confirm("Diesen Drop wirklich löschen? Der Share-Link wird sofort ungültig.")) return;
    try {
      const r = await fetch(API + "/drops/" + encodeURIComponent(id), {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      // purge localStorage meta
      const meta = getMeta(currentAddress);
      delete meta[id];
      localStorage.setItem(lsKey(currentAddress), JSON.stringify(meta));
      if (selectedDropId === id) selectedDropId = null;
      const data = await loadMine();
      if (data) render(data);
    } catch (e) {
      alert("Konnte Drop nicht löschen: " + (e.message || e));
    }
  }

  async function copyLink(id) {
    const meta = getMeta(currentAddress);
    const link = meta[id] && meta[id].share_link;
    if (!link) {
      alert("Dieser Share-Link ist auf einem anderen Gerät erzeugt worden und hier nicht verfügbar. Der Drop existiert noch — nur der Decryption-Key ist nicht mehr in deinem Browser.");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
    } catch {}
  }

  // delegated click
  listEl.addEventListener("click", (e) => {
    // ignore clicks inside the share-link input (so user can select text)
    if (e.target.closest("[data-share-input]")) return;

    const wrapper = e.target.closest("[data-id]");
    if (!wrapper) return;
    const id = wrapper.dataset.id;
    const actBtn = e.target.closest("[data-act]");
    if (actBtn) {
      e.stopPropagation();
      const act = actBtn.dataset.act;
      if (act === "delete")    { deleteDrop(id); return; }
      if (act === "copy-full") { copyShareFromUI(wrapper, actBtn); return; }
    }
    // Only row summary should toggle — not clicks inside the share panel.
    if (!e.target.closest("[data-row]")) return;
    selectedDropId = (selectedDropId === id) ? null : id;
    renderList();
    renderMapMarkers();
  });

  async function copyShareFromUI(wrapper, btn) {
    const input = wrapper.querySelector("[data-share-input]");
    if (!input) return;
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      try { document.execCommand("copy"); } catch {}
    }
    const prev = btn.textContent;
    btn.textContent = "✓ kopiert";
    setTimeout(() => (btn.textContent = prev), 1500);
  }

  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      const b = document.getElementById("wallet-btn");
      if (b) b.click();
    });
  }

  // ——— Bubble browser ———
  const bubbleCanvas = document.getElementById("bubble-canvas");
  const bubbleTip = document.getElementById("bubble-tooltip");
  const bubbleTipName = bubbleTip.querySelector("[data-tip-name]");
  const bubbleTipMeta = bubbleTip.querySelector("[data-tip-meta]");
  const bubbleEmpty = document.getElementById("bubble-empty");

  let bubbles = [];
  let bubbleRaf = null;
  let bubbleW = 0, bubbleH = 280;
  let bubbleHover = null;

  function fitCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = bubbleCanvas.getBoundingClientRect();
    bubbleW = rect.width;
    bubbleH = rect.height;
    bubbleCanvas.width = Math.floor(bubbleW * dpr);
    bubbleCanvas.height = Math.floor(bubbleH * dpr);
    const ctx = bubbleCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function bubbleRadius(size) {
    // sqrt-scaled, min 14 (always visible), max 60
    const kb = Math.max(1, size / 1024);
    return Math.max(14, Math.min(60, 14 + Math.sqrt(kb) * 2.5));
  }

  function expiryColor(expiresAt) {
    const now = Date.now() / 1000;
    const total = expiresAt - now;
    if (total <= 0) return { fill: "rgba(239,68,68,0.35)", stroke: "rgba(239,68,68,0.8)" };
    const days = total / 86400;
    if (days > 10) return { fill: "rgba(0,255,157,0.20)", stroke: "rgba(0,255,157,0.9)" };
    if (days > 3)  return { fill: "rgba(77,255,184,0.22)", stroke: "rgba(77,255,184,0.95)" };
    if (days > 1)  return { fill: "rgba(251,191,36,0.22)", stroke: "rgba(251,191,36,0.95)" };
    return { fill: "rgba(251,146,60,0.25)", stroke: "rgba(251,146,60,0.95)" };
  }

  function buildBubbles(drops) {
    const meta = getMeta(currentAddress);
    const prev = new Map(bubbles.map((b) => [b.drop.id, b]));
    bubbles = drops.map((d) => {
      const r = bubbleRadius(d.size);
      const existing = prev.get(d.id);
      return {
        drop: d,
        name: (meta[d.id] && meta[d.id].filename) || "Drop " + d.id.slice(0, 6),
        r,
        x: existing ? existing.x : Math.random() * Math.max(1, bubbleW - 2 * r) + r,
        y: existing ? existing.y : Math.random() * Math.max(1, bubbleH - 2 * r) + r,
        vx: existing ? existing.vx : (Math.random() - 0.5) * 0.5,
        vy: existing ? existing.vy : (Math.random() - 0.5) * 0.5,
      };
    });
  }

  function stepPhysics() {
    const cx = bubbleW / 2, cy = bubbleH / 2;
    for (const b of bubbles) {
      // gentle pull toward center
      b.vx += (cx - b.x) * 0.0015;
      b.vy += (cy - b.y) * 0.0015;
      // friction
      b.vx *= 0.94; b.vy *= 0.94;
    }
    // pair-wise collision
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i], c = bubbles[j];
        const dx = c.x - a.x, dy = c.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const minD = a.r + c.r + 2;
        if (dist < minD) {
          const push = (minD - dist) * 0.5;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * push; a.y -= ny * push;
          c.x += nx * push; c.y += ny * push;
        }
      }
    }
    // integrate + clamp to canvas
    for (const b of bubbles) {
      b.x += b.vx; b.y += b.vy;
      if (b.x - b.r < 0)          { b.x = b.r;           b.vx *= -0.5; }
      if (b.x + b.r > bubbleW)    { b.x = bubbleW - b.r; b.vx *= -0.5; }
      if (b.y - b.r < 0)          { b.y = b.r;           b.vy *= -0.5; }
      if (b.y + b.r > bubbleH)    { b.y = bubbleH - b.r; b.vy *= -0.5; }
    }
  }

  function drawBubbles() {
    const ctx = bubbleCanvas.getContext("2d");
    ctx.clearRect(0, 0, bubbleW, bubbleH);
    for (const b of bubbles) {
      const col = expiryColor(b.drop.expires_at);
      const isSelected = b.drop.id === selectedDropId;
      const isHover = b === bubbleHover;

      // soft glow
      if (isSelected || isHover) {
        const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 2);
        g.addColorStop(0, col.stroke.replace(/[\d.]+\)$/, "0.4)"));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2, 0, Math.PI * 2); ctx.fill();
      }

      // filled circle
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = col.fill;
      ctx.fill();
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.strokeStyle = col.stroke;
      ctx.stroke();

      // size label (only if bubble large enough)
      if (b.r > 22) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = "500 11px JetBrains Mono, monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(fmtBytes(b.drop.size), b.x, b.y);
      }
    }
  }

  function bubbleLoop() {
    stepPhysics();
    drawBubbles();
    bubbleRaf = requestAnimationFrame(bubbleLoop);
  }

  function startBubbles() {
    if (bubbleRaf) return;
    bubbleLoop();
  }

  function hitTestBubble(mx, my) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      const dx = mx - b.x, dy = my - b.y;
      if (dx * dx + dy * dy <= b.r * b.r) return b;
    }
    return null;
  }

  bubbleCanvas.addEventListener("mousemove", (e) => {
    const rect = bubbleCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hitTestBubble(mx, my);
    bubbleHover = hit;
    if (hit) {
      bubbleCanvas.style.cursor = "pointer";
      bubbleTipName.textContent = hit.name;
      bubbleTipMeta.textContent =
        fmtBytes(hit.drop.size) + " · Ablauf " + fmtRelative(hit.drop.expires_at);
      bubbleTip.style.left = Math.min(bubbleW - 200, mx + 14) + "px";
      bubbleTip.style.top = Math.max(8, my - 48) + "px";
      bubbleTip.classList.remove("hidden");
    } else {
      bubbleCanvas.style.cursor = "default";
      bubbleTip.classList.add("hidden");
    }
  });
  bubbleCanvas.addEventListener("mouseleave", () => {
    bubbleHover = null;
    bubbleTip.classList.add("hidden");
  });
  bubbleCanvas.addEventListener("click", (e) => {
    const rect = bubbleCanvas.getBoundingClientRect();
    const hit = hitTestBubble(e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) return;
    selectedDropId = (selectedDropId === hit.drop.id) ? null : hit.drop.id;
    renderList();
    renderMapMarkers();
  });
  window.addEventListener("resize", () => { fitCanvas(); });

  // Robust resize detection: if the canvas container ever changes size (e.g.
  // the dashboard-screen becomes visible after login), re-measure and nudge
  // any bubbles that landed outside the new box back into bounds.
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      const prevW = bubbleW, prevH = bubbleH;
      fitCanvas();
      if ((prevW === 0 || prevH === 0) && bubbleW > 0) {
        // first real measurement — seed positions inside the new canvas
        for (const b of bubbles) {
          b.x = Math.random() * Math.max(1, bubbleW - 2 * b.r) + b.r;
          b.y = Math.random() * Math.max(1, bubbleH - 2 * b.r) + b.r;
        }
      }
    });
    ro.observe(bubbleCanvas);
  }

  // auth.js raises this after successful SIWE or pro update
  window.addEventListener("dwinity:pro-updated", async () => {
    const data = await loadMine();
    if (data) render(data);
  });

  // boot
  (async () => {
    const data = await loadMine();
    if (data) render(data);
    else { show(noLogin); hide(dash); }
  })();
})();
