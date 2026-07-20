
function vt(key, fallback, vars) {
  let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
  if (!v || v === key) v = fallback;
  if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
  return v;
}
(function() {
  const m = document.getElementById('report-modal');
  const link = document.getElementById('report-link');
  if (!m || !link) return;
  const cancel = document.getElementById('report-cancel');
  const submit = document.getElementById('report-submit');
  const reason = document.getElementById('report-reason');
  const contact = document.getElementById('report-contact');
  const err = document.getElementById('report-error');
  const ok = document.getElementById('report-success');

  function open(e) {
    e.preventDefault();
    m.classList.remove('hidden');
    err.classList.add('hidden');
    ok.classList.add('hidden');
  }
  function close() { m.classList.add('hidden'); }

  link.addEventListener('click', open);
  cancel.addEventListener('click', close);
  submit.addEventListener('click', async () => {
    err.classList.add('hidden'); ok.classList.add('hidden');
    const id = location.pathname.split('/').pop();
    const r = (reason.value || '').trim();
    if (r.length < 10) {
      err.textContent = 'Mindestens 10 Zeichen angeben.';
      err.classList.remove('hidden');
      return;
    }
    submit.disabled = true;
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ drop_id: id, reason: r, contact: contact.value || null })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      ok.classList.remove('hidden');
      setTimeout(close, 2500);
    } catch (e) {
      err.textContent = vt('rp.errPrefix', 'Fehler: ') + (e.message || e);
      err.classList.remove('hidden');
    } finally { submit.disabled = false; }
  });
})();
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "rp.errPrefix": "Error: ",
} });
