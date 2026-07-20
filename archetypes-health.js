// Apple-Health archetype classifier. Pure JS, deterministic.
//
// Reads raw activities (kind=health_metric and kind=workout) and assigns one
// of six archetypes based on sleep + activity patterns. Same shape as the
// Strava classifier so wrapped-health.js can consume it.

(function (global) {
  function isSleepStage(a) {
    return a && a.kind === "health_metric" && a.meta && a.meta.metric === "sleep";
  }
  function isInBed(a) {
    return isSleepStage(a) && /InBed/i.test(a.meta.stage || "");
  }
  function isStepCount(a) {
    return a && a.kind === "health_metric" && a.meta && a.meta.metric === "step_count";
  }
  function isWorkout(a) {
    return a && a.kind === "workout";
  }

  function median(values) {
    if (!values.length) return 0;
    const s = values.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  function stdev(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const sq = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(sq);
  }

  // Aggregate sleep duration per night (date the bed-interval ts falls on).
  function nightlySleepMinutes(activities) {
    const nights = {};
    for (const a of activities) {
      if (!isInBed(a)) continue;
      const dur = (a.duration_sec || 0) / 60;
      if (dur <= 0) continue;
      const d = new Date(a.ts * 1000);
      const day = d.toISOString().slice(0, 10);
      nights[day] = (nights[day] || 0) + dur;
    }
    // Filter plausible 1-14 h nights
    const out = {};
    for (const k in nights) {
      if (nights[k] >= 60 && nights[k] <= 14*60) out[k] = nights[k];
    }
    return out;
  }

  function bedtimeHours(activities) {
    // Earliest sleep stage of each "night cluster" → the hour the user
    // typically went to bed. Use AsleepCore/Unspecified preference if available,
    // else first InBed.
    const byNight = {};
    for (const a of activities) {
      if (!isSleepStage(a)) continue;
      const h = new Date(a.ts * 1000).getHours();
      // Treat "in bed" timestamps within 19:00-04:00 as the night-start.
      if (h < 4 || h >= 19) {
        const d = new Date(a.ts * 1000);
        const dayKey = (h < 12 ? new Date(d - 12*3600*1000) : d).toISOString().slice(0, 10);
        if (!byNight[dayKey] || a.ts < byNight[dayKey]) {
          byNight[dayKey] = a.ts;
        }
      }
    }
    const hours = Object.values(byNight).map(ts => {
      const d = new Date(ts * 1000);
      let h = d.getHours() + d.getMinutes() / 60;
      // Map "early-morning" (00-04) back to 24+ for averaging usefulness.
      if (h < 12) h += 24;
      return h;
    });
    return hours;
  }

  function totalSteps(activities) {
    let total = 0;
    let days = new Set();
    for (const a of activities) {
      if (!isStepCount(a)) continue;
      const v = parseFloat(a.meta && a.meta.value);
      if (!isFinite(v) || v <= 0) continue;
      total += v;
      const day = new Date(a.ts * 1000).toISOString().slice(0, 10);
      days.add(day);
    }
    return { total, dailyAvg: days.size ? total / days.size : 0, days: days.size };
  }

  function workoutsPerWeek(activities) {
    const wos = activities.filter(isWorkout);
    if (!wos.length) return 0;
    const earliest = Math.min(...wos.map(a => a.ts));
    const weeks = Math.max(1, (Date.now() / 1000 - earliest) / (86400 * 7));
    return wos.length / weeks;
  }

  function deriveArchetype(activities) {
    const nights = nightlySleepMinutes(activities);
    const nightDurations = Object.values(nights);
    const avgSleep = nightDurations.length
      ? nightDurations.reduce((s, v) => s + v, 0) / nightDurations.length
      : 0;
    const sleepStdev = stdev(nightDurations);

    const bedtimes = bedtimeHours(activities);
    const avgBedtime = bedtimes.length
      ? bedtimes.reduce((s, v) => s + v, 0) / bedtimes.length
      : null;

    const steps = totalSteps(activities);
    const wpw = workoutsPerWeek(activities);

    const scores = {
      sleepDuration:    Math.min(1, avgSleep / 480),       // 480 min = 8h target
      sleepConsistency: Math.max(0, 1 - sleepStdev / 120), // ±2h is noisy
      stepsDaily:       Math.min(1, steps.dailyAvg / 10000),
      activeWorkouts:   Math.min(1, wpw / 5),
      bedtimeHour:      avgBedtime,
    };

    let archetype;
    if (avgBedtime != null && avgBedtime >= 24) {
      archetype = "night-owl";       // bedtime 0:00 or later
    } else if (avgBedtime != null && avgBedtime < 22.5) {
      archetype = "early-bird";      // bedtime before 22:30
    } else if (avgSleep > 0 && avgSleep < 5 * 60) {
      archetype = "light-sleeper";   // <5h average
    } else if (avgSleep >= 7 * 60 && sleepStdev < 60) {
      archetype = "deep-sleeper";    // ≥7h + consistent
    } else if (wpw >= 3) {
      archetype = "heart-athlete";   // 3+ workouts/week
    } else if (steps.dailyAvg >= 12000) {
      archetype = "step-hero";       // 12k+ daily steps
    } else {
      archetype = "balanced";        // fallback
    }

    return {
      archetype, scores,
      raw: {
        nights:       nightDurations.length,
        avgSleepMin:  avgSleep,
        sleepStdev:   sleepStdev,
        avgBedtime:   avgBedtime,
        avgSteps:     steps.dailyAvg,
        stepDays:     steps.days,
        totalSteps:   steps.total,
        workouts:     activities.filter(isWorkout).length,
        wpw:          wpw,
      },
    };
  }

  global.DwinityHealthArchetypes = { deriveArchetype };
})(window);
