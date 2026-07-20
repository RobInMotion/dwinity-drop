// Spotify Extended Streaming archetype classifier.
//
// Activities are kind=listen with meta = { track, artist, album, ms, skipped,
// shuffle, kind: "music"|"podcast" }. Returns one of 6 archetypes.

(function (global) {
  function isListen(a) { return a && a.kind === "listen"; }
  function isMusic(a)  { return isListen(a) && a.meta && (a.meta.kind === "music" || !a.meta.kind); }
  function isPodcast(a){ return isListen(a) && a.meta && a.meta.kind === "podcast"; }

  function deriveArchetype(activities) {
    const listens = activities.filter(isListen);
    if (!listens.length) {
      return {
        archetype: "casual-listener",
        scores:    {},
        raw:       { total: 0, hours: 0 },
      };
    }
    const music    = listens.filter(isMusic);
    const podcasts = listens.filter(isPodcast);

    // Total minutes + skip rate
    let totalMs = 0, skips = 0;
    const byArtist = {};
    const byTrack  = {};
    for (const a of listens) {
      const ms = (a.meta && a.meta.ms) || ((a.duration_sec || 0) * 1000);
      totalMs += ms;
      if (a.meta && a.meta.skipped) skips++;
      const ar = a.meta && a.meta.artist;
      const tr = a.meta && a.meta.track;
      if (ar) byArtist[ar] = (byArtist[ar] || 0) + 1;
      if (tr) byTrack[tr]  = (byTrack[tr]  || 0) + 1;
    }
    const totalMin   = totalMs / 60000;
    const totalHours = totalMin / 60;
    const uniqueArtists = Object.keys(byArtist).length;
    const uniqueTracks  = Object.keys(byTrack).length;
    const skipRate = listens.length ? skips / listens.length : 0;

    // Top artist concentration
    const sortedArtists = Object.entries(byArtist).sort((a, b) => b[1] - a[1]);
    const topArtistPct = sortedArtists.length ? sortedArtists[0][1] / listens.length : 0;

    // Per-week average
    const earliest = Math.min(...listens.map(a => a.ts).filter(t => t > 0));
    const weeks = Math.max(1, (Date.now()/1000 - earliest) / (86400*7));
    const minPerWk = totalMin / weeks;

    const podcastShare = listens.length ? podcasts.length / listens.length : 0;

    const scores = {
      hoursTotal:      totalHours,
      minPerWeek:      minPerWk,
      uniqueArtists,
      uniqueTracks,
      topArtistPct,
      skipRate,
      podcastShare,
    };

    let archetype;
    if (podcastShare >= 0.4) {
      archetype = "podcast-listener";       // 40%+ podcasts
    } else if (topArtistPct >= 0.20 && listens.length >= 200) {
      archetype = "artist-loyalist";         // top artist >20% of plays
    } else if (uniqueArtists >= 200 && skipRate < 0.20) {
      archetype = "playlist-curator";        // wide selection, deliberate
    } else if (uniqueArtists >= 300) {
      archetype = "genre-hopper";            // very varied
    } else if (minPerWk >= 600) {
      archetype = "deep-diver";              // 10h+ per week
    } else {
      archetype = "casual-listener";         // fallback
    }

    return {
      archetype, scores,
      raw: {
        total:          listens.length,
        music:          music.length,
        podcasts:       podcasts.length,
        hours:          totalHours,
        minPerWeek:     minPerWk,
        uniqueArtists,
        uniqueTracks,
        topArtist:      sortedArtists[0] && sortedArtists[0][0],
        topArtistCount: sortedArtists[0] && sortedArtists[0][1],
        skipRate,
        podcastShare,
      },
    };
  }

  global.DwinityMusicArchetypes = { deriveArchetype };
})(window);
