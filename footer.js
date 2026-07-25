/*
 * Unified site footer — single source of truth for every page.
 *
 * Usage:
 *   <div id="site-footer"></div>
 *   <script src="/footer.js"></script>     (near the end of <body>)
 *
 * Why this exists: before it, only 7 of 18 pages carried a footer and each
 * one differed. Impressum was reachable from 2 of 14 user-facing pages and
 * Datenschutz from 3 — in Germany both must be reachable from every page.
 * Putting them in one shared component is the only way that stays true as
 * pages get added.
 *
 * Content is the homepage footer, which was the most complete of the seven —
 * nothing was dropped, the links were only made absolute so they work from
 * any depth.
 *
 * No state, no re-render: unlike nav.js this is built once and never touched
 * again, so there are no zones to keep apart.
 */
(function () {
  var mount = document.getElementById("site-footer");
  if (!mount) return;

  var year = 2026;

  function ext(href, label, key, aria) {
    return '<a href="' + href + '" target="_blank" rel="noopener"' +
      (aria ? ' aria-label="' + aria + '"' : "") +
      (key ? ' data-i18n="' + key + '"' : "") +
      ' class="hover:text-white transition">' + label + "</a>";
  }
  function link(href, label, key) {
    return '<a href="' + href + '"' + (key ? ' data-i18n="' + key + '"' : "") +
      ' class="hover:text-white transition">' + label + "</a>";
  }
  function social(href, label, aria, path) {
    return '<a href="' + href + '" target="_blank" rel="noopener" aria-label="' + aria + '" ' +
      'class="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-neon-500 transition">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + path + '"/></svg>' +
      label + "</a>";
  }

  var X_PATH = "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";
  var TG_PATH = "M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.97 9.28c-.146.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.643-.204-.657-.643.136-.953l11.566-4.458c.537-.196 1.006.128.832.938z";
  var IG_PATH = "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z";
  var LI_PATH = "M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z";

  mount.innerHTML =
  '<footer class="border-t border-white/5 py-12 mt-16">' +
    '<div class="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">' +
      '<div>' +
        '<div class="flex items-center gap-2 font-sans font-semibold text-lg mb-1">' +
          '<img src="/img/deaddrop-logo.svg" alt="" class="w-10 h-10 object-contain fx-logo-glow" />' +
          'Dead <span class="text-neon-500">Drop</span>' +
        "</div>" +
        '<div class="text-sm text-white/50">' +
          '<span data-i18n="footer.subtitle">powered by</span> ' +
          '<a href="https://dwinity.com" target="_blank" rel="noopener" class="hover:text-white underline-offset-2 hover:underline">Dwinity</a>' +
        "</div>" +
      "</div>" +
      '<nav class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">' +
        ext("https://dwinity.shop", "Ecosystem", "footer.ecosystem") +
        ext("https://dwinity.shop/crypto-chat/", "Chat 1.0") +
        link("/chat", "Chat 2.0") +
        link("/impressum.html", "Impressum", "footer.imprint") +
        link("/datenschutz.html", "Datenschutz", "footer.privacy") +
        link("mailto:hello@dwinity.de", "Kontakt", "footer.contact") +
      "</nav>" +
    "</div>" +
    '<div class="max-w-6xl mx-auto px-6 mt-8 flex flex-wrap items-center gap-3 md:gap-5">' +
      '<span class="text-[10px] font-mono uppercase tracking-widest text-white/35" data-i18n="footer.follow">Follow:</span>' +
      social("https://x.com/dwinity_eco", "@dwinity_eco", "X (Twitter)", X_PATH) +
      social("https://t.me/dwinity_eco", "t.me/dwinity_eco", "Telegram", TG_PATH) +
      social("https://www.instagram.com/dwinity_eco/", "@dwinity_eco", "Instagram", IG_PATH) +
      social("https://www.linkedin.com/company/dwinity-ip-gmbh/", "LinkedIn", "LinkedIn", LI_PATH) +
    "</div>" +
    '<div class="max-w-6xl mx-auto px-6 mt-8 pt-8 border-t border-white/5 text-xs text-white/35 font-mono">' +
      '<span data-i18n="footer.copy">© ' + year + ' Dead Drop · powered by Dwinity · deaddrop.digital · Zero-Knowledge by design</span>' +
    "</div>" +
  "</footer>";

  // The markup is built after i18n.js has already applied translations, so the
  // fresh nodes need a pass of their own.
  if (window.DDI18n && window.DDI18n.apply) window.DDI18n.apply(mount);
})();
