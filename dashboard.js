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
  const statPct = document.getElementById("stat-pct");
  const statDl = document.getElementById("stat-dl");
  const ringProgress = document.getElementById("ring-progress");
  const RING_CIRC = 553;  // 2π × 88 — matches SVG stroke-dasharray

  const listEl = document.getElementById("drops-list");
  const emptyEl = document.getElementById("drops-empty");

  let currentAddress = null;
  let allDrops = [];
  let selectedDropId = null;
  let map = null;
  let nodeMarkers = [];

  // Details arrow rotation — Leaflet map is inside <details>, rotate ▾ to ▴ on open
  document.querySelectorAll("details").forEach((el) => {
    const arrow = el.querySelector("[data-details-arrow]");
    if (!arrow) return;
    el.addEventListener("toggle", () => {
      arrow.style.transform = el.open ? "rotate(180deg)" : "";
      if (el.open && map) {
        // Leaflet needs a size-recompute when its container becomes visible
        setTimeout(() => { try { map.invalidateSize(); } catch {} }, 100);
      }
    });
  });

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
  async function probeAdmin() {
    // If the logged-in wallet is a chat/drop admin, show a shortcut in the
    // header with a badge of open reports. Silent no-op for non-admins.
    try {
      const ar = await fetch("/api/admin/stats", { credentials: "include" });
      if (!ar.ok) return;
      const astats = await ar.json();
      let hdr = document.getElementById("admin-shortcut");
      if (!hdr) {
        // Insert into the right-side button group in the new header
        const group = document.querySelector("header .max-w-6xl > div:last-child");
        if (!group) return;
        hdr = document.createElement("a");
        hdr.id = "admin-shortcut";
        hdr.href = "/admin";
        hdr.className = "hidden sm:inline-flex items-center gap-1 px-2.5 md:px-3 py-1.5 md:py-2 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 text-[11px] font-mono uppercase tracking-widest transition";
        // prepend before the "+ Neuer Drop" button
        group.insertBefore(hdr, group.querySelector('a[href="/"]') || group.firstChild);
      }
      const open = (astats.reports && astats.reports.open) || 0;
      hdr.innerHTML = "Admin" + (open > 0
        ? ` <span class="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px]">${open}</span>`
        : "");
    } catch {}
  }

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
    const totalDls = allDrops.reduce((s, d) => s + (d.download_count || 0), 0);
    if (statDl) statDl.textContent = totalDls;
    const pct = Math.min(100, Math.round((data.stats.storage_used / Math.max(1, data.stats.storage_quota)) * 100));
    if (statPct) statPct.textContent = pct + " %";
    if (ringProgress) ringProgress.setAttribute("stroke-dashoffset", RING_CIRC * (1 - pct / 100));

    // list
    renderList();

    show(dash);
    hide(noLogin);
    initMap();
    probeAdmin();  // fire-and-forget async
    if (!selectedDropId && allDrops[0]) {
      selectedDropId = allDrops[0].id;
      renderMapMarkers();
    }

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
      const isBurn = d.max_downloads === 1;
      const downloaded = (d.download_count || 0) > 0;
      const hasKey = !!m.share_link;

      const card = document.createElement("article");
      card.className = "drop-card rounded-2xl bg-void-900/80 backdrop-blur border border-white/10 overflow-hidden";
      card.dataset.id = d.id;

      // Expiry urgency accent on card border
      const remaining = d.expires_at - Math.floor(Date.now() / 1000);
      let expiryBadgeCls = "text-neon-500";
      if (remaining < 3600) expiryBadgeCls = "text-red-400";
      else if (remaining < 86400) expiryBadgeCls = "text-yellow-400";

      const filename = escapeHtml(m.filename || "Drop");
      const burnChip = isBurn
        ? `<span class="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/20 border border-orange-500/40 text-orange-300 text-[10px] font-mono">🔥 ${d.download_count}/1</span>`
        : "";
      const keyChip = !hasKey
        ? `<span class="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 text-[10px] font-mono" title="Schlüssel auf diesem Gerät nicht verfügbar">Kein Key</span>`
        : "";

      const dlLine = downloaded
        ? `<span class="text-white/70">⬇ ${d.download_count}${d.last_download_at ? ` · vor ${fmtRelative(d.last_download_at)}` : ''}</span>`
        : `<span class="text-white/40">noch nicht geladen</span>`;
      const urlLine = (d.url_issued_count || 0) > (d.download_count || 0)
        ? `<span class="text-white/40" title="URL-Abrufe (inkl. Tab-Refresh)">◐ ${d.url_issued_count}</span>`
        : "";

      // ——— card header (always visible) ———
      const header = document.createElement("div");
      header.className = "p-4 cursor-pointer select-none";
      header.dataset.role = "header";
      header.innerHTML = `
        <div class="flex items-start gap-3 mb-2.5">
          <div class="shrink-0 w-9 h-9 rounded-lg bg-neon-500/10 text-neon-500 grid place-items-center font-mono text-[10px]">29/80</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap mb-0.5">
              <div class="font-600 truncate">${filename}</div>
              ${burnChip}
              ${keyChip}
            </div>
            <div class="font-mono text-[10px] text-white/30 truncate">${d.id.slice(0, 16)}…</div>
          </div>
          <div class="shrink-0 text-white/30 text-xs">${isOpen ? "▲" : "▾"}</div>
        </div>
        <div class="grid grid-cols-3 gap-2 text-[11px] font-mono pt-2.5 border-t border-white/5">
          <div>
            <div class="text-white/30 mb-0.5">Größe</div>
            <div class="text-white/80">${fmtBytes(d.size)}</div>
          </div>
          <div>
            <div class="text-white/30 mb-0.5">Ablauf</div>
            <div class="${expiryBadgeCls}">${fmtRelative(d.expires_at)}</div>
          </div>
          <div>
            <div class="text-white/30 mb-0.5">Downloads</div>
            <div class="flex items-center gap-1.5 flex-wrap">
              ${dlLine}
              ${urlLine}
            </div>
          </div>
        </div>
      `;
      card.appendChild(header);

      // ——— expanded share panel ———
      if (isOpen) {
        const panel = document.createElement("div");
        panel.className = "border-t border-white/10 bg-void-800/30 p-4";
        if (hasKey) {
          panel.innerHTML = `
            <div class="flex flex-col sm:flex-row items-stretch sm:items-start gap-3">
              <div class="shrink-0 self-center sm:self-start p-2 rounded-xl bg-white" style="width:116px;height:116px;">
                <canvas data-qr="${d.id}" width="100" height="100"></canvas>
              </div>
              <div class="flex-1 min-w-0 flex flex-col gap-2">
                <div class="font-mono text-[10px] uppercase tracking-widest text-neon-500">Share-Link</div>
                <div class="flex gap-2">
                  <input data-share-input value="${escapeAttr(m.share_link)}" readonly class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-void-900 border border-white/10 text-neon-400 font-mono text-[11px] focus:outline-none focus:border-neon-500/60" />
                  <button data-act="copy-full" class="shrink-0 px-3 py-2 rounded-lg bg-neon-500 text-void-950 font-bold text-xs hover:bg-neon-600 transition">Kopieren</button>
                </div>
                <p class="text-[11px] text-white/40 font-mono leading-relaxed">
                  Alles nach dem <span class="text-neon-500">#</span> bleibt im Browser — der Schlüssel verlässt unseren Server nie.
                </p>
                <div class="flex justify-end pt-1">
                  <button data-act="delete" class="inline-flex items-center gap-1.5 text-[11px] font-mono text-white/50 hover:text-red-400 transition">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
                    Drop löschen
                  </button>
                </div>
              </div>
            </div>
          `;
        } else {
          panel.innerHTML = `
            <div class="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/30 text-[13px]">
              <div class="font-600 text-yellow-400 mb-1">Share-Link auf diesem Gerät nicht verfügbar</div>
              <div class="text-white/70 leading-relaxed">
                Dieser Drop wurde auf einem anderen Browser erstellt. Der Decryption-Schlüssel lebt nur dort — <strong>wir können ihn nicht rekonstruieren</strong>. Hast du den Link noch irgendwo? Dann weiterleiten, sonst löschen + neu hochladen.
              </div>
              <div class="flex justify-end mt-3">
                <button data-act="delete" class="inline-flex items-center gap-1.5 text-[11px] font-mono text-white/50 hover:text-red-400 transition">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
                  Drop löschen
                </button>
              </div>
            </div>
          `;
        }
        card.appendChild(panel);

        queueMicrotask(() => {
          const c = card.querySelector('canvas[data-qr]');
          if (c && m.share_link && typeof QRious !== "undefined") {
            try {
              new QRious({ element: c, value: m.share_link, size: 100, level: "M",
                background: "#ffffff", foreground: "#05060A" });
            } catch {}
          }
        });
      }

      listEl.appendChild(card);
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
