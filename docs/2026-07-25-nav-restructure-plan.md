# Navigation neu aufteilen — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Menüleiste zeigt Drop · Chat · Vault · Verdienen ▾ statt eines
„Daten"-Sammelbeckens, führt den Markennamen auf allen Seiten einheitlich und
passt sich dem Wallet-Zustand an.

**Architecture:** `nav.js` wird in zwei Zonen geteilt. Das Gerüst (Logo, rechter
Konto-Cluster, mobile Sprach-/Ansicht-/Dashboard-Zeilen) entsteht genau einmal
synchron; nur die reinen Link-Listen `#nav-primary` und `#nav-mobile-links`
werden bei Wallet-Zustandswechsel neu gefüllt. Dadurch bleiben alle direkt
gebundenen Listener fremder Skripte am Leben und `auth.js` braucht keinen
Rückkanal.

**Tech Stack:** Vanilla JS (IIFE, kein Build), Tailwind als vorgebautes
statisches CSS, eigenes i18n (`window.DDI18n`).

**Spec:** `docs/2026-07-25-nav-restructure-spec.md`

## Global Constraints

- **Zwei-Zonen-Regel:** Kein Element, an dem ein anderes Skript direkt einen
  Listener bindet, darf je neu gebaut werden. Betroffen: `#wallet-btn`
  (`auth.js:454`), `#wallet-menu-logout` (`auth.js:466`),
  `[data-pro-mode-toggle]` (`pro-mode.js:52`).
- **Kein Build-Schritt.** Geänderte Dateien liegen direkt unter
  `/var/www/dwinity-drop/` und wirken sofort. Keine neuen Tailwind-Klassen
  erfinden — das statische `tailwind.min.css` ist vorgebaut und enthält keine
  frei erfundenen Werte. Nur Klassen wiederverwenden, die heute schon in
  `nav.js` vorkommen.
- **Kein Testrahmen im Frontend.** Verifikation = `node --check` für Syntax plus
  Sichtprüfung im Browser.
- **Die Seite steht während des geschlossenen Tests hinter einem Passwort-Gate.**
  Für jede Browser-Prüfung wird der Vorschau-Schlüssel gebraucht; er liegt in
  der nginx-Konfiguration auf dem Server.
- **Alle sichtbaren Texte brauchen DE und EN.** Deutsch steht als Rückfalltext
  im Markup, Englisch kommt aus `i18n.js`.
- **Markenname ist überall „Dead Drop".** Kein „Dwinity Vault" im Logo.
- **Commits auf `main`**, wie im Repo üblich. Jede Aufgabe endet mit einem
  eigenen Commit.

---

### Task 1: Übersetzungs-Schlüssel anlegen

Vier neue Schlüssel, damit die neuen Menüpunkte in beiden Sprachen stehen. Muss
vor `nav.js` passieren, sonst zeigt die EN-Ansicht rohe Schlüsselnamen.

**Files:**
- Modify: `i18n.js` (DE-Block bei Zeile ~117, EN-Block bei Zeile ~1129)

**Interfaces:**
- Produces: die Schlüssel `nav.vault`, `nav.earn`, `nav.groupProducts`,
  `nav.groupAccount`, die Task 2 im Markup als `data-i18n` referenziert.

- [ ] **Step 1: DE-Block ergänzen**

In `i18n.js` direkt nach der Zeile `"nav.surveys": "Umfragen",` (DE-Block,
ca. Zeile 117) einfügen:

```js
      "nav.vault": "Vault",
      "nav.earn": "Verdienen",
      "nav.groupProducts": "Produkte",
      "nav.groupAccount": "Konto",
```

- [ ] **Step 2: EN-Block ergänzen**

In `i18n.js` direkt nach der Zeile `"nav.surveys": "Surveys",` (EN-Block,
ca. Zeile 1129) einfügen:

```js
      "nav.vault": "Vault",
      "nav.earn": "Earn",
      "nav.groupProducts": "Products",
      "nav.groupAccount": "Account",
```

- [ ] **Step 3: Syntax prüfen**

```bash
cd /var/www/dwinity-drop && node --check i18n.js && echo SYNTAX-OK
```

Erwartet: `SYNTAX-OK`

- [ ] **Step 4: Beide Sprachen haben alle vier Schlüssel**

```bash
cd /var/www/dwinity-drop && for k in nav.vault nav.earn nav.groupProducts nav.groupAccount; do
  echo "$k: $(grep -c "\"$k\":" i18n.js)"
done
```

Erwartet: jeweils `2` (einmal DE, einmal EN). Bei `1` fehlt ein Block, bei `3`
wurde doppelt eingefügt.

- [ ] **Step 5: Commit**

```bash
cd /var/www/dwinity-drop && git add i18n.js && git commit -m "i18n: Schluessel fuer die neue Nav-Struktur (Vault, Verdienen, Gruppen)"
```

---

### Task 2: nav.js auf die neue Struktur umbauen

Kern der Arbeit. Ersetzt `nav.js` vollständig und entfernt die dadurch toten
Attribute aus den Seiten. Nach dieser Aufgabe zeigt jede Seite die neue Leiste
im **ausgeloggten** Zustand; das Mitdenken folgt in Task 3.

**Files:**
- Modify: `nav.js` (Vollersatz)
- Modify: `index.html:` Zeile mit `data-nav-extra`
- Modify: `vault.html:39`, `surveys.html:29`, `vault-landing.html:83`
  (jeweils `data-brand="vault"` entfernen)

**Interfaces:**
- Consumes: die vier Schlüssel aus Task 1.
- Produces:
  - `#nav-primary` — Desktop-Link-Container (Zone B), von Task 3 neu gefüllt
  - `#nav-mobile-links` — Handy-Link-Container (Zone B), von Task 3 neu gefüllt
  - `#nav-mobile-dash-wrap` — Wrapper um den Handy-Dashboard-Link (Zone A), von
    Task 3 per `classList.toggle("hidden", …)` geschaltet
  - unverändert erhalten bleiben `#wallet-btn`, `#wallet-btn-label`,
    `#wallet-btn-dot`, `#wallet-menu`, `#wallet-menu-addr`, `#wallet-menu-pro`,
    `#wallet-menu-logout`, `#wallet-balance`, `#wallet-balance-hide`,
    `#wallet-balance-show`, `#mobile-menu`

- [ ] **Step 1: Ausgangszustand festhalten**

```bash
cd /var/www/dwinity-drop && cp nav.js /tmp/nav.js.before && git status --short
```

Erwartet: sauberer Baum bis auf das, was Task 1 committet hat.

- [ ] **Step 2: `nav.js` vollständig ersetzen**

Kompletter neuer Inhalt von `nav.js`:

```js
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
  fillLinks(false);

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
```

- [ ] **Step 3: Syntax prüfen**

```bash
cd /var/www/dwinity-drop && node --check nav.js && echo SYNTAX-OK
```

Erwartet: `SYNTAX-OK`

- [ ] **Step 4: Die Anker für fremde Skripte sind alle noch da**

Das ist die Absicherung gegen die Zwei-Zonen-Regel. Wenn hier eine `0` steht,
ist ein Skript kaputt, das diesen Anker sucht.

```bash
cd /var/www/dwinity-drop && for id in wallet-btn wallet-btn-label wallet-btn-dot \
  wallet-menu wallet-menu-addr wallet-menu-pro wallet-menu-logout \
  wallet-balance wallet-balance-hide wallet-balance-show mobile-menu \
  nav-primary nav-mobile-links nav-mobile-dash-wrap; do
  printf "%-22s %s\n" "$id" "$(grep -c "id=\"$id\"" nav.js)"
done
```

Erwartet: bei jedem `1`.

- [ ] **Step 5: Tote Attribute aus den Seiten entfernen**

`nav.js` wertet `data-brand` und `data-nav-extra` nicht mehr aus. Die Attribute
werden entfernt, damit niemand sie für wirksam hält.

In `index.html`: `data-nav-extra='[…]'` aus dem `<div id="site-nav" …>` löschen,
sodass dort `<div id="site-nav"></div>` steht.

In `vault.html:39`: nur `data-brand="vault"` löschen — **der Pro-Mode-Knopf im
selben Element bleibt vollständig erhalten.** Ergebnis:
`<div id="site-nav"><button data-pro-mode-toggle …>…</button></div>`

In `surveys.html:29` und `vault-landing.html:83`: `data-brand="vault"` löschen,
sodass `<div id="site-nav"></div>` steht.

- [ ] **Step 6: Keine Reste der alten Attribute mehr im Baum**

```bash
cd /var/www/dwinity-drop && echo "data-brand:     $(grep -c 'data-brand' *.html | grep -v ':0' | wc -l) Dateien"
echo "data-nav-extra: $(grep -c 'data-nav-extra' *.html | grep -v ':0' | wc -l) Dateien"
echo "pro-mode-toggle noch da: $(grep -c 'data-pro-mode-toggle' vault.html)"
```

Erwartet: `data-brand: 0 Dateien`, `data-nav-extra: 0 Dateien`,
`pro-mode-toggle noch da: 1`

- [ ] **Step 7: Im Browser gegenprüfen (ausgeloggt)**

Mit dem Vorschau-Schlüssel und **ohne verbundenes Wallet** `/`, `/chat`,
`/vault` und `/marketplace` öffnen.

Erwartet auf jeder Seite:
- Leiste zeigt `Drop · Chat · Vault · Preise`
- Logo überall „Dead Drop", auch auf `/vault` und `/surveys`
- Vault führt auf `/vault`
- Kein „Dash"-Knopf mehr rechts
- Browser-Konsole ohne Fehler

- [ ] **Step 8: Commit**

```bash
cd /var/www/dwinity-drop && git add nav.js index.html vault.html surveys.html vault-landing.html && \
git commit -m "nav: Drop/Chat/Vault + Verdienen statt Daten-Sammelbecken, einheitlicher Markenname"
```

---

### Task 3: Leiste auf den Wallet-Zustand reagieren lassen

**Files:**
- Modify: `nav.js` (Ergänzung am Ende der `fillLinks`-Sektion)

**Interfaces:**
- Consumes: `fillLinks(loggedIn)`, `#nav-primary`, `#nav-mobile-links`,
  `#nav-mobile-dash-wrap` aus Task 2; das Ereignis `dwinity:wallet-changed`,
  dessen `detail` das `me`-Objekt mit `address` ist.

- [ ] **Step 1: Zustandsverfolgung und Ereignis-Anmeldung ergänzen**

In `nav.js` die Zeile `fillLinks(false);` durch diesen Block ersetzen:

```js
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
```

- [ ] **Step 2: Syntax prüfen**

```bash
cd /var/www/dwinity-drop && node --check nav.js && echo SYNTAX-OK
```

Erwartet: `SYNTAX-OK`

- [ ] **Step 3: Im Browser prüfen — der kritische Durchgang**

Auf `/` mit dem Gate-Schlüssel öffnen, dann **Wallet verbinden**.

Erwartet direkt nach dem Verbinden, ohne Neuladen:
1. Leiste zeigt `Drop · Chat · Vault · Verdienen ▾`
2. `Verdienen ▾` klappt auf und zeigt Markt · Umfragen · Rewards · Rang
3. **Wallet-Knopf klappt weiterhin auf und zu** (Zone-A-Beweis)
4. Wallet-Menü enthält Adresse, Anzeigename-Feld, Tarif-Block, Egress-Balken,
   Dashboard-Link und Rang
5. **„// trennen" funktioniert** und die Leiste fällt danach auf
   `Drop · Chat · Vault · Preise` zurück
6. Vault im Menü zeigt jetzt auf `/vault.html`

Bricht Punkt 3, 4 oder 5, wurde die Zwei-Zonen-Regel verletzt — dann steht zu
viel im neu gefüllten Bereich.

- [ ] **Step 4: Auf `vault.html` den Pro-Mode-Schalter prüfen**

`/vault.html` öffnen, Wallet verbinden, danach in Handybreite den Hamburger
öffnen und den Pro-Mode-Knopf drücken.

Erwartet: Der Schalter reagiert weiterhin und wechselt zwischen AN und AUS.

- [ ] **Step 5: Commit**

```bash
cd /var/www/dwinity-drop && git add nav.js && \
git commit -m "nav: Links folgen dem Wallet-Zustand (Verdienen nur eingeloggt)"
```

---

### Task 4: auth.js — Zustandswechsel auch beim Laden und Trennen melden

Ohne diese Aufgabe steht die Leiste nach einem Seitenwechsel wieder auf
„ausgeloggt", obwohl die Sitzung besteht, und bleibt nach dem Trennen auf
„eingeloggt" stehen. Heute wird `dwinity:wallet-changed` nur nach einem frischen
Login verschickt (`auth.js:408`).

**Files:**
- Modify: `auth.js:303-317` (`refreshMe`)
- Modify: `auth.js:420-433` (`logout`)

**Interfaces:**
- Produces: `dwinity:wallet-changed` mit `detail = me` beim Wiederherstellen
  einer Sitzung und `detail = { address: null }` beim Trennen — beides
  konsumiert von `nav.js` aus Task 3.

- [ ] **Step 1: Ereignis beim Sitzungs-Wiederherstellen verschicken**

In `auth.js` in `refreshMe()` diesen Block:

```js
    if (!res.ok) return null;            // transient failure — leave state as-is
    const me = res.me;
    if (me && me.address) renderLoggedIn(me);
    else renderLoggedOut();
    return me;
```

ersetzen durch:

```js
    if (!res.ok) return null;            // transient failure — leave state as-is
    const me = res.me;
    if (me && me.address) renderLoggedIn(me);
    else renderLoggedOut();
    // Tell page-scripts the state is known. A fresh login dispatches this too
    // (see connect()); without it here, a page loaded with a live session would
    // leave nav.js and friends stuck in their logged-out rendering.
    window.dispatchEvent(new CustomEvent("dwinity:wallet-changed", { detail: me }));
    return me;
```

- [ ] **Step 2: Ereignis beim Trennen verschicken**

In `auth.js` in `logout()` die Zeile `renderLoggedOut();` am Ende der Funktion
ersetzen durch:

```js
    renderLoggedOut();
    window.dispatchEvent(new CustomEvent("dwinity:wallet-changed", { detail: { address: null } }));
```

- [ ] **Step 3: Syntax prüfen**

```bash
cd /var/www/dwinity-drop && node --check auth.js && echo SYNTAX-OK
```

Erwartet: `SYNTAX-OK`

- [ ] **Step 4: Genau drei Sendestellen**

```bash
cd /var/www/dwinity-drop && grep -c 'dwinity:wallet-changed' auth.js
```

Erwartet: `3` (Login, Wiederherstellen, Trennen).

- [ ] **Step 5: Regressionsprüfung der mithörenden Seiten**

Fünf Skripte hören auf dieses Ereignis und booten dadurch beim Seitenladen
jetzt einmal zusätzlich. Jede Seite mit **bestehender Sitzung** laden und auf
Doppelungen prüfen:

| Seite | Datei | Worauf achten |
|---|---|---|
| `/chat` | `chat-index.js:228` | Raumliste erscheint einmal, nicht doppelt |
| `/rank` | `rank.js:335` | Bestenliste einmal, keine doppelten Zeilen |
| `/surveys` | `surveys.js:455` | Umfragen-, Aktivitäts- und Eigene-Liste je einmal |
| `/vault.html` | `vault.js:1128` | Datenquellen einmal aufgelistet |
| jede Seite | `panic.js:245` | Panik-Knopf einmal vorhanden und auslösbar |

Erwartet: keine doppelten Listeneinträge, keine Fehler in der Browser-Konsole.
Tritt eine Doppelung auf, ist das `boot()` der betroffenen Seite nicht mehrfach
aufrufbar — dann diese eine Seite so absichern, dass ihr Bootvorgang die Liste
vor dem Füllen leert.

- [ ] **Step 6: Commit**

```bash
cd /var/www/dwinity-drop && git add auth.js && \
git commit -m "auth: wallet-changed auch beim Sitzungs-Wiederherstellen und Trennen melden"
```

---

### Task 5: Abnahme über alle Seiten und beide Sprachen

Keine Code-Änderung — die Schluss-Sichtprüfung aus Spec §4. Findet sich hier ein
Fehler, wird er in der Aufgabe behoben, zu der er gehört.

**Files:**
- Keine Änderung, außer es fällt etwas auf.

- [ ] **Step 1: Alle neun Seiten ausgeloggt durchgehen**

`/`, `/chat`, `/vault`, `/marketplace`, `/surveys`, `/rewards`, `/rank`,
`/dashboard`, `/vault.html`

Erwartet je Seite: `Drop · Chat · Vault · Preise`, Logo „Dead Drop", die
aktuelle Seite hervorgehoben (bei `/vault` und `/vault.html` der Vault-Punkt),
kein „Dash"-Knopf, Konsole fehlerfrei.

- [ ] **Step 2: Dieselben neun Seiten eingeloggt**

Erwartet je Seite: `Drop · Chat · Vault · Verdienen ▾`. Steht man auf einer
Verdienen-Seite, ist der Elternpunkt lila (`text-purple-300`) und der Eintrag im
aufgeklappten Menü grün.

- [ ] **Step 3: Neu laden mit bestehender Sitzung**

Auf `/marketplace` mit verbundenem Wallet neu laden.

Erwartet: Die Leiste steht nach dem Laden auf „eingeloggt" — kein sichtbares
Umspringen von „Preise" auf „Verdienen".

- [ ] **Step 4: Sprachumschaltung in beiden Zuständen**

Auf EN schalten, ausgeloggt und eingeloggt.

Erwartet: `Drop · Chat · Vault · Pricing` bzw. `… · Earn ▾` mit
Market · Surveys · Rewards · Rank. Im Handy-Menü die Überschriften
`PRODUCTS` / `EARN` / `ACCOUNT`. Nirgends ein roher Schlüsselname wie
`nav.earn`.

- [ ] **Step 5: Handybreite**

Fenster auf unter 768 px, oder Geräte-Ansicht.

Erwartet: Hamburger öffnet das gruppierte Menü, schließt bei Auswahl eines Links
und bei Tipp daneben. Der Wallet-Knopf läuft nicht über den Rand. Eingeloggt
erscheint Dashboard unter „Konto", ausgeloggt nicht. Auf `/vault.html` ist der
„Ansicht"-Block mit dem Pro-Mode-Knopf vorhanden und bedienbar.

- [ ] **Step 6: Ergebnis festhalten**

Falls Schritte 1–5 Änderungen nötig machten, diese committen. Sonst nichts zu
tun — der Plan ist durch.
