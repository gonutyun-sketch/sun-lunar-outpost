/**
 * Screen-by-screen responsive sweep (dev server only; needs tools/qa-responsive.js loaded first).
 * Open http://localhost:5173/?devShift=9 at the viewport to test, then run:  await __sweep()
 * It walks: menu → how-to → science tabs → new game → difficulty select → base (emergency card, coach tips) → rover menu → each mission briefing,
 * driving view and minigame overlay → pause menu → shift report → … → results, and returns
 * __qa.check() reports for every screen. The rover is placed at targets through the dev-only hook
 * (layout test; driving itself is covered by the touch play-tests).
 */
(() => {
  const wait = (t = 250) => new Promise((r) => setTimeout(r, t));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const key = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code })); };
  const click = async (el, t) => { if (!el) throw new Error('missing button'); el.click(); await wait(t); };
  const btn = (sel, text) => $$(sel).find((b) => b.textContent.includes(text));
  const at = (site) => { const r = window.__rover.current; const s = { solarB: [2170, 545], depot: [525, 722], valveC: [195, 100], sample3: [1230, 1470] }[site]; r.x = s[0]; r.y = s[1]; r.vx = 0; r.vy = 0; };

  async function launch(text) {
    const l = $('.rover-launch > .btn-rover');
    await click(l);
    const item = btn('.rover-menu .btn-rover', text);
    if (item) await click(item, 400);
  }
  async function abort() {
    key('Escape'); await wait();
    if ($('.ex-card .btn-ghost')) await click($('.ex-card .btn-ghost'), 400);
  }

  window.__sweep = async () => {
    const R = [];
    const C = (l) => R.push(__qa.check(l));
    window.scrollTo(0, 0);
    C('menu');
    const mb = () => $$('.menu-buttons button');
    await click(mb()[mb().length - 2]); C('how-to'); window.scrollTo(0, 0);
    await click($$('.header-actions .btn')[0]);
    await click(mb()[mb().length - 1]); C('science: survive'); window.scrollTo(0, 0);
    // every science tab (long pages: check each one for overflow)
    for (const tab of $$('.sci-tab').slice(1)) { await click(tab, 200); window.scrollTo(0, 0); C(`science: ${tab.id.replace('sci-tab-', '')}`); }
    await click($('#sci-tab-survive'), 200);
    for (const d of $$('.topic details')) d.open = true;
    await wait(200); C('science: details open');
    await click($$('.header-actions .btn')[0]);
    if ($('.btn-continue')) {
      // a saved game exists: New game -> confirmation dialog -> confirm
      // (no dialog when the saved game has no progress to lose)
      await click(mb()[1], 300);
      if ($('.confirm-modal')) { C('new-game confirm'); await click($('.confirm-modal .btn-danger'), 500); }
    } else await click(mb()[0], 500);
    window.scrollTo(0, 0); C('difficulty select');
    await click($('.diff-card.diff-normal'), 150); C('difficulty: normal selected');
    await click($('.diff-card.diff-easy'), 150);
    await click($('.diff-actions .btn-primary'), 500);
    C('tutorial choice');
    await click($('[data-tutorial-start="direct"]'), 350);
    C('base + emergency (shift 9)');
    if (!$('.coach')) await click($('.coach-btn'), 200);
    C('base + coach tips');
    await click($('.event-card .choice'), 300); C('emergency decided');
    await click($('.rover-launch > .btn-rover')); C('rover menu'); await click($('.rover-launch > .btn-rover'));
    // Mission 1: briefing, driving, circuit, pause
    await launch('태양광'); C('M1 briefing');
    await click($('.ex-card .btn-primary'), 400); C('M1 driving');
    at('solarB'); await wait(300); key('KeyE'); await wait(400); C('M1 circuit puzzle');
    key('Escape'); await wait(); key('Escape'); await wait(); C('M1 pause menu');
    await click($('.ex-card .btn-ghost'), 400);
    // Mission 2: pressure panel
    await launch('산소'); await click($('.ex-card .btn-primary'), 400);
    at('depot'); await wait(300); key('KeyE'); await wait(300);
    at('valveC'); await wait(300); key('KeyE'); await wait(500); C('M2 pressure puzzle');
    key('Escape'); await wait(); await abort();
    // Mission 3: briefing + drilling view
    await launch('과학'); C('M3 briefing');
    await click($('.ex-card .btn-primary'), 400); at('sample3'); await wait(400); C('M3 at sample');
    await abort();
    // shift report, then play to the end
    for (let i = 0; i < 6 && !$('.results-hero'); i++) {
      const ev = $('.event-card'); if (ev && !ev.querySelector('.choice.picked')) await click(ev.querySelectorAll('.choice')[1] || ev.querySelector('.choice'));
      let adv = btn('.advance button', '진행') || btn('.advance button', 'ADVANCE');
      for (const k of [1, 0, 3]) { if (!adv || !adv.disabled) break; const s = $$('button[role=switch]')[k]; if (s && s.getAttribute('aria-checked') === 'true' && !s.disabled) { await click(s); adv = btn('.advance button', '진행') || btn('.advance button', 'ADVANCE'); } }
      if (!adv || adv.disabled) { R.push({ label: 'blocked', note: $$('.alert').map((a) => a.textContent).join(' / ') }); break; }
      await click(adv, 400);
      if (i === 0) C('shift report');
      const m = $('.modal .actions button'); if (m) await click(m, 400);
    }
    if (!$('.results-hero') && btn('.advance button', '결과')) await click(btn('.advance button', '결과'), 500);
    window.scrollTo(0, 0); await wait(300);
    if ($('.results-hero')) C('results');
    return R;
  };
  return 'sweep ready';
})();
