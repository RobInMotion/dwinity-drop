// Apple-Health Wrapped story builder. Returns a slides array for DwinityWrapped.play().
// The final slide cross-links to Strava data if the user has any (cross-source magic).

(function (global) {
  function vt(key, fallback, vars) {
    let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
    if (!v || v === key) v = fallback;
    if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
    return v;
  }
  (window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
    "wh.hint-night-owl": "You're most likely to be found after midnight.",
    "wh.hint-early-bird": "You're in bed while most people are just heading out.",
    "wh.hint-light-sleeper": "Your sleep runs short — what's stealing your hours?",
    "wh.hint-deep-sleeper": "7 h+ and consistent — you rest like a pro.",
    "wh.hint-heart-athlete": "Your heart rate climbs regularly — working out is routine.",
    "wh.hint-step-hero": "12k+ steps a day — you move the world.",
    "wh.hint-balanced": "Sleep, steps, workouts — everything in a healthy middle range.",
    "wh.month-1": "January",
    "wh.month-2": "February",
    "wh.month-3": "March",
    "wh.month-4": "April",
    "wh.month-5": "May",
    "wh.month-6": "June",
    "wh.month-7": "July",
    "wh.month-8": "August",
    "wh.month-9": "September",
    "wh.month-10": "October",
    "wh.month-11": "November",
    "wh.month-12": "December",
    "wh.dow-mo": "Mo",
    "wh.dow-tu": "Tu",
    "wh.dow-we": "We",
    "wh.dow-th": "Th",
    "wh.dow-fr": "Fr",
    "wh.dow-sa": "Sa",
    "wh.dow-su": "Su",
    "wh.nights-recorded": "Nights recorded",
    "wh.welcome-sub": "{n} steps across {d} days. Apple Health kept track of it all.",
    "wh.enters-pool": "entering health-pool",
    "wh.you-are-a": "You are a",
    "wh.avg-sleep-night": "Average sleep per night",
    "wh.sleep-spread": "Across {n} nights · variance ±{s} min",
    "wh.very-regular": "Very consistent",
    "wh.long-short": "Sometimes long, sometimes short",
    "wh.bed-when": "When you're in bed",
    "wh.heatmap-legend": "Mon-Sun × 24 h. Brighter cells = went to bed more often.",
    "wh.typical-bedtime": "typical bedtime",
    "wh.midnight-club": "Midnight club member.",
    "wh.early-bed": "Early to bed, early to rise.",
    "wh.mainstream-sleeper": "Solid mainstream sleeper.",
    "wh.peak-note": "Peak: {m} {y} with {n} steps.",
    "wh.avg-steps-day": "Steps per day on average",
    "wh.run-and-sleep": 'You run <strong class="wrapped-accent">AND</strong> sleep',
    "wh.we-know-both": "We know both",
    "wh.strava-combo": '{r} workouts on Strava + {n} nights here. Buyers ask for exactly this combo: <em>"how does someone running {k} km/week sleep?"</em>',
    "wh.cross-source-tag": "Cross-source insights · exactly your value",
    "wh.workouts-health": "Workouts in Apple Health",
    "wh.workouts-sub": "{w} workouts per week. Your body moves — measurably.",
    "wh.share-text": "According to Dwinity Vault I'm a {t} {i} — what are you?\n\nLoad your Strava/Apple Health/Spotify data into your self-custody vault, join a data DAO, earn whenever someone buys anonymous insights.",
    "wh.make-official": "Make it official",
    "wh.cta-sub": "Join the health-pool. Your data gets aggregated anonymously, buyers pay for it, you earn your share in mDWIN.",
    "wh.cta-connect": "Connect wallet &amp; join",
    "wh.cta-later": "Later",
    "wh.share-archetype": "Share your archetype",
  }});

  const HEALTH_LABELS = {
    "night-owl":      { icon: "🦉", title: "Night Owl",        hint: vt('wh.hint-night-owl', "Du bist nach Mitternacht am ehesten zu finden.") },
    "early-bird":     { icon: "🐦", title: "Early Bird",       hint: vt('wh.hint-early-bird', "Du liegst, wenn die meisten erst feiern gehen.") },
    "light-sleeper":  { icon: "🌙", title: "Light Sleeper",    hint: vt('wh.hint-light-sleeper', "Schlaf ist bei dir kurz — was rauben dir Stunden?") },
    "deep-sleeper":   { icon: "💤", title: "Deep Sleeper",     hint: vt('wh.hint-deep-sleeper', "7 h+ und konstant — du ruhst wie ein Profi.") },
    "heart-athlete":  { icon: "❤️", title: "Heart Athlete",    hint: vt('wh.hint-heart-athlete', "Dein Puls steigt regelmäßig — Sport ist Routine.") },
    "step-hero":      { icon: "🚶", title: "Step Hero",        hint: vt('wh.hint-step-hero', "12k+ Schritte am Tag — du bewegst die Welt.") },
    "balanced":       { icon: "⚖️", title: "Balanced",         hint: vt('wh.hint-balanced', "Schlaf, Schritte, Sport — alles im gesunden Mittelfeld.") },
  };

  const MONTHS_DE = [vt('wh.month-1', "Januar"),vt('wh.month-2', "Februar"),vt('wh.month-3', "März"),vt('wh.month-4', "April"),vt('wh.month-5', "Mai"),vt('wh.month-6', "Juni"),vt('wh.month-7', "Juli"),vt('wh.month-8', "August"),vt('wh.month-9', "September"),vt('wh.month-10', "Oktober"),vt('wh.month-11', "November"),vt('wh.month-12', "Dezember")];

  function fmt(n)        { return Math.round(n).toLocaleString("de-DE"); }
  function fmtMin(m)     { return `${Math.floor(m/60)} h ${Math.round(m%60).toString().padStart(2,"0")} min`; }
  function fmtBedtime(h) {
    if (h == null) return "—";
    const hour = Math.floor(h) % 24;
    const min = Math.round((h - Math.floor(h)) * 60);
    return `${hour.toString().padStart(2,"0")}:${min.toString().padStart(2,"0")}`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  // Reuse a 7×24 heatmap renderer (sleep stages over weekday × hour).
  function sleepHeatmapSvg(activities) {
    const grid = Array.from({length: 7}, () => Array(24).fill(0));
    let max = 0;
    for (const a of activities) {
      if (a.kind !== "health_metric") continue;
      if (!a.meta || a.meta.metric !== "sleep") continue;
      if (!/InBed/i.test(a.meta.stage || "")) continue;
      const d = new Date(a.ts * 1000);
      const dow = d.getDay();
      const h = d.getHours();
      grid[dow][h]++;
      if (grid[dow][h] > max) max = grid[dow][h];
    }
    if (max === 0) return "";
    const order = [1,2,3,4,5,6,0];
    const labels = [vt('wh.dow-mo', "Mo"),vt('wh.dow-tu', "Di"),vt('wh.dow-we', "Mi"),vt('wh.dow-th', "Do"),vt('wh.dow-fr', "Fr"),vt('wh.dow-sa', "Sa"),vt('wh.dow-su', "So")];
    const cellW=18, cellH=14, padL=26, padT=16, padB=18;
    const W = padL + 24*cellW;
    const H = padT + 7*cellH + padB;
    let cells = "";
    for (let i=0;i<7;i++) {
      const dow = order[i];
      for (let h=0;h<24;h++) {
        const v = grid[dow][h];
        const op = v === 0 ? 0.05 : 0.15 + 0.85 * (v/max);
        cells += `<rect x="${padL+h*cellW+1}" y="${padT+i*cellH+1}" width="${cellW-2}" height="${cellH-2}" rx="2" fill="#a78bfa" opacity="${op.toFixed(2)}"/>`;
      }
    }
    let yLabels="";
    for (let i=0;i<7;i++) yLabels += `<text x="${padL-4}" y="${padT+i*cellH+cellH/2+3}" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.5)" font-family="JetBrains Mono, monospace">${labels[i]}</text>`;
    let xLabels="";
    for (let h=0;h<=24;h+=6) {
      xLabels += `<text x="${padL+h*cellW}" y="${H-4}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.5)" font-family="JetBrains Mono, monospace">${h.toString().padStart(2,"0")}</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:min(92vw,${W}px); height:auto; margin:1rem auto 0; display:block">${cells}${yLabels}${xLabels}</svg>`;
  }

  // Step-count monthly sparkline.
  function stepSparkline(activities) {
    const byMonth = {};
    for (const a of activities) {
      if (a.kind !== "health_metric" || !a.meta || a.meta.metric !== "step_count") continue;
      const v = parseFloat(a.meta.value);
      if (!isFinite(v) || v <= 0) continue;
      const d = new Date(a.ts * 1000);
      const k = d.getFullYear() + "-" + (d.getMonth()+1).toString().padStart(2,"0");
      byMonth[k] = (byMonth[k] || 0) + v;
    }
    const months = Object.keys(byMonth).sort();
    const last12 = months.slice(-12);
    if (last12.length < 2) return { svg: "", peak: null };
    const values = last12.map(k => byMonth[k]);
    const max = Math.max(...values, 1);
    const peakIdx = values.indexOf(Math.max(...values));
    const peakKey = last12[peakIdx];
    const W=480, H=90, P=4;
    const stepX = (W-2*P) / (last12.length-1);
    const points = values.map((v, i) => [P+i*stepX, H-P-(v/max)*(H-2*P)]);
    const linePath = points.map(([x,y],i)=>(i?"L":"M")+x.toFixed(1)+","+y.toFixed(1)).join(" ");
    const areaPath = linePath + ` L${points[points.length-1][0].toFixed(1)},${H-P} L${points[0][0].toFixed(1)},${H-P} Z`;
    return {
      svg: `
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:min(90vw,480px); height:90px; margin:1rem auto 0; display:block">
          <defs>
            <linearGradient id="stepfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.45"/>
              <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path d="${areaPath}" fill="url(#stepfill)"/>
          <path d="${linePath}" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linejoin="round"/>
          <circle cx="${points[peakIdx][0].toFixed(1)}" cy="${points[peakIdx][1].toFixed(1)}" r="5" fill="#facc15" stroke="#0c0d10" stroke-width="2"/>
        </svg>
      `,
      peak: { ym: peakKey, total: values[peakIdx] },
    };
  }

  function buildSlides({ activities, archetype, raw, stravaContext }) {
    const ai = HEALTH_LABELS[archetype] || HEALTH_LABELS.balanced;
    const slides = [];

    // Slide 1: Welcome
    slides.push({
      duration: 6500,
      html: `
        <div class="wrapped-counter" data-countup="${raw.nights}" data-countup-decimals="0">0</div>
        <h2>${vt('wh.nights-recorded', 'Nächte aufgezeichnet')}</h2>
        <p>${vt('wh.welcome-sub', '{n} Schritte über {d} Tage. Apple Health hat alles mitgeschrieben.', { n: fmt(raw.totalSteps), d: raw.stepDays })}</p>
        <div class="wrapped-pool-tag">${vt('wh.enters-pool', 'betritt health-pool')}</div>
      `,
    });

    // Slide 2: Archetype
    slides.push({
      duration: 8000,
      html: `
        <div class="wrapped-archetype-icon">${ai.icon}</div>
        <h1>${vt('wh.you-are-a', 'Du bist ein')}</h1>
        <h1 class="wrapped-accent">${ai.title}</h1>
        <p>${ai.hint}</p>
      `,
    });

    // Slide 3: Sleep duration
    if (raw.avgSleepMin > 0) {
      slides.push({
        duration: 7500,
        html: `
          <div class="wrapped-counter" data-countup="${(raw.avgSleepMin/60).toFixed(1)}" data-countup-suffix=" h" data-countup-decimals="1">0 h</div>
          <h2>${vt('wh.avg-sleep-night', 'Schnitt-Schlaf pro Nacht')}</h2>
          <p>${vt('wh.sleep-spread', 'Über {n} Nächte · Schwankung ±{s} min', { n: raw.nights, s: Math.round(raw.sleepStdev) })}</p>
          ${raw.sleepStdev < 60 ? `<div class="wrapped-pool-tag">${vt('wh.very-regular', 'Sehr regelmäßig')}</div>` : `<div class="wrapped-pool-tag">${vt('wh.long-short', 'Mal lang, mal kurz')}</div>`}
        `,
      });
    }

    // Slide 4: Sleep heatmap
    const heat = sleepHeatmapSvg(activities);
    if (heat) {
      slides.push({
        duration: 8500,
        html: `
          <div class="wrapped-archetype-icon" style="font-size:clamp(3rem,9vw,5rem)">🛌</div>
          <h1>${vt('wh.bed-when', 'Wann du im Bett bist')}</h1>
          ${heat}
          <p>${vt('wh.heatmap-legend', 'Mo-So × 24 h. Hellere Felder = häufiger ins Bett gegangen.')}</p>
        `,
      });
    }

    // Slide 5: Bedtime
    if (raw.avgBedtime != null) {
      slides.push({
        duration: 7000,
        html: `
          <div class="wrapped-archetype-icon">${raw.avgBedtime >= 24 ? "🦉" : "🌙"}</div>
          <h1>${fmtBedtime(raw.avgBedtime)}</h1>
          <h2>${vt('wh.typical-bedtime', 'typische Bettzeit')}</h2>
          <p>${raw.avgBedtime >= 24 ? vt('wh.midnight-club', 'Mitternachtsclub-Mitglied.') : raw.avgBedtime < 22 ? vt('wh.early-bed', 'Früh ins Bett, früh raus.') : vt('wh.mainstream-sleeper', 'Solider Mainstream-Sleeper.')}</p>
        `,
      });
    }

    // Slide 6: Steps + sparkline
    const sp = stepSparkline(activities);
    if (raw.avgSteps > 0) {
      const peakNote = sp.peak ? vt('wh.peak-note', 'Peak: {m} {y} mit {n} Schritten.', { m: MONTHS_DE[parseInt(sp.peak.ym.split("-")[1],10)-1], y: sp.peak.ym.split("-")[0], n: fmt(sp.peak.total) }) : "";
      slides.push({
        duration: 8500,
        html: `
          <div class="wrapped-counter" data-countup="${Math.round(raw.avgSteps)}">0</div>
          <h2>${vt('wh.avg-steps-day', 'Schritte pro Tag im Schnitt')}</h2>
          ${sp.svg}
          <p>${peakNote}</p>
        `,
      });
    }

    // Slide 7: Cross-source magic — show Strava overlap if available
    if (stravaContext && stravaContext.totalRuns > 0) {
      slides.push({
        duration: 8500,
        html: `
          <div class="wrapped-archetype-icon">🤝</div>
          <h1>${vt('wh.run-and-sleep', 'Du läufst <strong class="wrapped-accent">UND</strong> schläfst')}</h1>
          <h2>${vt('wh.we-know-both', 'Wir kennen beides')}</h2>
          <p>${vt('wh.strava-combo', '{r} Workouts auf Strava + {n} Nächte hier. Buyer fragen genau diese Kombi: <em>"wie schläft jemand der {k} km/Woche läuft?"</em>', { r: stravaContext.totalRuns, n: raw.nights, k: stravaContext.weeklyKm.toFixed(0) })}</p>
          <div class="wrapped-pool-tag">${vt('wh.cross-source-tag', 'Cross-Source-Insights · genau dein Wert')}</div>
        `,
      });
    } else if (raw.workouts > 0) {
      slides.push({
        duration: 7500,
        html: `
          <div class="wrapped-counter" data-countup="${raw.workouts}">0</div>
          <h2>${vt('wh.workouts-health', 'Workouts in Apple Health')}</h2>
          <p>${vt('wh.workouts-sub', '{w} Workouts pro Woche. Dein Körper bewegt sich messbar.', { w: raw.wpw.toFixed(1) })}</p>
        `,
      });
    }

    // Slide 8: CTA
    const shareText = encodeURIComponent(
      vt('wh.share-text', 'Ich bin laut Dwinity Vault ein {t} {i} — was bist du?\n\nLade deine Strava/Apple-Health/Spotify-Daten in deinen Self-Custody-Vault, tritt einer Daten-DAO bei, verdiene wenn jemand anonyme Insights kauft.', { t: ai.title, i: ai.icon })
    );
    const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent("https://deaddrop.digital/vault")}`;
    slides.push({
      duration: 999_000,
      html: `
        <div class="wrapped-archetype-icon">⚡</div>
        <h1>${vt('wh.make-official', 'Mach es offiziell')}</h1>
        <p>${vt('wh.cta-sub', 'Trag dich in den Health-Pool ein. Deine Daten werden anonym aggregiert, Buyer zahlen dafür, du bekommst Anteile in mDWIN.')}</p>
        <div class="wrapped-cta">
          <button class="wrapped-cta-primary" data-wrapped-cta="connect">${vt('wh.cta-connect', 'Wallet verbinden &amp; eintragen')}</button>
          <button class="wrapped-cta-secondary" data-wrapped-cta="skip">${vt('wh.cta-later', 'Später')}</button>
        </div>
        <div style="margin-top:1.5rem">
          <a href="${twitterUrl}" target="_blank" rel="noopener"
             onclick="event.stopPropagation();"
             style="display:inline-flex;align-items:center;gap:0.5rem;color:rgba(255,255,255,0.55);font-size:0.85rem;text-decoration:none;border-bottom:1px dashed rgba(255,255,255,0.3);padding-bottom:1px">
            🐦 ${vt('wh.share-archetype', 'Teile deinen Archetyp')}
          </a>
        </div>
      `,
    });

    return slides;
  }

  global.DwinityWrappedHealth = { buildSlides };
})(window);
