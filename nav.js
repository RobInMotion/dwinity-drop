/*
 * Unified site navigation — single source of truth for every page.
 *
 * Usage:
 *   <div id="site-nav" data-brand="vault"
 *        data-nav-extra='[{"href":"#how","label":"So funktioniert&#39;s"}]'>
 *     …optional page-specific right-side controls (kept, desktop only)…
 *   </div>
 *   <script src="/nav.js"></script>     (near top of <body>, before wallet scripts)
 *
 * Desktop (md+): logo · Drop · Chat · [extras] · Daten ▾ · · · lang · wallet · Dash
 * Mobile  (<md): logo · · · wallet · ☰  → tap ☰ for a full menu (no cramped pills).
 *
 * Renders synchronously so wallet scripts (auth.js, wallet-balance.js) loaded
 * later find #wallet-btn / #wallet-balance. Highlights the current page.
 */
(function () {
  var mount = document.getElementById("site-nav");
  if (!mount) return;

  // The prebuilt static tailwind.min.css lacks these arbitrary values, so the mobile
  // wallet-button cap + dropdown width would be no-ops. Provide them via an ID-scoped
  // style (CSP allows 'unsafe-inline' for styles), mobile-only so desktop is untouched.
  if (!document.getElementById("nav-fix-style")) {
    var nfs = document.createElement("style");
    nfs.id = "nav-fix-style";
    nfs.textContent =
      "@media(max-width:767px){#wallet-btn{max-width:116px}#wallet-menu{max-width:calc(100vw - 1.5rem)}}";
    document.head.appendChild(nfs);
  }

  var path = location.pathname.replace(/\/+$/, "") || "/";
  var extrasHtml = mount.innerHTML.trim();               // page-specific controls (e.g. Pro-Mode)
  var brand = mount.getAttribute("data-brand") === "vault"
    ? 'Dwinity <span class="text-neon-500">Vault</span>'
    : 'Dead <span class="text-neon-500">Drop</span>';
  var navExtra = [];
  try { navExtra = JSON.parse(mount.getAttribute("data-nav-extra") || "[]"); } catch (e) {}

  var DATEN = [
    { href: "/vault",       label: "Vault · Info",       key: "nav.vaultInfo" },
    { href: "/vault.html",  label: "Vault öffnen (App)",  key: "nav.vaultApp" },
    { href: "/marketplace", label: "Markt",              key: "nav.market" },
    { href: "/rewards",     label: "Rewards",            key: "nav.rewards" },
    { href: "/rank",        label: "Rang",               key: "nav.rank" }
  ];
  var inDaten = DATEN.some(function (i) { return i.href === path; });
  function on(href) { return path === href; }
  // data-i18n attr only when a key is given (so the lang switch re-translates it)
  function i18n(key) { return key ? ' data-i18n="' + key + '"' : ""; }

  // ---------- desktop nav ----------
  function dtop(href, label, key) {
    return '<a href="' + href + '"' + i18n(key) + ' class="hover:text-white transition ' +
      (on(href) ? "text-neon-500" : "") + '">' + label + "</a>";
  }
  var extraTop = navExtra.map(function (i) { return dtop(i.href, i.label, i.key); }).join("");
  var datenTop =
    '<div class="relative" data-daten>' +
      '<button type="button" data-daten-btn class="inline-flex items-center gap-1 hover:text-white transition ' +
        (inDaten ? "text-purple-300" : "") + '"><span data-i18n="nav.daten">Daten</span>' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-70"><path d="M6 9l6 6 6-6"/></svg>' +
      "</button>" +
      '<div data-daten-menu class="hidden absolute left-0 mt-2 w-52 rounded-xl bg-void-900 border border-white/10 shadow-xl p-1.5 z-50">' +
        '<div class="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-white/35" data-i18n="nav.datenEco">Daten-Ökonomie</div>' +
        DATEN.map(function (i) {
          return '<a href="' + i.href + '"' + i18n(i.key) + ' class="block px-3 py-2 rounded-lg hover:bg-white/5 transition text-sm ' +
            (on(i.href) ? "text-neon-500" : "text-white/80") + '">' + i.label + "</a>";
        }).join("") +
      "</div>" +
    "</div>";

  // ---------- mobile menu items ----------
  function mlink(href, label, key) {
    return '<a href="' + href + '"' + i18n(key) + ' class="block px-4 py-3 rounded-lg text-sm transition ' +
      (on(href) ? "text-neon-500 bg-white/5" : "text-white/85 hover:bg-white/5") + '">' + label + "</a>";
  }
  var mobileItems =
    mlink("/", "Drop", "nav.drop") + mlink("/chat", "Chat", "nav.chat") +
    navExtra.map(function (i) { return mlink(i.href, i.label, i.key); }).join("") +
    '<div class="mt-1 pt-2 border-t border-white/5">' +
      '<div class="px-4 py-1 text-[10px] font-mono uppercase tracking-widest text-white/35" data-i18n="nav.datenEco">Daten-Ökonomie</div>' +
      DATEN.map(function (i) { return mlink(i.href, i.label, i.key); }).join("") +
    "</div>" +
    '<div class="mt-1 pt-2 border-t border-white/5">' + mlink("/dashboard", "Dashboard", "nav.dashboard") + "</div>";

  var html =
  '<header class="fixed top-0 left-0 right-0 z-40 backdrop-blur-xl bg-void-950/80 border-b border-white/5">' +
    '<div class="max-w-6xl mx-auto px-3 md:px-6 h-14 md:h-16 flex items-center justify-between gap-2">' +
      // logo
      '<a href="/" class="flex items-center gap-2 font-semibold text-base md:text-lg tracking-tight shrink-0 min-w-0">' +
        '<img src="/img/deaddrop-logo.svg" alt="" class="w-9 h-9 md:w-10 md:h-10 object-contain fx-logo-glow shrink-0" />' +
        '<span class="truncate">' + brand + "</span>" +
      "</a>" +
      // desktop primary nav
      '<nav class="hidden md:flex items-center gap-5 lg:gap-6 text-sm text-white/70">' +
        dtop("/", "Drop", "nav.drop") + dtop("/chat", "Chat", "nav.chat") + extraTop + datenTop +
      "</nav>" +
      // right cluster
      '<div class="flex items-center gap-1.5 md:gap-2 shrink-0">' +
        (extrasHtml ? '<div class="hidden md:flex items-center gap-2">' + extrasHtml + "</div>" : "") +
        // lang (desktop only)
        '<div class="hidden md:flex items-center font-mono text-[11px] uppercase tracking-widest border border-white/10 rounded-full overflow-hidden shrink-0">' +
          '<button type="button" data-lang-switch="de" class="lang-btn px-2 py-1.5 text-white/50 hover:text-white transition">DE</button>' +
          '<button type="button" data-lang-switch="en" class="lang-btn px-2 py-1.5 text-white/50 hover:text-white transition">EN</button>' +
        "</div>" +
        // wallet balance ribbon — desktop only (wrapper hides it on mobile regardless of JS toggle)
        '<div class="hidden md:block">' +
          '<div id="wallet-balance" class="hidden items-center gap-2 px-3 py-2 rounded-full bg-void-900/60 border border-white/10 text-[11px] font-mono text-white/60 shrink-0">' +
            '<span data-bal="avax" class="hidden sm:inline">— AVAX</span><span class="hidden sm:inline opacity-30">·</span>' +
            '<span data-bal="usdc">$—</span><span class="opacity-30">·</span>' +
            '<span data-bal="dwin" class="text-purple-300">— DWIN</span>' +
            '<button id="wallet-balance-hide" title="Balance ausblenden" class="ml-1 opacity-40 hover:opacity-100 transition">×</button>' +
          "</div>" +
          '<button id="wallet-balance-show" class="hidden items-center px-3 py-2 rounded-full bg-void-900/60 border border-white/10 text-[10px] font-mono text-white/40 hover:text-white shrink-0" title="Balance einblenden">💰</button>' +
        "</div>" +
        // wallet button (always) — truncates on mobile so it never overflows
        '<div class="relative">' +
          '<button id="wallet-btn" data-state="out" aria-haspopup="menu" aria-controls="wallet-menu" aria-expanded="false" class="fx-halo inline-flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 md:py-2 rounded-full border border-white/15 bg-void-900/85 text-[11px] md:text-sm font-mono text-white/80 hover:text-white hover:border-neon-500/40 transition max-w-[116px] md:max-w-none">' +
            '<span id="wallet-btn-dot" class="w-1.5 h-1.5 rounded-full bg-white/50 shrink-0"></span>' +
            '<span id="wallet-btn-label" class="truncate" data-i18n="nav.walletConnect">Wallet verbinden</span>' +
          "</button>" +
          '<div id="wallet-menu" role="menu" aria-labelledby="wallet-btn" class="hidden absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl bg-void-900 border border-white/10 shadow-xl p-4 text-sm z-50">' +
            '<div class="font-mono text-[10px] uppercase tracking-widest text-white/50 mb-1">Wallet</div>' +
            '<div id="wallet-menu-addr" class="font-mono text-xs break-all text-white/80 mb-3">—</div>' +
            '<div id="wallet-menu-pro" class="text-xs mb-4">—</div>' +
            '<a href="/#preise" id="wallet-menu-logout" class="text-xs font-mono text-white/60 hover:text-red-400 underline underline-offset-2">// trennen</a>' +
          "</div>" +
        "</div>" +
        // dashboard (desktop only)
        '<a href="/dashboard" data-i18n="nav.dashboard" class="hidden md:inline-flex shrink-0 items-center px-2.5 py-1.5 rounded-full bg-void-800 border border-white/15 text-white/70 hover:text-white hover:border-white/30 text-[11px] font-mono uppercase tracking-widest transition' +
          (on("/dashboard") ? " text-neon-500 border-neon-500/40" : "") + '">Dash</a>' +
        // hamburger (mobile only)
        '<button type="button" data-burger aria-label="Menü" class="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-white/15 text-white/80 hover:text-white hover:border-white/30 transition shrink-0">' +
          '<svg data-burger-open width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
          '<svg data-burger-close class="hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        "</button>" +
      "</div>" +
    "</div>" +
    // mobile dropdown panel
    '<div id="mobile-menu" class="md:hidden hidden border-t border-white/5 bg-void-950/95 backdrop-blur-xl">' +
      '<nav class="max-w-6xl mx-auto px-3 py-3 flex flex-col gap-0.5">' + mobileItems +
        '<div class="mt-2 pt-3 border-t border-white/5 flex items-center gap-2 px-4">' +
          '<span class="text-[10px] font-mono uppercase tracking-widest text-white/35 mr-1" data-i18n="nav.language">Sprache</span>' +
          '<button type="button" data-lang-switch="de" class="lang-btn text-xs px-2.5 py-1 rounded border border-white/10 text-white/60 hover:text-white transition">DE</button>' +
          '<button type="button" data-lang-switch="en" class="lang-btn text-xs px-2.5 py-1 rounded border border-white/10 text-white/60 hover:text-white transition">EN</button>' +
        "</div>" +
      "</nav>" +
    "</div>" +
  "</header>";

  mount.removeAttribute("data-brand");
  mount.removeAttribute("data-nav-extra");
  mount.innerHTML = html;

  // ---------- interactions ----------
  function setBurger(open) {
    var mm = document.getElementById("mobile-menu");
    if (!mm) return;
    mm.classList.toggle("hidden", !open);
    var o = document.querySelector("[data-burger-open]");
    var c = document.querySelector("[data-burger-close]");
    if (o) o.classList.toggle("hidden", open);
    if (c) c.classList.toggle("hidden", !open);
  }

  document.addEventListener("click", function (e) {
    // Daten dropdown (desktop)
    var wrap = document.querySelector("[data-daten]");
    if (wrap) {
      var menu = wrap.querySelector("[data-daten-menu]");
      if (e.target.closest("[data-daten-btn]")) menu.classList.toggle("hidden");
      else if (!e.target.closest("[data-daten-menu]")) menu.classList.add("hidden");
    }
    // Hamburger (mobile)
    var mm = document.getElementById("mobile-menu");
    if (mm) {
      if (e.target.closest("[data-burger]")) {
        setBurger(mm.classList.contains("hidden"));
      } else if (e.target.closest("#mobile-menu a")) {
        setBurger(false);                       // close after choosing
      } else if (!e.target.closest("#mobile-menu") && !mm.classList.contains("hidden")) {
        setBurger(false);                       // close on outside tap
      }
    }
  });
})();
