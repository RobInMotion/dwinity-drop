// Spotify Wrapped story builder.

(function (global) {
  function vt(key, fallback, vars) {
    let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
    if (!v || v === key) v = fallback;
    if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
    return v;
  }
  (window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
    "wm.hint.podcast": "Voices over beats — pumping in knowledge instead of dancing.",
    "wm.hint.loyalist": "You have one main artist — and they get almost everything.",
    "wm.hint.curator": "You pick deliberately — few skips, lots of artists.",
    "wm.hint.hopper": "You jump across every genre like a kid in a candy store.",
    "wm.hint.diver": "10+ hours a week — music is your second language.",
    "wm.hint.casual": "Music accompanies, it doesn't dominate.",
    "wm.totalTime": "Total listening time",
    "wm.plays": "{n} plays · {a} different artists",
    "wm.poolTag": "entering music-pool",
    "wm.youAre": "You're a",
    "wm.playedTimes": "played {n}×",
    "wm.topArtistPct": "That's {pct}% of all your plays. Clear no. 1 on the soundtrack of your life.",
    "wm.topTracks": "Your top 5 tracks",
    "wm.peak": "Peak: {h}:00",
    "wm.peakHint": "This is when you blast the most tracks. When does your soundtrack play?",
    "wm.weekly": "Average listening time per week",
    "wm.skipRate": "Skip rate:",
    "wm.skipOfTracks": "of your tracks",
    "wm.skipFinish": "— you listen to the end",
    "wm.skipHop": "— lots of track hopping",
    "wm.hoursMusic": "{n} h of music",
    "wm.workouts": "{n} workouts",
    "wm.nights": "{n} nights",
    "wm.crossQ1": "What do you listen to when your",
    "wm.crossQ2": "heart rate spikes",
    "wm.crossAnswer": "We can answer that",
    "wm.crossBuyers": "Buyers ask for exactly these bridges:",
    "wm.crossExample": "what music do marathon runners play in cardio zones?",
    "wm.crossOnly": "No one but Vault has that answer.",
    "wm.shareText": "According to Dwinity Vault I'm a {t} {i} — what are you?\n\nLoad your Spotify/Strava/Health data into a self-custody vault, join a data DAO, earn mDWIN.",
    "wm.official": "Make it official",
    "wm.ctaText": "Join the music-pool. Streaming platforms sell your listening patterns anyway — this way you get the cut instead.",
    "wm.ctaConnect": "Connect wallet &amp; join",
    "wm.ctaLater": "Later",
    "wm.shareArchetype": "Share your archetype",
  }});

  const LABELS = {
    "podcast-listener":  { icon: "🎙", title: "Podcast Listener",  hint: vt('wm.hint.podcast', "Stimmen statt Beats — Wissen reinpumpen statt Tanzen.") },
    "artist-loyalist":   { icon: "💜", title: "Artist Loyalist",   hint: vt('wm.hint.loyalist', "Du hast einen Hauptkünstler — und der bekommt fast alles.") },
    "playlist-curator":  { icon: "🎚", title: "Playlist Curator",  hint: vt('wm.hint.curator', "Du wählst gezielt aus — wenig skips, viele Künstler.") },
    "genre-hopper":      { icon: "🌈", title: "Genre Hopper",      hint: vt('wm.hint.hopper', "Du springst durch alle Genres wie ein Kid im Süßwarenladen.") },
    "deep-diver":        { icon: "🌊", title: "Deep Diver",        hint: vt('wm.hint.diver', "10 + Stunden pro Woche — Musik ist deine zweite Sprache.") },
    "casual-listener":   { icon: "🎧", title: "Casual Listener",   hint: vt('wm.hint.casual', "Musik begleitet, dominiert nicht.") },
  };

  function fmt(n) { return Math.round(n).toLocaleString("de-DE"); }
  function fmtHours(h) { return `${h.toFixed(1)} h`; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

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

  // 24-bar hour-of-day plot (purple).
  function hourBarsSvg(activities) {
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
      return `<rect x="${(P + i*barW + 1).toFixed(1)}" y="${(H - P - h).toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="#a78bfa" opacity="${(0.3 + 0.7*(v/max)).toFixed(2)}" rx="1"/>`;
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
    const ai = LABELS[archetype] || LABELS["casual-listener"];
    const listens = activities.filter(a => a.kind === "listen");
    const slides = [];

    // ===== Slide 1: Welcome =====
    slides.push({
      duration: 6500,
      html: `
        <div class="wrapped-counter" data-countup="${Math.round(raw.hours)}" data-countup-suffix=" h">0 h</div>
        <h2>${vt('wm.totalTime', 'Hörzeit insgesamt')}</h2>
        <p>${vt('wm.plays', '{n} Plays · {a} verschiedene Künstler', { n: fmt(raw.total), a: fmt(raw.uniqueArtists) })}</p>
        <div class="wrapped-pool-tag">${vt('wm.poolTag', 'betritt music-pool')}</div>
      `,
    });

    // ===== Slide 2: Archetype =====
    slides.push({
      duration: 8000,
      html: `
        <div class="wrapped-archetype-icon">${ai.icon}</div>
        <h1>${vt('wm.youAre', 'Du bist ein')}</h1>
        <h1 class="wrapped-accent">${ai.title}</h1>
        <p>${ai.hint}</p>
      `,
    });

    // ===== Slide 3: Top Artist =====
    if (raw.topArtist) {
      const pct = ((raw.topArtistCount / raw.total) * 100).toFixed(1);
      slides.push({
        duration: 8500,
        html: `
          <div class="wrapped-archetype-icon" style="font-size:clamp(3rem,9vw,5rem)">⭐</div>
          <h1 class="wrapped-accent">${escapeHtml(raw.topArtist)}</h1>
          <h2>${vt('wm.playedTimes', '{n}× gehört', { n: raw.topArtistCount })}</h2>
          <p>${vt('wm.topArtistPct', 'Das sind {pct} % aller deiner Plays. Klare Nr. 1 im Soundtrack deines Lebens.', { pct })}</p>
        `,
      });
    }

    // ===== Slide 4: Top 5 Tracks =====
    const topTracks = topByCount(listens.map(l => l.meta && l.meta.track), 5);
    if (topTracks.length) {
      const list = topTracks.map(([name, n], i) => `
        <div style="display:flex;justify-content:space-between;gap:1rem;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.06)">
          <span><span style="opacity:0.4;margin-right:0.5rem">${i+1}</span>${escapeHtml(name)}</span>
          <span style="opacity:0.6;font-family:'JetBrains Mono',monospace">${n}×</span>
        </div>
      `).join("");
      slides.push({
        duration: 9000,
        html: `
          <div class="wrapped-archetype-icon" style="font-size:clamp(3rem,8vw,5rem)">🎵</div>
          <h1>${vt('wm.topTracks', 'Deine Top-5 Tracks')}</h1>
          <div style="max-width:480px;width:100%;margin-top:1.5rem;text-align:left;font-size:0.95rem">
            ${list}
          </div>
        `,
      });
    }

    // ===== Slide 5: Listening time of day =====
    if (listens.length >= 50) {
      const counts = Array(24).fill(0);
      for (const l of listens) counts[new Date(l.ts*1000).getHours()]++;
      const peak = counts.indexOf(Math.max(...counts));
      slides.push({
        duration: 8500,
        html: `
          <div class="wrapped-archetype-icon" style="font-size:clamp(3rem,8vw,5rem)">🕐</div>
          <h1>${vt('wm.peak', 'Peak: {h}:00 Uhr', { h: peak.toString().padStart(2,"0") })}</h1>
          ${hourBarsSvg(listens)}
          <p>${vt('wm.peakHint', 'Hier knallst du die meisten Tracks rein. Wann läuft dein Soundtrack?')}</p>
        `,
      });
    }

    // ===== Slide 6: Skip + per-week =====
    slides.push({
      duration: 7500,
      html: `
        <div class="wrapped-counter" data-countup="${Math.round(raw.minPerWeek)}" data-countup-suffix=" min">0 min</div>
        <h2>${vt('wm.weekly', 'Hörzeit pro Woche im Schnitt')}</h2>
        <p>${vt('wm.skipRate', 'Skip-Rate:')} <strong class="wrapped-accent">${(raw.skipRate*100).toFixed(0)} %</strong> ${vt('wm.skipOfTracks', 'deiner Tracks')} ${raw.skipRate < 0.15 ? vt('wm.skipFinish', '— du hörst zu Ende') : vt('wm.skipHop', '— viele Track-Hopps')}</p>
      `,
    });

    // ===== Slide 7: Cross-source =====
    if (crossSourceCtx && (crossSourceCtx.totalRuns > 0 || crossSourceCtx.nights > 0)) {
      const bits = [];
      bits.push(vt('wm.hoursMusic', '{n} h Musik', { n: fmt(raw.hours) }));
      if (crossSourceCtx.totalRuns) bits.push(vt('wm.workouts', '{n} Workouts', { n: crossSourceCtx.totalRuns }));
      if (crossSourceCtx.nights)    bits.push(vt('wm.nights', '{n} Nächte', { n: crossSourceCtx.nights }));
      slides.push({
        duration: 9000,
        html: `
          <div class="wrapped-archetype-icon">🤝</div>
          <h1>${vt('wm.crossQ1', 'Was hörst du, wenn dein')} <span class="wrapped-accent">${vt('wm.crossQ2', 'Puls hochgeht')}</span>?</h1>
          <h2>${vt('wm.crossAnswer', "Wir können's beantworten")}</h2>
          <p>${bits.join(" · ")}. ${vt('wm.crossBuyers', 'Buyer fragen genau diese Brücken:')} <em>"${vt('wm.crossExample', 'welche Musik hören Marathon-Läufer in Cardio-Zonen?')}"</em> ${vt('wm.crossOnly', 'Niemand außer Vault hat diese Antwort.')}</p>
          <div class="wrapped-pool-tag">Cross-Source · multi-DAO</div>
        `,
      });
    }

    // ===== Slide 8: CTA =====
    const shareText = encodeURIComponent(
      vt('wm.shareText', `Ich bin laut Dwinity Vault ein {t} {i} — was bist du?\n\nLade deine Spotify/Strava/Health-Daten in einen Self-Custody-Vault, tritt einer Daten-DAO bei, verdiene mDWIN.`, { t: ai.title, i: ai.icon })
    );
    const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent("https://deaddrop.digital/vault")}`;
    slides.push({
      duration: 999_000,
      html: `
        <div class="wrapped-archetype-icon">⚡</div>
        <h1>${vt('wm.official', 'Mach es offiziell')}</h1>
        <p>${vt('wm.ctaText', 'Trag dich in den music-pool ein. Streaming-Plattformen verkaufen deine Hör-Patterns sowieso — du bekommst stattdessen den Anteil.')}</p>
        <div class="wrapped-cta">
          <button class="wrapped-cta-primary" data-wrapped-cta="connect">${vt('wm.ctaConnect', 'Wallet verbinden &amp; eintragen')}</button>
          <button class="wrapped-cta-secondary" data-wrapped-cta="skip">${vt('wm.ctaLater', 'Später')}</button>
        </div>
        <div style="margin-top:1.5rem">
          <a href="${twitterUrl}" target="_blank" rel="noopener"
             style="display:inline-flex;align-items:center;gap:0.5rem;color:rgba(255,255,255,0.55);font-size:0.85rem;text-decoration:none;border-bottom:1px dashed rgba(255,255,255,0.3);padding-bottom:1px">
            🐦 ${vt('wm.shareArchetype', 'Teile deinen Archetyp')}
          </a>
        </div>
      `,
    });

    return slides;
  }

  global.DwinityWrappedMusic = { buildSlides };
})(window);
