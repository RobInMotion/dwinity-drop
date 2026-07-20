
function vt(key, fallback, vars) {
  let v = (window.DDI18n && window.DDI18n.t && window.DDI18n.t(key)) || "";
  if (!v || v === key) v = fallback;
  if (vars) for (const k in vars) v = v.replace("{" + k + "}", vars[k]);
  return v;
}
(function() {
  function handle(form, successEl) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type=email]');
      const button = form.querySelector('button[type=submit]');
      const email = input.value.trim();
      if (!email) return;
      const origLabel = button.textContent;
      button.disabled = true;
      button.textContent = '// sende …';
      try {
        const r = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, product: 'drop' }),
        });
        if (r.status === 429) throw new Error(vt('wl.tooMany', 'Zu viele Anfragen — bitte später erneut.'));
        if (!r.ok) throw new Error(vt('wl.serverErr', 'Server-Fehler: HTTP ') + r.status);
        form.reset();
        if (successEl) {
          successEl.classList.remove('hidden');
          successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          alert(vt('wl.done', '// eingetragen'));
        }
      } catch (err) {
        alert(vt('wl.errPrefix', '// Fehler: ') + (err.message || err));
      } finally {
        button.disabled = false;
        button.textContent = origLabel;
      }
    });
  }
  const heroForm = document.getElementById('waitlist-hero');
  const bottomForm = document.getElementById('waitlist-bottom');
  const success = document.getElementById('waitlist-success');
  if (heroForm) handle(heroForm, success);
  if (bottomForm) handle(bottomForm, success);

  // Upgrade modal close shortcut on inline OK button
  document.querySelectorAll('[data-action="upgrade-close"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById('upgrade-close');
      if (target) target.click();
    });
  });
})();
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "wl.serverErr": "Server error: HTTP ",
  "wl.errPrefix": "// Error: ",
} });
(window.DDI18n ? (x) => window.DDI18n.register(x) : (x) => (window.__DDI18N_PENDING = window.__DDI18N_PENDING || []).push(x))({ en: {
  "wl.tooMany": "Too many requests — please try again later.",
  "wl.done": "// you're on the list",
} });
