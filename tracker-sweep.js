/* Tracker Sweep — a co-op, wallet-native Minesweeper easter egg for Dead Drop Chat.
 *
 * Data-sovereignty theme: the grid is YOUR data. Hidden "trackers" are the mines;
 * numbers show how many trackers sit adjacent; 🔒 locks (flags) a suspected tracker.
 * Two players share ONE board and take turns — clear every safe cell together to
 * secure the vault; reveal a tracker and it's a shared data leak.
 *
 * Rides entirely on the E2E-encrypted chat message pipe (kind:"sweep"), delivered
 * live via the room's SSE. The server never sees the game — same as your messages.
 * No backend. Ephemeral: reloading the room ends the round.
 *
 * Trigger: type /sweep in a room. chat-room.js wires init()/onEvent()/invite().
 */
(function () {
  "use strict";

  var ROWS = 8, COLS = 8, TRACKERS = 10;
  var bridge = null;   // { send(obj)->Promise, me()->address }
  var game = null;     // active game state, or null

  function t(key, fb) {
    var v = window.DDI18n && window.DDI18n.t && window.DDI18n.t(key);
    return (v && v !== key) ? v : fb;
  }
  function shortAddr(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- deterministic RNG (mulberry32) so BOTH clients build the identical board ----
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var x = Math.imul(s ^ (s >>> 15), 1 | s);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildBoard(seed) {
    var cells = [];
    for (var i = 0; i < ROWS * COLS; i++) {
      cells.push({ tracker: false, adj: 0, revealed: false, flagged: false });
    }
    // Center 3x3 is guaranteed tracker-free → a fair opening for the first move.
    var cr = (ROWS >> 1), cc = (COLS >> 1);
    function inSafe(r, c) { return Math.abs(r - cr) <= 1 && Math.abs(c - cc) <= 1; }
    var rand = rng(seed), placed = 0, guard = 0;
    while (placed < TRACKERS && guard++ < 100000) {
      var idx = Math.floor(rand() * ROWS * COLS);
      var r = Math.floor(idx / COLS), c = idx % COLS;
      if (cells[idx].tracker || inSafe(r, c)) continue;
      cells[idx].tracker = true; placed++;
    }
    for (var r2 = 0; r2 < ROWS; r2++) {
      for (var c2 = 0; c2 < COLS; c2++) {
        if (cells[r2 * COLS + c2].tracker) continue;
        var n = 0;
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            var rr = r2 + dr, ccc = c2 + dc;
            if (rr < 0 || rr >= ROWS || ccc < 0 || ccc >= COLS) continue;
            if (cells[rr * COLS + ccc].tracker) n++;
          }
        }
        cells[r2 * COLS + c2].adj = n;
      }
    }
    return cells;
  }

  function floodReveal(cells, r, c) {
    var stack = [[r, c]];
    while (stack.length) {
      var p = stack.pop(), pr = p[0], pc = p[1], cell = cells[pr * COLS + pc];
      if (cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      if (cell.adj === 0 && !cell.tracker) {
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            var rr = pr + dr, cc = pc + dc;
            if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
            if (!cells[rr * COLS + cc].revealed) stack.push([rr, cc]);
          }
        }
      }
    }
  }

  function safeCellsLeft(cells) {
    var n = 0;
    for (var i = 0; i < cells.length; i++) {
      if (!cells[i].tracker && !cells[i].revealed) n++;
    }
    return n;
  }
  function flagsUsed(cells) {
    var n = 0;
    for (var i = 0; i < cells.length; i++) if (cells[i].flagged) n++;
    return n;
  }

  // ---- whose turn: host on even move counts, guest on odd ----
  function turnAddr() {
    if (!game) return null;
    return (game.moveCount % 2 === 0) ? game.host : game.guest;
  }
  function myTurn() {
    return game && game.active && !game.over && game.guest && turnAddr() === bridge.me();
  }

  // ---------------- overlay UI ----------------

  // The prebuilt static tailwind.min.css does NOT include arbitrary values
  // (aspect-square, z-[…], max-w-[…], …), so the panel is styled with a dedicated
  // <style> block instead — CSP allows 'unsafe-inline' for styles. z-index sits above
  // panic.js's wipe button (z-index:1000) so the game is never covered by it.
  function injectStyle() {
    if (document.getElementById("ts-style")) return;
    var st = document.createElement("style");
    st.id = "ts-style";
    st.textContent =
      ".ts-overlay{position:fixed;inset:0;z-index:11000;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(0,0,0,.62);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}" +
      ".ts-card{width:100%;max-width:400px;max-height:92vh;max-height:92dvh;display:flex;flex-direction:column;background:#05060A;border:1px solid rgba(0,255,157,.3);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.6);overflow:hidden}" +
      ".ts-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 16px;border-bottom:1px solid rgba(255,255,255,.1);background:rgba(10,11,16,.85);flex-shrink:0}" +
      ".ts-title{display:flex;align-items:center;gap:8px;min-width:0;font-weight:600;font-size:14px;color:#fff}" +
      ".ts-x{flex-shrink:0;width:34px;height:34px;display:grid;place-items:center;border-radius:8px;color:rgba(255,255,255,.55);background:none;border:none;font-size:18px;line-height:1;cursor:pointer}" +
      ".ts-x:hover{color:#fff;background:rgba(255,255,255,.1)}" +
      ".ts-status{padding:8px 16px;text-align:center;font-size:12px;font-family:ui-monospace,monospace;color:rgba(255,255,255,.72);border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0}" +
      ".ts-status .ok{color:#00FF9D}.ts-status .bad{color:#f87171}.ts-status .dim{color:rgba(255,255,255,.5)}.ts-status .who{color:rgba(255,255,255,.85)}" +
      ".ts-body{padding:14px;overflow-y:auto}" +
      ".ts-howto{margin:0 0 12px;font-size:11.5px;line-height:1.6;color:rgba(255,255,255,.5);text-align:center}" +
      ".ts-grid{display:grid;gap:5px;width:100%}" +
      ".ts-cell{aspect-ratio:1/1;border-radius:6px;font-size:clamp(13px,4.4vw,18px);font-family:ui-monospace,monospace;font-weight:700;display:grid;place-items:center;user-select:none;-webkit-user-select:none;border:1px solid rgba(255,255,255,.1);background:rgba(19,20,27,.6);color:#fff;padding:0;cursor:pointer;transition:background .1s,border-color .1s}" +
      ".ts-cell:disabled{cursor:default}.ts-cell.ts-tap:active{background:rgba(0,255,157,.18)}" +
      ".ts-cell.ts-rev{background:#13141B;color:rgba(255,255,255,.75);border-color:rgba(255,255,255,.06)}" +
      ".ts-cell.ts-boom{background:rgba(239,68,68,.85);color:#fff;border-color:transparent}" +
      ".ts-n1{color:#38bdf8}.ts-n2{color:#00FF9D}.ts-n3{color:#facc15}.ts-n4{color:#fb923c}.ts-n5{color:#f87171}.ts-n6{color:#f87171}.ts-n7{color:#f87171}.ts-n8{color:#f87171}" +
      ".ts-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 16px;border-top:1px solid rgba(255,255,255,.1);flex-shrink:0}" +
      ".ts-flag{padding:8px 12px;border-radius:8px;font-size:12px;font-family:ui-monospace,monospace;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.72);background:none;cursor:pointer;white-space:nowrap}" +
      ".ts-flag.on{background:#00FF9D;color:#05060A;border-color:#00FF9D}" +
      ".ts-left{font-size:11.5px;font-family:ui-monospace,monospace;color:rgba(255,255,255,.5);text-align:right}";
    document.head.appendChild(st);
  }

  function ensurePanel() {
    if (game.panel) return game.panel;
    injectStyle();
    var wrap = document.createElement("div");
    wrap.id = "sweep-overlay";
    wrap.className = "ts-overlay";
    wrap.innerHTML =
      '<div class="ts-card">' +
        '<div class="ts-head">' +
          '<div class="ts-title"><span style="color:#00FF9D;font-size:18px">🛡️</span><span>Tracker Sweep</span></div>' +
          '<button data-sweep-close class="ts-x" aria-label="Schließen">✕</button>' +
        '</div>' +
        '<div data-sweep-status class="ts-status"></div>' +
        '<div class="ts-body">' +
          '<p class="ts-howto">' + esc(t("sweep.howto", "Tippe Felder frei. Zahl = wie viele ☠ Tracker angrenzen. 🔒 sperrt Verdächtige. Alle sicheren Felder frei = gewonnen, ein Tracker = verloren.")) + '</p>' +
          '<div data-sweep-grid class="ts-grid" style="grid-template-columns:repeat(' + COLS + ',minmax(0,1fr))"></div>' +
        '</div>' +
        '<div class="ts-foot">' +
          '<button data-sweep-flag class="ts-flag">' + esc(t("sweep.flagMode", "🔒 Sperr-Modus")) + '</button>' +
          '<div data-sweep-left class="ts-left"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    game.panel = wrap;
    game.flagMode = false;

    wrap.querySelector("[data-sweep-close]").addEventListener("click", closeGame);
    wrap.querySelector("[data-sweep-flag]").addEventListener("click", function () {
      game.flagMode = !game.flagMode;
      this.classList.toggle("on", game.flagMode);
    });
    return wrap;
  }

  function renderPanel() {
    if (!game || !game.panel) return;
    var grid = game.panel.querySelector("[data-sweep-grid]");
    var statusEl = game.panel.querySelector("[data-sweep-status]");
    var leftEl = game.panel.querySelector("[data-sweep-left]");

    // status line (scoped .ok/.bad/.dim/.who classes from the injected stylesheet)
    if (game.over) {
      statusEl.innerHTML = game.won
        ? '<span class="ok">' + esc(t("sweep.won", "✓ Vault gesichert — alle Tracker umgangen.")) + '</span>'
        : '<span class="bad">' + esc(t("sweep.lost", "💥 Datenleck! Ein Tracker wurde aufgedeckt. Runde vorbei.")) + '</span>';
    } else if (!game.guest) {
      statusEl.innerHTML = '<span class="dim">' + esc(t("sweep.waiting", "// warte auf Mitspieler …")) + '</span>';
    } else if (myTurn()) {
      statusEl.innerHTML = '<span class="ok">' + esc(t("sweep.yourTurn", "Du bist dran")) + '</span> — ' + esc(t("sweep.tapHint", "tippe ein Feld frei."));
    } else {
      statusEl.innerHTML = esc(t("sweep.turnOf", "Zug von")) + ' <span class="who">' + esc(shortAddr(turnAddr())) + '</span> …';
    }
    leftEl.textContent = "🔒 " + flagsUsed(game.cells) + " · " + safeCellsLeft(game.cells) + " " + t("sweep.safeLeft", "sicher übrig");

    // grid
    grid.innerHTML = "";
    var interactive = myTurn();
    for (var i = 0; i < game.cells.length; i++) {
      (function (idx) {
        var cell = game.cells[idx];
        var b = document.createElement("button");
        var cls = "ts-cell";
        var playable = interactive && !cell.revealed;
        if (cell.revealed) {
          if (cell.tracker) { cls += " ts-boom"; b.textContent = "☠"; }
          else {
            cls += " ts-rev";
            if (cell.adj) { b.textContent = String(cell.adj); cls += " ts-n" + cell.adj; }
            else b.textContent = "";
          }
        } else {
          b.textContent = cell.flagged ? "🔒" : "";
          if (playable) cls += " ts-tap";
        }
        b.className = cls;
        b.disabled = !playable;
        if (playable) b.addEventListener("click", function () { onCellTap(idx); });
        grid.appendChild(b);
      })(i);
    }
  }

  function onCellTap(idx) {
    if (!myTurn()) return;
    var cell = game.cells[idx];
    if (cell.revealed) return;
    var r = Math.floor(idx / COLS), c = idx % COLS;
    var action = game.flagMode ? "flag" : "reveal";
    if (action === "flag" ? false : cell.flagged) return; // don't reveal a locked cell
    // optimistic local apply + broadcast; both clients apply identically
    applyMove({ r: r, c: c, action: action });
    bridge.send({ ev: "move", gid: game.gid, r: r, c: c, action: action }).catch(function () {});
  }

  function applyMove(mv) {
    if (!game || game.over) return;
    var cell = game.cells[mv.r * COLS + mv.c];
    if (mv.action === "flag") {
      if (!cell.revealed) cell.flagged = !cell.flagged;
      // flagging does NOT consume the turn — keeps co-op flowing
      renderPanel();
      return;
    }
    // reveal
    if (cell.flagged || cell.revealed) { renderPanel(); return; }
    if (cell.tracker) {
      cell.revealed = true;
      revealAllTrackers();
      game.over = true; game.won = false;
      renderPanel();
      return;
    }
    floodReveal(game.cells, mv.r, mv.c);
    game.moveCount++;
    if (safeCellsLeft(game.cells) === 0) { game.over = true; game.won = true; }
    renderPanel();
  }

  function revealAllTrackers() {
    for (var i = 0; i < game.cells.length; i++) {
      if (game.cells[i].tracker) game.cells[i].revealed = true;
    }
  }

  function closeGame() {
    if (game && game.panel) { try { game.panel.remove(); } catch (e) {} }
    if (game && !game.over && bridge) {
      bridge.send({ ev: "quit", gid: game.gid }).catch(function () {});
    }
    game = null;
  }

  // ---------------- public API (called by chat-room.js) ----------------

  function init(b) { bridge = b; }

  // Host types /sweep → create game, open panel in "waiting" state, broadcast invite.
  function invite() {
    if (!bridge) return;
    if (game && !game.over) { closeGame(); }
    var seed = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
    var gid = "g" + seed.toString(36) + Math.floor((crypto.getRandomValues(new Uint32Array(1))[0]) % 100000).toString(36);
    game = {
      gid: gid, seed: seed, host: bridge.me(), guest: null,
      cells: buildBoard(seed), moveCount: 0, active: true, over: false, won: false, panel: null,
    };
    // guaranteed opening: center is auto-revealed for both once the guest joins
    ensurePanel();
    renderPanel();
    bridge.send({ ev: "invite", gid: gid, seed: seed, host: bridge.me() }).catch(function () {});
  }

  // Guest taps "Mitspielen" on an invite bubble.
  function join(gid, seed, host) {
    if (game && !game.over) closeGame();
    game = {
      gid: gid, seed: seed >>> 0, host: host, guest: bridge.me(),
      cells: buildBoard(seed >>> 0), moveCount: 0, active: true, over: false, won: false, panel: null,
    };
    openOpening();
    ensurePanel();
    renderPanel();
    bridge.send({ ev: "join", gid: gid }).catch(function () {});
  }

  // Reveal the guaranteed-safe center as a shared opening (deterministic on both sides).
  function openOpening() {
    var cr = (ROWS >> 1), cc = (COLS >> 1);
    floodReveal(game.cells, cr, cc);
  }

  /* Called from chat-room.js renderMessage for kind:"sweep".
   * Returns a DOM node to render as a chat bubble (invites only), else null. */
  function onEvent(decoded, msg, isMe) {
    var ev = decoded && decoded.ev;
    var sender = msg && msg.sender;

    if (ev === "invite") {
      // Late/echoed invites just render a bubble; only the non-host gets an active button.
      return inviteBubble(decoded, sender, isMe);
    }
    if (!game || decoded.gid !== game.gid) return null; // event for a game we're not in

    if (ev === "join") {
      if (game.host === bridge.me() && !game.guest && sender !== bridge.me()) {
        // host learns who joined; reveal the same shared opening now
        game.guest = sender;
        openOpening();
        ensurePanel();
        renderPanel();
      }
      return null;
    }
    if (ev === "move") {
      if (sender === bridge.me()) return null; // already applied optimistically
      applyMove({ r: decoded.r, c: decoded.c, action: decoded.action });
      return null;
    }
    if (ev === "quit") {
      if (!game.over && game.panel) {
        game.over = true;
        var st = game.panel.querySelector("[data-sweep-status]");
        if (st) st.innerHTML = '<span class="text-white/50">' + esc(t("sweep.partnerLeft", "Mitspieler hat die Runde verlassen.")) + '</span>';
      }
      return null;
    }
    return null;
  }

  function inviteBubble(decoded, sender, isMe) {
    var row = document.createElement("div");
    row.className = "flex justify-center my-2";
    var canJoin = !isMe && bridge && (!game || game.gid !== decoded.gid);
    var inner = document.createElement("div");
    inner.className = "rounded-2xl border border-neon-500/30 bg-void-900/70 px-4 py-3 text-center";
    inner.style.maxWidth = "85%";  // arbitrary Tailwind value not in the prebuilt CSS
    inner.innerHTML =
      '<div class="text-lg mb-1">🛡️ <span class="font-semibold">Tracker Sweep</span></div>' +
      '<div class="text-xs text-white/60 mb-2">' +
        esc(shortAddr(sender)) + ' ' + t("sweep.invited", "fordert dich zu einer Runde heraus — schützt gemeinsam den Vault.") +
      '</div>';
    if (canJoin) {
      var btn = document.createElement("button");
      btn.className = "px-4 py-2 rounded-full bg-neon-500 text-void-950 font-bold text-sm hover:bg-neon-600 transition";
      btn.textContent = t("sweep.join", "Mitspielen →");
      btn.addEventListener("click", function () {
        btn.disabled = true; btn.textContent = t("sweep.joined", "beigetreten ✓");
        join(decoded.gid, decoded.seed, decoded.host);
      });
      inner.appendChild(btn);
    } else if (isMe) {
      var w = document.createElement("div");
      w.className = "font-mono text-white/40";
      w.style.fontSize = "11px";
      w.textContent = t("sweep.waiting", "// warte auf Mitspieler …");
      inner.appendChild(w);
    }
    row.appendChild(inner);
    return row;
  }

  window.TrackerSweep = { init: init, invite: invite, onEvent: onEvent };
})();

/* i18n strings (registered order-proof; drained by i18n.js). */
(window.DDI18n ? function (x) { window.DDI18n.register(x); }
              : function (x) { (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x); })({
  de: {
    "sweep.invited": "fordert dich zu einer Runde heraus — schützt gemeinsam den Vault.",
    "sweep.join": "Mitspielen →",
    "sweep.joined": "beigetreten ✓",
    "sweep.waiting": "// warte auf Mitspieler …",
    "sweep.howto": "Tippe Felder frei. Zahl = wie viele ☠ Tracker angrenzen. 🔒 sperrt Verdächtige. Alle sicheren Felder frei = gewonnen, ein Tracker = verloren.",
    "sweep.flagMode": "🔒 Sperr-Modus",
    "sweep.won": "✓ Vault gesichert — alle Tracker umgangen.",
    "sweep.lost": "💥 Datenleck! Ein Tracker wurde aufgedeckt. Runde vorbei.",
    "sweep.yourTurn": "Du bist dran",
    "sweep.tapHint": "tippe ein Feld frei.",
    "sweep.turnOf": "Zug von",
    "sweep.safeLeft": "sicher übrig",
    "sweep.partnerLeft": "Mitspieler hat die Runde verlassen.",
  },
  en: {
    "sweep.invited": "challenges you to a round — protect the vault together.",
    "sweep.join": "Join →",
    "sweep.joined": "joined ✓",
    "sweep.waiting": "// waiting for a partner …",
    "sweep.howto": "Tap cells to clear them. A number = how many ☠ trackers are adjacent. 🔒 locks suspects. Clear every safe cell to win; hit a tracker and you lose.",
    "sweep.flagMode": "🔒 Lock mode",
    "sweep.won": "✓ Vault secured — every tracker avoided.",
    "sweep.lost": "💥 Data leak! A tracker was uncovered. Round over.",
    "sweep.yourTurn": "Your turn",
    "sweep.tapHint": "tap a cell to clear it.",
    "sweep.turnOf": "Move by",
    "sweep.safeLeft": "safe left",
    "sweep.partnerLeft": "Your partner left the round.",
  },
});
