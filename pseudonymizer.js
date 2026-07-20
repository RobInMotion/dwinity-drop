// Browser-side Pseudonymizer for Dwinity Vault — Phase 3a MVP.
//
// Implements the per-source quantization profiles from
// docs/marketplace-design.md §3.1. Pure JS for now; Rust-WASM is a Phase-2
// performance optimization (current data sizes don't warrant it).
//
// Output is a *pseudonymized* copy of an Activity:
// - PII fields stripped
// - Timestamps coarsened (default: rounded to day)
// - Numeric fields bucketed (distance, duration, calories, HR, …)
// - Identifier fields hashed (track URI, place ID, …)
// - GPS coordinates snapped to a coarse grid (default: ~1 km)
//
// k-Anonymity gate is NOT enforced here — that's added in Phase 3b once the
// pool contracts are deployed and we can check peer counts on-chain. For
// now, the user just gets to see "what would be sent" so they can audit.

(function (global) {
  "use strict";

  const PROFILES = {
    strava: {
      timeGranularity: "day",
      durationBucket:  300,           // 5 min
      stripFields:     ["name"],
      // strava_id added to hashFields: OAuth Live-Sync writes the provider's
      // numeric activity-id into meta — leaving it raw enables re-id of any
      // public Strava activity (https://www.strava.com/activities/<id>).
      hashFields:      ["external_id", "strava_id"],
      numericRules: {
        distance_m:       { bucket: 500 },
        elevation_gain_m: { bucket: 50 },
        calories:         { bucket: 50 },
        avg_hr:           { bucket: 5 },
        max_hr:           { bucket: 5 },
      },
    },
    spotify: {
      timeGranularity: "day",
      durationBucket:  60,            // 1 min
      stripFields:     ["platform", "offline"],
      // track + artist + album also hashed: the URI alone is sufficient for
      // fingerprinting via rare tracks, but a marketplace buyer with playlist
      // access can match by (artist, album, ms) tuples too. Hashing all three
      // forces buyers to query by hash, breaking direct attribution.
      hashFields:      ["uri", "track", "artist", "album"],
      numericRules: {
        ms: { bucket: 60000 },        // 1 min
      },
    },
    apple_health: {
      timeGranularity: "day",
      stripFields:     ["source"],
      numericRules: {
        value: { bucket: 100 },       // step counts, calories etc.
      },
    },
    google_takeout: {
      timeGranularity: "day",
      stripFields:     ["address", "name", "url", "title"],
      hashFields:      ["place_id"],
      gpsGrid:         1000,          // ~1 km
    },
    csv: {
      timeGranularity: "day",
      // Common PII column names across CSV-providers (Bank, Netflix, Amazon …).
      stripFields: [
        "name", "first_name", "last_name", "fullname", "vorname", "nachname",
        "email", "e-mail", "phone", "telefon", "address", "adresse",
        "iban", "card_number", "kreditkarte", "konto",
        "verwendungszweck", "description", "memo", "notiz",
        "url", "link", "title",
      ],
    },
  };

  // ------------- helpers -------------

  function quantizeTs(ts, granularity) {
    if (!ts) return ts;
    if (granularity === "hour")   return Math.floor(ts / 3600)  * 3600;
    if (granularity === "minute") return Math.floor(ts / 60)    * 60;
    return Math.floor(ts / 86400) * 86400;
  }

  function quantizeNum(n, bucket) {
    if (n == null || n === "") return n;
    const v = Number(n);
    if (!isFinite(v)) return n;
    return Math.round(v / bucket) * bucket;
  }

  function quantizeGPS(lat, lng, gridMeters) {
    if (lat == null || lng == null) return null;
    const degPerMeter = 1 / 111000;
    const grid = gridMeters * degPerMeter;
    return {
      lat: +(Math.round(lat / grid) * grid).toFixed(3),
      lng: +(Math.round(lng / grid) * grid).toFixed(3),
    };
  }

  async function sha256Short(s) {
    const buf = new TextEncoder().encode(String(s));
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // ------------- core -------------

  async function pseudonymizeActivity(activity, source) {
    const profile = PROFILES[source] || PROFILES.csv;
    const meta = { ...(activity.meta || {}) };

    // 1. PII strip — drop disallowed fields entirely.
    for (const f of profile.stripFields || []) {
      // Case-insensitive match for CSV-style keys.
      for (const k of Object.keys(meta)) {
        if (k.toLowerCase() === f.toLowerCase()) delete meta[k];
      }
    }

    // 2. Hash identifier fields.
    for (const f of profile.hashFields || []) {
      if (meta[f]) meta[f] = "h_" + (await sha256Short(meta[f]));
    }

    // 3. Numeric quantization per source-specific rules.
    for (const [field, rule] of Object.entries(profile.numericRules || {})) {
      if (meta[field] != null) meta[field] = quantizeNum(meta[field], rule.bucket);
    }

    // 4. GPS snap (Google Takeout currently the only source with lat/lng).
    if (profile.gpsGrid && meta.lat != null && meta.lng != null) {
      const g = quantizeGPS(meta.lat, meta.lng, profile.gpsGrid);
      if (g) { meta.lat = g.lat; meta.lng = g.lng; }
    }

    return {
      kind: activity.kind,
      ts:   quantizeTs(activity.ts, profile.timeGranularity || "day"),
      duration_sec: profile.durationBucket && activity.duration_sec
        ? quantizeNum(activity.duration_sec, profile.durationBucket)
        : activity.duration_sec,
      meta,
    };
  }

  async function pseudonymizeBatch(activities, source) {
    const out = [];
    for (const a of activities) out.push(await pseudonymizeActivity(a, source));
    return out;
  }

  // Diff-aware preview: returns { stripped: [...keys], hashed: [...keys],
  // bucketed: {field: {from, to}}, ts_shift_sec, gps_shift_m }
  function diffActivity(orig, pseudo, source) {
    const profile = PROFILES[source] || PROFILES.csv;
    const stripped = [];
    const hashed = [];
    const bucketed = {};

    const origMeta = orig.meta || {};
    const pMeta = pseudo.meta || {};

    for (const k of Object.keys(origMeta)) {
      if (!(k in pMeta)) stripped.push(k);
    }
    for (const f of profile.hashFields || []) {
      if (origMeta[f] && pMeta[f] && pMeta[f] !== origMeta[f]) hashed.push(f);
    }
    for (const [field] of Object.entries(profile.numericRules || {})) {
      if (origMeta[field] != null && pMeta[field] !== origMeta[field]) {
        bucketed[field] = { from: origMeta[field], to: pMeta[field] };
      }
    }
    return {
      stripped,
      hashed,
      bucketed,
      ts_shift_sec: orig.ts - pseudo.ts,
    };
  }

  global.Pseudonymizer = {
    pseudonymize: pseudonymizeBatch,
    pseudonymizeOne: pseudonymizeActivity,
    diff: diffActivity,
    profiles: PROFILES,
  };
})(window);
