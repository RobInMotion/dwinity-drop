/* Dead Drop — sealed gate.
   Two jobs: render the node sphere, and hand the typed key to nginx.

   No external dependencies on purpose: the site CSP is script-src 'self',
   so a CDN three.js would be blocked and an inline <script> would be too.
   The 3D below is hand-rolled — rotate, project, sort by depth, draw. */
(function () {
  "use strict";

  /* ============================== the sphere ============================== */

  var canvas = document.getElementById("globe");
  var ctx = canvas.getContext("2d");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var NODES     = 440;   // points on the sphere
  var LINK_ARC  = 0.34;  // max angular distance (rad) for a mesh edge
  var CAM       = 3.05;  // camera distance, sphere radius is 1
  var TILT      = -0.42; // pitch, radians — looking slightly down onto it
  var SPIN      = 0.045; // radians per second

  var COL_NEON   = [0, 255, 157];
  var COL_CYAN   = [0, 229, 255];
  var COL_VIOLET = [167, 139, 250];

  var W = 0, H = 0, DPR = 1, R = 0, CX = 0, CY = 0;

  /* Fibonacci lattice — even spacing without clumping at the poles. */
  var nodes = [];
  (function buildNodes() {
    var golden = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < NODES; i++) {
      var y = 1 - (i / (NODES - 1)) * 2;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var th = golden * i;
      nodes.push({
        x: Math.cos(th) * r,
        y: y,
        z: Math.sin(th) * r,
        flash: 0,          // 0..1, decays after a fragment lands
        sx: 0, sy: 0, sz: 0, scale: 0, depth: 0
      });
    }
  })();

  /* Mesh edges: every pair closer than LINK_ARC. Computed once. */
  var edges = [];
  (function buildEdges() {
    var cosLimit = Math.cos(LINK_ARC);
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var a = nodes[i], b = nodes[j];
        if (a.x * b.x + a.y * b.y + a.z * b.z > cosLimit) edges.push([i, j]);
      }
    }
  })();

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    /* The centre sits below the viewport on purpose: only the upper cap is
       visible, so the mesh reads as a horizon you are standing on rather than
       a ball behind the text. Everything above the curve stays empty for type. */
    R = Math.min(W, H) * (W < 640 ? 1.15 : 0.86);
    CX = W / 2;
    CY = H * (W < 640 ? 1.16 : 1.12);
  }
  window.addEventListener("resize", resize);
  resize();

  var yaw = 0;

  /* Rotate a unit-sphere point into view space and project it. */
  function project(p, out) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var x1 = p.x * cy - p.z * sy;
    var z1 = p.x * sy + p.z * cy;
    var ct = Math.cos(TILT), st = Math.sin(TILT);
    var y2 = p.y * ct - z1 * st;
    var z2 = p.y * st + z1 * ct;

    var depth = CAM + z2;                 // smaller = nearer the camera
    var scale = CAM / depth;              // perspective divide
    out.sx = CX + x1 * R * scale;
    out.sy = CY - y2 * R * scale;
    out.sz = z2;
    out.depth = depth;
    out.scale = scale;
    return out;
  }

  /* Front of the sphere = 1, far side = 0. Drives size and opacity so the
     mesh reads as a solid volume instead of a flat ring of dots. */
  function facing(sz) {
    return Math.max(0, Math.min(1, (1 - sz) / 2));
  }

  function rgba(c, a) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")";
  }

  /* ----------------------------- the drops ------------------------------ */
  /* A drop is the product, drawn: one payload lands, splits into fragments,
     each fragment arcs to a different node. Nothing is stored whole. */

  var fragments = [];
  var nextDrop = 0.9;

  function slerp(a, b, t, out) {
    var dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    var om = Math.acos(dot);
    if (om < 1e-4) { out.x = a.x; out.y = a.y; out.z = a.z; return out; }
    var so = Math.sin(om);
    var f1 = Math.sin((1 - t) * om) / so;
    var f2 = Math.sin(t * om) / so;
    out.x = a.x * f1 + b.x * f2;
    out.y = a.y * f1 + b.y * f2;
    out.z = a.z * f1 + b.z * f2;
    return out;
  }

  function spawnDrop() {
    var src = nodes[(Math.random() * nodes.length) | 0];
    var count = 5 + ((Math.random() * 4) | 0);
    for (var i = 0; i < count; i++) {
      var dst = nodes[(Math.random() * nodes.length) | 0];
      if (dst === src) continue;
      fragments.push({
        src: src,
        dst: dst,
        t: 0,
        speed: 0.42 + Math.random() * 0.34,
        lift: 0.16 + Math.random() * 0.22,   // how far off the surface it arcs
        delay: i * 0.045,
        colour: i % 3 === 0 ? COL_CYAN : COL_NEON
      });
    }
    src.flash = 1;
  }

  var tmp = { x: 0, y: 0, z: 0 };
  var pt = { sx: 0, sy: 0, sz: 0, depth: 0, scale: 0 };

  function drawFragment(f) {
    /* Trail: sample a few steps behind the head along the same arc. */
    var STEPS = 7;
    for (var s = STEPS; s >= 0; s--) {
      var t = f.t - s * 0.028;
      if (t <= 0) continue;
      slerp(f.src, f.dst, t, tmp);
      var lift = 1 + f.lift * Math.sin(Math.PI * t);
      var head = { x: tmp.x * lift, y: tmp.y * lift, z: tmp.z * lift };
      project(head, pt);
      var fade = (1 - s / (STEPS + 1));
      var a = fade * fade * (0.25 + 0.75 * facing(pt.sz));
      var rad = (s === 0 ? 2.1 : 1.15) * pt.scale * fade;
      ctx.fillStyle = rgba(f.colour, a * (s === 0 ? 0.95 : 0.4));
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, Math.max(0.4, rad), 0, Math.PI * 2);
      ctx.fill();
      if (s === 0) {
        ctx.fillStyle = rgba(f.colour, a * 0.16);
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, Math.max(1, rad * 4.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ------------------------------ the loop ------------------------------ */

  var last = 0;

  function frame(now) {
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;

    if (!reduced) {
      yaw += SPIN * dt;
      nextDrop -= dt;
      if (nextDrop <= 0) { spawnDrop(); nextDrop = 2.1 + Math.random() * 2.2; }
    }

    ctx.clearRect(0, 0, W, H);

    var i, n;
    for (i = 0; i < nodes.length; i++) project(nodes[i], nodes[i]);

    /* Edges first, behind the points. */
    ctx.lineWidth = 1;
    for (i = 0; i < edges.length; i++) {
      var a = nodes[edges[i][0]], b = nodes[edges[i][1]];
      var f = (facing(a.sz) + facing(b.sz)) / 2;
      if (f < 0.06) continue;
      var lit = Math.max(a.flash, b.flash);
      ctx.strokeStyle = lit > 0.02
        ? rgba(COL_NEON, 0.10 + lit * 0.55 * f)
        : rgba(COL_VIOLET, 0.035 + f * f * 0.115);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }

    /* Points, far side first so near ones sit on top. */
    var order = nodes.slice().sort(function (p, q) { return q.depth - p.depth; });
    for (i = 0; i < order.length; i++) {
      n = order[i];
      var fv = facing(n.sz);
      var rad = (0.7 + fv * 1.5) * n.scale;
      if (n.flash > 0.02) {
        ctx.fillStyle = rgba(COL_NEON, 0.10 * n.flash);
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, rad * (5 + 9 * n.flash), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(COL_NEON, 0.35 + 0.65 * n.flash);
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, rad * (1 + n.flash * 1.5), 0, Math.PI * 2);
        ctx.fill();
        if (!reduced) n.flash -= dt * 1.15;
      } else {
        ctx.fillStyle = rgba(COL_NEON, 0.10 + fv * fv * 0.62);
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* Fragments on top of everything. */
    if (!reduced) {
      for (i = fragments.length - 1; i >= 0; i--) {
        var fr = fragments[i];
        if (fr.delay > 0) { fr.delay -= dt; continue; }
        fr.t += fr.speed * dt;
        if (fr.t >= 1) { fr.dst.flash = 1; fragments.splice(i, 1); continue; }
        drawFragment(fr);
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* Glitch the sphere red for a beat on a rejected key. */
  function reject() {
    var held = COL_NEON;
    COL_NEON = [255, 46, 108];
    for (var i = 0; i < 26; i++) nodes[(Math.random() * nodes.length) | 0].flash = 1;
    setTimeout(function () { COL_NEON = held; }, 620);
  }

  /* =============================== the gate =============================== */
  /* The key is never compared here. It goes into a cookie and nginx decides —
     so the secret is not in anything the browser can read. */

  var form  = document.getElementById("gate");
  var input = document.getElementById("key");
  var field = document.getElementById("field");
  var note  = document.getElementById("note");

  var TRIED = "dd_gate_tried";

  /* Still on this page after a submit means nginx said no. */
  try {
    if (sessionStorage.getItem(TRIED)) {
      sessionStorage.removeItem(TRIED);
      document.cookie = "dd_preview=; path=/; max-age=0; SameSite=Lax; Secure";
      note.textContent = "Wrong key. Nothing opens.";
      note.classList.add("bad");
      field.classList.add("bad");
      setTimeout(function () { field.classList.remove("bad"); }, 420);
      reject();
    }
  } catch (e) { /* private mode — the gate still works, just without the notice */ }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var value = input.value.trim();
    if (!value) { input.focus(); return; }

    note.classList.remove("bad");
    note.textContent = "Checking key…";
    field.classList.remove("bad");

    try { sessionStorage.setItem(TRIED, "1"); } catch (e) {}
    document.cookie =
      "dd_preview=" + encodeURIComponent(value) +
      "; path=/; max-age=" + (60 * 60 * 24 * 30) + "; SameSite=Lax; Secure";

    /* Cache-buster: without it the browser can re-serve the gate from cache
       and a correct key would look like a wrong one. */
    window.location.replace("/?g=" + Date.now());
  });

  input.addEventListener("input", function () {
    if (!note.classList.contains("bad")) return;
    note.classList.remove("bad");
    note.textContent = "";
  });

  input.focus();
})();
