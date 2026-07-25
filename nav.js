/*
 * Unified site navigation — single source of truth for every page.
 *
 * Usage:
 *   <div id="site-nav">
 *     …optional page-specific controls (e.g. the vault Pro-Mode toggle)…
 *   </div>
 *   <script src="/nav.js"></script>     (near top of <body>, before wallet scripts)
 *
 * Desktop (md+): logo · Drop · Chat · Vault · Verdienen ▾ · · · lang · balance · wallet
 * Mobile  (<md): logo · · · wallet · ☰  → tap ☰ for a grouped menu.
 *
 * TWO ZONES — see docs/2026-07-25-nav-restructure-spec.md §3.2.
 *   Zone A (shell) is built ONCE and never rebuilt: logo, the whole right-hand
 *     cluster (#wallet-btn, #wallet-menu, #wallet-balance, lang), and the mobile
 *     "Ansicht" / Dashboard / language rows. auth.js and pro-mode.js bind click
 *     handlers DIRECTLY to elements in here — rebuilding them would silently kill
 *     the wallet button, "trennen" and the Pro-Mode toggle.
 *   Zone B is #nav-primary + #nav-mobile-links, refilled whenever the wallet
 *     state changes. It holds only <a> elements and the Verdienen dropdown
 *     button, all of which are handled by delegation on document.
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

  var PRODUCTS = [
    { href: "/",      label: "Drop",  key: "nav.drop" },
    { href: "/chat",  label: "Chat",  key: "nav.chat" },
    { href: "/vault", label: "Vault", key: "nav.vault", vault: true }
  ];
  var EARN = [
    { href: "/marketplace", label: "Markt",    key: "nav.market" },
    { href: "/surveys",     label: "Umfragen", key: "nav.surveys" },
    { href: "/rewards",     label: "Rewards",  key: "nav.rewards" },
    { href: "/rank",        label: "Rang",     key: "nav.rank" }
  ];

  var inEarn = EARN.some(function (i) { return i.href === path; });
  function on(href) { return path === href; }
  // Vault is ONE entry pointing at two pages: the info page when logged out,
  // the app when logged in. Either page highlights the entry.
  function hrefOf(item, loggedIn) {
    return item.vault ? (loggedIn ? "/vault.html" : "/vault") : item.href;
  }
  function isActive(item) {
    return item.vault ? (path === "/vault" || path === "/vault.html") : on(item.href);
  }
  // data-i18n attr only when a key is given (so the lang switch re-translates it)
  function i18n(key) { return key ? ' data-i18n="' + key + '"' : ""; }

  // ---------- Zone B: desktop links ----------
  function dtop(href, label, key, isOn) {
    return '<a href="' + href + '"' + i18n(key) + ' class="hover:text-white transition ' +
      (isOn ? "text-neon-500" : "") + '">' + label + "</a>";
  }
  function earnDropdown() {
    return '<div class="relative" data-earn>' +
      '<button type="button" data-earn-btn class="inline-flex items-center gap-1 hover:text-white transition ' +
        (inEarn ? "text-purple-300" : "") + '"><span data-i18n="nav.earn">Verdienen</span>' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-70"><path d="M6 9l6 6 6-6"/></svg>' +
      "</button>" +
      '<div data-earn-menu class="hidden absolute left-0 mt-2 w-52 rounded-xl bg-void-900 border border-white/10 shadow-xl p-1.5 z-50">' +
        EARN.map(function (i) {
          return '<a href="' + i.href + '"' + i18n(i.key) + ' class="block px-3 py-2 rounded-lg hover:bg-white/5 transition text-sm ' +
            (on(i.href) ? "text-neon-500" : "text-white/80") + '">' + i.label + "</a>";
        }).join("") +
      "</div>" +
    "</div>";
  }
  function primaryHtml(loggedIn) {
    var out = PRODUCTS.map(function (i) {
      return dtop(hrefOf(i, loggedIn), i.label, i.key, isActive(i));
    }).join("");
    // Logged out the earn pages are useless, so the slot carries the pricing
    // link instead — the one marketing anchor worth keeping in the bar.
    return out + (loggedIn ? earnDropdown() : dtop("/#preise", "Preise", "nav.pricing", false));
  }

  // ---------- Zone B: mobile links ----------
  function mlink(href, label, key, isOn) {
    return '<a href="' + href + '"' + i18n(key) + ' class="block px-4 py-3 rounded-lg text-sm transition ' +
      (isOn ? "text-neon-500 bg-white/5" : "text-white/85 hover:bg-white/5") + '">' + label + "</a>";
  }
  // `first` drops the separator line — otherwise the topmost group would draw a
  // stray border right under the header edge.
  function mgroup(key, label, inner, first) {
    return '<div class="' + (first ? "" : "mt-1 pt-2 border-t border-white/5") + '">' +
      '<div class="px-4 py-1 text-[10px] font-mono uppercase tracking-widest text-white/35"' + i18n(key) + ">" + label + "</div>" +
      inner + "</div>";
  }
  function mobileLinksHtml(loggedIn) {
    var prods = PRODUCTS.map(function (i) {
      return mlink(hrefOf(i, loggedIn), i.label, i.key, isActive(i));
    }).join("");
    if (!loggedIn) prods += mlink("/#preise", "Preise", "nav.pricing", false);
    var out = mgroup("nav.groupProducts", "Produkte", prods, true);
    if (loggedIn) {
      out += mgroup("nav.earn", "Verdienen", EARN.map(function (i) {
        return mlink(i.href, i.label, i.key, on(i.href));
      }).join(""), false);
    }
    return out;
  }

  // ---------- Zone A: the shell, built once ----------
  var shell =
  '<header class="fixed top-0 left-0 right-0 z-40 backdrop-blur-xl bg-void-950/80 border-b border-white/5">' +
    '<div class="max-w-6xl mx-auto px-3 md:px-6 h-14 md:h-16 flex items-center justify-between gap-2">' +
      // logo — one brand name on every page
      '<a href="/" class="flex items-center gap-2 font-semibold text-base md:text-lg tracking-tight shrink-0 min-w-0">' +
        '<img src="/img/deaddrop-logo.svg" alt="" class="w-9 h-9 md:w-10 md:h-10 object-contain fx-logo-glow shrink-0" />' +
        '<span class="truncate">Dead <span class="text-neon-500">Drop</span></span>' +
      "</a>" +
      // Zone B — desktop links
      '<nav id="nav-primary" class="hidden md:flex items-center gap-5 lg:gap-6 text-sm text-white/70"></nav>' +
      // right cluster — Zone A, never rebuilt
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
        // hamburger (mobile only)
        '<button type="button" data-burger aria-label="Menü" class="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-white/15 text-white/80 hover:text-white hover:border-white/30 transition shrink-0">' +
          '<svg data-burger-open width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
          '<svg data-burger-close class="hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        "</button>" +
      "</div>" +
    "</div>" +
    // mobile dropdown panel
    '<div id="mobile-menu" class="md:hidden hidden border-t border-white/5 bg-void-950/95 backdrop-blur-xl">' +
      '<nav class="max-w-6xl mx-auto px-3 py-3 flex flex-col gap-0.5">' +
        // Zone B — link groups
        '<div id="nav-mobile-links"></div>' +
        // Zone A below: anything a foreign script binds to, or that only toggles.
        // Page-specific controls (e.g. vault Pro-Mode) — desktop shows these inline;
        // on mobile they'd otherwise be unreachable, so surface them here too.
        (extrasHtml
          ? '<div class="mt-1 pt-2 border-t border-white/5 px-4 py-2 flex items-center gap-2">' +
              '<span class="text-[10px] font-mono uppercase tracking-widest text-white/35" data-i18n="nav.view">Ansicht</span>' +
              extrasHtml +
            "</div>"
          : "") +
        '<div class="mt-1 pt-2 border-t border-white/5">' +
          '<div class="px-4 py-1 text-[10px] font-mono uppercase tracking-widest text-white/35" data-i18n="nav.groupAccount">Konto</div>' +
          // Wrapper carries the hidden toggle so we never fight Tailwind's
          // .block / .hidden ordering on the anchor itself.
          '<div id="nav-mobile-dash-wrap" class="hidden">' +
            '<a href="/dashboard" data-i18n="nav.dashboard" class="block px-4 py-3 rounded-lg text-sm transition ' +
              (on("/dashboard") ? "text-neon-500 bg-white/5" : "text-white/85 hover:bg-white/5") + '">Dashboard</a>' +
          "</div>" +
          '<div class="flex items-center gap-2 px-4 py-2">' +
            '<span class="text-[10px] font-mono uppercase tracking-widest text-white/35 mr-1" data-i18n="nav.language">Sprache</span>' +
            '<button type="button" data-lang-switch="de" class="lang-btn text-xs px-2.5 py-1 rounded border border-white/10 text-white/60 hover:text-white transition">DE</button>' +
            '<button type="button" data-lang-switch="en" class="lang-btn text-xs px-2.5 py-1 rounded border border-white/10 text-white/60 hover:text-white transition">EN</button>' +
          "</div>" +
        "</div>" +
      "</nav>" +
    "</div>" +
  "</header>";

  mount.removeAttribute("data-brand");
  mount.removeAttribute("data-nav-extra");
  mount.innerHTML = shell;

  // ---------- Zone B filling ----------
  var primary = document.getElementById("nav-primary");
  var mobileLinks = document.getElementById("nav-mobile-links");
  var dashWrap = document.getElementById("nav-mobile-dash-wrap");

  function fillLinks(loggedIn) {
    primary.innerHTML = primaryHtml(loggedIn);
    mobileLinks.innerHTML = mobileLinksHtml(loggedIn);
    dashWrap.classList.toggle("hidden", !loggedIn);
    // Freshly built nodes carry data-i18n but no translation yet.
    if (window.DDI18n && window.DDI18n.apply) {
      window.DDI18n.apply(primary);
      window.DDI18n.apply(mobileLinks);
    }
  }
  var loggedInNow = false;
  fillLinks(false);

  // auth.js announces every login, session restore and logout here. Refill only
  // on a real transition — the event also fires for tier changes, and refilling
  // on each of those would be wasted work.
  window.addEventListener("dwinity:wallet-changed", function (e) {
    var li = !!(e && e.detail && e.detail.address);
    if (li === loggedInNow) return;
    loggedInNow = li;
    fillLinks(li);
  });

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

  // Delegated on document so refilling Zone B never loses these handlers.
  document.addEventListener("click", function (e) {
    // Verdienen dropdown (desktop)
    var wrap = document.querySelector("[data-earn]");
    if (wrap) {
      var menu = wrap.querySelector("[data-earn-menu]");
      if (e.target.closest("[data-earn-btn]")) menu.classList.toggle("hidden");
      else if (!e.target.closest("[data-earn-menu]")) menu.classList.add("hidden");
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
