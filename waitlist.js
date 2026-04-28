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
        if (r.status === 429) throw new Error('Zu viele Anfragen — bitte später erneut.');
        if (!r.ok) throw new Error('Server-Fehler: HTTP ' + r.status);
        form.reset();
        if (successEl) {
          successEl.classList.remove('hidden');
          successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          alert('// eingetragen');
        }
      } catch (err) {
        alert('// Fehler: ' + (err.message || err));
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
