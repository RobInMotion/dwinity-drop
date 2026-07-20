// Google Takeout archetype classifier — derives one of 6 personas from
// YouTube watch + Search + Maps Timeline activities. Pure JS, deterministic.

(function (global) {
  function isWatch(a)  { return a && a.kind === "watch"  && a.meta && a.meta.service === "youtube"; }
  function isSearch(a) { return a && a.kind === "post"   && a.meta && a.meta.service === "google_search"; }
  function isVisit(a)  { return a && a.kind === "visit"  && a.meta && a.meta.service === "google_maps"; }

  function deriveArchetype(activities) {
    const watches  = activities.filter(isWatch);
    const searches = activities.filter(isSearch);
    const visits   = activities.filter(isVisit);

    // Per-week rates over the data window.
    const allTs = activities.map(a => a.ts).filter(t => t > 0);
    if (allTs.length === 0) {
      return {
        archetype: "balanced-explorer",
        scores:    { watch: 0, search: 0, visit: 0, variety: 0 },
        raw:       { watches: 0, searches: 0, visits: 0 },
      };
    }
    const earliest = Math.min(...allTs);
    const weeks = Math.max(1, (Date.now()/1000 - earliest) / (86400*7));

    // Channel/place variety
    const uniqueChannels = new Set(watches.map(w => w.meta.channel).filter(Boolean)).size;
    const uniquePlaces   = new Set(visits.map(v => v.meta.place_id || v.meta.name).filter(Boolean)).size;
    const totalPlaces    = visits.length;
    const placeRepeat    = totalPlaces > 0 ? uniquePlaces / totalPlaces : 0; // low = repeat same places

    const watchPerWk  = watches.length  / weeks;
    const searchPerWk = searches.length / weeks;
    const visitPerWk  = visits.length   / weeks;

    const scores = {
      watch:   Math.min(1, watchPerWk / 30),
      search:  Math.min(1, searchPerWk / 50),
      visit:   Math.min(1, visitPerWk / 20),
      variety: Math.min(1, uniqueChannels / 100),
    };

    let archetype;
    if (searchPerWk >= 30 && searches.length >= 100) {
      archetype = "knowledge-seeker";    // high search rate
    } else if (watchPerWk >= 25) {
      archetype = "youtube-binger";       // many videos
    } else if (uniquePlaces >= 50 && uniquePlaces > 30) {
      archetype = "place-collector";      // lots of unique places
    } else if (totalPlaces >= 20 && placeRepeat <= 0.3) {
      archetype = "creature-of-habit";    // few places but visited often
    } else if (uniqueChannels >= 50 && watches.length >= 200) {
      archetype = "wide-watcher";         // diverse YouTube viewing
    } else {
      archetype = "balanced-explorer";    // fallback
    }

    return {
      archetype, scores,
      raw: {
        watches:        watches.length,
        searches:       searches.length,
        visits:         visits.length,
        uniqueChannels, uniquePlaces, totalPlaces,
        weeks,
      },
    };
  }

  global.DwinityGoogleArchetypes = { deriveArchetype };
})(window);
