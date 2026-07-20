// Dwinity Vault — frontend logic.
// i18n helper: translated string if DDI18n is loaded, German fallback otherwise
function vt(key, fallback, vars) {
  let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
  if (!v || v === key) v = fallback;
  if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
  return v;
}

// Reuses auth.js (wallet connect / SIWE) from /var/www/dwinity-drop/.

const API = '/api/vault';

const SOURCE_ICONS = {
  strava:        { icon: '🏃', tint: '#fc5200' },
  spotify:       { icon: '🎧', tint: '#1db954' },
  apple_health:  { icon: '❤️',  tint: '#fa233b' },
  google_takeout:{ icon: '🌐', tint: '#4285f4' },
  csv:           { icon: '📊', tint: '#9ca3af' },
};

let CURRENT_SOURCE = null;
let SOURCES = [];

function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  let i = 0;
  while (n >= 1024 && i < u.length-1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function fmtRelative(ts) {
  if (!ts) return '—';
  const diff = (Date.now()/1000) - ts;
  if (diff < 60) return 'gerade eben';
  if (diff < 3600) return `vor ${Math.floor(diff/60)} min`;
  if (diff < 86400) return `vor ${Math.floor(diff/3600)} h`;
  if (diff < 86400*30) return `vor ${Math.floor(diff/86400)} d`;
  return new Date(ts*1000).toLocaleDateString();
}

async function api(path, opts = {}) {
  const r = await fetch(API + path, { credentials: 'include', ...opts });
  if (!r.ok) {
    const text = await r.text();
    let msg = text;
    try { msg = JSON.parse(text).detail || msg; } catch {}
    throw new Error(`${r.status} ${msg}`);
  }
  return r.json();
}

async function refreshMe() {
  try {
    const me = await api('/me');
    if (!me.authenticated) {
      document.getElementById('gate').classList.remove('hidden');
      document.getElementById('app').classList.add('hidden');
      return null;
    }
    document.getElementById('gate').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('stat-imports').textContent    = me.imports_parsed;
    document.getElementById('stat-activities').textContent = me.activities_total.toLocaleString('de-DE');
    document.getElementById('stat-storage').textContent    =
      `${fmtBytes(me.storage.bytes_used)} / ${fmtBytes(me.storage.bytes_total)}`;
    document.getElementById('stat-tier').textContent       = me.tier.toUpperCase();
    // Imports are wallet-bound — show which wallet this list belongs to, so a
    // wallet switch never reads as "my data disappeared".
    const iw = document.getElementById('imports-wallet');
    if (iw && me.address) iw.textContent = me.address.slice(0, 6) + '…' + me.address.slice(-4);
    return me;
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function loadSources() {
  SOURCES = await api('/sources');
  const grid = document.getElementById('source-grid');
  grid.innerHTML = SOURCES.map(s => {
    const meta = SOURCE_ICONS[s.id] || { icon: '📁', tint: '#9ca3af' };
    return `
      <div class="card card-hover cursor-pointer" data-source="${s.id}">
        <div class="flex items-center gap-3 mb-2">
          <div class="source-icon" style="background: ${meta.tint}20; color: ${meta.tint};">${meta.icon}</div>
          <div>
            <div class="font-600">${s.name}</div>
            <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${s.extensions.join(' · ')}</div>
          </div>
        </div>
        <p class="text-sm text-white/60">${vt('vjs.src.' + s.id, s.description)}</p>
      </div>`;
  }).join('');
  grid.querySelectorAll('[data-source]').forEach(el => {
    el.addEventListener('click', () => selectSource(el.dataset.source));
  });
}

function selectSource(sourceId) {
  CURRENT_SOURCE = SOURCES.find(s => s.id === sourceId);
  if (!CURRENT_SOURCE) return;
  const panel = document.getElementById('upload-panel');
  panel.classList.remove('hidden');
  document.getElementById('upload-source-name').textContent = `· ${CURRENT_SOURCE.name}`;
  document.getElementById('upload-hint').innerHTML =
    vt('vjs.uploadHint', 'Lade dein <strong>{name}</strong>-Export hoch ({ext}).', { name: CURRENT_SOURCE.name, ext: CURRENT_SOURCE.extensions.join(' / ') });
  if (CURRENT_SOURCE.instructions_url) {
    document.getElementById('upload-instructions').innerHTML =
      vt('vjs.uploadInstructions', 'Brauchst du das Export-File noch? <a href="{url}" target="_blank" class="text-neon-500 hover:underline">Anleitung →</a>', { url: CURRENT_SOURCE.instructions_url });
  } else {
    document.getElementById('upload-instructions').textContent = '';
  }
  document.getElementById('dropzone-formats').textContent = CURRENT_SOURCE.extensions.join(' · ');
  document.getElementById('upload-result').classList.add('hidden');
  document.getElementById('dropzone-busy').classList.add('hidden');
  document.getElementById('dropzone-idle').classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setupDropzone() {
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('file-input');
  dz.addEventListener('click', () => input.click());
  // Keyboard activation for the role="button" dropzone (Enter/Space).
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => input.files[0] && handleUpload(input.files[0]));
  ['dragover','dragenter'].forEach(ev =>
    dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev =>
    dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => {
    if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
  });
  document.getElementById('upload-cancel').addEventListener('click', () => {
    document.getElementById('upload-panel').classList.add('hidden');
    CURRENT_SOURCE = null;
  });
}

async function handleUpload(file) {
  if (!CURRENT_SOURCE) return;
  document.getElementById('dropzone-idle').classList.add('hidden');
  document.getElementById('dropzone-busy').classList.remove('hidden');
  document.getElementById('upload-status').textContent = vt('vjs.uploading', 'Lade {size} hoch…', { size: fmtBytes(file.size) });
  document.getElementById('upload-bar').style.width = '15%';

  const fd = new FormData();
  fd.append('source', CURRENT_SOURCE.id);
  fd.append('file', file);

  try {
    document.getElementById('upload-status').textContent = vt('vjs.parsing', 'Parse läuft…');
    document.getElementById('upload-bar').style.width = '60%';
    const result = await api('/imports', { method: 'POST', body: fd });
    document.getElementById('upload-bar').style.width = '100%';
    showUploadResult(result);
    await refreshMe();
    await loadImports();
  } catch (e) {
    document.getElementById('upload-status').textContent = vt('vjs.errPrefix', 'Fehler: ') + e.message;
    document.getElementById('upload-bar').style.width = '0%';
  }
}

function showUploadResult(result) {
  const box = document.getElementById('upload-result');
  box.classList.remove('hidden');
  const s = result.summary || {};
  let summaryHtml = '';
  if (result.source === 'strava') {
    summaryHtml = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div><div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt("vjs.activities", "Aktivitäten")}</div><div class="font-600 text-lg">${s.activity_count}</div></div>
        <div><div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt("vjs.distance", "Distanz")}</div><div class="font-600 text-lg">${s.total_distance_km} km</div></div>
        <div><div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt("vjs.hours", "Stunden")}</div><div class="font-600 text-lg">${s.total_duration_hours}</div></div>
        <div><div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt("vjs.sports", "Sportarten")}</div><div class="font-600 text-lg">${Object.keys(s.by_type || {}).length}</div></div>
      </div>`;
  } else {
    summaryHtml = `<pre class="text-xs font-mono text-white/60 overflow-auto">${JSON.stringify(s, null, 2)}</pre>`;
  }
  box.innerHTML = `
    <div class="text-neon-500 font-mono text-xs uppercase tracking-widest mb-2">✓ ${vt("vjs.importOk", "Import erfolgreich")}</div>
    ${summaryHtml}
    ${result.warnings && result.warnings.length ? `<div class="mt-3 text-xs text-yellow-400 font-mono">${result.warnings.join(' · ')}</div>` : ''}
  `;
}

async function loadImports() {
  const list = document.getElementById('imports-list');
  try {
    const items = await api('/imports');
    if (!items.length) {
      list.innerHTML = `<div class="text-white/40 text-sm">${vt('vjs.noImports', 'Noch keine Imports — wähle oben eine Quelle.')}</div>`;
      return;
    }
    list.innerHTML = items.map(it => {
      const meta = SOURCE_ICONS[it.source] || { icon: '📁', tint: '#9ca3af' };
      const pillCls = `pill-${it.status}`;
      const summaryLine = renderSummaryLine(it);
      return `
        <div class="card" data-id="${it.id}">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div class="source-icon" style="background: ${meta.tint}20; color: ${meta.tint};">${meta.icon}</div>
              <div class="min-w-0 flex-1">
                <div class="font-600 truncate">${it.filename || '(unbenannt)'}</div>
                <div class="text-xs text-white/40 font-mono mt-0.5">${it.source} · ${fmtBytes(it.bytes_size)} · ${fmtRelative(it.created_at)}</div>
                ${summaryLine ? `<div class="text-sm text-white/70 mt-1">${summaryLine}</div>` : ''}
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="pill ${pillCls}">${it.status}</span>
              ${it.status === 'parsed' ? `<button data-anon="${it.id}" data-source="${it.source}" class="text-xs font-mono text-neon-500/70 hover:text-neon-500 px-2 py-1 rounded border border-neon-500/30 hover:border-neon-500/60 transition" title="Pseudonymisieren + Vorschau">🛡 anon</button>` : ''}
              <button data-delete="${it.id}" class="text-xs font-mono text-white/30 hover:text-red-400 px-2">×</button>
            </div>
          </div>
          <div data-anon-panel="${it.id}" class="hidden mt-4 pt-4 border-t border-white/10"></div>
        </div>`;
    }).join('');
    list.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(vt('vjs.confirmDeleteImport', 'Import löschen? Roh-Archiv und Activities werden entfernt.'))) return;
        await api('/imports/' + btn.dataset.delete, { method: 'DELETE' });
        await refreshMe();
        await loadImports();
      });
    });
    list.querySelectorAll('[data-anon]').forEach(btn => {
      btn.addEventListener('click', () => openAnonPanel(btn.dataset.anon, btn.dataset.source));
    });
  } catch (e) {
    list.innerHTML = `<div class="text-red-400 font-mono text-sm">${vt('vjs.errPrefix', 'Fehler: ')}${e.message}</div>`;
  }
}

function renderSummaryLine(item) {
  if (!item.summary) return '';
  const s = item.summary;
  if (item.source === 'strava') {
    return `${s.activity_count} Workouts · ${s.total_distance_km} km · ${s.total_duration_hours} h`;
  }
  if (item.source === 'spotify') {
    const top = Object.keys(s.top_artists || {})[0] || '';
    return `${s.play_count} Plays · ${s.total_hours} h${top ? ' · top: ' + top : ''}`;
  }
  if (item.source === 'apple_health') {
    return `${s.workouts || 0} Workouts · ${s.sleep_records || 0} Sleep · ${Object.keys(s.metrics || {}).length} Metrics`;
  }
  if (item.source === 'google_takeout') {
    return `Watch ${s.watch_count || 0} · Search ${s.search_count || 0} · Visits ${s.visit_count || 0}`;
  }
  if (item.source === 'csv') {
    return vt("vjs.csvSummary", "{n} Zeilen · Datum-Spalte: {c}", { n: s.row_count, c: s.date_column });
  }
  return vt("vjs.entries", "{n} Einträge", { n: s.activity_count || s.row_count || 0 });
}

// ===== Pseudonymizer Preview =====

async function openAnonPanel(importId, source) {
  const panel = document.querySelector(`[data-anon-panel="${importId}"]`);
  if (!panel) return;
  if (!panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }
  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="text-xs font-mono text-white/40">${vt('vjs.loadingActivities', '// lade Activities + Pseudonymisierung läuft browser-side …')}</div>`;

  let raw;
  try {
    raw = await api('/activities?import_id=' + encodeURIComponent(importId) + '&limit=2000');
  } catch (e) {
    panel.innerHTML = `<div class="text-red-400 text-sm">${vt('vjs.errLoading', 'Fehler beim Laden: ')}${e.message}</div>`;
    return;
  }
  if (!raw.length) {
    panel.innerHTML = `<div class="text-white/40 text-sm">${vt('vjs.noActivities', 'Keine Activities zu diesem Import.')}</div>`;
    return;
  }

  const pseudo = await window.Pseudonymizer.pseudonymize(raw, source);
  const sample = raw.slice(0, 3).map((r, i) => ({ raw: r, pseudo: pseudo[i] }));

  // === Wrapped Story — runs before the technical preview ===
  // Per-source: Strava → DwinityWrappedStrava, Apple Health → DwinityWrappedHealth.
  // After the story:
  //   - "connect"  → straight into contribute flow
  //   - "skip" / Überspringen → fall through to the existing preview below
  let wrappedHandled = false;
  if (source === "strava" && window.DwinityArchetypes && window.DwinityWrapped && window.DwinityWrappedStrava) {
    panel.innerHTML = '';
    let poolStats = null;
    try {
      const r = await fetch(MARKETPLACE_API + '/pools/running-data/stats', { credentials: 'include' });
      if (r.ok) poolStats = await r.json();
    } catch {}
    const { archetype, scores } = window.DwinityArchetypes.deriveArchetype(raw);
    window._lastWrappedContext = { importId, source, archetype, scores, poolStats };
    const slides = window.DwinityWrappedStrava.buildSlides({ activities: raw, archetype, scores, poolStats });
    const result = await window.DwinityWrapped.play(slides);
    wrappedHandled = true;
    if (result.action === "connect") {
      const profile = window.Pseudonymizer.profiles[source] || window.Pseudonymizer.profiles.csv;
      openContributeFlow(importId, source, pseudo, profile);
      return;
    }
    panel.classList.remove('hidden');
  }
  if (source === "spotify" && window.DwinityMusicArchetypes && window.DwinityWrapped && window.DwinityWrappedMusic) {
    panel.innerHTML = '';
    let crossSourceCtx = null;
    try {
      const allWorkouts = await api('/activities?kind=workout&limit=2000');
      const totalRuns = (allWorkouts || []).filter(a => /run/i.test((a.meta&&a.meta.type)||"")).length;
      const allHealth = await api('/activities?kind=health_metric&limit=2000');
      const nights = new Set();
      for (const a of (allHealth || [])) {
        if (a.meta && a.meta.metric === "sleep" && /InBed/i.test(a.meta.stage||"")) {
          nights.add(new Date(a.ts*1000).toISOString().slice(0,10));
        }
      }
      crossSourceCtx = { totalRuns, nights: nights.size };
    } catch {}

    const { archetype, scores, raw: rawArch } = window.DwinityMusicArchetypes.deriveArchetype(raw);
    window._lastWrappedContext = { importId, source, archetype, scores };
    const slides = window.DwinityWrappedMusic.buildSlides({
      activities: raw, archetype, raw: rawArch, crossSourceCtx,
    });
    const result = await window.DwinityWrapped.play(slides);
    wrappedHandled = true;
    if (result.action === "connect") {
      const profile = window.Pseudonymizer.profiles[source] || window.Pseudonymizer.profiles.csv;
      openContributeFlow(importId, source, pseudo, profile);
      return;
    }
    panel.classList.remove('hidden');
  }
  if (source === "google_takeout" && window.DwinityGoogleArchetypes && window.DwinityWrapped && window.DwinityWrappedGoogle) {
    panel.innerHTML = '';
    // Cross-source context: Strava runs + Health nights.
    let crossSourceCtx = null;
    try {
      const allWorkouts = await api('/activities?kind=workout&limit=2000');
      const totalRuns = (allWorkouts || []).filter(a => /run/i.test((a.meta&&a.meta.type)||"")).length;
      const allHealth = await api('/activities?kind=health_metric&limit=2000');
      const nights = new Set();
      for (const a of (allHealth || [])) {
        if (a.meta && a.meta.metric === "sleep" && /InBed/i.test(a.meta.stage||"")) {
          nights.add(new Date(a.ts*1000).toISOString().slice(0,10));
        }
      }
      crossSourceCtx = { totalRuns, nights: nights.size };
    } catch {}

    const { archetype, scores, raw: rawArch } = window.DwinityGoogleArchetypes.deriveArchetype(raw);
    window._lastWrappedContext = { importId, source, archetype, scores };
    const slides = window.DwinityWrappedGoogle.buildSlides({
      activities: raw, archetype, raw: rawArch, crossSourceCtx,
    });
    const result = await window.DwinityWrapped.play(slides);
    wrappedHandled = true;
    if (result.action === "connect") {
      const profile = window.Pseudonymizer.profiles[source] || window.Pseudonymizer.profiles.csv;
      openContributeFlow(importId, source, pseudo, profile);
      return;
    }
    panel.classList.remove('hidden');
  }
  if (source === "apple_health" && window.DwinityHealthArchetypes && window.DwinityWrapped && window.DwinityWrappedHealth) {
    panel.innerHTML = '';
    // Pull Strava context cross-source — sum of running workouts across all the user's imports.
    let stravaContext = null;
    try {
      const allRuns = await api('/activities?kind=workout&limit=2000');
      const runs = (allRuns || []).filter(a => {
        const t = a.meta && a.meta.type;
        return /run/i.test(t || "");
      });
      if (runs.length) {
        const totalKm = runs.reduce((s, r) => s + (r.meta && r.meta.distance_m || 0) / 1000, 0);
        const earliest = Math.min(...runs.map(r => r.ts));
        const weeks = Math.max(1, (Date.now()/1000 - earliest) / (86400*7));
        stravaContext = { totalRuns: runs.length, weeklyKm: totalKm / weeks, totalKm };
      }
    } catch {}

    const { archetype, scores, raw: rawArch } = window.DwinityHealthArchetypes.deriveArchetype(raw);
    window._lastWrappedContext = { importId, source, archetype, scores };
    const slides = window.DwinityWrappedHealth.buildSlides({
      activities: raw, archetype, raw: rawArch, stravaContext,
    });
    const result = await window.DwinityWrapped.play(slides);
    wrappedHandled = true;
    if (result.action === "connect") {
      const profile = window.Pseudonymizer.profiles[source] || window.Pseudonymizer.profiles.csv;
      openContributeFlow(importId, source, pseudo, profile);
      return;
    }
    panel.classList.remove('hidden');
  }
  // If skipped or unhandled: fall through to render the preview below.
  // === /Wrapped Story ===

  // Aggregate diff stats across the full batch.
  const allStripped = new Set();
  const allHashed = new Set();
  const allBucketed = new Set();
  let tsShifts = 0, tsShiftsCount = 0;
  for (let i = 0; i < raw.length; i++) {
    const d = window.Pseudonymizer.diff(raw[i], pseudo[i], source);
    d.stripped.forEach(k => allStripped.add(k));
    d.hashed.forEach(k => allHashed.add(k));
    Object.keys(d.bucketed).forEach(k => allBucketed.add(k));
    if (d.ts_shift_sec) { tsShifts += d.ts_shift_sec; tsShiftsCount++; }
  }
  const avgTsShift = tsShiftsCount ? Math.round(tsShifts / tsShiftsCount / 60) : 0;
  const profile = window.Pseudonymizer.profiles[source] || window.Pseudonymizer.profiles.csv;

  panel.innerHTML = `
    <div class="text-[10px] font-mono text-neon-500 uppercase tracking-widest mb-3">🛡 ${vt("vjs.pseudoPreview", "Pseudonymisierung — Vorschau")}</div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
      <div><div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">Activities</div><div class="font-600 text-lg">${raw.length}</div></div>
      <div><div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt('vjs.piiStripped', 'PII gestrippt')}</div><div class="font-600 text-lg">${allStripped.size}</div></div>
      <div><div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt('vjs.idsHashed', 'IDs gehasht')}</div><div class="font-600 text-lg">${allHashed.size}</div></div>
      <div><div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt('vjs.fieldsBucketed', 'Felder gebucketed')}</div><div class="font-600 text-lg">${allBucketed.size}</div></div>
    </div>
    <div class="text-xs text-white/60 mb-3 font-mono">
      Profil: <span class="text-white/90">${source}</span>
      · ${vt("vjs.timeGranularity", "Zeit-Granularität")}: <span class="text-white/90">${profile.timeGranularity}</span>
      ${profile.gpsGrid ? `· GPS-Grid: <span class="text-white/90">${profile.gpsGrid}m</span>` : ''}
      ${avgTsShift ? `· Ø Zeit-Shift: <span class="text-white/90">${avgTsShift} min</span>` : ''}
    </div>
    <div class="mb-3">
      <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Sample (first 3 of ${raw.length})</div>
      <div class="space-y-2">
        ${sample.map(s => `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
            <div class="bg-red-500/5 border border-red-500/20 rounded p-2 overflow-auto">
              <div class="text-red-400 mb-1">RAW</div>
              <pre class="whitespace-pre-wrap break-all text-white/70">${escapeHtml(JSON.stringify(s.raw, null, 1))}</pre>
            </div>
            <div class="bg-neon-500/5 border border-neon-500/20 rounded p-2 overflow-auto">
              <div class="text-neon-500 mb-1">PSEUDONYM</div>
              <pre class="whitespace-pre-wrap break-all text-white/70">${escapeHtml(JSON.stringify(s.pseudo, null, 1))}</pre>
            </div>
          </div>`).join('')}
      </div>
    </div>
    <div class="flex flex-wrap gap-2 mt-4">
      <button data-download="${importId}" class="px-4 py-2 rounded-full bg-neon-500 text-void-950 font-bold hover:bg-neon-600 transition text-sm">
        ⬇ ${vt('vjs.downloadJson', 'Pseudonymisierte JSON runterladen')}
      </button>
      <button data-contribute="${importId}" class="px-4 py-2 rounded-full border border-neon-500/40 text-neon-500 hover:bg-neon-500/10 transition text-sm font-mono">
        📤 In DAO contribute
      </button>
      <a href="/docs/marketplace" class="px-4 py-2 rounded-full border border-white/15 text-white/70 hover:text-white hover:border-neon-500/40 transition text-sm font-mono">
        Was ist das? →
      </a>
    </div>
    <div class="mt-3 text-[11px] text-white/40 font-mono leading-relaxed">
      ${vt('vjs.pseudoNote', 'Browser-Pseudonymisierung — diese Daten verlassen deinen Computer nicht (außer du klickst Download oder Contribute). Beim Contribute wird die pseudonymisierte JSON server-side AES-verschlüsselt und in den DAO-Bucket geladen.')}
    </div>
  `;

  panel.querySelector('[data-download]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({
      source,
      pseudonymized_at: new Date().toISOString(),
      profile_used: profile,
      activities: pseudo,
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vault-${source}-${importId.slice(0, 8)}-pseudo.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  panel.querySelector('[data-contribute]').addEventListener('click', () => {
    openContributeFlow(importId, source, pseudo, profile);
  });
}

// ===== Contribute-to-DAO Flow (Phase 3b) =====

const MARKETPLACE_API = '/api/marketplace';

async function fetchMarketplace() {
  const r = await fetch(MARKETPLACE_API + '/pools', { credentials: 'include' });
  if (!r.ok) throw new Error(`pools: ${r.status}`);
  return r.json();
}

function snowtraceUrl(chainId, address) {
  const host = chainId === 43114 ? 'snowtrace.io' : 'testnet.snowtrace.io';
  return `https://${host}/address/${address}#writeContract`;
}

async function openContributeFlow(importId, source, pseudoActivities, profile) {
  let mp;
  try {
    mp = await fetchMarketplace();
  } catch (e) {
    showModal(`<div class="text-red-400">${vt('vjs.mpUnreachable', 'Marketplace nicht erreichbar: ')}${escapeHtml(e.message)}</div>`);
    return;
  }
  if (!mp.configured) {
    showModal(`
      <div class="text-[10px] font-mono text-yellow-400 uppercase tracking-widest mb-2">${vt('vjs.mpNotActive', '⚠ Marketplace noch nicht aktiv')}</div>
      <div class="text-2xl font-600 mb-3">Coming soon</div>
      <p class="text-white/70 text-sm leading-relaxed mb-4">
        ${vt('vjs.mpComingSoonBody', 'Die DataPool-Factory wird gerade auf Avalanche Fuji deployed. Sobald die Adressen gesetzt sind, kannst du deine pseudonymisierten Daten direkt on-chain contributen und am Revenue-Split (70/20/10) verdienen.')}
      </p>
      <p class="text-white/50 text-xs font-mono leading-relaxed">
        ${vt('vjs.mpComingSoonFoot', 'Bis dahin: Download-JSON funktioniert, du behältst die Hoheit über die Daten.')}
      </p>
    `);
    return;
  }
  showPoolPicker(mp, importId, source, pseudoActivities, profile);
}

function showPoolPicker(mp, importId, source, pseudoActivities, profile) {
  const cards = mp.pools.map(p => `
    <button data-pool="${escapeHtml(p.slug)}" class="text-left card card-hover w-full">
      <div class="font-600 mb-1">${escapeHtml(p.name)}</div>
      <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">
        ${escapeHtml(p.slug)} · ${escapeHtml(shortAddr(p.address))}
      </div>
      ${p.description ? `<div class="text-xs text-white/60">${escapeHtml(p.description)}</div>` : ''}
    </button>
  `).join('');

  showModal(`
    <div class="text-[10px] font-mono text-neon-500 uppercase tracking-widest mb-2">📤 DAO Contribute · ${vt('vjs.step1of2', 'Schritt 1 / 2')}</div>
    <div class="text-xl font-600 mb-1">${vt('vjs.choosePool', 'Pool wählen')}</div>
    <div class="text-xs text-white/50 font-mono mb-4">
      Chain: ${mp.chain_id === 43114 ? 'Avalanche C-Chain' : 'Avalanche Fuji'} · ${pseudoActivities.length} Activities
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">${cards}</div>
    <div class="text-[11px] text-white/40 font-mono leading-relaxed">
      ${vt('vjs.splitNote', 'Bei Purchase eines Buyers fließen 70 % an aktive Contributors (size-gewichtet), 20 % in die Pool-Treasury, 10 % an die Dwinity-Plattform.')}
    </div>
  `);

  document.querySelectorAll('[data-pool]').forEach(el => {
    el.addEventListener('click', () => {
      const slug = el.dataset.pool;
      const pool = mp.pools.find(p => p.slug === slug);
      submitContribution(mp, pool, importId, source, pseudoActivities, profile);
    });
  });
}

async function submitContribution(mp, pool, importId, source, pseudoActivities, profile) {
  showModal(`
    <div class="text-[10px] font-mono text-neon-500 uppercase tracking-widest mb-2">📤 DAO Contribute · ${vt('vjs.step2of2', 'Schritt 2 / 2')}</div>
    <div class="text-xl font-600 mb-3">${vt('vjs.encryptUpload', 'Verschlüssele und lade hoch …')}</div>
    <div class="text-xs text-white/50 font-mono">Pool: ${escapeHtml(pool.name)} · ${pseudoActivities.length} Activities</div>
    <div class="mt-4 h-1 rounded bg-white/10 overflow-hidden">
      <div class="h-full bg-neon-500 animate-pulse" style="width: 60%"></div>
    </div>
  `);

  let prep;
  try {
    const r = await fetch(MARKETPLACE_API + '/contribute/prepare', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        import_id:  importId,
        pool_slug:  pool.slug,
        activities: pseudoActivities,
        profile,
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      let msg = txt; try { msg = JSON.parse(txt).detail || msg; } catch {}
      throw new Error(`${r.status} ${msg}`);
    }
    prep = await r.json();
  } catch (e) {
    showModal(`
      <div class="text-red-400 font-mono text-sm mb-3">${vt('vjs.uploadFailed', 'Upload fehlgeschlagen')}</div>
      <div class="text-xs text-white/60 font-mono break-all">${escapeHtml(e.message)}</div>
    `);
    return;
  }

  showContributeReceipt(mp, prep);
}

function showContributeReceipt(mp, prep) {
  const txUrl = snowtraceUrl(prep.chain_id, prep.contract_call.to);
  const args = prep.contract_call.args;
  const hasWallet = !!(window.ethereum && (window.ethereum.selectedAddress || (window.ethereum.request)));
  showModal(`
    <div class="text-[10px] font-mono text-neon-500 uppercase tracking-widest mb-2">${vt('vjs.receiptKicker', '✓ Verschlüsselt + nach Storj geladen')}</div>
    <div class="text-xl font-600 mb-1">${vt('vjs.receiptTitle', 'Letzter Schritt: on-chain contribute()')}</div>
    <div class="text-xs text-white/60 font-mono mb-4">
      Pool: ${escapeHtml(prep.pool.name)} · ${escapeHtml(shortAddr(prep.pool.address))}
    </div>

    <div class="pro-only space-y-2 mb-4 text-xs font-mono">
      ${kvLine('commitment (bytes32)', args[0])}
      ${kvLine('storjKey (string)',    args[1])}
      ${kvLine('sizeBytes (uint256)',  String(args[2]))}
    </div>

    <div class="flex flex-wrap gap-2 mb-4">
      ${hasWallet ? `
        <button data-send-tx class="px-4 py-2 rounded-full bg-neon-500 text-void-950 font-bold text-sm hover:bg-neon-600 transition">
          🦊 ${vt('vjs.execInWallet', 'contribute() in Wallet ausführen')}
        </button>
      ` : ''}
      <a href="${txUrl}" target="_blank" rel="noopener" class="pro-only px-4 py-2 rounded-full ${hasWallet ? 'border border-white/15 text-white/70 hover:text-white hover:border-neon-500/40' : 'bg-neon-500 text-void-950 font-bold hover:bg-neon-600'} transition text-sm ${hasWallet ? 'font-mono' : ''}">
        ${vt('vjs.openSnowtrace', 'Snowtrace öffnen')}
      </a>
      <button data-copy-args class="pro-only px-4 py-2 rounded-full border border-white/15 text-white/70 hover:text-white hover:border-neon-500/40 transition text-sm font-mono">
        ${vt('vjs.copyArgs', 'Args kopieren')}
      </button>
    </div>

    <div data-tx-status class="hidden mb-3 text-xs font-mono"></div>

    <div class="text-[11px] text-white/40 font-mono leading-relaxed">
      ${hasWallet
        ? vt('vjs.txHintWallet', 'Klick auf "in Wallet ausführen" → MetaMask zeigt die Tx mit den drei Args oben → bestätigen.')
        : vt('vjs.txHintNoWallet', 'Kein Wallet erkannt — öffne Snowtrace, paste die Args manuell in den "Write Contract" Tab.')}
      ${vt('vjs.txHintFoot', 'Sobald die Tx mined ist, bist du Contributor und erhältst künftige Buyer-Splits proportional zu sizeBytes.')}
    </div>
  `);

  const copyBtn = document.querySelector('[data-copy-args]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify({
          to: prep.contract_call.to,
          function: prep.contract_call.function,
          args,
        }, null, 2));
        copyBtn.textContent = '✓ kopiert';
      } catch {
        copyBtn.textContent = '⚠ clipboard blockiert';
      }
    });
  }

  const sendBtn = document.querySelector('[data-send-tx]');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => sendContributeTx(prep));
  }
}

// ===== ABI encoder (just enough for contribute(bytes32,string,uint256)) =====
//
// Hand-rolled to avoid vendoring ethers.js (~120 KB) for one function call.
// The function selector is the first 4 bytes of keccak256("contribute(bytes32,string,uint256)")
// computed offline — verified against eth_hash. If you ever change the ABI,
// recompute via:
//   python -c "from eth_hash.auto import keccak; \
//              print(keccak(b'contribute(bytes32,string,uint256)').hex()[:8])"

const CONTRIBUTE_SELECTOR = '0x2094d624';

function _hexNoPrefix(s) { return s.startsWith('0x') ? s.slice(2) : s; }

function _utf8ToHex(str) {
  const bytes = new TextEncoder().encode(str);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return { hex: out, length: bytes.length };
}

function _padRight(hex, mod32 = 64) {
  const r = hex.length % mod32;
  return r === 0 ? hex : hex + '0'.repeat(mod32 - r);
}

function _toUint256Hex(n) {
  // BigInt-tolerant: handles plain numbers, BigInts, and decimal strings.
  return BigInt(n).toString(16).padStart(64, '0');
}

function encodeContributeCalldata(commitmentHex, storjKey, sizeBytes) {
  const commitment = _hexNoPrefix(commitmentHex);
  if (commitment.length !== 64) throw new Error('commitment must be 32 bytes');

  // Static head order: [commitment (slot0)] [offset_to_string (slot1)] [sizeBytes (slot2)]
  // Three slots = 0x60 = 96 bytes of head, so the string tail starts at 96.
  const offset = (3 * 32).toString(16).padStart(64, '0');
  const sizeHex = _toUint256Hex(sizeBytes);

  const { hex: keyHex, length: keyLen } = _utf8ToHex(storjKey);
  const lenHex = keyLen.toString(16).padStart(64, '0');
  const tail = lenHex + _padRight(keyHex);

  return CONTRIBUTE_SELECTOR + commitment + offset + sizeHex + tail;
}

async function sendContributeTx(prep) {
  const status = document.querySelector('[data-tx-status]');
  const sendBtn = document.querySelector('[data-send-tx]');
  if (!window.ethereum) {
    status.textContent = 'Kein Wallet (window.ethereum) gefunden.';
    status.className = 'mb-3 text-xs font-mono text-red-400';
    return;
  }
  status.classList.remove('hidden');
  status.className = 'mb-3 text-xs font-mono text-white/60';
  status.textContent = vt('vjs.openingWallet', '🦊 öffne Wallet …');
  if (sendBtn) sendBtn.disabled = true;

  // Surface "MetaMask hängt" within 8s — typical fail mode when a previous
  // popup is still queued and eth_requestAccounts never resolves.
  const hangTimer = setTimeout(() => {
    if (status && !status.textContent.startsWith('✓') && !status.textContent.startsWith(vt('vjs.errWord', 'Fehler'))) {
      status.className = 'mb-3 text-xs font-mono text-yellow-400';
      status.innerHTML = vt('vjs.mmHang', '⚠ MetaMask reagiert nicht — klick auf das MetaMask-Icon in deiner Browser-Toolbar. Falls dort eine offene Anfrage hängt, akzeptier oder lehn sie ab und versuch es nochmal.');
    }
  }, 8000);

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || !accounts.length) throw new Error(vt('vjs.noWalletAddr', 'keine Wallet-Adresse autorisiert'));
    const from = accounts[0];
    clearTimeout(hangTimer);

    // Auto-switch to the configured chain (Fuji = 0xa869, mainnet = 0xa86a).
    const chainHex = '0x' + prep.chain_id.toString(16);
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainHex }],
      });
    } catch (e) {
      // 4902 = chain not added — only auto-add Fuji to keep mainnet user-driven.
      if (e && e.code === 4902 && prep.chain_id === 43113) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId:           chainHex,
            chainName:         'Avalanche Fuji C-Chain',
            nativeCurrency:    { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
            rpcUrls:           ['https://api.avax-test.network/ext/bc/C/rpc'],
            blockExplorerUrls: ['https://testnet.snowtrace.io/'],
          }],
        });
      } else {
        throw e;
      }
    }

    const args = prep.contract_call.args;
    const data = encodeContributeCalldata(args[0], args[1], args[2]);

    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: prep.contract_call.to, data }],
    });

    const explorer = snowtraceUrl(prep.chain_id, prep.contract_call.to).replace(/\/address\/.*/, `/tx/${txHash}`);
    status.className = 'mb-3 text-xs font-mono text-neon-500';
    status.innerHTML = vt('vjs.txSent', '✓ Tx gesendet: ') + `<a href="${explorer}" target="_blank" rel="noopener" class="underline break-all">${shortAddr(txHash)}</a>`;
    if (sendBtn) sendBtn.textContent = vt('vjs.txSentMining', '✓ Tx gesendet — auf Mining warten');

    // 🎉 Confetti at the wallet button (top of viewport).
    if (window.DwinityFx) {
      try { window.DwinityFx.confetti({ count: 120, duration: 3500 }); } catch {}
    }

    // Show dashboard hero after Tx is sent. We don't wait for mining; the
    // user gets the celebration immediately, the snowtrace link confirms.
    if (window.DwinityDashboard) {
      try {
        const ctx = window._lastWrappedContext || {};
        let stats = null;
        try {
          const r = await fetch('/api/marketplace/pools/' + (prep.pool && prep.pool.slug || 'running-data') + '/stats', { credentials: 'include' });
          if (r.ok) stats = await r.json();
        } catch {}
        window.DwinityDashboard.show({
          archetype:         ctx.archetype || 'recreational',
          poolName:          prep.pool && prep.pool.name,
          poolAddress:       prep.pool && prep.pool.address,
          members:           stats && stats.members,
          contributionCount: null,
          txHash,
          chainId:           prep.chain_id,
        });
      } catch (e) { console.warn('dashboard.show failed', e); }
    }
  } catch (e) {
    clearTimeout(hangTimer);
    status.className = 'mb-3 text-xs font-mono text-red-400';
    // 4001 = user rejected; show a friendlier message for that one only.
    status.textContent = (e && e.code === 4001)
      ? vt('vjs.txRejected', 'Tx abgelehnt — du kannst es nochmal versuchen.')
      : vt('vjs.errPrefix', 'Fehler: ') + (e && e.message ? e.message : String(e));
    if (sendBtn) sendBtn.disabled = false;
  }
}

function kvLine(label, value) {
  return `
    <div class="grid grid-cols-[140px_1fr_auto] gap-2 items-start">
      <div class="text-white/40 uppercase tracking-widest text-[10px] mt-0.5">${escapeHtml(label)}</div>
      <div class="text-white/90 break-all">${escapeHtml(value)}</div>
      <button data-clip="${encodeURIComponent(value)}" class="text-white/40 hover:text-neon-500 text-[10px] uppercase tracking-widest" title="kopieren">⧉</button>
    </div>`;
}

function shortAddr(a) {
  return a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : (a || '');
}

// ===== Generic modal helper =====

function showModal(innerHtml) {
  let root = document.getElementById('vault-modal');
  if (!root) {
    root = document.createElement('div');
    root.id = 'vault-modal';
    root.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm';
    root.innerHTML = `
      <div class="card max-w-2xl w-full max-h-[85vh] overflow-auto relative">
        <button data-close-modal class="absolute top-3 right-3 text-white/40 hover:text-white text-lg">×</button>
        <div data-modal-body></div>
      </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', e => { if (e.target === root) closeModal(); });
    root.querySelector('[data-close-modal]').addEventListener('click', closeModal);
  }
  root.querySelector('[data-modal-body]').innerHTML = innerHtml;

  // Wire any clipboard links inside the modal body.
  root.querySelectorAll('[data-clip]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(decodeURIComponent(btn.dataset.clip));
        btn.textContent = '✓';
      } catch { btn.textContent = '⚠'; }
    });
  });
}

function closeModal() {
  const root = document.getElementById('vault-modal');
  if (root) root.remove();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== OAuth Live-Sync (Phase 2) =====
//
// Tradeoff: this UI explicitly walks the user out of the Self-Custody model
// for a given provider. We surface the disclaimer modal *before* redirecting
// to the provider's authorize endpoint so the consent is informed.

async function loadOauthProviders() {
  try {
    const r = await fetch('/api/vault/oauth/providers', { credentials: 'include' });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}

function renderOauthGrid(providers) {
  const section = document.getElementById('oauth-section');
  const grid = document.getElementById('oauth-grid');
  if (!section || !grid) return;
  // Hide section entirely if no provider is configured AND none connected.
  const anyVisible = providers.some(p => p.configured || p.connected);
  if (!anyVisible) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  grid.innerHTML = providers.map(p => {
    const icon = p.id === 'strava' ? '🏃' : p.id === 'spotify' ? '🎧' : '🔗';
    if (p.connected) {
      const lastSync = p.connection && p.connection.last_sync_at
        ? new Date(p.connection.last_sync_at * 1000).toLocaleString('de-DE')
        : vt('vjs.notYet', 'noch nicht');
      return `
        <div class="card" style="border-color: rgba(0,255,157,0.3)">
          <div class="flex items-center gap-3 mb-3">
            <div class="source-icon" aria-hidden="true">${icon}</div>
            <div>
              <div class="font-600">${escapeHtml(p.label)}</div>
              <div class="text-[10px] font-mono text-neon-500 uppercase tracking-widest">${vt('vjs.connected', 'verbunden')}</div>
            </div>
          </div>
          <div class="text-xs text-white/60 mb-3">${vt('vjs.lastSync', 'Letzter Sync: ')}${escapeHtml(lastSync)}</div>
          <button data-action="oauth-disconnect" data-provider="${p.id}" class="w-full px-3 py-2 rounded-full border border-white/15 text-white/70 hover:text-white hover:border-red-400/40 font-mono text-xs transition">// ${vt('vjs.disconnect', 'trennen')}</button>
        </div>`;
    }
    if (!p.configured) {
      return `
        <div class="card opacity-50">
          <div class="flex items-center gap-3 mb-3">
            <div class="source-icon" aria-hidden="true">${icon}</div>
            <div>
              <div class="font-600">${escapeHtml(p.label)}</div>
              <div class="text-[10px] font-mono text-white/40 uppercase tracking-widest">${vt('vjs.setupPending', 'Einrichtung ausstehend')}</div>
            </div>
          </div>
          <div class="text-xs text-white/40">${vt('vjs.oauthNotConfigured', 'OAuth-App muss vom Operator registriert werden.')}</div>
        </div>`;
    }
    return `
      <div class="card card-hover">
        <div class="flex items-center gap-3 mb-3">
          <div class="source-icon" aria-hidden="true">${icon}</div>
          <div>
            <div class="font-600">${escapeHtml(p.label)}</div>
            <div class="text-[10px] font-mono text-amber-400/80 uppercase tracking-widest">${vt('vjs.connectLabel', 'verbinden')}</div>
          </div>
        </div>
        <div class="text-xs text-white/60 mb-3">${vt('vjs.liveSyncCard', 'Live-Sync — kein erneuter ZIP-Upload nötig.')}</div>
        <button data-action="oauth-connect" data-provider="${p.id}" data-label="${escapeHtml(p.label)}" class="w-full px-3 py-2 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 hover:bg-amber-500/30 font-mono text-xs transition">→ ${vt('vjs.connectBtn', 'Verbinden')}</button>
      </div>`;
  }).join('');

  // Wire connect / disconnect handlers
  grid.querySelectorAll('[data-action="oauth-connect"]').forEach(btn => {
    btn.addEventListener('click', () => openOauthDisclaimer(btn.dataset.provider, btn.dataset.label));
  });
  grid.querySelectorAll('[data-action="oauth-disconnect"]').forEach(btn => {
    btn.addEventListener('click', () => disconnectOauth(btn.dataset.provider));
  });
}

// Track focus state so we can restore + trap it inside the modal.
let _oauthLastFocus = null;

function openOauthDisclaimer(provider, label) {
  const modal = document.getElementById('oauth-disclaimer');
  const titleProv = document.getElementById('oauth-disclaimer-provider');
  const goBtn = document.getElementById('oauth-disclaimer-go');
  const cancelBtn = document.getElementById('oauth-disclaimer-cancel');
  if (!modal || !titleProv || !goBtn) return;

  _oauthLastFocus = document.activeElement;  // restore on close
  titleProv.textContent = label || provider;
  goBtn.href = `/api/vault/oauth/${encodeURIComponent(provider)}/start`;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  // Move keyboard focus into the modal so screen-reader users land here.
  if (cancelBtn) cancelBtn.focus();
}

function closeOauthDisclaimer() {
  const modal = document.getElementById('oauth-disclaimer');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  // Restore focus to the trigger that opened us.
  if (_oauthLastFocus && typeof _oauthLastFocus.focus === 'function') {
    _oauthLastFocus.focus();
  }
  _oauthLastFocus = null;
}

// Trap Tab/Shift-Tab inside the modal while it's open (WCAG 2.1.2).
function _oauthTrapFocus(e) {
  const modal = document.getElementById('oauth-disclaimer');
  if (!modal || modal.classList.contains('hidden')) return;
  if (e.key !== 'Tab') return;
  const focusables = modal.querySelectorAll(
    'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last  = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}

async function disconnectOauth(provider) {
  if (!confirm(vt('vjs.confirmDisconnect', '{provider} trennen? Das gespeicherte OAuth-Token wird gelöscht.', { provider }))) return;
  try {
    const r = await fetch(`/api/vault/oauth/${encodeURIComponent(provider)}/disconnect`, {
      method: 'POST', credentials: 'include',
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await loadAndRenderOauth();
  } catch (e) {
    alert(vt('vjs.disconnectFailed', 'Trennung fehlgeschlagen: ') + e.message);
  }
}

async function loadAndRenderOauth() {
  const providers = await loadOauthProviders();
  renderOauthGrid(providers);
}

// Surface query-param feedback after OAuth callback redirect
function showOauthFeedback() {
  const sp = new URLSearchParams(location.search);
  const ok = sp.get('oauth_connected');
  const err = sp.get('oauth_error');
  if (!ok && !err) return;
  // strip query param so a refresh doesn't re-show the toast
  const url = new URL(location.href);
  url.searchParams.delete('oauth_connected');
  url.searchParams.delete('oauth_error');
  history.replaceState({}, '', url);
  if (ok) {
    alert(vt('vjs.oauthOk', '✓ {p} verbunden. Erster Sync läuft automatisch.', { p: ok }));
  } else if (err) {
    alert(vt('vjs.oauthErr', 'OAuth-Fehler: ') + err);
  }
}

async function init() {
  setupDropzone();
  await loadSources();
  // OAuth section + modal wiring (independent of login state — gracefully no-ops)
  const cancelBtn = document.getElementById('oauth-disclaimer-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeOauthDisclaimer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('oauth-disclaimer');
      if (modal && !modal.classList.contains('hidden')) closeOauthDisclaimer();
    }
    _oauthTrapFocus(e);
  });
  showOauthFeedback();
  const me = await refreshMe();
  if (me) {
    await loadImports();
    await loadAndRenderOauth();
    if (window.DwinityDashboard) {
      try {
        await window.DwinityDashboard.autoShowIfPending();
      } catch (e) { console.warn('[dashboard] autoShow failed', e); }
    } else {
      console.warn('[dashboard] DwinityDashboard not loaded');
    }
  }
  // Re-check after auth.js wallet-connect flow finishes.
  window.addEventListener('dwinity:wallet-changed', async () => {
    await refreshMe();
    await loadImports();
    if (window.DwinityDashboard) {
      try { await window.DwinityDashboard.autoShowIfPending(); } catch (e) { console.warn(e); }
    }
  });
}

init();
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "vjs.activities": "Activities",
  "vjs.distance": "Distance",
  "vjs.hours": "Hours",
  "vjs.sports": "Sports",
  "vjs.importOk": "Import successful",
  "vjs.csvSummary": "{n} rows · date column: {c}",
  "vjs.entries": "{n} entries",
  "vjs.pseudoPreview": "Pseudonymization — preview",
  "vjs.timeGranularity": "time granularity",
} });
