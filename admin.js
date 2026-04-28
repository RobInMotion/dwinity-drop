(function() {
  const $ = (id) => document.getElementById(id);

  function fmtBytes(n) {
    if (n == null) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + " MB";
    return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }

  function fmtAgo(ts) {
    if (!ts) return "—";
    const s = Math.floor(Date.now() / 1000 - ts);
    if (s < 60) return s + "s";
    if (s < 3600) return Math.floor(s / 60) + "min";
    if (s < 86400) return Math.floor(s / 3600) + "h";
    return Math.floor(s / 86400) + "d";
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ credentials: "include" }, opts || {}));
    if (r.status === 403) {
      $("panel").classList.add("hidden");
      $("gate").classList.remove("hidden");
      throw new Error("forbidden");
    }
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function loadStats() {
    const s = await api("/api/admin/stats");
    $("stat-active").textContent = s.drops.active ?? 0;
    $("stat-total").textContent = s.drops.total ?? 0;
    $("stat-pending").textContent = s.drops.pending ?? 0;
    $("stat-bytes").textContent = fmtBytes(s.drops.bytes_total);
    $("stat-downloads").textContent = s.drops.downloads_total ?? 0;
    $("stat-urls").textContent = s.drops.url_issued_total ?? 0;
    $("stat-reports-open").textContent = s.reports.open ?? 0;
    $("stat-reports-total").textContent = s.reports.total ?? 0;
  }

  async function loadReports() {
    const includeResolved = $("show-resolved").checked;
    const list = $("reports-list");
    list.innerHTML = '<div class="text-white/40 font-mono text-sm">// lade …</div>';
    try {
      const data = await api("/api/admin/reports" + (includeResolved ? "?include_resolved=true" : ""));
      if (!data.reports.length) {
        list.innerHTML = '<div class="text-white/40 font-mono text-sm">keine Meldungen</div>';
        return;
      }
      list.innerHTML = "";
      for (const r of data.reports) {
        const resolved = r.resolved_at !== null;
        const el = document.createElement("div");
        el.className = "p-5 rounded-2xl border " + (resolved
          ? "border-white/5 bg-void-900/40 opacity-60"
          : "border-red-500/30 bg-red-500/5");
        el.innerHTML = `
          <div class="flex items-center justify-between mb-3">
            <div class="font-mono text-xs text-white/70">
              #${r.id} · <span class="text-neon-500">${escapeHtml(r.drop_id)}</span>
              · vor ${fmtAgo(r.created_at)}
              ${resolved ? '<span class="ml-2 text-green-400">✓ resolved</span>' : ''}
            </div>
            <div class="flex gap-2">
              <a href="/d/${encodeURIComponent(r.drop_id)}" target="_blank" rel="noopener"
                 class="px-3 py-1.5 text-xs font-mono text-white/60 hover:text-white border border-white/15 rounded-full">öffnen →</a>
              ${resolved ? "" : `<button data-drop-id="${escapeHtml(r.drop_id)}" data-report-id="${r.id}"
                 class="admin-del-btn px-3 py-1.5 text-xs font-mono bg-red-500 hover:bg-red-600 text-white rounded-full">löschen</button>`}
            </div>
          </div>
          <div class="text-sm text-white/80 mb-2">${escapeHtml(r.reason)}</div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono text-white/50 mt-3 pt-3 border-t border-white/5">
            <div><div class="text-white/40 mb-1">Besitzer</div>${r.address ? escapeHtml(r.address.slice(0,10)) + "…" : "anon"}</div>
            <div><div class="text-white/40 mb-1">Größe</div>${fmtBytes(r.size)}</div>
            <div><div class="text-white/40 mb-1">Kontakt</div>${r.reporter_contact ? escapeHtml(r.reporter_contact) : "—"}</div>
            <div><div class="text-white/40 mb-1">Ablauf</div>${r.expires_at ? fmtAgo(r.expires_at) : "—"}</div>
          </div>
        `;
        list.appendChild(el);
      }
      list.querySelectorAll(".admin-del-btn").forEach(btn => {
        btn.addEventListener("click", () => deleteDrop(btn.dataset.dropId, btn));
      });
    } catch (e) {
      list.innerHTML = '<div class="text-red-400 font-mono text-sm">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }

  async function deleteDrop(dropId, btn) {
    if (!confirm("Drop " + dropId + " wirklich löschen? (Storj + DB, unwiderruflich)")) return;
    btn.disabled = true;
    btn.textContent = "// lösche …";
    try {
      await api("/api/admin/drops/" + encodeURIComponent(dropId), { method: "DELETE" });
      await Promise.all([loadStats(), loadReports()]);
    } catch (e) {
      alert("Fehler: " + e.message);
      btn.disabled = false;
      btn.textContent = "löschen";
    }
  }

  async function loadWaitlist() {
    const list = $("waitlist-list");
    const summary = $("waitlist-summary");
    const filter = $("waitlist-filter").value || "";
    list.innerHTML = '<div class="text-white/40 font-mono text-sm">// lade …</div>';
    try {
      const qs = filter ? "?product=" + encodeURIComponent(filter) : "";
      const r = await fetch("/api/waitlist/admin/signups" + qs, { credentials: "include" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      const parts = Object.entries(data.totals).map(([k, v]) => `<span class="text-white/70">${escapeHtml(k)}</span>: <span class="text-neon-500">${v}</span>`).join(" · ");
      summary.innerHTML = `Total: <span class="text-neon-500">${data.total || 0}</span> · ${parts}`;
      if (!data.signups.length) {
        list.innerHTML = '<div class="text-white/40 font-mono text-sm">keine Einträge</div>';
        return;
      }
      list.innerHTML = data.signups.map(s => `
        <div class="flex items-center justify-between gap-3 p-3 rounded-lg bg-void-800/40 border border-white/5">
          <div class="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
            <span class="px-1.5 py-0.5 rounded bg-neon-500/15 text-neon-500 text-[10px] font-mono uppercase tracking-widest">${escapeHtml(s.product)}</span>
            <span class="font-mono text-sm text-white/80 truncate">${escapeHtml(s.email)}</span>
            <span class="font-mono text-[10px] text-white/40 shrink-0">${fmtAgo(s.created_at)}</span>
          </div>
          <button data-del-signup="${s.id}" class="shrink-0 p-1.5 rounded-md hover:bg-red-500/10 text-white/40 hover:text-red-400 transition" title="Löschen">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      `).join("");
      list.querySelectorAll("[data-del-signup]").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Diesen Eintrag löschen?")) return;
          btn.disabled = true;
          try {
            const r = await fetch("/api/waitlist/admin/signups/" + encodeURIComponent(btn.dataset.delSignup), {
              method: "DELETE", credentials: "include",
            });
            if (!r.ok) throw new Error("HTTP " + r.status);
            await loadWaitlist();
          } catch (e) {
            alert("Fehler: " + e.message);
            btn.disabled = false;
          }
        });
      });
    } catch (e) {
      list.innerHTML = '<div class="text-red-400 font-mono text-sm">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }

  function exportWaitlistCSV() {
    const filter = $("waitlist-filter").value || "";
    // Use existing export.csv endpoint — needs the legacy token for now; fall back to manual copy
    fetch("/api/waitlist/admin/signups" + (filter ? "?product=" + encodeURIComponent(filter) : "") + "&limit=2000", {
      credentials: "include",
    }).then(r => r.json()).then(data => {
      const lines = ["email,product,created_at"];
      for (const s of data.signups) lines.push(`${s.email},${s.product},${s.created_at}`);
      const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dwinity-waitlist-" + (filter || "all") + "-" + new Date().toISOString().slice(0,10) + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });
  }

  async function loadOrphans() {
    const list = $("orphans-list");
    list.innerHTML = '<div class="text-white/40 font-mono text-sm">// lade …</div>';
    try {
      const r = await fetch("/api/identity/admin/orphans", { credentials: "include" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (!data.orphans.length) {
        list.innerHTML = '<div class="text-white/40 font-mono text-sm">keine orphan payments ✓</div>';
        return;
      }
      list.innerHTML = "";
      for (const o of data.orphans) {
        const atomic = o.amount_atomic;
        // Human format: USDC has 6 decimals, DWIN has 18 — quick split
        const dec = o.asset === "USDC" ? 6 : 18;
        const padded = atomic.padStart(dec + 1, "0");
        const display = padded.slice(0, -dec) + "." + padded.slice(-dec).replace(/0+$/, "") || "0";
        const el = document.createElement("div");
        el.className = "p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5";
        el.innerHTML = `
          <div class="space-y-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-2">
                <span class="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-[10px] font-mono uppercase">${o.asset}</span>
                <span class="font-mono font-600 text-neon-500">${display} ${o.asset}</span>
                <span class="text-white/40 text-[11px] font-mono">Block #${o.block_number}</span>
                <span class="text-white/40 text-[11px] font-mono">vor ${fmtAgo(o.created_at)}</span>
              </div>
              <div class="text-[11px] font-mono text-white/60 mb-1 break-all">
                <span class="text-white/40">from:</span>
                <span class="text-white/80">${escapeHtml(o.from_address)}</span>
              </div>
              <div class="text-[11px] font-mono text-white/50 truncate">
                <a href="https://snowtrace.io/tx/${encodeURIComponent(o.tx_hash)}" target="_blank" rel="noopener"
                   class="hover:text-neon-500 underline underline-offset-2 break-all">
                  ${escapeHtml(o.tx_hash)}
                </a>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-[1fr,auto,auto] gap-2 items-stretch pt-2 border-t border-white/5">
              <input type="text" maxlength="42" placeholder="0x…" value="${escapeHtml(o.from_address)}"
                data-orphan-wallet="${escapeHtml(o.tx_hash)}"
                class="w-full px-2.5 py-2 rounded-md bg-void-800 border border-white/10 font-mono text-[11px] focus:outline-none focus:border-neon-500/40" />
              <input type="number" min="1" max="3650" value="30"
                data-orphan-days="${escapeHtml(o.tx_hash)}"
                class="w-full sm:w-20 px-2.5 py-2 rounded-md bg-void-800 border border-white/10 font-mono text-xs focus:outline-none focus:border-neon-500/40" />
              <button data-orphan-assign="${escapeHtml(o.tx_hash)}"
                class="w-full sm:w-auto px-4 py-2 rounded-md bg-neon-500 hover:bg-neon-600 text-void-950 text-xs font-bold">
                zuweisen
              </button>
            </div>
          </div>
        `;
        list.appendChild(el);
      }
      list.querySelectorAll("[data-orphan-assign]").forEach(btn => {
        btn.addEventListener("click", () => {
          const tx = btn.dataset.orphanAssign;
          const walletInput = list.querySelector(`[data-orphan-wallet="${tx}"]`);
          const daysInput = list.querySelector(`[data-orphan-days="${tx}"]`);
          assignOrphan(tx, walletInput.value.trim(), parseInt(daysInput.value, 10), btn);
        });
      });
    } catch (e) {
      list.innerHTML = '<div class="text-red-400 font-mono text-sm">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }

  async function assignOrphan(tx, wallet, days, btn) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      alert("Ungültige Wallet-Adresse (0x + 40 hex)");
      return;
    }
    if (!(days >= 1 && days <= 3650)) {
      alert("Tage 1-3650");
      return;
    }
    if (!confirm(`${days} Pro-Tage an ${wallet} vergeben? (nicht umkehrbar)`)) return;
    btn.disabled = true;
    btn.textContent = "// …";
    try {
      const r = await fetch("/api/identity/admin/orphans/" + encodeURIComponent(tx) + "/assign", {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ wallet, days }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({detail: "HTTP " + r.status}));
        throw new Error(d.detail || "Fehler");
      }
      await Promise.all([loadOrphans(), loadStats()]);
    } catch (e) {
      alert("Fehler: " + e.message);
      btn.disabled = false;
      btn.textContent = "zuweisen";
    }
  }

  async function loadPromos() {
    const list = $("promos-list");
    list.innerHTML = '<div class="text-white/40 font-mono text-sm">// lade …</div>';
    try {
      const r = await fetch("/api/identity/admin/promos", { credentials: "include" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (!data.promos.length) {
        list.innerHTML = '<div class="text-white/40 font-mono text-sm">keine Promo-Codes</div>';
        return;
      }
      list.innerHTML = "";
      for (const p of data.promos) {
        const now = Math.floor(Date.now() / 1000);
        const expired = p.valid_until && p.valid_until <= now;
        const usedUp = p.max_uses !== null && p.uses_count >= p.max_uses;
        const dead = expired || usedUp;
        const validUntilStr = p.valid_until
          ? new Date(p.valid_until * 1000).toLocaleDateString("de-DE")
          : "unbegrenzt";
        const usesStr = p.max_uses !== null
          ? `${p.uses_count}/${p.max_uses}`
          : `${p.uses_count}/∞`;
        const el = document.createElement("div");
        el.className = "p-4 rounded-xl border " + (dead
          ? "border-white/5 bg-void-900/30 opacity-50"
          : "border-white/10 bg-void-900/60");
        el.innerHTML = `
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-3">
              <code class="font-mono text-lg ${dead ? 'text-white/50 line-through' : 'text-neon-500'}">${escapeHtml(p.code)}</code>
              <span class="px-2 py-0.5 rounded-full bg-neon-500/15 text-neon-500 text-xs font-bold">−${p.discount_pct}%</span>
              ${expired ? '<span class="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-mono">abgelaufen</span>' : ''}
              ${usedUp ? '<span class="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-mono">aufgebraucht</span>' : ''}
            </div>
            <div class="flex items-center gap-4 text-xs font-mono text-white/60">
              <span>Uses: <span class="text-white">${usesStr}</span></span>
              <span>bis ${validUntilStr}</span>
              <button data-promo-code="${escapeHtml(p.code)}" class="promo-del-btn px-3 py-1 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white text-xs rounded-full transition">löschen</button>
            </div>
          </div>
          ${p.note ? `<div class="mt-2 text-xs text-white/50">${escapeHtml(p.note)}</div>` : ''}
        `;
        list.appendChild(el);
      }
      list.querySelectorAll(".promo-del-btn").forEach(btn => {
        btn.addEventListener("click", () => deletePromo(btn.dataset.promoCode, btn));
      });
    } catch (e) {
      list.innerHTML = '<div class="text-red-400 font-mono text-sm">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }

  async function createPromo() {
    const errEl = $("promo-error");
    errEl.classList.add("hidden");
    const code = ($("promo-new-code").value || "").trim().toUpperCase();
    const pct = parseInt($("promo-new-pct").value, 10);
    const maxUsesRaw = $("promo-new-max").value.trim();
    const untilRaw = $("promo-new-until").value.trim();
    const note = $("promo-new-note").value.trim();
    if (!code || code.length < 3) {
      errEl.textContent = "Code mindestens 3 Zeichen"; errEl.classList.remove("hidden"); return;
    }
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      errEl.textContent = "Code: nur A-Z, 0-9, _, -"; errEl.classList.remove("hidden"); return;
    }
    if (!(pct >= 1 && pct <= 100)) {
      errEl.textContent = "Rabatt 1-100%"; errEl.classList.remove("hidden"); return;
    }
    const body = { code, discount_pct: pct };
    if (maxUsesRaw) body.max_uses = parseInt(maxUsesRaw, 10);
    if (untilRaw) body.valid_until = Math.floor(new Date(untilRaw + "T23:59:59").getTime() / 1000);
    if (note) body.note = note;
    const btn = $("promo-create-btn");
    btn.disabled = true; btn.textContent = "// erstelle …";
    try {
      const r = await fetch("/api/identity/admin/promos", {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({detail: "HTTP " + r.status}));
        throw new Error(d.detail || "Fehler");
      }
      $("promo-new-code").value = "";
      $("promo-new-max").value = "";
      $("promo-new-until").value = "";
      $("promo-new-note").value = "";
      await loadPromos();
    } catch (e) {
      errEl.textContent = "" + e.message;
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false; btn.textContent = "Erstellen";
    }
  }

  async function deletePromo(code, btn) {
    if (!confirm("Promo-Code " + code + " löschen?")) return;
    btn.disabled = true;
    try {
      const r = await fetch("/api/identity/admin/promos/" + encodeURIComponent(code), {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      await loadPromos();
    } catch (e) {
      alert("Fehler: " + e.message);
      btn.disabled = false;
    }
  }

  async function loadRevenue() {
    try {
      const r = await fetch("/api/identity/admin/revenue", { credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      $("rev-usdc").textContent = d.usdc.total_display + " USDC";
      $("rev-usdc-count").textContent = d.usdc.paid_count;
      $("rev-dwin").textContent = d.dwin.total_display + " DWIN";
      $("rev-dwin-count").textContent = d.dwin.paid_count;
      $("rev-pending").textContent = d.pending;
    } catch {}
  }

  async function loadWallets() {
    const list = $("wallets-list");
    list.innerHTML = '<div class="text-white/40 font-mono text-sm">// lade …</div>';
    try {
      const r = await fetch("/api/identity/admin/wallets", { credentials: "include" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (!data.wallets.length) {
        list.innerHTML = '<div class="text-white/40 font-mono text-sm">keine Wallets</div>';
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      list.innerHTML = data.wallets.map(w => {
        const isPro = w.pro_until > now;
        const isAdmin = !!w.is_admin;
        return `
          <div class="p-3 rounded-lg border border-white/5 bg-void-800/40 flex items-center gap-3 flex-wrap">
            <span class="font-mono text-xs text-white/80 truncate">${escapeHtml(w.address)}</span>
            ${isAdmin ? '<span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] font-mono uppercase tracking-widest">Admin</span>' : ''}
            ${isPro ? '<span class="px-1.5 py-0.5 rounded bg-neon-500/20 text-neon-500 text-[9px] font-mono uppercase tracking-widest">Pro</span>' : '<span class="px-1.5 py-0.5 rounded bg-white/5 text-white/50 text-[9px] font-mono uppercase tracking-widest">Free</span>'}
            ${w.ref_code ? `<span class="px-1.5 py-0.5 rounded bg-void-800 text-neon-500 text-[9px] font-mono">${escapeHtml(w.ref_code)}</span>` : ''}
            <div class="ml-auto flex items-center gap-3 text-[11px] font-mono text-white/50">
              ${w.total_paid_usdc ? `<span>${(w.total_paid_usdc / 1e6).toFixed(2)} USDC</span>` : ''}
              ${w.total_paid_dwin ? `<span>${(w.total_paid_dwin / 1e18).toFixed(2)} DWIN</span>` : ''}
              <span>seit ${fmtAgo(w.created_at)}</span>
              ${isAdmin ? `<button data-demote="${escapeHtml(w.address)}" class="px-2 py-1 rounded-md text-[10px] font-mono text-red-400 hover:bg-red-500/10 transition">− Admin</button>` : ''}
            </div>
          </div>
        `;
      }).join("");
      list.querySelectorAll("[data-demote]").forEach(btn => {
        btn.addEventListener("click", () => demoteAdmin(btn.dataset.demote, btn));
      });
    } catch (e) {
      list.innerHTML = '<div class="text-red-400 font-mono text-sm">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }

  async function promoteWallet() {
    const input = $("wallet-promote-input");
    const v = input.value.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(v)) {
      alert("Ungültige Wallet-Adresse (0x + 40 hex).");
      return;
    }
    try {
      const r = await fetch("/api/identity/admin/admins", {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ wallet: v }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      input.value = "";
      await loadWallets();
    } catch (e) {
      alert("Fehler: " + e.message);
    }
  }

  async function demoteAdmin(wallet, btn) {
    if (!confirm("Admin-Rechte für " + wallet + " entziehen?")) return;
    btn.disabled = true;
    try {
      const r = await fetch("/api/identity/admin/admins/" + encodeURIComponent(wallet), {
        method: "DELETE", credentials: "include",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({detail: "HTTP " + r.status}));
        throw new Error(d.detail || "Fehler");
      }
      await loadWallets();
    } catch (e) {
      alert("Fehler: " + e.message);
      btn.disabled = false;
    }
  }

  async function loadAllDrops() {
    const list = $("all-drops-list");
    list.innerHTML = '<div class="text-white/40 font-mono text-sm">// lade …</div>';
    try {
      const r = await fetch("/api/admin/all-drops", { credentials: "include" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      const now = data.now || Math.floor(Date.now() / 1000);
      if (!data.drops.length) {
        list.innerHTML = '<div class="text-white/40 font-mono text-sm">keine Drops</div>';
        return;
      }
      list.innerHTML = data.drops.map(d => {
        const active = d.expires_at > now;
        const owner = d.address ? d.address.slice(0,10) + "…" + d.address.slice(-4) : "anon";
        return `
          <div class="p-3 rounded-lg border border-white/5 bg-void-800/40 flex items-center gap-3 flex-wrap text-xs font-mono">
            ${active
              ? '<span class="px-1.5 py-0.5 rounded bg-neon-500/20 text-neon-500 text-[9px] uppercase">aktiv</span>'
              : '<span class="px-1.5 py-0.5 rounded bg-white/5 text-white/40 text-[9px] uppercase">expired</span>'}
            <span class="text-white/70">${escapeHtml(d.id)}</span>
            <span class="text-white/40">${escapeHtml(owner)}</span>
            <span class="text-white/60">${fmtBytes(d.size)}</span>
            <span class="text-white/50">⬇ ${d.download_count || 0}${d.url_issued_count > d.download_count ? ` · URLs: ${d.url_issued_count}` : ''}</span>
            <span class="ml-auto text-white/40">vor ${fmtAgo(d.created_at)}</span>
            ${d.upload_state !== 'complete' ? '<span class="px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 text-[9px] uppercase">pending</span>' : ''}
          </div>
        `;
      }).join("");
    } catch (e) {
      list.innerHTML = '<div class="text-red-400 font-mono text-sm">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }

  async function loadAllRooms() {
    const list = $("all-rooms-list");
    list.innerHTML = '<div class="text-white/40 font-mono text-sm">// lade …</div>';
    try {
      const r = await fetch("/api/chat/admin/rooms", { credentials: "include" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (!data.rooms.length) {
        list.innerHTML = '<div class="text-white/40 font-mono text-sm">keine Rooms</div>';
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      list.innerHTML = data.rooms.map(r => {
        const active = !r.expires_at || r.expires_at > now;
        const name = r.name || "(unnamed)";
        const creator = r.creator ? r.creator.slice(0,10) + "…" + r.creator.slice(-4) : "—";
        return `
          <div class="p-3 rounded-lg border border-white/5 bg-void-800/40 flex items-center gap-3 flex-wrap text-xs font-mono">
            ${active
              ? '<span class="px-1.5 py-0.5 rounded bg-neon-500/20 text-neon-500 text-[9px] uppercase">aktiv</span>'
              : '<span class="px-1.5 py-0.5 rounded bg-white/5 text-white/40 text-[9px] uppercase">expired</span>'}
            <span class="text-white/70 truncate">${escapeHtml(name)}</span>
            <span class="text-white/40">${escapeHtml(creator)}</span>
            <span class="text-white/60">${r.members || 0} Member</span>
            <span class="text-white/60">${r.message_count || 0} Msgs</span>
            <span class="ml-auto text-white/40">${r.last_message_at ? 'letzte: vor ' + fmtAgo(r.last_message_at) : 'leer'}</span>
          </div>
        `;
      }).join("");
    } catch (e) {
      list.innerHTML = '<div class="text-red-400 font-mono text-sm">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }

  async function loadInvoices() {
    const list = $("invoices-list");
    const filter = $("invoices-filter").value || "";
    list.innerHTML = '<div class="text-white/40 font-mono text-sm">// lade …</div>';
    try {
      const qs = filter ? "?status=" + encodeURIComponent(filter) : "";
      const r = await fetch("/api/identity/admin/invoices" + qs, { credentials: "include" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (!data.invoices.length) {
        list.innerHTML = '<div class="text-white/40 font-mono text-sm">keine Invoices</div>';
        return;
      }
      list.innerHTML = data.invoices.map(inv => {
        const statusCls = inv.status === 'paid' ? 'bg-neon-500/20 text-neon-500' :
                         inv.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                         'bg-white/5 text-white/40';
        const owner = inv.address.slice(0,10) + "…" + inv.address.slice(-4);
        const dec = inv.asset === 'USDC' ? 6 : 18;
        const atomic = BigInt(inv.amount_atomic);
        const div = 10n ** BigInt(dec);
        const whole = Number(atomic / div);
        const frac = Number(atomic % div) / Number(div);
        const display = (whole + frac).toFixed(Math.min(6, dec));
        return `
          <div class="p-3 rounded-lg border border-white/5 bg-void-800/40 flex items-center gap-3 flex-wrap text-xs font-mono">
            <span class="px-1.5 py-0.5 rounded ${statusCls} text-[9px] uppercase tracking-widest">${inv.status}</span>
            <span class="text-white/70">#${inv.id}</span>
            <span class="text-white/40">${escapeHtml(owner)}</span>
            <span class="text-neon-500">${display} ${inv.asset}</span>
            ${inv.discount_pct > 0 ? `<span class="text-white/50">−${inv.discount_pct}%</span>` : ''}
            ${inv.promo_code ? `<span class="text-white/40">${escapeHtml(inv.promo_code)}</span>` : ''}
            <span class="text-white/50">${inv.duration_days}d</span>
            <span class="ml-auto text-white/40">vor ${fmtAgo(inv.created_at)}</span>
            ${inv.paid_tx ? `<a href="https://snowtrace.io/tx/${encodeURIComponent(inv.paid_tx)}" target="_blank" rel="noopener" class="text-neon-500 hover:underline">tx →</a>` : ''}
          </div>
        `;
      }).join("");
    } catch (e) {
      list.innerHTML = '<div class="text-red-400 font-mono text-sm">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }

  async function loadTopupStats() {
    try {
      const s = await api("/api/identity/admin/topup-stats");
      $("topup-usdc-total").textContent = s.usdc.total_display + " USDC";
      $("topup-usdc-count").textContent = s.usdc.paid_count;
      $("topup-usdc-gb").textContent = s.usdc.gb_total;
      $("topup-dwin-total").textContent = s.dwin.total_display + " DWIN";
      $("topup-dwin-count").textContent = s.dwin.paid_count;
      $("topup-dwin-gb").textContent = s.dwin.gb_total;
      $("topup-gb-total").textContent = (s.usdc.gb_total + s.dwin.gb_total);
      $("topup-pending").textContent = s.pending;
    } catch (e) {
      if (String(e).includes("forbidden")) return;
    }
  }

  async function loadEgressCounters() {
    const list = $("egress-list");
    if (!list) return;
    try {
      const data = await api("/api/admin/egress-counters");
      const counters = data.counters || [];
      if (!counters.length) {
        list.innerHTML = '<div class="text-white/40 font-mono text-sm">// keine Egress-Counter</div>';
        return;
      }
      list.innerHTML = counters.map((c) => {
        const used = fmtBytes(c.bytes_used);
        const credits = fmtBytes(c.bytes_credits);
        const periodAge = fmtAgo(c.period_start);
        return (
          '<div class="stat-card text-xs font-mono flex flex-wrap items-center justify-between gap-3">' +
            '<div class="truncate">' + escapeHtml(c.address) + '</div>' +
            '<div class="text-white/60">' +
              'used <span class="text-white">' + used + '</span> · ' +
              'credits <span class="text-neon-500">' + credits + '</span> · ' +
              'period ' + periodAge + ' · upd ' + fmtAgo(c.last_updated) +
            '</div>' +
          '</div>'
        );
      }).join("");
    } catch (e) {
      if (String(e).includes("forbidden")) return;
      list.innerHTML = '<div class="text-red-400 font-mono text-xs">' + escapeHtml(String(e)) + '</div>';
    }
  }

  async function addEgressCredits() {
    const err = $("egress-error");
    err.classList.add("hidden");
    const addr = ($("egress-new-addr").value || "").trim().toLowerCase();
    const gb = parseInt($("egress-new-gb").value, 10);
    const note = ($("egress-new-note").value || "").trim();
    if (!/^0x[0-9a-f]{40}$/.test(addr)) {
      err.textContent = "Wallet-Adresse ungültig";
      err.classList.remove("hidden");
      return;
    }
    if (!Number.isFinite(gb) || gb < 1 || gb > 10000) {
      err.textContent = "GB muss zwischen 1 und 10000 liegen";
      err.classList.remove("hidden");
      return;
    }
    try {
      const r = await fetch("/api/admin/egress-credit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr, gb, note: note || null }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      $("egress-new-addr").value = "";
      $("egress-new-note").value = "";
      await loadEgressCounters();
    } catch (e) {
      err.textContent = String(e);
      err.classList.remove("hidden");
    }
  }

  async function boot() {
    let me;
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      me = r.ok ? await r.json() : null;
    } catch { me = null; }

    if (!me || !me.address) {
      $("gate").classList.remove("hidden");
      return;
    }

    // Probe admin endpoint — server is source of truth
    try {
      await api("/api/admin/stats");
    } catch {
      $("gate").classList.remove("hidden");
      return;
    }

    $("admin-wallet").textContent = me.address.slice(0, 10) + "…" + me.address.slice(-4);
    $("panel").classList.remove("hidden");

    await Promise.all([
      loadStats(), loadReports(), loadWaitlist(), loadOrphans(), loadPromos(),
      loadRevenue(), loadWallets(), loadAllDrops(), loadAllRooms(), loadInvoices(),
      loadEgressCounters(), loadTopupStats(),
    ]);

    $("show-resolved").addEventListener("change", loadReports);
    const egressBtn = $("egress-add-btn");
    if (egressBtn) egressBtn.addEventListener("click", addEgressCredits);
    const createBtn = $("promo-create-btn");
    if (createBtn) createBtn.addEventListener("click", createPromo);
    const wlFilter = $("waitlist-filter");
    if (wlFilter) wlFilter.addEventListener("change", loadWaitlist);
    const wlExport = $("waitlist-export");
    if (wlExport) wlExport.addEventListener("click", exportWaitlistCSV);
    const promoteBtn = $("wallet-promote-btn");
    if (promoteBtn) promoteBtn.addEventListener("click", promoteWallet);
    const invFilter = $("invoices-filter");
    if (invFilter) invFilter.addEventListener("change", loadInvoices);
    setInterval(() => { loadStats(); loadRevenue(); }, 30_000);
  }

  boot();
})();
