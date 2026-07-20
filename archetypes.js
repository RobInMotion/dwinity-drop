// Derive a running archetype from a list of activities (raw, pre-pseudonymizer).
// Pure function — no DOM, no network — easy to unit-test in a sandbox page.
//
// Activity input shape (from /api/vault/activities):
//   { id, import_id, kind, ts, duration_sec, meta: { type, name, distance_m, ... } }
//
// Output:
//   { archetype: "park-dauerlaeufer", scores: { distance, weekend, morning, frequency, speed } }
//
// No GPS-based locality scoring in v1 — Strava CSV doesn't include start coords.
// The "park-dauerlaeufer" archetype falls out of activity-name repetition instead.

(function (global) {
  const RUN_RX = /run/i;

  function isRun(a) {
    if (!a || a.kind !== "workout") return false;
    const t = a.meta && a.meta.type;
    return !t || RUN_RX.test(t);
  }

  function median(values) {
    if (!values.length) return 0;
    const s = values.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  function lastNDays(activities, n) {
    const cutoff = Math.floor(Date.now() / 1000) - n * 86400;
    return activities.filter(a => a.ts >= cutoff);
  }

  function nameRepetitionScore(runs) {
    // Park-Dauerläufer signal: same activity name repeats often (e.g. "Morgenlauf").
    if (!runs.length) return 0;
    const counts = {};
    for (const r of runs) {
      const n = (r.meta && r.meta.name || "").trim().toLowerCase();
      if (!n) continue;
      counts[n] = (counts[n] || 0) + 1;
    }
    const top = Math.max(0, ...Object.values(counts));
    return top / runs.length;
  }

  function deriveArchetype(activities) {
    const runs = (activities || []).filter(isRun);
    const total = runs.length;
    if (total === 0) {
      return {
        archetype: "recreational",
        scores: { distance: 0, weekend: 0, morning: 0, frequency: 0, speed: 0, locality: 0 },
      };
    }

    const distancesKm = runs
      .map(r => (r.meta && r.meta.distance_m) || 0)
      .filter(m => m > 0)
      .map(m => m / 1000);
    const longRuns = distancesKm.filter(km => km >= 30).length;
    const medianKm = median(distancesKm);

    const weekendCount = runs.filter(r => {
      const d = new Date(r.ts * 1000).getDay();
      return d === 0 || d === 6;
    }).length;

    const morningCount = runs.filter(r => new Date(r.ts * 1000).getHours() < 7).length;

    // Speed in min/km — only where we have both distance and duration.
    const paces = runs
      .filter(r => r.meta && r.meta.distance_m > 0 && r.duration_sec > 0)
      .map(r => (r.duration_sec / 60) / (r.meta.distance_m / 1000));
    const medianPace = median(paces); // min/km

    const last12mRuns = lastNDays(runs, 365).length;
    const localityFromName = nameRepetitionScore(runs);

    const scores = {
      distance:  Math.min(1, medianKm / 20),
      weekend:   weekendCount / total,
      morning:   morningCount / total,
      frequency: Math.min(1, last12mRuns / 200),
      // Speed: 1.0 = pace ≤ 4:00 min/km, 0.0 = pace ≥ 7:00 min/km.
      speed:     paces.length === 0 ? 0 : Math.max(0, Math.min(1, (7 - medianPace) / 3)),
      locality:  localityFromName,
    };

    let archetype;
    if (longRuns >= 3)                     archetype = "marathonjunkie";
    else if (medianKm >= 15)               archetype = "distance-beast";
    else if (scores.weekend >= 0.80)       archetype = "wochenend-krieger";
    else if (scores.morning >= 0.70)       archetype = "fruehaufsteher";
    else if (scores.locality >= 0.60)      archetype = "park-dauerlaeufer";
    else                                    archetype = "recreational";

    return { archetype, scores };
  }

  global.DwinityArchetypes = { deriveArchetype };
})(window);
