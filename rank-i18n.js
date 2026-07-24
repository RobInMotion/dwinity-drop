/* Dragon Rank i18n — the rk.* keys used by rank.js's vt() helper.
 * These previously lived DE-only in i18n.js, so the dynamic parts of the rank page
 * (XP breakdown labels, perk fallback, export button, "next rank at …") fell back to
 * German in English. Registered here DE+EN complete, order-proof (drained by i18n.js).
 * External file (not inline) to satisfy the CSP script-src 'self' rule.
 */
(window.DDI18n ? function (x) { window.DDI18n.register(x); }
              : function (x) { (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x); })({
  de: {
    "rk.errPrefix": "Fehler: ",
    "rk.activate": "🐉 Dragon Rank aktivieren",
    "rk.linkCopied": "✓ Link kopiert",
    "rk.dropsCreated": "Drops erstellt",
    "rk.dropDownloads": "Drop-Downloads",
    "rk.chatMessages": "Chat-Messages",
    "rk.chatRooms": "Chat-Rooms",
    "rk.proActivations": "Pro-Aktivierungen",
    "rk.dataContrib": "Daten-Beiträge",
    "rk.noEntries": "noch keine Einträge — sei der erste!",
    "rk.lbUnavailable": "Leaderboard nicht verfügbar",
    "rk.maxRank": "🏆 höchster Rang erreicht",
    "rk.nextAt": "ab",
    "rk.starterRank": "Starter-Rang · keine Perks",
    "rk.loading": "// lade …",
    "rk.downloaded": "✓ heruntergeladen",
    "rk.downloadJson": "JSON herunterladen",
    "rk.invitedBy": "du wurdest eingeladen von:",
    "rk.noReferrals": "noch keine Referrals — teile deinen Link oben",
  },
  en: {
    "rk.errPrefix": "Error: ",
    "rk.activate": "🐉 Activate Dragon Rank",
    "rk.linkCopied": "✓ Link copied",
    "rk.dropsCreated": "Drops created",
    "rk.dropDownloads": "Drop downloads",
    "rk.chatMessages": "Chat messages",
    "rk.chatRooms": "Chat rooms",
    "rk.proActivations": "Pro activations",
    "rk.dataContrib": "Data contributions",
    "rk.noEntries": "no entries yet — be the first!",
    "rk.lbUnavailable": "Leaderboard unavailable",
    "rk.maxRank": "🏆 highest rank reached",
    "rk.nextAt": "at",
    "rk.starterRank": "Starter rank · no perks",
    "rk.loading": "// loading …",
    "rk.downloaded": "✓ downloaded",
    "rk.downloadJson": "Download JSON",
    "rk.invitedBy": "you were invited by:",
    "rk.noReferrals": "no referrals yet — share your link above",
  },
});
