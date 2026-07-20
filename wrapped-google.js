// Google Takeout Wrapped story builder.

(function (global) {
  function vt(key, fallback, vars) {
    let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
    if (!v || v === key) v = fallback;
    if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
    return v;
  }
  (window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
    "wg.arch-knowledge": "You ask Google by the minute — a walking library.",
    "wg.arch-binger": "When you say video, you probably mean hours.",
    "wg.arch-wide": "Hundreds of channels — you go broad, not deep.",
    "wg.arch-places": "More places than most travel guides.",
    "wg.arch-habit": "Not many places, but all on repeat — solid setup.",
    "wg.arch-balanced": "Search, Watch, Maps — you keep it all in balance.",
    "wg.events-captured": "Google events captured",
    "wg.summary": "{y} YouTube · {s} searches · {o} places",
    "wg.pools-enter": "entering location-pool · search-pool · video-pool",
    "wg.you-are": "You are a",
    "wg.no-channel-data": "No channel data",
    "wg.top-channels": "Your top 5 channels",
    "wg.videos-watched": "{n} videos watched",
    "wg.searches-count": "{n} searches",
    "wg.peak-time": "Peak time: {h}:00",
    "wg.search-hours-caption": "When you ask Google — averaged across all 24 hours.",
    "wg.no-place-names": "No place names",
    "wg.top-places": "Your top 5 places",
    "wg.unique-places": "{n} unique places in total",
    "wg.bit-workouts": "{n} workouts",
    "wg.bit-nights": "{n} nights",
    "wg.bit-places": "{n} places",
    "wg.cross-title-pre": "You bring",
    "wg.cross-title-accent": "the whole story",
    "wg.cross-subtitle": "What buyers would pay for this",
    "wg.cross-body": "{bits}. That's not one dataset — it's a <strong>linked</strong> one. Buyers ask for exactly this connection: \"where do people who search for marathon training hang out in the evening?\" or \"which places do early risers visit more often?\"",
    "wg.share-text": "According to Dwinity Vault I'm a {title} {icon} — what are you?\n\nLoad your Strava/Apple Health/Google/Spotify data into a self-custody vault, join a data DAO, earn mDWIN.",
    "wg.make-official": "Make it official",
    "wg.cta-body": "Add yourself to the matching pools — Location · Search · YouTube. Every pool its own buyer market, every contribution your share.",
    "wg.cta-connect": "Connect wallet &amp; join",
    "wg.cta-later": "Later",
    "wg.share-archetype": "Share your archetype",
  }});

  const LABELS = {
    "knowledge-seeker":  { icon: "🧠", title: "Knowledge Seeker",   hint: vt('wg.arch-knowledge', 'Du fragst Google im Minutentakt — eine wandelnde Bibliothek.') },
    "youtube-binger":    { icon: "📺", title: "YouTube Binger",     hint: vt('wg.arch-binger', 'Wenn du Video sagst, meinst du wahrscheinlich Stunden.') },
    "wide-watcher":      { icon: "🎬", title: "Wide Watcher",       hint: vt('wg.arch-wide', 'Hunderte Kanäle — du gehst breit, nicht tief.') },
    "place-collector":   { icon: "🗺", title: "Place Collector",    hint: vt('wg.arch-places', 'Mehr Orte als die meisten Reiseführer.') },
    "creature-of-habit": { icon: "🏠", title: "Creature of Habit",  hint: vt('wg.arch-habit', 'Wenig Orte, aber alles regelmäßig — solides Setup.') },
    "balanced-explorer": { icon: "🌐", title: "Balanced Explorer",  hint: vt('wg.arch-balanced', 'Search, Watch, Maps — alles ausgewogen genutzt.') },
  };

  function fmt(n) { return Math.round(n).toLocaleString("de-DE"); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  // Top-N entries by frequency from a list of strings (case-insensitive).
  function topByCount(items, n=5) {
    const counts = {};
    for (const x of items) {
      if (!x) continue;
      const k = String(x).trim();
      if (!k) continue;
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, n);
  }

  // Hour-of-day distribution as 24-bar mini chart.
  function hourBarsSvg(activities, color) {
    const bins = Array(24).fill(0);
    for (const a of activities) {
      if (!a.ts) continue;
      bins[new Date(a.ts*1000).getHours()]++;
    }
    const max = Math.max(1, ...bins);
    const W = 480, H = 80, P = 4;
    const barW = (W - 2*P) / 24;
    const bars = bins.map((v, i) => {
      const h = (v / max) * (H - 2*P);
      return `<rect x="${(P + i*barW + 1).toFixed(1)}" y="${(H - P - h).toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" opacity="${(0.3 + 0.7*(v/max)).toFixed(2)}" rx="1"/>`;
    }).join("");
    return `
      <svg viewBox="0 0 ${W} ${H+18}" preserveAspectRatio="xMidYMax meet" style="width:min(92vw,${W}px); height:auto; margin:1rem auto 0; display:block">
        ${bars}
        <text x="${P}" y="${H+13}" font-size="9" fill="rgba(255,255,255,0.5)" font-family="JetBrains Mono, monospace">00</text>
        <text x="${P + 12*barW}" y="${H+13}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.5)" font-family="JetBrains Mono, monospace">12</text>
        <text x="${W - P}" y="${H+13}" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.5)" font-family="JetBrains Mono, monospace">24</text>
      </svg>
    `;
  }

  function buildSlides({ activities, archetype, raw, crossSourceCtx }) {
    const ai = LABELS[archetype] || LABELS["balanced-explorer"];
    const watches  = activities.filter(a => a.kind === "watch"  && a.meta && a.meta.service === "youtube");
    const searches = activities.filter(a => a.kind === "post"   && a.meta && a.meta.service === "google_search");
    const visits   = activities.filter(a => a.kind === "visit"  && a.meta && a.meta.service === "google_maps");

    const slides = [];

    // ===== Slide 1: Welcome =====
    const total = watches.length + searches.length + visits.length;
    slides.push({
      duration: 6500,
      html: `
        <div class="wrapped-counter" data-countup="${total}">0</div>
        <h2>${vt('wg.events-captured', 'Google-Events erfasst')}</h2>
        <p>${vt('wg.summary', '{y} YouTube · {s} Suchen · {o} Orte', { y: fmt(watches.length), s: fmt(searches.length), o: fmt(visits.length) })}</p>
        <div class="wrapped-pool-tag">${vt('wg.pools-enter', 'betritt location-pool · search-pool · video-pool')}</div>
      `,
    });

    // ===== Slide 2: Archetype =====
    slides.push({
      duration: 8000,
      html: `
        <div class="wrapped-archetype-icon">${ai.icon}</div>
        <h1>${vt('wg.you-are', 'Du bist ein')}</h1>
        <h1 class="wrapped-accent">${ai.title}</h1>
        <p>${ai.hint}</p>
      `,
    });

    // ===== Slide 3: Top YouTube channels =====
    if (watches.length > 0) {
      const topChannels = topByCount(watches.map(w => w.meta.channel), 5);
      const list = topChannels.length
        ? topChannels.map(([name, n], i) => `
            <div style="display:flex;justify-content:space-between;gap:1rem;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.06)">
              <span><span style="opacity:0.4;margin-right:0.5rem">${i+1}</span>${escapeHtml(name)}</span>
              <span style="opacity:0.6;font-family:'JetBrains Mono',monospace">${n}×</span>
            </div>
          `).join("")
        : `<div style='opacity:0.4'>${vt('wg.no-channel-data', 'Keine Channel-Daten')}</div>`;
      slides.push({
        duration: 9000,
        html: `
          <div class="wrapped-archetype-icon" style="font-size:clamp(3rem,8vw,5rem)">📺</div>
          <h1>${vt('wg.top-channels', 'Deine Top-5 Channels')}</h1>
          <div style="max-width:480px;width:100%;margin-top:1.5rem;text-align:left;font-size:0.95rem">
            ${list}
          </div>
          <div class="wrapped-pool-tag" style="margin-top:1.5rem">${vt('wg.videos-watched', '{n} Videos angeschaut', { n: fmt(watches.length) })}</div>
        `,
      });
    }

    // ===== Slide 4: Search hourly distribution =====
    if (searches.length >= 30) {
      const hourBars = hourBarsSvg(searches, "#facc15");
      // Top hour
      const counts = Array(24).fill(0);
      for (const s of searches) counts[new Date(s.ts*1000).getHours()]++;
      const topHour = counts.indexOf(Math.max(...counts));
      slides.push({
        duration: 8500,
        html: `
          <div class="wrapped-archetype-icon" style="font-size:clamp(3rem,8vw,5rem)">🔍</div>
          <h1>${vt('wg.searches-count', '{n} Suchen', { n: fmt(searches.length) })}</h1>
          <h2>${vt('wg.peak-time', 'Peak-Zeit: {h}:00 Uhr', { h: topHour.toString().padStart(2,"0") })}</h2>
          ${hourBars}
          <p>${vt('wg.search-hours-caption', 'Wann du Google fragst — über alle 24 Stunden gemittelt.')}</p>
        `,
      });
    }

    // ===== Slide 5: Top places =====
    if (visits.length >= 5) {
      const topPlaces = topByCount(visits.map(v => v.meta.name).filter(Boolean), 5);
      const list = topPlaces.length
        ? topPlaces.map(([name, n], i) => `
            <div style="display:flex;justify-content:space-between;gap:1rem;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.06)">
              <span><span style="opacity:0.4;margin-right:0.5rem">${i+1}</span>${escapeHtml(name)}</span>
              <span style="opacity:0.6;font-family:'JetBrains Mono',monospace">${n}×</span>
            </div>
          `).join("")
        : `<div style='opacity:0.4'>${vt('wg.no-place-names', 'Keine Ortsnamen')}</div>`;
      slides.push({
        duration: 9000,
        html: `
          <div class="wrapped-archetype-icon" style="font-size:clamp(3rem,8vw,5rem)">📍</div>
          <h1>${vt('wg.top-places', 'Deine Top-5 Orte')}</h1>
          <div style="max-width:480px;width:100%;margin-top:1.5rem;text-align:left;font-size:0.95rem">
            ${list}
          </div>
          <div class="wrapped-pool-tag" style="margin-top:1.5rem">${vt('wg.unique-places', '{n} verschiedene Orte gesamt', { n: raw.uniquePlaces })}</div>
        `,
      });
    }

    // ===== Slide 6: Cross-source =====
    if (crossSourceCtx && (crossSourceCtx.totalRuns > 0 || crossSourceCtx.nights > 0)) {
      const bits = [];
      if (crossSourceCtx.totalRuns) bits.push(vt('wg.bit-workouts', '{n} Workouts', { n: crossSourceCtx.totalRuns }));
      if (crossSourceCtx.nights)    bits.push(vt('wg.bit-nights', '{n} Nächte', { n: crossSourceCtx.nights }));
      bits.push(vt('wg.searches-count', '{n} Suchen', { n: fmt(searches.length || 0) }));
      if (visits.length)            bits.push(vt('wg.bit-places', '{n} Orte', { n: visits.length }));
      slides.push({
        duration: 9000,
        html: `
          <div class="wrapped-archetype-icon">🤝</div>
          <h1>${vt('wg.cross-title-pre', 'Du gibst')} <span class="wrapped-accent">${vt('wg.cross-title-accent', 'die ganze Story')}</span></h1>
          <h2>${vt('wg.cross-subtitle', 'Was Buyer dafür zahlen würden')}</h2>
          <p>${vt('wg.cross-body', '{bits}. Das ist nicht ein Datensatz — das ist ein <strong>verknüpfter</strong>. Buyer fragen genau diese Verbindung: "wo sind Leute, die nach Marathon-Training suchen, abends?" oder "welche Orte besuchen Frühaufsteher öfter?"', { bits: bits.join(" · ") })}</p>
          <div class="wrapped-pool-tag">Cross-Source · Multi-DAO Member</div>
        `,
      });
    }

    // ===== Slide 7: CTA =====
    const shareText = encodeURIComponent(
      vt('wg.share-text', 'Ich bin laut Dwinity Vault ein {title} {icon} — was bist du?\n\nLade deine Strava/Apple-Health/Google/Spotify-Daten in einen Self-Custody-Vault, tritt einer Daten-DAO bei, verdiene mDWIN.', { title: ai.title, icon: ai.icon })
    );
    const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent("https://deaddrop.digital/vault")}`;
    slides.push({
      duration: 999_000,
      html: `
        <div class="wrapped-archetype-icon">⚡</div>
        <h1>${vt('wg.make-official', 'Mach es offiziell')}</h1>
        <p>${vt('wg.cta-body', 'Trag dich in die passenden Pools ein — Location · Search · YouTube. Jeder Pool ein eigener Buyer-Markt, jede Contribution dein Anteil.')}</p>
        <div class="wrapped-cta">
          <button class="wrapped-cta-primary" data-wrapped-cta="connect">${vt('wg.cta-connect', 'Wallet verbinden &amp; eintragen')}</button>
          <button class="wrapped-cta-secondary" data-wrapped-cta="skip">${vt('wg.cta-later', 'Später')}</button>
        </div>
        <div style="margin-top:1.5rem">
          <a href="${twitterUrl}" target="_blank" rel="noopener"
             onclick="event.stopPropagation();"
             style="display:inline-flex;align-items:center;gap:0.5rem;color:rgba(255,255,255,0.55);font-size:0.85rem;text-decoration:none;border-bottom:1px dashed rgba(255,255,255,0.3);padding-bottom:1px">
            🐦 ${vt('wg.share-archetype', 'Teile deinen Archetyp')}
          </a>
        </div>
      `,
    });

    return slides;
  }

  global.DwinityWrappedGoogle = { buildSlides };
})(window);
