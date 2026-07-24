// Survey Pools — participant flow (M2/Stufe 2). Vanilla, same-origin API.
(function () {
  // --- i18n: page-scoped, registered order-proof (i18n.js may load after this) ---
  const SV_I18N = { de: {
    "sv.loadingList": "Umfragen werden geladen …",
    "sv.loadFail": "Konnte Umfragen nicht laden.",
    "sv.none": "Aktuell keine offenen Umfragen.",
    "sv.answered": "beantwortet", "sv.full": "voll",
    "sv.join": "Teilnehmen →", "sv.mdwin": "mDWIN",
    "sv.loading": "Lädt …", "sv.close": "Schließen",
    "sv.detailFail": "Konnte Umfrage nicht laden.",
    "sv.alreadyAnswered": "Du hast diese Umfrage schon beantwortet.",
    "sv.optional": "(optional)",
    "sv.consentFull": 'Ich willige ein, dass meine Antworten <b class="text-white">pseudonym</b> (ohne Wallet/Name) an <b class="text-white">{recipient}</b> geliefert werden. Dafür erhalte ich {reward} mDWIN.',
    "sv.recipientFallback": "den Auftraggeber",
    "sv.submit": "Antworten & einlösen", "sv.sending": "Sende …",
    "sv.needWallet": "Bitte zuerst Wallet verbinden (oben rechts), dann erneut absenden.",
    "sv.surveyFull": "Diese Umfrage ist voll oder geschlossen.",
    "sv.fillRequired": "Bitte alle Pflichtfragen beantworten.",
    "sv.sendFail": "Senden fehlgeschlagen.", "sv.netErr": "Netzwerkfehler — nochmal versuchen.",
    "sv.thanks": "Danke fürs Mitmachen!",
    "sv.credited": 'Du hast <b class="text-neon-500">{amount} mDWIN</b> gutgeschrieben bekommen.',
    "sv.delivered": 'Geliefert als Deckname <b>{p}</b> — nie dein Wallet.',
    "sv.create": "Umfrage erstellen", "sv.f.title": "Titel", "sv.ph.title": "z.B. Café-Gewohnheiten",
    "sv.f.desc": "Beschreibung", "sv.ph.desc": "Worum geht es?",
    "sv.f.recipient": "Empfänger-Label (was Teilnehmer sehen)", "sv.ph.recipient": "z.B. Bachelorarbeit Sportwissenschaft",
    "sv.f.target": "Ziel-Teilnehmer", "sv.f.reward": "Belohnung (mDWIN)",
    "sv.f.questions": "Fragen", "sv.addQ": "+ Frage hinzufügen",
    "sv.ph.options": "Optionen, eine pro Zeile", "sv.ph.qtext": "Fragetext",
    "sv.t.single": "Einzelwahl", "sv.t.multi": "Mehrfachwahl", "sv.t.scale": "Skala", "sv.t.number": "Zahl",
    "sv.submitCreate": "Zur Freigabe einreichen", "sv.createNote": "Geht erst nach kurzer Prüfung live. Nur strukturierte Fragen.",
    "sv.createErr": "Bitte prüfen: Titel ≥3 Zeichen, jede Frage mit Text/Optionen.",
    "sv.submitted": "Eingereicht!", "sv.submittedNote": "Deine Umfrage wartet auf kurze Freigabe. Danach ist sie live.",
    "sv.mine": "Meine Umfragen", "sv.st.pending": "wartet auf Freigabe", "sv.st.live": "live",
    "sv.st.closed": "geschlossen", "sv.st.rejected": "abgelehnt", "sv.st.draft": "Entwurf",
    "sv.approvals": "Freigaben", "sv.approve": "Freigeben", "sv.reject": "Ablehnen",
    "sv.pageChip": "Umfragen · Beta",
    "sv.pageH1": 'Beantworte bewusst. <span class="fx-glow-text">Kassiere DWIN.</span>',
    "sv.pageLead": 'Bezahlte Umfragen mit klaren Fragen. Du siehst <span class="text-white">vorher genau</span>, was du teilst und wofür — deine Antworten gehen <span class="text-white">pseudonym</span> an den Auftraggeber, nie dein Wallet oder Name.',
    "sv.pageNote": "Ausdrückliche Einwilligung je Umfrage · nur strukturierte Fragen · Frühe Phase · Testnetz (mDWIN).",
    "sv.createBtn": "+ Umfrage erstellen",
    "sv.shared": "Geteilt", "sv.today": "heute", "sv.week": "Woche", "sv.datapoints": "Datenpunkte",
    "sv.footer": 'Dwinity Vault · Umfragen — bewusstes Datenteilen.',
  }, en: {
    "sv.loadingList": "Loading surveys …",
    "sv.loadFail": "Couldn't load surveys.",
    "sv.none": "No open surveys right now.",
    "sv.answered": "answered", "sv.full": "full",
    "sv.join": "Take part →", "sv.mdwin": "mDWIN",
    "sv.loading": "Loading …", "sv.close": "Close",
    "sv.detailFail": "Couldn't load survey.",
    "sv.alreadyAnswered": "You already answered this survey.",
    "sv.optional": "(optional)",
    "sv.consentFull": 'I consent to my answers being delivered <b class="text-white">pseudonymously</b> (no wallet/name) to <b class="text-white">{recipient}</b>. In return I receive {reward} mDWIN.',
    "sv.recipientFallback": "the commissioner",
    "sv.submit": "Answer & claim", "sv.sending": "Sending …",
    "sv.needWallet": "Please connect your wallet (top right), then submit again.",
    "sv.surveyFull": "This survey is full or closed.",
    "sv.fillRequired": "Please answer all required questions.",
    "sv.sendFail": "Submit failed.", "sv.netErr": "Network error — try again.",
    "sv.thanks": "Thanks for taking part!",
    "sv.credited": 'You were credited <b class="text-neon-500">{amount} mDWIN</b>.',
    "sv.delivered": 'Delivered as handle <b>{p}</b> — never your wallet.',
    "sv.create": "Create survey", "sv.f.title": "Title", "sv.ph.title": "e.g. Café habits",
    "sv.f.desc": "Description", "sv.ph.desc": "What is it about?",
    "sv.f.recipient": "Recipient label (what participants see)", "sv.ph.recipient": "e.g. Sports-science thesis",
    "sv.f.target": "Target participants", "sv.f.reward": "Reward (mDWIN)",
    "sv.f.questions": "Questions", "sv.addQ": "+ Add question",
    "sv.ph.options": "Options, one per line", "sv.ph.qtext": "Question text",
    "sv.t.single": "Single choice", "sv.t.multi": "Multiple choice", "sv.t.scale": "Scale", "sv.t.number": "Number",
    "sv.submitCreate": "Submit for approval", "sv.createNote": "Goes live after a quick review. Structured questions only.",
    "sv.createErr": "Please check: title ≥3 chars, every question with text/options.",
    "sv.submitted": "Submitted!", "sv.submittedNote": "Your survey is awaiting a quick approval. Then it goes live.",
    "sv.mine": "My surveys", "sv.st.pending": "awaiting approval", "sv.st.live": "live",
    "sv.st.closed": "closed", "sv.st.rejected": "rejected", "sv.st.draft": "draft",
    "sv.approvals": "Approvals", "sv.approve": "Approve", "sv.reject": "Reject",
    "sv.pageChip": "Surveys · Beta",
    "sv.pageH1": 'Answer consciously. <span class="fx-glow-text">Earn DWIN.</span>',
    "sv.pageLead": 'Paid surveys with clear questions. You see <span class="text-white">exactly</span> what you share and why — your answers go to the commissioner <span class="text-white">pseudonymously</span>, never your wallet or name.',
    "sv.pageNote": "Explicit consent per survey · structured questions only · Early phase · Testnet (mDWIN).",
    "sv.createBtn": "+ Create survey",
    "sv.shared": "Shared", "sv.today": "today", "sv.week": "week", "sv.datapoints": "data points",
    "sv.footer": 'Dwinity Vault · Surveys — conscious data sharing.',
  } };
  if (window.DDI18n && window.DDI18n.register) window.DDI18n.register(SV_I18N);
  else { (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(SV_I18N); }
  const T = (k) => (window.DDI18n && window.DDI18n.t && window.DDI18n.t(k) !== k)
    ? window.DDI18n.t(k) : (SV_I18N.de[k] || k);

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
      listEl.innerHTML = '<div class="col-span-full text-center text-red-400 font-mono text-sm py-16">' + T("sv.loadFail") + '</div>';
    }
  }

  function renderList(surveys) {
    if (!surveys.length) {
      listEl.innerHTML = '<div class="col-span-full text-center text-white/40 font-mono text-sm py-16">' + T("sv.none") + '</div>';
      return;
    }
    listEl.innerHTML = surveys.map(cardHtml).join("");
    listEl.querySelectorAll("[data-open]").forEach((b) =>
      b.addEventListener("click", () => openSurvey(b.dataset.open)));
  }

  function cardHtml(s) {
    const pct = Math.min(100, Math.round((s.responses / Math.max(1, s.target_n)) * 100));
    const badge = s.answered
      ? '<span class="chip bg-neon-500/15 text-neon-500 shrink-0"><svg class="ic w-3.5 h-3.5"><use href="#i-check"/></svg> ' + T("sv.answered") + '</span>'
      : s.full
        ? '<span class="chip bg-white/10 text-white/50 shrink-0">' + T("sv.full") + '</span>'
        : "";
    const btn = (s.answered || s.full)
      ? ""
      : '<button data-open="' + esc(s.slug) + '" class="mt-4 w-full px-4 py-2.5 rounded-full bg-neon-500 text-void-950 font-bold hover:bg-neon-600 transition">' + T("sv.join") + '</button>';
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
    openOverlay('<div class="text-center text-white/50 font-mono text-sm py-10">' + T("sv.loading") + '</div>');
    let s;
    try {
      const r = await fetch("/api/surveys/" + encodeURIComponent(slug), { credentials: "include" });
      if (!r.ok) throw new Error();
      s = await r.json();
    } catch {
      openOverlay('<div class="text-center text-red-400 font-mono text-sm py-10">' + T("sv.detailFail") + '</div>' + closeBtn());
      return;
    }
    if (s.answered) { openOverlay(doneHtml(s.reward_dwin, null, T("sv.alreadyAnswered"))); return; }
    renderForm(s);
  }

  function questionHtml(q, i) {
    const req = q.required === false ? ' <span class="text-white/30">' + T("sv.optional") + '</span>' : "";
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
        '<span class="inline-flex items-center gap-1 text-neon-500"><svg class="ic w-4 h-4"><use href="#i-coin"/></svg>' + esc(s.reward_dwin) + " " + T("sv.mdwin") + "</span>" +
        "<span>→ " + esc(s.recipient_label || T("sv.recipientFallback")) + "</span></div>" +
      '<form id="survey-form">' + qs +
        '<label class="flex items-start gap-2.5 mt-2 mb-4 p-3 rounded-lg bg-neon-500/5 border border-neon-500/20 cursor-pointer">' +
          '<input type="checkbox" id="consent-box" class="mt-0.5 accent-neon-500">' +
          '<span class="text-xs text-white/70 leading-relaxed">' +
            T("sv.consentFull").replace("{recipient}", esc(s.recipient_label || T("sv.recipientFallback"))).replace("{reward}", esc(s.reward_dwin)) +
          "</span>" +
        "</label>" +
        '<div id="survey-err" class="hidden mb-3 text-xs font-mono text-red-400"></div>' +
        '<button type="submit" class="w-full px-5 py-3 rounded-full bg-neon-500 text-void-950 font-bold hover:bg-neon-600 transition disabled:opacity-40" disabled id="survey-submit">' + T("sv.submit") + '</button>' +
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
    submit.disabled = true; submit.textContent = T("sv.sending");
    try {
      const r = await fetch("/api/surveys/" + encodeURIComponent(s.slug) + "/respond", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, answers: collectAnswers(s) }),
      });
      if (r.status === 401) {
        showErr(err, T("sv.needWallet"));
        if (typeof window.connectWallet === "function") window.connectWallet();
      } else if (r.status === 409) { openOverlay(doneHtml(s.reward_dwin, null, T("sv.alreadyAnswered"))); loadList(); }
      else if (r.status === 410) { showErr(err, T("sv.surveyFull")); }
      else if (r.status === 400) { const j = await r.json().catch(() => ({})); showErr(err, T("sv.fillRequired") + (j.detail ? " (" + j.detail + ")" : "")); }
      else if (!r.ok) { showErr(err, T("sv.sendFail") + " (HTTP " + r.status + ")"); }
      else {
        const j = await r.json();
        openOverlay(doneHtml(j.reward_dwin, j.pseudonym));
        loadList(); loadActivity();
      }
    } catch {
      showErr(err, T("sv.netErr"));
    } finally {
      if (submit.isConnected) { submit.disabled = false; submit.textContent = T("sv.submit"); }
    }
  }

  function showErr(el, msg) { el.textContent = msg; el.classList.remove("hidden"); }

  function doneHtml(reward, pseudo, note) {
    return (
      '<div class="text-center py-4">' +
        '<div class="w-14 h-14 mx-auto rounded-full bg-neon-500/15 grid place-items-center mb-4"><svg class="ic w-7 h-7 text-neon-500"><use href="#i-check"/></svg></div>' +
        '<h2 class="text-xl font-semibold mb-2">' + (note ? esc(note) : T("sv.thanks")) + "</h2>" +
        (note ? "" : '<p class="text-white/60 text-sm mb-1">' + T("sv.credited").replace("{amount}", esc(reward)) + "</p>") +
        (pseudo ? '<p class="text-white/40 text-xs font-mono mb-4">' + T("sv.delivered").replace("{p}", esc(pseudo)) + "</p>" : '<div class="mb-4"></div>') +
        '<button data-close class="px-6 py-2.5 rounded-full bg-neon-500 text-void-950 font-bold hover:bg-neon-600 transition">' + T("sv.close") + '</button>' +
      "</div>"
    );
  }

  function closeBtn() { return '<div class="text-center mt-4"><button data-close class="px-5 py-2 rounded-full border border-white/20 text-sm">' + T("sv.close") + '</button></div>'; }

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
        '<h2 class="text-xl font-semibold">' + T("sv.create") + '</h2>' +
        '<button data-close class="shrink-0 text-white/40 hover:text-white text-xl leading-none">×</button>' +
      "</div>" +
      '<form id="sv-create-form" class="space-y-3">' +
        field("sv-title", T("sv.f.title"), '<input id="sv-title" required maxlength="120" class="' + inp() + '" placeholder="' + esc(T("sv.ph.title")) + '">') +
        field("sv-desc", T("sv.f.desc"), '<textarea id="sv-desc" maxlength="600" rows="2" class="' + inp() + '" placeholder="' + esc(T("sv.ph.desc")) + '"></textarea>') +
        field("sv-recipient", T("sv.f.recipient"), '<input id="sv-recipient" maxlength="120" class="' + inp() + '" placeholder="' + esc(T("sv.ph.recipient")) + '">') +
        '<div class="grid grid-cols-2 gap-3">' +
          field("sv-target", T("sv.f.target"), '<input id="sv-target" type="number" min="5" max="1000" value="50" class="' + inp() + '">') +
          field("sv-reward", T("sv.f.reward"), '<input id="sv-reward" type="number" min="0" step="0.5" value="3" class="' + inp() + '">') +
        "</div>" +
        '<div class="pt-2"><div class="text-xs font-mono uppercase tracking-widest text-white/40 mb-2">' + T("sv.f.questions") + '</div><div id="sv-builder" class="space-y-3"></div>' +
          '<button type="button" id="sv-add-q" class="mt-2 text-sm font-mono text-neon-500 hover:underline">' + T("sv.addQ") + '</button></div>' +
        '<div id="sv-create-err" class="hidden text-xs font-mono text-red-400"></div>' +
        '<button type="submit" class="w-full px-5 py-3 rounded-full bg-neon-500 text-void-950 font-bold hover:bg-neon-600 transition">' + T("sv.submitCreate") + '</button>' +
        '<p class="text-[11px] text-white/40 text-center">' + T("sv.createNote") + '</p>' +
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
        ? '<textarea data-q="' + i + '" data-f="options" rows="2" class="' + inp() + ' mt-1.5" placeholder="' + esc(T("sv.ph.options")) + '">' + esc((q.options || []).join("\n")) + "</textarea>"
        : q.type === "scale"
          ? '<div class="flex gap-2 mt-1.5"><input data-q="' + i + '" data-f="min" type="number" value="' + (q.min ?? 1) + '" class="' + inp() + '" placeholder="min"><input data-q="' + i + '" data-f="max" type="number" value="' + (q.max ?? 5) + '" class="' + inp() + '" placeholder="max"></div>'
          : "";
      return (
        '<div class="p-3 rounded-lg bg-void-800/40 border border-white/10">' +
          '<div class="flex gap-2 items-center">' +
            '<select data-q="' + i + '" data-f="type" class="' + inp() + ' max-w-[130px]">' +
              ["single", "multi", "scale", "number"].map((t) => '<option value="' + t + '"' + (q.type === t ? " selected" : "") + ">" + T("sv.t." + t) + "</option>").join("") +
            "</select>" +
            '<button type="button" data-del="' + i + '" class="ml-auto text-white/30 hover:text-red-400 text-lg leading-none">×</button>' +
          "</div>" +
          '<input data-q="' + i + '" data-f="text" value="' + esc(q.text || "") + '" class="' + inp() + ' mt-2" placeholder="' + esc(T("sv.ph.qtext")) + '">' +
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
      if (r.status === 401) { showErr(err, T("sv.needWallet")); if (window.connectWallet) window.connectWallet(); return; }
      if (r.status === 422 || r.status === 400) { const j = await r.json().catch(() => ({})); showErr(err, T("sv.createErr") + (j.detail && typeof j.detail === "string" ? " (" + j.detail + ")" : "")); return; }
      if (!r.ok) { showErr(err, T("sv.sendFail") + " (HTTP " + r.status + ")"); return; }
      openOverlay('<div class="text-center py-6"><div class="w-14 h-14 mx-auto rounded-full bg-neon-500/15 grid place-items-center mb-4"><svg class="ic w-7 h-7 text-neon-500"><use href="#i-check"/></svg></div><h2 class="text-xl font-semibold mb-2">' + T("sv.submitted") + '</h2><p class="text-white/60 text-sm mb-4">' + T("sv.submittedNote") + '</p><button data-close class="px-6 py-2.5 rounded-full bg-neon-500 text-void-950 font-bold">' + T("sv.close") + '</button></div>');
      loadMine();
    } catch { showErr(err, T("sv.netErr")); }
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
      box.innerHTML = '<h2 class="text-lg font-semibold mb-3">' + T("sv.mine") + '</h2>' +
        '<div class="space-y-2">' + rows.map((s) => {
          const stColor = { pending: "text-amber-400", live: "text-neon-500", closed: "text-white/50", rejected: "text-red-400", draft: "text-white/50" }[s.status] || "text-white/50";
          const st = [T("sv.st." + s.status) !== "sv.st." + s.status ? T("sv.st." + s.status) : s.status, stColor];
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
      box.innerHTML = '<h2 class="text-lg font-semibold mb-3">🛡 ' + T("sv.approvals") + ' (' + pending.length + ")</h2>" +
        '<div class="space-y-2">' + pending.map((s) =>
          '<div class="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm"><span class="flex-1 truncate">' + esc(s.title) + ' <span class="text-white/40">· ' + s.reward_dwin + " " + T("sv.mdwin") + " · " + s.target_n + '</span></span>' +
            '<button data-approve="' + esc(s.slug) + '" class="px-3 py-1 rounded-full bg-neon-500 text-void-950 text-xs font-bold">' + T("sv.approve") + '</button>' +
            '<button data-reject="' + esc(s.slug) + '" class="px-3 py-1 rounded-full border border-white/15 text-white/60 text-xs">' + T("sv.reject") + '</button></div>').join("") + "</div>";
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
  // re-render JS-built content when the language changes
  window.addEventListener("dd:lang-changed", () => { loadList(); loadMine(); loadAdmin(); });

  loadList();
  loadActivity();
  loadMine();
  loadAdmin();
})();
