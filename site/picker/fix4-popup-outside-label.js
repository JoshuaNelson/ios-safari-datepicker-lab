// A custom date picker for event dates. The next 14 days and days already on the business calendar (shown as Reserved)
// (pop-ups, markets, private events, personal days) are grayed out, so they can't be chosen.
// The original <input type="date"> stays in the page (hidden) and keeps its value, so every
// form and script that reads it works as before.
(function () {
  'use strict';
  const fmt = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const iso = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  let busy = null; // Set of booked dates, once loaded
  const busyLoad = fetch('/api/busy', { cache: 'no-store' }).then(r => r.ok ? r.json() : { busy: [] }).then(d => { busy = new Set(d.busy || []); }).catch(() => { busy = new Set(); });
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  let openPop = null;
  document.addEventListener('click', e => { if (openPop && e.target.isConnected && !openPop.contains(e.target) && !e.target.closest('.dp-field')) closePop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openPop) { e.preventDefault(); e.stopPropagation(); const f = openPop._btn; closePop(); f?.focus(); } }, true);
  function closePop() { if (!openPop) return; openPop.hidden = true; openPop._btn?.setAttribute('aria-expanded', 'false'); openPop = null; }

  function enhance(input) {
    if (input.dataset.dp) return; input.dataset.dp = '1';
    const optional = !input.required;
    const wrap = document.createElement('span'); wrap.className = 'dp';
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    input.hidden = true; input.tabIndex = -1;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dp-field'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    const label = document.createElement('span'); const icon = document.createElement('i'); icon.className = 'dp-icon'; icon.setAttribute('aria-hidden', 'true');
    btn.append(label, icon); wrap.appendChild(btn);
    const pop = document.createElement('div'); pop.className = 'dp-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choose a date'); pop._btn = btn;
    // The popup sits in <body>, outside the field's <label>, positioned just under the field.
    document.body.appendChild(pop);
    const place = () => { const r = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = Math.min(330, vw - 32);
      pop.style.top = `${r.bottom + window.scrollY + 6}px`; pop.style.left = `${Math.max(16, Math.min(r.left, vw - w - 16)) + window.scrollX}px`; };
    window.addEventListener('resize', () => { if (openPop === pop) place(); });
    const sync = () => { const v = desc.get.call(input); label.textContent = v ? fmt(v) : 'Choose a date'; btn.classList.toggle('is-empty', !v); };
    Object.defineProperty(input, 'value', { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); }, configurable: true });
    sync();
    // Mirror the field's "this date won't work" state onto the visible button.
    new MutationObserver(() => btn.setAttribute('aria-invalid', input.getAttribute('aria-invalid') === 'true' ? 'true' : 'false')).observe(input, { attributes: true, attributeFilter: ['aria-invalid'] });
    let view;
    function choose(day, short) {
      if (short) input.dataset.shortNotice = 'yes'; else delete input.dataset.shortNotice;
      input.value = day; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); closePop(); btn.focus();
    }
    // A date inside 14 days: say so kindly, and let them still ask.
    function askShortNotice(day) {
      pop.innerHTML = '';
      const box = document.createElement('div'); box.className = 'dp-short'; box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-label', 'Short-notice date');
      const h = document.createElement('strong'); h.textContent = fmt(day);
      const p = document.createElement('p'); p.textContent = 'This date is less than 14 days away. We usually need about two weeks to prepare, so we may not be able to make it, but you’re welcome to ask and we’ll let you know quickly.';
      const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'dp-yes'; yes.textContent = 'Yes, I’d still like to explore';
      const no = document.createElement('button'); no.type = 'button'; no.className = 'dp-no'; no.textContent = 'Choose another date';
      yes.addEventListener('click', () => choose(day, true));
      no.addEventListener('click', () => render());
      box.append(h, p, yes, no); pop.appendChild(box); yes.focus({ preventScroll: true });
      // On phones the note can open below the fold: bring it into view so it's never missed.
      requestAnimationFrame(() => box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
    function render() {
      const min = input.min || '', y = view.getUTCFullYear(), m = view.getUTCMonth();
      const first = new Date(Date.UTC(y, m, 1)).getUTCDay(), count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const today = min ? new Date(Date.parse(min + 'T12:00:00Z') - 14 * 864e5).toISOString().slice(0, 10) : '';
      pop.innerHTML = '';
      const head = document.createElement('div'); head.className = 'dp-head';
      const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'dp-nav'; prev.setAttribute('aria-label', 'Previous month'); prev.textContent = '‹';
      const next = document.createElement('button'); next.type = 'button'; next.className = 'dp-nav'; next.setAttribute('aria-label', 'Next month'); next.textContent = '›';
      const title = document.createElement('strong'); title.textContent = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      prev.disabled = min && iso(y, m, 0) < new Date(Date.parse(min + 'T12:00:00Z') - 14 * 864e5).toISOString().slice(0, 10);
      prev.addEventListener('click', () => { view = new Date(Date.UTC(y, m - 1, 1)); render(); });
      next.addEventListener('click', () => { view = new Date(Date.UTC(y, m + 1, 1)); render(); });
      head.append(prev, title, next); pop.appendChild(head);
      const grid = document.createElement('div'); grid.className = 'dp-grid';
      'SMTWTFS'.split('').forEach(d => { const s = document.createElement('span'); s.className = 'dp-wd'; s.textContent = d; grid.appendChild(s); });
      for (let i = 0; i < first; i++) grid.appendChild(document.createElement('span'));
      const chosen = desc.get.call(input);
      for (let d = 1; d <= count; d++) {
        const day = iso(y, m, d), b = document.createElement('button'); b.type = 'button'; b.textContent = d; b.className = 'dp-day';
        const past = day < today, soon = !past && min && day < min, taken = busy && busy.has(day);
        // Reserved days stay visible and tappable, so a tap explains why they can't be chosen.
        if (taken && !past) { b.classList.add('is-busy'); b.setAttribute('aria-disabled', 'true'); b.title = 'Reserved'; b.innerHTML = `${d}<small aria-hidden="true">Reserved</small>`; }
        else if (past) { b.disabled = true; b.classList.add('is-past'); b.title = 'This day has passed'; }
        else if (soon) { b.classList.add('is-soon'); b.title = 'Short notice: less than 14 days away'; }
        if (day === chosen) b.setAttribute('aria-pressed', 'true');
        b.setAttribute('aria-label', fmt(day) + (b.disabled || b.title === 'Reserved' ? ` · ${b.title}` : ''));
        b.addEventListener('click', () => { if (b.title === 'Reserved') { const n = pop.querySelector('.dp-reserved-note'); if (n) { n.hidden = false; n.textContent = `${fmt(day)} is already reserved. Please choose another date, or send us a note if your day is flexible.`; } return; } if (soon) askShortNotice(day); else choose(day, false); });
        grid.appendChild(b);
      }
      pop.appendChild(grid);
      const note = document.createElement('p'); note.className = 'dp-reserved-note'; note.setAttribute('role', 'status'); note.hidden = true; pop.appendChild(note);
      const foot = document.createElement('div'); foot.className = 'dp-foot';
      const key = document.createElement('span'); key.innerHTML = '<i class="dp-k soon"></i>Short notice <i class="dp-k busy"></i>Reserved';
      foot.appendChild(key);
      if (optional && chosen) { const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'dp-clear'; clear.textContent = 'Clear date'; clear.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); closePop(); }); foot.appendChild(clear); }
      pop.appendChild(foot);
    }
    pop.addEventListener('dp-rerender', () => render());
    btn.addEventListener('click', () => {
      if (openPop === pop) { closePop(); return; }
      closePop();
      const start = desc.get.call(input) || new Date().toISOString().slice(0, 10);
      const [y, m] = start.split('-').map(Number); view = new Date(Date.UTC(y, m - 1, 1));
      render(); place(); pop.hidden = false; openPop = pop; btn.setAttribute('aria-expanded', 'true');
      if (!busy) busyLoad.then(() => { if (openPop === pop) render(); });
      (pop.querySelector('.dp-day[aria-pressed="true"]') || pop.querySelector('.dp-day:not(:disabled):not([aria-disabled])'))?.focus();
    });
  }
  const run = () => document.querySelectorAll('input[type="date"]').forEach(enhance);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  // A day found reserved by the date check is shown as Reserved in the picker too, even if the list hadn't loaded.
  const markBusy = d => { busyLoad.then(() => { busy.add(d); if (openPop) openPop.dispatchEvent(new Event('dp-rerender')); }); };
  window.sitePicker = { enhance, busyReady: busyLoad, isBusy: d => !!busy && busy.has(d), markBusy };
})();
