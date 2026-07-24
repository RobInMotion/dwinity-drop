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

  // re-check answered/counter after a wallet login happens
  window.addEventListener("dwinity:wallet-changed", () => { loadList(); loadActivity(); });

  loadList();
  loadActivity();
})();
