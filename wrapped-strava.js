// Strava-specific Wrapped story: builds slide definitions from raw activities
// + pool stats. Caller provides activities + stats; this returns a slides array
// suitable for DwinityWrapped.play().

(function (global) {
  function vt(key, fallback, vars) {
    let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
    if (!v || v === key) v = fallback;
    if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
    return v;
  }
  (window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
    "ws.archMarathonTitle": "Marathon Junkie",
    "ws.archMarathonHint": "Long distances are your element.",
    "ws.archDistanceHint": "You'd rather run far than often.",
    "ws.archWeekendTitle": "Weekend Warrior",
    "ws.archWeekendHint": "Mon-Fri: rest. Sat-Sun: full send.",
    "ws.archEarlyTitle": "Early Bird",
    "ws.archEarlyHint": "While everyone else hits snooze, you're already out running.",
    "ws.archParkTitle": "Park Regular",
    "ws.samePlace": "Same place, every time. You know every root by now.",
    "ws.archRecreationalHint": "Easy, regular, healthy.",
    "ws.month1": "January",
    "ws.month2": "February",
    "ws.month3": "March",
    "ws.month4": "April",
    "ws.month5": "May",
    "ws.month6": "June",
    "ws.month7": "July",
    "ws.month8": "August",
    "ws.month9": "September",
    "ws.month10": "October",
    "ws.month11": "November",
    "ws.month12": "December",
    "ws.dayMo": "Mo",
    "ws.dayTu": "Tu",
    "ws.dayWe": "We",
    "ws.dayTh": "Th",
    "ws.dayFr": "Fr",
    "ws.daySa": "Sa",
    "ws.daySu": "Su",
    "ws.top5": "Top 5%",
    "ws.top10": "Top 10%",
    "ws.top25": "Top 25%",
    "ws.top50": "Top 50%",
    "ws.activitiesCollected": "activities collected",
    "ws.uploadedPseudo": "Uploaded, pseudonymized, in your vault.",
    "ws.enteringPool": "entering running-pool",
    "ws.youAreA": "You are a",
    "ws.archShare": "{pct}% of pool members are just like you",
    "ws.totalRun": "run in total",
    "ws.weeklyAvg": "Average: {km} km per week",
    "ws.tierWeekly": "{tier} in the pool for weekly kilometers",
    "ws.pctBefore7": "{pct}% before 7 am",
    "ws.earlyLeague": "Early bird league",
    "ws.pctAfter18": "{pct}% after 6 pm",
    "ws.eveningRunner": "Evening runner",
    "ws.pctWeekend": "{pct}% on weekends",
    "ws.allDaytimes": "Spread across all times of day",
    "ws.noRoutine": "No fixed routine",
    "ws.heatmapCaption": "When you run — Mon-Sun × 24 hours. Brighter cells = more runs.",
    "ws.shareOfRuns": "{pct}% of your runs",
    "ws.differentRoutes": "different routes",
    "ws.varietyLover": "You like a change of scenery. Never gets boring.",
    "ws.inMonth": "in {month} {yr}",
    "ws.strongestMonth": "Your strongest month — highlighted in yellow. The line shows your last 12 months.",
    "ws.ofMembersPool": "of {n} in the running-pool",
    "ws.poolContribution": "Your contribution to the collective dataset. Bigger contributions → bigger shares in buyer splits.",
    "ws.shareIntro": "According to Dwinity Vault I'm a {title} {icon} — what are you?",
    "ws.shareBody": "Load your Strava/Spotify/health data into your self-custody vault, join a data DAO, earn whenever someone buys anonymous insights.",
    "ws.makeOfficial": "Make it official",
    "ws.ctaBody": "Register in the pool and your position is recorded on-chain. When someone buys pool data, you get your share.",
    "ws.ctaConnect": "Connect wallet &amp; register",
    "ws.ctaLater": "Later, just looking for now",
    "ws.shareTwitter": "Share your archetype on Twitter",
  }});

  const ARCHETYPE_LABELS = {
    "marathonjunkie":     { icon: "🏅", title: vt('ws.archMarathonTitle', 'Marathonjunkie'), hint: vt('ws.archMarathonHint', 'Lange Distanzen sind dein Element.') },
    "distance-beast":     { icon: "🦬", title: "Distance Beast",      hint: vt('ws.archDistanceHint', 'Du läufst lieber lang als oft.') },
    "wochenend-krieger":  { icon: "⚔️", title: vt('ws.archWeekendTitle', 'Wochenend-Krieger'), hint: vt('ws.archWeekendHint', 'Mo-Fr Pause, Sa-So Vollgas.') },
    "fruehaufsteher":     { icon: "🌅", title: vt('ws.archEarlyTitle', 'Frühaufsteher'), hint: vt('ws.archEarlyHint', 'Während andere snoozen, du läufst schon.') },
    "park-dauerlaeufer":  { icon: "🌳", title: vt('ws.archParkTitle', 'Park-Dauerläufer'), hint: vt('ws.samePlace', 'Same place, every time. Du kennst jede Wurzel.') },
    "recreational":       { icon: "🌀", title: "Recreational Runner", hint: vt('ws.archRecreationalHint', 'Locker, regelmäßig, gesund.') },
  };

  const MONTH_NAMES_DE = [
    vt('ws.month1','Januar'),vt('ws.month2','Februar'),vt('ws.month3','März'),vt('ws.month4','April'),vt('ws.month5','Mai'),vt('ws.month6','Juni'),
    vt('ws.month7','Juli'),vt('ws.month8','August'),vt('ws.month9','September'),vt('ws.month10','Oktober'),vt('ws.month11','November'),vt('ws.month12','Dezember')
  ];

  function fmtNumber(n) { return Math.round(n).toLocaleString("de-DE"); }

  function isRun(a) {
    if (!a || a.kind !== "workout") return false;
    const t = a.meta && a.meta.type;
    return !t || /run/i.test(t);
  }

  function totalDistanceKm(runs) {
    return runs.reduce((s, r) => s + ((r.meta && r.meta.distance_m) || 0) / 1000, 0);
  }

  function weeklyKm(runs) {
    if (!runs.length) return 0;
    const earliestTs = Math.min(...runs.map(r => r.ts));
    const spanWeeks = (Date.now() / 1000 - earliestTs) / (86400 * 7);
    return totalDistanceKm(runs) / Math.max(1, spanWeeks);
  }

  function morningRate(runs) {
    if (!runs.length) return 0;
    return runs.filter(r => new Date(r.ts * 1000).getHours() < 7).length / runs.length;
  }

  function eveningRate(runs) {
    if (!runs.length) return 0;
    return runs.filter(r => {
      const h = new Date(r.ts * 1000).getHours();
      return h >= 18;
    }).length / runs.length;
  }

  function weekendRate(runs) {
    if (!runs.length) return 0;
    return runs.filter(r => {
      const d = new Date(r.ts * 1000).getDay();
      return d === 0 || d === 6;
    }).length / runs.length;
  }

  // Tier label from a value vs cutoff dict {p50,p75,p90,p95}.
  function tierFor(value, cutoffs) {
    if (!cutoffs) return null;
    if (value >= (cutoffs.p95 ?? Infinity)) return vt('ws.top5', 'Top 5 %');
    if (value >= (cutoffs.p90 ?? Infinity)) return vt('ws.top10', 'Top 10 %');
    if (value >= (cutoffs.p75 ?? Infinity)) return vt('ws.top25', 'Top 25 %');
    if (value >= (cutoffs.p50 ?? Infinity)) return vt('ws.top50', 'Top 50 %');
    return null;
  }

  function monthlyKm(runs) {
    const byMonth = {};
    for (const r of runs) {
      const d = new Date(r.ts * 1000);
      const key = d.getFullYear() + "-" + (d.getMonth() + 1).toString().padStart(2, "0");
      byMonth[key] = (byMonth[key] || 0) + ((r.meta && r.meta.distance_m) || 0) / 1000;
    }
    return byMonth;
  }

  function topMonthByKm(runs) {
    const byMonth = monthlyKm(runs);
    const sorted = Object.entries(byMonth).sort((a, b) => b[1] - a[1]);
    return sorted[0]; // [yyyy-mm, km] or undefined
  }

  // 7×24 day-of-week × hour-of-day heatmap.
  function heatmapSvg(runs) {
    if (!runs.length) return "";
    // grid[dow][hour] = count of runs in that bucket
    const grid = Array.from({length: 7}, () => Array(24).fill(0));
    for (const r of runs) {
      const d = new Date(r.ts * 1000);
      const dow = d.getDay();   // 0=Sun
      const h   = d.getHours();
      grid[dow][h]++;
    }
    // German week order: Mo (1), Di (2), ..., So (0)
    const order = [1, 2, 3, 4, 5, 6, 0];
    const labels = [vt('ws.dayMo', 'Mo'), vt('ws.dayTu', 'Di'), vt('ws.dayWe', 'Mi'), vt('ws.dayTh', 'Do'), vt('ws.dayFr', 'Fr'), vt('ws.daySa', 'Sa'), vt('ws.daySu', 'So')];
    let max = 0;
    for (const row of grid) for (const v of row) if (v > max) max = v;
    if (max === 0) return "";

    const cellW = 18, cellH = 14, padL = 26, padT = 16, padB = 18;
    const W = padL + 24 * cellW;
    const H = padT + 7 * cellH + padB;

    let cells = "";
    for (let i = 0; i < 7; i++) {
      const dow = order[i];
      for (let h = 0; h < 24; h++) {
        const v = grid[dow][h];
        const intensity = v / max;
        const opacity = v === 0 ? 0.05 : 0.15 + 0.85 * intensity;
        cells += `<rect x="${padL + h*cellW + 1}" y="${padT + i*cellH + 1}" width="${cellW-2}" height="${cellH-2}" fill="#50e3c2" opacity="${opacity.toFixed(2)}" rx="2"/>`;
      }
    }
    let yLabels = "";
    for (let i = 0; i < 7; i++) {
      yLabels += `<text x="${padL - 4}" y="${padT + i*cellH + cellH/2 + 3}" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.5)" font-family="JetBrains Mono, monospace">${labels[i]}</text>`;
    }
    let xLabels = "";
    for (let h = 0; h <= 24; h += 6) {
      const x = padL + h * cellW;
      xLabels += `<text x="${x}" y="${H - 4}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.5)" font-family="JetBrains Mono, monospace">${h.toString().padStart(2,'0')}</text>`;
    }

    return `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"
           style="width:min(92vw,${W}px); height:auto; margin:1.25rem auto 0; display:block">
        ${cells}
        ${yLabels}
        ${xLabels}
      </svg>
    `;
  }

  // SVG sparkline: 12-month trailing, peak highlighted.
  function sparklineSvg(byMonth, peakKey) {
    const months = Object.keys(byMonth).sort(); // chronological
    const last12 = months.slice(-12);
    if (last12.length < 2) return "";
    const values = last12.map(k => byMonth[k]);
    const max = Math.max(...values, 1);
    const W = 480, H = 90, P = 4;
    const stepX = (W - 2*P) / (last12.length - 1);
    const points = values.map((v, i) => {
      const x = P + i * stepX;
      const y = H - P - (v / max) * (H - 2*P);
      return [x, y];
    });
    const linePath = points.map(([x,y], i) => (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1)).join(" ");
    const areaPath = linePath +
      ` L${points[points.length-1][0].toFixed(1)},${H-P} L${points[0][0].toFixed(1)},${H-P} Z`;
    const peakIdx = last12.indexOf(peakKey);
    const peakPt = peakIdx >= 0 ? points[peakIdx] : null;
    return `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:min(90vw,480px); height:90px; margin:1rem auto 0; display:block">
        <defs>
          <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#50e3c2" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#50e3c2" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#sparkfill)"/>
        <path d="${linePath}" fill="none" stroke="#50e3c2" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${peakPt ? `<circle cx="${peakPt[0].toFixed(1)}" cy="${peakPt[1].toFixed(1)}" r="5" fill="#facc15" stroke="#0c0d10" stroke-width="2"/>` : ""}
      </svg>
    `;
  }

  function nameRepetitionTop(runs) {
    const counts = {};
    for (const r of runs) {
      const n = (r.meta && r.meta.name || "").trim();
      if (!n) continue;
      counts[n] = (counts[n] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) return null;
    const [name, count] = sorted[0];
    return { name, count, share: count / runs.length };
  }

  // Estimate user's rank within pool. The contract uses sizeBytes-weighted shares,
  // not run-count, but for the demo a rank-from-run-count estimate is fine.
  function estimateRank(runCount, totalMembers) {
    if (!totalMembers || !runCount) return null;
    // Simple sigmoid: more runs → better rank (lower number).
    // 200 runs → top ~5%, 100 → top ~20%, 50 → top ~50%, 25 → top ~75%.
    const percentile = Math.min(0.95, 1 - 1 / (1 + Math.exp((runCount - 80) / 30)));
    return Math.max(1, Math.round(totalMembers * (1 - percentile)));
  }

  function buildSlides({ activities, archetype, scores, poolStats }) {
    const runs = (activities || []).filter(isRun);
    const N = runs.length;
    const totalKm = totalDistanceKm(runs);
    const weeklyAvgKm = weeklyKm(runs);
    const morning = morningRate(runs);
    const evening = eveningRate(runs);
    const weekend = weekendRate(runs);
    const topName = nameRepetitionTop(runs);

    const archInfo = ARCHETYPE_LABELS[archetype] || ARCHETYPE_LABELS.recreational;
    const archShare = poolStats && poolStats.archetypes && poolStats.archetypes[archetype];
    const archSharePct = archShare != null ? Math.round(archShare * 100) : null;
    const wkmCutoffs = poolStats && poolStats.percentiles && poolStats.percentiles.weekly_km;
    const wkmTier = tierFor(weeklyAvgKm, wkmCutoffs);

    const slides = [];

    // ===== Slide 1: Welcome =====
    slides.push({
      duration: 6000,
      html: `
        <div class="wrapped-counter" data-countup="${N}" data-countup-decimals="0">0</div>
        <h2>${vt('ws.activitiesCollected', 'Aktivitäten gesammelt')}</h2>
        <p>${vt('ws.uploadedPseudo', 'Hochgeladen, pseudonymisiert, in deinem Vault.')}</p>
        <div class="wrapped-pool-tag">${vt('ws.enteringPool', 'betritt running-pool')}</div>
      `,
    });

    // ===== Slide 2: Archetype reveal =====
    slides.push({
      duration: 8000,
      html: `
        <div class="wrapped-archetype-icon">${archInfo.icon}</div>
        <h1>${vt('ws.youAreA', 'Du bist ein')}</h1>
        <h1 class="wrapped-accent">${archInfo.title}</h1>
        <p>${archInfo.hint}</p>
        ${archSharePct != null
          ? `<div class="wrapped-pool-tag">${vt('ws.archShare', '{pct} % der Pool-Mitglieder sind wie du', { pct: archSharePct })}</div>`
          : ``}
      `,
    });

    // ===== Slide 3: Distance =====
    slides.push({
      duration: 7000,
      html: `
        <div class="wrapped-counter" data-countup="${Math.round(totalKm)}" data-countup-suffix=" km">0 km</div>
        <h2>${vt('ws.totalRun', 'insgesamt gelaufen')}</h2>
        <p>${vt('ws.weeklyAvg', 'Schnitt: {km} km pro Woche', { km: weeklyAvgKm.toFixed(1) })}</p>
        ${wkmTier
          ? `<div class="wrapped-pool-tag">${vt('ws.tierWeekly', '{tier} im Pool bei Wochenkilometern', { tier: wkmTier })}</div>`
          : ``}
      `,
    });

    // ===== Slide 4: Time-of-day with 7×24 heatmap =====
    const heatHeader =
      morning >= 0.5 ? { icon: "🌅", title: vt('ws.pctBefore7', '{pct} % vor 7 Uhr', { pct: Math.round(morning*100) }), sub: vt('ws.earlyLeague', 'Frühaufsteher-Liga') } :
      evening >= 0.5 ? { icon: "🌙", title: vt('ws.pctAfter18', '{pct} % ab 18 Uhr', { pct: Math.round(evening*100) }), sub: vt('ws.eveningRunner', 'Abendläufer') } :
      weekend >= 0.5 ? { icon: "⚔️", title: vt('ws.pctWeekend', '{pct} % am Wochenende', { pct: Math.round(weekend*100) }), sub: vt('ws.archWeekendTitle', 'Wochenend-Krieger') } :
                       { icon: "🌀", title: vt('ws.allDaytimes', 'Über alle Tageszeiten verteilt'), sub: vt('ws.noRoutine', 'Keine fixe Routine') };
    slides.push({
      duration: 9000,
      html: `
        <div class="wrapped-archetype-icon" style="font-size:clamp(3rem,9vw,5.5rem);">${heatHeader.icon}</div>
        <h1 style="font-size:clamp(1.6rem,4.5vw,3rem)">${heatHeader.title}</h1>
        ${heatmapSvg(runs)}
        <p style="margin-top:0.75rem;">${vt('ws.heatmapCaption', 'Wann du läufst — Mo-So × 24 Stunden. Hellere Felder = mehr Läufe.')}</p>
        <div class="wrapped-pool-tag">${heatHeader.sub}</div>
      `,
    });

    // ===== Slide 5: Geography (name repetition or variety) =====
    if (topName && topName.share >= 0.5) {
      slides.push({
        duration: 7000,
        html: `
          <div class="wrapped-archetype-icon">🌳</div>
          <h1>${topName.count}×</h1>
          <h2 class="wrapped-accent">${escapeHtml(topName.name)}</h2>
          <p>${vt('ws.samePlace', 'Same place, every time. Du kennst jede Wurzel.')}</p>
          <div class="wrapped-pool-tag">${vt('ws.shareOfRuns', '{pct} % deiner Läufe', { pct: Math.round(topName.share * 100) })}</div>
        `,
      });
    } else if (topName) {
      slides.push({
        duration: 7000,
        html: `
          <div class="wrapped-archetype-icon">🗺️</div>
          <h1>${Object.keys(runs.reduce((acc, r) => { const n=r.meta && r.meta.name; if(n) acc[n]=1; return acc; }, {})).length}</h1>
          <h2>${vt('ws.differentRoutes', 'verschiedene Strecken')}</h2>
          <p>${vt('ws.varietyLover', 'Du wechselst gern die Kulisse. Nichts wird langweilig.')}</p>
        `,
      });
    } else {
      // Skip if no names at all.
    }

    // ===== Slide 6: Trends — strongest month + 12-month sparkline =====
    const monthly = monthlyKm(runs);
    const top = topMonthByKm(runs);
    if (top) {
      const [ym, km] = top;
      const [yr, mo] = ym.split("-");
      const monthName = MONTH_NAMES_DE[parseInt(mo, 10) - 1];
      slides.push({
        duration: 8500,
        html: `
          <div class="wrapped-counter" data-countup="${Math.round(km)}" data-countup-suffix=" km">0 km</div>
          <h2>${vt('ws.inMonth', 'im {month} {yr}', { month: monthName, yr: yr })}</h2>
          ${sparklineSvg(monthly, ym)}
          <p>${vt('ws.strongestMonth', 'Dein stärkster Monat — gelb markiert. Die Linie zeigt deine letzten 12 Monate.')}</p>
        `,
      });
    }

    // ===== Slide 7: Pool position =====
    const members = poolStats && poolStats.members;
    if (members) {
      const rank = estimateRank(N, members);
      slides.push({
        duration: 7000,
        html: `
          <div class="wrapped-counter" data-countup="${rank}" data-countup-prefix="#">#0</div>
          <h2>${vt('ws.ofMembersPool', 'von {n} im running-pool', { n: fmtNumber(members) })}</h2>
          <p>${vt('ws.poolContribution', 'Dein Beitrag zum kollektiven Datensatz. Größere Beiträge → größere Anteile bei Buyer-Splits.')}</p>
        `,
      });
    }

    // ===== Slide 8: CTA + Share =====
    const shareText = encodeURIComponent(
      vt('ws.shareIntro', 'Ich bin laut Dwinity Vault ein {title} {icon} — was bist du?', { title: archInfo.title, icon: archInfo.icon }) +
      "\n\n" +
      vt('ws.shareBody', 'Lade deine Strava/Spotify/Health-Daten in deinen Self-Custody-Vault, tritt einer Daten-DAO bei, verdiene wenn jemand anonyme Insights kauft.')
    );
    const shareUrl = encodeURIComponent("https://deaddrop.digital/vault");
    const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;

    slides.push({
      duration: 999_000, // de facto manual exit only
      html: `
        <div class="wrapped-archetype-icon">⚡</div>
        <h1>${vt('ws.makeOfficial', 'Mach es offiziell')}</h1>
        <p>${vt('ws.ctaBody', 'Trag dich in den Pool ein, deine Position wird on-chain festgehalten. Wenn jemand Pool-Daten kauft, kriegst du deinen Anteil.')}</p>
        <div class="wrapped-cta">
          <button class="wrapped-cta-primary" data-wrapped-cta="connect">${vt('ws.ctaConnect', 'Wallet verbinden &amp; eintragen')}</button>
          <button class="wrapped-cta-secondary" data-wrapped-cta="skip">${vt('ws.ctaLater', 'Später, erst mal anschauen')}</button>
        </div>
        <div style="margin-top:1.5rem">
          <a href="${twitterUrl}" target="_blank" rel="noopener"
             style="display:inline-flex;align-items:center;gap:0.5rem;color:rgba(255,255,255,0.55);font-size:0.85rem;text-decoration:none;border-bottom:1px dashed rgba(255,255,255,0.3);padding-bottom:1px"
             >
            🐦 ${vt('ws.shareTwitter', 'Teile deinen Archetyp auf Twitter')}
          </a>
        </div>
      `,
    });

    return slides;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    })[c]);
  }

  global.DwinityWrappedStrava = { buildSlides };
})(window);
