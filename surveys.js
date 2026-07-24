// Survey Pools — participant flow (M2). Vanilla, same-origin API.
(function () {
  const $ = (id) => document.getElementById(id);
  const listEl = $("survey-list");
  const overlay = $("survey-overlay");
  const panel = $("survey-panel");

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- list ----------
  async function loadList() {
    try {
      const r = await fetch("/api/surveys", { credentials: "include" });
      const d = await r.json();
      renderList(d.surveys || []);
    } catch {
      listEl.innerHTML = '<div class="col-span-full text-center text-red-400 font-mono text-sm py-16">Konnte Umfragen nicht laden.</div>';
    }
  }

  function renderList(surveys) {
    if (!surveys.length) {
      listEl.innerHTML = '<div class="col-span-full text-center text-white/40 font-mono text-sm py-16">Aktuell keine offenen Umfragen.</div>';
      return;
    }
    listEl.innerHTML = surveys.map(cardHtml).join("");
    listEl.querySelectorAll("[data-open]").forEach((b) =>
      b.addEventListener("click", () => openSurvey(b.dataset.open)));
  }

  function cardHtml(s) {
    const pct = Math.min(100, Math.round((s.responses / Math.max(1, s.target_n)) * 100));
    const badge = s.answered
      ? '<span class="chip bg-neon-500/15 text-neon-500 shrink-0"><svg class="ic w-3.5 h-3.5"><use href="#i-check"/></svg> beantwortet</span>'
      : s.full
        ? '<span class="chip bg-white/10 text-white/50 shrink-0">voll</span>'
        : "";
    const btn = (s.answered || s.full)
      ? ""
      : '<button data-open="' + esc(s.slug) + '" class="mt-4 w-full px-4 py-2.5 rounded-full bg-neon-500 text-void-950 font-bold hover:bg-neon-600 transition">Teilnehmen →</button>';
    return (
      '<div class="p-5 rounded-2xl bg-void-900/60 border border-white/10 flex flex-col">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<h3 class="font-semibold text-lg leading-tight">' + esc(s.title) + "</h3>" + badge +
        "</div>" +
        '<p class="mt-2 text-sm text-white/60 flex-1">' + esc(s.description) + "</p>" +
        '<div class="mt-4 flex items-center gap-4 text-xs font-mono">' +
          '<span class="inline-flex items-center gap-1 text-neon-500"><svg class="ic w-4 h-4"><use href="#i-coin"/></svg>' + esc(s.reward_dwin) + " mDWIN</span>" +
          '<span class="inline-flex items-center gap-1 text-white/50"><svg class="ic w-4 h-4"><use href="#i-users"/></svg>' + esc(s.responses) + " / " + esc(s.target_n) + "</span>" +
        "</div>" +
        '<div class="mt-2 h-1.5 rounded-full bg-void-950 overflow-hidden"><div class="h-full bg-gradient-to-r from-neon-500 to-cyan-400" style="width:' + pct + '%"></div></div>' +
        btn +
      "</div>"
    );
  }

  // ---------- detail: consent + form ----------
  async function openSurvey(slug) {
    openOverlay('<div class="text-center text-white/50 font-mono text-sm py-10">Lädt …</div>');
    let s;
    try {
      const r = await fetch("/api/surveys/" + encodeURIComponent(slug), { credentials: "include" });
      if (!r.ok) throw new Error();
      s = await r.json();
    } catch {
      openOverlay('<div class="text-center text-red-400 font-mono text-sm py-10">Konnte Umfrage nicht laden.</div>' + closeBtn());
      return;
    }
    if (s.answered) { openOverlay(doneHtml(s.reward_dwin, null, "Du hast diese Umfrage schon beantwortet.")); return; }
    renderForm(s);
  }

  function questionHtml(q, i) {
    const req = q.required === false ? ' <span class="text-white/30">(optional)</span>' : "";
    let input = "";
    if (q.type === "single") {
      input = q.options.map((o) =>
        '<label class="flex items-center gap-2 px-3 py-2 rounded-lg bg-void-800/60 border border-white/10 hover:border-neon-500/40 cursor-pointer">' +
          '<input type="radio" name="q_' + esc(q.id) + '" value="' + esc(o) + '" class="accent-neon-500"> <span class="text-sm">' + esc(o) + "</span></label>"
      ).join("");
      input = '<div class="grid gap-1.5">' + input + "</div>";
    } else if (q.type === "multi") {
      input = q.options.map((o) =>
        '<label class="flex items-center gap-2 px-3 py-2 rounded-lg bg-void-800/60 border border-white/10 hover:border-neon-500/40 cursor-pointer">' +
          '<input type="checkbox" name="q_' + esc(q.id) + '" value="' + esc(o) + '" class="accent-neon-500"> <span class="text-sm">' + esc(o) + "</span></label>"
      ).join("");
      input = '<div class="grid gap-1.5">' + input + "</div>";
    } else if (q.type === "scale") {
      let opts = "";
      for (let v = q.min; v <= q.max; v++)
        opts += '<label class="flex-1 text-center px-2 py-2 rounded-lg bg-void-800/60 border border-white/10 hover:border-neon-500/40 cursor-pointer text-sm">' +
          '<input type="radio" name="q_' + esc(q.id) + '" value="' + v + '" class="sr-only peer"><span class="peer-checked:text-neon-500">' + v + "</span></label>";
      input = '<div class="flex gap-1.5">' + opts + "</div>";
    } else if (q.type === "number") {
      input = '<input type="number" name="q_' + esc(q.id) + '"' +
        (q.min != null ? ' min="' + esc(q.min) + '"' : "") + (q.max != null ? ' max="' + esc(q.max) + '"' : "") +
        ' class="w-full px-3 py-2 rounded-lg bg-void-800/60 border border-white/10 focus:border-neon-500/40 focus:outline-none text-sm" inputmode="numeric">';
    }
    return '<div class="mb-4"><div class="text-sm font-medium mb-2">' + (i + 1) + ". " + esc(q.text) + req + "</div>" + input + "</div>";
  }

  function renderForm(s) {
    const qs = (s.questions || []).map(questionHtml).join("");
    openOverlay(
      '<div class="flex items-start justify-between gap-3 mb-1">' +
        '<h2 class="text-xl font-semibold leading-tight">' + esc(s.title) + "</h2>" +
        '<button data-close class="shrink-0 text-white/40 hover:text-white text-xl leading-none">×</button>' +
      "</div>" +
      '<div class="flex items-center gap-3 text-xs font-mono text-white/50 mb-4">' +
        '<span class="inline-flex items-center gap-1 text-neon-500"><svg class="ic w-4 h-4"><use href="#i-coin"/></svg>' + esc(s.reward_dwin) + " mDWIN</span>" +
        "<span>→ " + esc(s.recipient_label || "Auftraggeber") + "</span></div>" +
      '<form id="survey-form">' + qs +
        '<label class="flex items-start gap-2.5 mt-2 mb-4 p-3 rounded-lg bg-neon-500/5 border border-neon-500/20 cursor-pointer">' +
          '<input type="checkbox" id="consent-box" class="mt-0.5 accent-neon-500">' +
          '<span class="text-xs text-white/70 leading-relaxed">Ich willige ein, dass meine Antworten <b class="text-white">pseudonym</b> (ohne Wallet/Name) an <b class="text-white">' + esc(s.recipient_label || "den Auftraggeber") + "</b> geliefert werden. Dafür erhalte ich " + esc(s.reward_dwin) + " mDWIN.</span>" +
        "</label>" +
        '<div id="survey-err" class="hidden mb-3 text-xs font-mono text-red-400"></div>' +
        '<button type="submit" class="w-full px-5 py-3 rounded-full bg-neon-500 text-void-950 font-bold hover:bg-neon-600 transition disabled:opacity-40" disabled id="survey-submit">Antworten & einlösen</button>' +
      "</form>"
    );
    const box = $("consent-box"), submit = $("survey-submit");
    box.addEventListener("change", () => { submit.disabled = !box.checked; });
    $("survey-form").addEventListener("submit", (e) => { e.preventDefault(); submitAnswers(s); });
  }

  function collectAnswers(s) {
    const form = $("survey-form");
    const out = {};
    for (const q of s.questions) {
      if (q.type === "single" || q.type === "scale") {
        const el = form.querySelector('input[name="q_' + q.id + '"]:checked');
        if (el) out[q.id] = q.type === "scale" ? Number(el.value) : el.value;
      } else if (q.type === "multi") {
        const vals = [...form.querySelectorAll('input[name="q_' + q.id + '"]:checked')].map((x) => x.value);
        if (vals.length) out[q.id] = vals;
      } else if (q.type === "number") {
        const el = form.querySelector('input[name="q_' + q.id + '"]');
        if (el && el.value !== "") out[q.id] = Number(el.value);
      }
    }
    return out;
  }

  async function submitAnswers(s) {
    const err = $("survey-err"), submit = $("survey-submit");
    err.classList.add("hidden");
    submit.disabled = true; submit.textContent = "Sende …";
    try {
      const r = await fetch("/api/surveys/" + encodeURIComponent(s.slug) + "/respond", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, answers: collectAnswers(s) }),
      });
      if (r.status === 401) {
        showErr(err, "Bitte zuerst Wallet verbinden (oben rechts), dann erneut absenden.");
        if (typeof window.connectWallet === "function") window.connectWallet();
      } else if (r.status === 409) { openOverlay(doneHtml(s.reward_dwin, null, "Du hast diese Umfrage schon beantwortet.")); loadList(); }
      else if (r.status === 410) { showErr(err, "Diese Umfrage ist voll oder geschlossen."); }
      else if (r.status === 400) { const j = await r.json().catch(() => ({})); showErr(err, "Bitte alle Pflichtfragen beantworten." + (j.detail ? " (" + j.detail + ")" : "")); }
      else if (!r.ok) { showErr(err, "Senden fehlgeschlagen (HTTP " + r.status + ")."); }
      else {
        const j = await r.json();
        openOverlay(doneHtml(j.reward_dwin, j.pseudonym));
        loadList(); loadActivity();
      }
    } catch {
      showErr(err, "Netzwerkfehler — nochmal versuchen.");
    } finally {
      if (submit.isConnected) { submit.disabled = false; submit.textContent = "Antworten & einlösen"; }
    }
  }

  function showErr(el, msg) { el.textContent = msg; el.classList.remove("hidden"); }

  function doneHtml(reward, pseudo, note) {
    return (
      '<div class="text-center py-4">' +
        '<div class="w-14 h-14 mx-auto rounded-full bg-neon-500/15 grid place-items-center mb-4"><svg class="ic w-7 h-7 text-neon-500"><use href="#i-check"/></svg></div>' +
        '<h2 class="text-xl font-semibold mb-2">' + (note ? esc(note) : "Danke fürs Mitmachen!") + "</h2>" +
        (note ? "" : '<p class="text-white/60 text-sm mb-1">Du hast <b class="text-neon-500">' + esc(reward) + " mDWIN</b> gutgeschrieben bekommen.</p>") +
        (pseudo ? '<p class="text-white/40 text-xs font-mono mb-4">Geliefert als Deckname <b>' + esc(pseudo) + "</b> — nie dein Wallet.</p>" : '<div class="mb-4"></div>') +
        '<button data-close class="px-6 py-2.5 rounded-full bg-neon-500 text-void-950 font-bold hover:bg-neon-600 transition">Schließen</button>' +
      "</div>"
    );
  }

  function closeBtn() { return '<div class="text-center mt-4"><button data-close class="px-5 py-2 rounded-full border border-white/20 text-sm">Schließen</button></div>'; }

  // ---------- overlay ----------
  function openOverlay(html) {
    panel.innerHTML = html;
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
    panel.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeOverlay));
  }
  function closeOverlay() { overlay.classList.add("hidden"); overlay.classList.remove("flex"); }
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });

  // ---------- awareness counter ----------
  async function loadActivity() {
    try {
      const r = await fetch("/api/surveys/me/activity", { credentials: "include" });
      const d = await r.json();
      if ((d.responses || 0) > 0) {
        $("act-today").textContent = d.today;
        $("act-week").textContent = d.week;
        $("survey-activity").classList.remove("hidden");
      }
    } catch {}
  }

  // ---------- Stufe 2: self-service creation ----------
  let draftQ = [];

  function openCreate() {
    draftQ = [{ type: "single", text: "", options: ["", ""], required: true }];
    openOverlay(createShell());
    $("sv-add-q").addEventListener("click", () => { draftQ.push({ type: "single", text: "", options: ["", ""], required: true }); renderBuilder(); });
    $("sv-create-form").addEventListener("submit", (e) => { e.preventDefault(); submitCreate(); });
    renderBuilder();
  }

  function createShell() {
    return (
      '<div class="flex items-start justify-between gap-3 mb-4">' +
        '<h2 class="text-xl font-semibold">Umfrage erstellen</h2>' +
        '<button data-close class="shrink-0 text-white/40 hover:text-white text-xl leading-none">×</button>' +
      "</div>" +
      '<form id="sv-create-form" class="space-y-3">' +
        field("sv-title", "Titel", '<input id="sv-title" required maxlength="120" class="' + inp() + '" placeholder="z.B. Café-Gewohnheiten">') +
        field("sv-desc", "Beschreibung", '<textarea id="sv-desc" maxlength="600" rows="2" class="' + inp() + '" placeholder="Worum geht es?"></textarea>') +
        field("sv-recipient", "Empfänger-Label (was Teilnehmer sehen)", '<input id="sv-recipient" maxlength="120" class="' + inp() + '" placeholder="z.B. Bachelorarbeit Sportwissenschaft">') +
        '<div class="grid grid-cols-2 gap-3">' +
          field("sv-target", "Ziel-Teilnehmer", '<input id="sv-target" type="number" min="5" max="1000" value="50" class="' + inp() + '">') +
          field("sv-reward", "Belohnung (mDWIN)", '<input id="sv-reward" type="number" min="0" step="0.5" value="3" class="' + inp() + '">') +
        "</div>" +
        '<div class="pt-2"><div class="text-xs font-mono uppercase tracking-widest text-white/40 mb-2">Fragen</div><div id="sv-builder" class="space-y-3"></div>' +
          '<button type="button" id="sv-add-q" class="mt-2 text-sm font-mono text-neon-500 hover:underline">+ Frage hinzufügen</button></div>' +
        '<div id="sv-create-err" class="hidden text-xs font-mono text-red-400"></div>' +
        '<button type="submit" class="w-full px-5 py-3 rounded-full bg-neon-500 text-void-950 font-bold hover:bg-neon-600 transition">Zur Freigabe einreichen</button>' +
        '<p class="text-[11px] text-white/40 text-center">Geht erst nach kurzer Prüfung live. Nur strukturierte Fragen.</p>' +
      "</form>"
    );
  }
  function field(id, label, html) {
    return '<div><label for="' + id + '" class="block text-xs text-white/50 mb-1">' + esc(label) + "</label>" + html + "</div>";
  }
  function inp() { return "w-full px-3 py-2 rounded-lg bg-void-800/60 border border-white/10 focus:border-neon-500/40 focus:outline-none text-sm"; }

  function renderBuilder() {
    const box = $("sv-builder");
    box.innerHTML = draftQ.map((q, i) => {
      const opts = (q.type === "single" || q.type === "multi")
        ? '<textarea data-q="' + i + '" data-f="options" rows="2" class="' + inp() + ' mt-1.5" placeholder="Optionen, eine pro Zeile">' + esc((q.options || []).join("\n")) + "</textarea>"
        : q.type === "scale"
          ? '<div class="flex gap-2 mt-1.5"><input data-q="' + i + '" data-f="min" type="number" value="' + (q.min ?? 1) + '" class="' + inp() + '" placeholder="min"><input data-q="' + i + '" data-f="max" type="number" value="' + (q.max ?? 5) + '" class="' + inp() + '" placeholder="max"></div>'
          : "";
      return (
        '<div class="p-3 rounded-lg bg-void-800/40 border border-white/10">' +
          '<div class="flex gap-2 items-center">' +
            '<select data-q="' + i + '" data-f="type" class="' + inp() + ' max-w-[130px]">' +
              ["single", "multi", "scale", "number"].map((t) => '<option value="' + t + '"' + (q.type === t ? " selected" : "") + ">" + ({ single: "Einzelwahl", multi: "Mehrfachwahl", scale: "Skala", number: "Zahl" }[t]) + "</option>").join("") +
            "</select>" +
            '<button type="button" data-del="' + i + '" class="ml-auto text-white/30 hover:text-red-400 text-lg leading-none">×</button>' +
          "</div>" +
          '<input data-q="' + i + '" data-f="text" value="' + esc(q.text || "") + '" class="' + inp() + ' mt-2" placeholder="Fragetext">' +
          opts +
        "</div>"
      );
    }).join("");
    box.querySelectorAll("[data-q]").forEach((el) => {
      el.addEventListener("input", () => updateDraft(el));
      el.addEventListener("change", () => { updateDraft(el); if (el.dataset.f === "type") renderBuilder(); });
    });
    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { draftQ.splice(+b.dataset.del, 1); renderBuilder(); }));
  }
  function updateDraft(el) {
    const q = draftQ[+el.dataset.q], f = el.dataset.f;
    if (f === "options") q.options = el.value.split("\n").map((s) => s.trim()).filter(Boolean);
    else if (f === "min" || f === "max") q[f] = parseInt(el.value, 10);
    else q[f] = el.value;
  }

  async function submitCreate() {
    const err = $("sv-create-err");
    err.classList.add("hidden");
    const questions = draftQ.map((q, i) => {
      const o = { id: "q" + (i + 1), type: q.type, text: (q.text || "").trim(), required: true };
      if (q.type === "single" || q.type === "multi") o.options = q.options || [];
      if (q.type === "scale") { o.min = q.min ?? 1; o.max = q.max ?? 5; }
      return o;
    });
    const body = {
      title: $("sv-title").value.trim(),
      description: $("sv-desc").value.trim(),
      recipient_label: $("sv-recipient").value.trim(),
      target_n: parseInt($("sv-target").value, 10) || 50,
      reward_dwin: parseFloat($("sv-reward").value) || 0,
      questions,
    };
    try {
      const r = await fetch("/api/surveys", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.status === 401) { showErr(err, "Bitte zuerst Wallet verbinden."); if (window.connectWallet) window.connectWallet(); return; }
      if (r.status === 422 || r.status === 400) { const j = await r.json().catch(() => ({})); showErr(err, "Bitte prüfen: Titel ≥3 Zeichen, jede Frage mit Text/Optionen. " + (j.detail ? "(" + (typeof j.detail === "string" ? j.detail : "Eingabe unvollständig") + ")" : "")); return; }
      if (!r.ok) { showErr(err, "Fehler (HTTP " + r.status + ")."); return; }
      openOverlay('<div class="text-center py-6"><div class="w-14 h-14 mx-auto rounded-full bg-neon-500/15 grid place-items-center mb-4"><svg class="ic w-7 h-7 text-neon-500"><use href="#i-check"/></svg></div><h2 class="text-xl font-semibold mb-2">Eingereicht!</h2><p class="text-white/60 text-sm mb-4">Deine Umfrage wartet auf kurze Freigabe. Danach ist sie live.</p><button data-close class="px-6 py-2.5 rounded-full bg-neon-500 text-void-950 font-bold">Schließen</button></div>');
      loadMine();
    } catch { showErr(err, "Netzwerkfehler."); }
  }

  // ---------- my created surveys ----------
  async function loadMine() {
    const box = $("my-surveys");
    if (!box) return;
    try {
      const r = await fetch("/api/surveys/me/created", { credentials: "include" });
      const d = await r.json();
      const rows = d.surveys || [];
      if (!rows.length) { box.classList.add("hidden"); return; }
      box.classList.remove("hidden");
      box.innerHTML = '<h2 class="text-lg font-semibold mb-3">Meine Umfragen</h2>' +
        '<div class="space-y-2">' + rows.map((s) => {
          const st = { pending: ["wartet auf Freigabe", "text-amber-400"], live: ["live", "text-neon-500"], closed: ["geschlossen", "text-white/50"], rejected: ["abgelehnt", "text-red-400"], draft: ["Entwurf", "text-white/50"] }[s.status] || [s.status, "text-white/50"];
          const dl = (s.status === "live" || s.status === "closed")
            ? '<a href="/api/surveys/' + encodeURIComponent(s.slug) + '/export?format=csv" class="text-xs font-mono text-neon-500 hover:underline">CSV ↓</a>' : "";
          return '<div class="flex items-center gap-3 p-3 rounded-lg bg-void-900/50 border border-white/5 text-sm"><span class="flex-1 truncate">' + esc(s.title) + '</span><span class="font-mono text-xs ' + st[1] + '">' + st[0] + '</span><span class="font-mono text-xs text-white/40">' + s.responses + "/" + s.target_n + "</span>" + dl + "</div>";
        }).join("") + "</div>";
    } catch { box.classList.add("hidden"); }
  }

  // ---------- admin: pending approvals ----------
  async function loadAdmin() {
    const box = $("admin-pending");
    if (!box) return;
    try {
      const r = await fetch("/api/surveys/admin/all", { credentials: "include" });
      if (!r.ok) { box.classList.add("hidden"); return; }  // not admin
      const d = await r.json();
      const pending = (d.surveys || []).filter((s) => s.status === "pending");
      if (!pending.length) { box.classList.add("hidden"); return; }
      box.classList.remove("hidden");
      box.innerHTML = '<h2 class="text-lg font-semibold mb-3">🛡 Freigaben (' + pending.length + ")</h2>" +
        '<div class="space-y-2">' + pending.map((s) =>
          '<div class="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm"><span class="flex-1 truncate">' + esc(s.title) + ' <span class="text-white/40">· ' + s.reward_dwin + " mDWIN · " + s.target_n + '</span></span>' +
            '<button data-approve="' + esc(s.slug) + '" class="px-3 py-1 rounded-full bg-neon-500 text-void-950 text-xs font-bold">Freigeben</button>' +
            '<button data-reject="' + esc(s.slug) + '" class="px-3 py-1 rounded-full border border-white/15 text-white/60 text-xs">Ablehnen</button></div>').join("") + "</div>";
      box.querySelectorAll("[data-approve]").forEach((b) => b.addEventListener("click", () => adminAct(b.dataset.approve, "approve")));
      box.querySelectorAll("[data-reject]").forEach((b) => b.addEventListener("click", () => adminAct(b.dataset.reject, "reject")));
    } catch { box.classList.add("hidden"); }
  }
  async function adminAct(slug, action) {
    try {
      await fetch("/api/surveys/" + encodeURIComponent(slug) + "/" + action, { method: "POST", credentials: "include" });
      loadAdmin(); loadList();
    } catch {}
  }

  // wire create button
  const createBtn = document.getElementById("survey-create-btn");
  if (createBtn) createBtn.addEventListener("click", openCreate);

  // re-check answered/counter after a wallet login happens
  window.addEventListener("dwinity:wallet-changed", () => { loadList(); loadActivity(); loadMine(); loadAdmin(); });

  loadList();
  loadActivity();
  loadMine();
  loadAdmin();
})();
