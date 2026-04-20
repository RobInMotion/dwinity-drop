/* Dwinity NetStream Background
   =============================
   Replaces Vanta NET with a custom mesh where:
    - nodes drift slowly,
    - connections appear between close nodes,
    - small "data packets" travel along those connections,
    - occasional short code snippets flash next to a packet.
   All calm. No flashing, no scan lines. */
(function () {
  const canvas = document.getElementById("netstream-bg");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const prefersReduced = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, DPR = 1;
  function fit() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  fit();
  window.addEventListener("resize", fit);

  // ——— nodes ———
  const NODE_COUNT = 28;
  const NODES = [];
  function seedNodes() {
    NODES.length = 0;
    for (let i = 0; i < NODE_COUNT; i++) {
      NODES.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.13,
        r: 1.4 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  seedNodes();
  window.addEventListener("resize", seedNodes);

  const CONNECT_DIST = 220;

  // ——— packets travelling along an active connection ———
  const PACKETS = [];
  function spawnPacket() {
    if (prefersReduced) return;
    // pick two nodes that are currently within connect distance
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = NODES[Math.floor(Math.random() * NODES.length)];
      const b = NODES[Math.floor(Math.random() * NODES.length)];
      if (a === b) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < CONNECT_DIST * CONNECT_DIST) {
        PACKETS.push({
          from: a, to: b,
          t0: performance.now(),
          life: 1400 + Math.random() * 800,
          code: Math.random() < 0.35 ? randomCode() : null,
        });
        return;
      }
    }
  }
  const CODE_POOL = [
    "0xAE32·4F1D", "SHA256", "AES-256-GCM", "0x13E9·3ED",
    "STORJ:29/80", "ERC-20", "DWIN", "SEND()", "COMMIT",
    "0xF4D8·CA35", "sig:0x…", "nonce:0x…", "fragment:7/29",
    "encrypt()", "IPFS·cid", "avax·43114", "BLOCK·ACK",
  ];
  function randomCode() {
    return CODE_POOL[Math.floor(Math.random() * CODE_POOL.length)];
  }

  function drawConnections() {
    ctx.lineWidth = 0.6;
    for (let i = 0; i < NODES.length; i++) {
      for (let j = i + 1; j < NODES.length; j++) {
        const a = NODES[i], b = NODES[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= CONNECT_DIST) continue;
        const fade = 1 - d / CONNECT_DIST;
        ctx.strokeStyle = `rgba(0,255,157,${fade * 0.18})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }

  function drawPackets(now) {
    for (let i = PACKETS.length - 1; i >= 0; i--) {
      const p = PACKETS[i];
      const age = now - p.t0;
      if (age >= p.life) { PACKETS.splice(i, 1); continue; }
      const r = age / p.life;                 // 0..1
      const ease = r * r * (3 - 2 * r);       // smoothstep
      const x = p.from.x + (p.to.x - p.from.x) * ease;
      const y = p.from.y + (p.to.y - p.from.y) * ease;
      // fading trail: a few afterimage dots behind the leader
      for (let k = 0; k < 5; k++) {
        const kr = ease - k * 0.04;
        if (kr < 0) break;
        const tx = p.from.x + (p.to.x - p.from.x) * kr;
        const ty = p.from.y + (p.to.y - p.from.y) * kr;
        const alpha = (1 - k / 5) * 0.9 * Math.sin(r * Math.PI);
        ctx.fillStyle = `rgba(180,255,210,${alpha * 0.7})`;
        ctx.beginPath(); ctx.arc(tx, ty, Math.max(0.8, 2 - k * 0.35), 0, Math.PI * 2); ctx.fill();
      }
      // bright leading dot
      const leadAlpha = Math.sin(r * Math.PI) * 0.95;
      ctx.shadowColor = "rgba(0,255,157,0.9)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(140,255,200,${leadAlpha})`;
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // optional code snippet
      if (p.code && r > 0.15 && r < 0.85) {
        ctx.font = "500 10px JetBrains Mono, monospace";
        ctx.fillStyle = `rgba(0,255,157,${leadAlpha * 0.75})`;
        ctx.fillText(p.code, x + 8, y - 6);
      }
    }
  }

  function drawNodes(now) {
    // drift + bounce
    for (const n of NODES) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
    }
    // soft glow discs
    for (const n of NODES) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.0014 + n.phase);
      ctx.shadowColor = "rgba(0,255,157,0.7)";
      ctx.shadowBlur = 6 + pulse * 4;
      ctx.fillStyle = `rgba(0,255,157,${0.35 + pulse * 0.35})`;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function drawBg() {
    // deep void with distant nebula wash
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#05060A");
    bg.addColorStop(0.5, "#070915");
    bg.addColorStop(1, "#040610");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    const n1 = ctx.createRadialGradient(W * 0.25, H * 0.2, 20, W * 0.25, H * 0.2, H * 0.6);
    n1.addColorStop(0, "rgba(0,255,157,0.07)"); n1.addColorStop(1, "rgba(0,255,157,0)");
    ctx.fillStyle = n1; ctx.fillRect(0, 0, W, H);
    const n2 = ctx.createRadialGradient(W * 0.8, H * 0.75, 20, W * 0.8, H * 0.75, H * 0.6);
    n2.addColorStop(0, "rgba(0,229,255,0.05)"); n2.addColorStop(1, "rgba(0,229,255,0)");
    ctx.fillStyle = n2; ctx.fillRect(0, 0, W, H);
  }

  // packet spawn scheduler: one every ~400–900ms
  let nextSpawn = performance.now() + 500;
  function frame(now) {
    drawBg();
    drawConnections();
    drawNodes(now);
    drawPackets(now);
    if (now > nextSpawn) {
      spawnPacket();
      nextSpawn = now + 350 + Math.random() * 550;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
