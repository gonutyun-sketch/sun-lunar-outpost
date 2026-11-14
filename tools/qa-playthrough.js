/**
 * Whole-mission playthrough through the real UI (dev server only; uses the dev-only __rover/__explore hooks).
 * Paste into the console on http://localhost:5173/ or inject via automation, then:
 *   await __play.toShift(6)   // play from the current base screen until shift 6 (or the end)
 *   await __play.toEnd()      // play until the results screen
 * Base decisions follow simple rules (Solar upgrade at shift 2, lab when power allows, greenhouse when food < 50,
 * first emergency option; when power is short: lab off, greenhouse off, then oxygen off if O2 >= 45).
 * Start a game first (menu -> difficulty -> start). If the browser pane is hidden or slow, add a frame shim first:
 *   window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16) Rover missions are completed with shortcuts: the rover is placed at each site, the
 * circuit is solved by trying rotations, the pressure gauges are set into their bands. Driving and the
 * minigames themselves are covered by unit tests and the touch/keyboard play-tests.
 * Use it to test save/continue: stop at a shift, reload the page, press Continue, and compare.
 */
(() => {
  const w = (t = 250) => new Promise((r) => setTimeout(r, t));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const key = async (code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
    await w(50);
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
  };
  const SITES = { solarB: [2170, 545], depot: [525, 722], dock: [860, 900], sample1: [2150, 1470], sample2: [2440, 1180], sample3: [1230, 1470], valveA: [110, 318], valveB: [330, 215], valveC: [195, 100] };
  const at = async (id) => { const r = window.__rover.current; [r.x, r.y] = SITES[id]; r.vx = 0; r.vy = 0; r.battery = Math.max(r.battery, 60); await w(300); };
  const shiftNo = () => Number(($('.brand')?.textContent.match(/(\d+)\s*\/\s*12/) || [])[1] || 0);

  async function solveCircuit() {
    const lit = () => $$('.cz-tile.on').length;
    for (let pass = 0; pass < 3 && !$('.circuit.solved'); pass++) {
      for (const d of ['Digit1', 'Digit2', 'Digit3']) {
        if ($('.circuit.solved')) break;
        let best = lit(), bestK = 0;
        for (let k = 1; k <= 4; k++) { await key(d); await w(60); if ($('.circuit.solved')) return; if (lit() > best) { best = lit(); bestK = k; } }
        for (let k = 0; k < bestK; k++) { await key(d); await w(60); }
      }
    }
  }
  async function runMission(btn) {
    btn.click(); await w(400);
    $('.ex-card .btn-primary').click(); await w(300);
    const title = $('.ex-mission h1').textContent;
    const kind = /태양광|Solar/i.test(title) ? 1 : /산소|Oxygen/i.test(title) ? 2 : 3;
    if (kind === 1) {
      await at('solarB'); await key('KeyE'); await w(400); await solveCircuit(); await w(1500);
    } else if (kind === 2) {
      await at('depot'); await key('KeyE'); await w(300);
      await at(window.__explore.faulty()); await key('KeyE'); await w(400);
      const pg = window.__explore.pressureRef.current;
      window.__explore.pressureRef.current = { ...pg, gauges: pg.gauges.map((g) => { const c = (g.band[0] + g.band[1]) / 2; return { ...g, p: c, valve: c + g.leak / 1.6, speed: 0, wobble: 0 }; }) };
      for (let i = 0; i < 50 && window.__explore.stepRef.current === 2; i++) await w(100);
    } else {
      for (const s of ['sample1', 'sample2', 'sample3']) {
        await at(s);
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'KeyE' }));
        await w(4400);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'KeyE' }));
        await w(200);
      }
    }
    await at('dock'); await key('KeyE'); await w(500);
    const ok = !!$('.win');
    ($('.win .btn-primary') || $('.ex-card .btn')).click(); await w(500);
    return { kind, ok };
  }

  async function baseTurn(log) {
    // rover missions first
    for (let guard = 0; guard < 3; guard++) {
      const launch = $('.rover-launch > .btn-rover');
      if (!launch) break;
      launch.click(); await w(300);
      const item = $('.rover-menu .btn-rover');
      log.push({ shift: shiftNo(), mission: await runMission(item || launch) });
    }
    const ev = $('.event-card');
    if (ev && !ev.querySelector('.choice.picked')) { ev.querySelector('.choice').click(); await w(200); }
    if (shiftNo() === 2) { const u = $$('.upg-btn')[0]; if (u && !u.disabled) { u.click(); await w(200); } }
    const sw = () => $$('button[role=switch]');
    const set = async (i, on) => { const s = sw()[i]; if (s && !s.disabled && (s.getAttribute('aria-checked') === 'true') !== on) { s.click(); await w(120); } };
    const food = Number($$('.stat .val')[2]?.textContent || 100);
    await set(0, true);
    await set(1, food < 50);
    await set(3, true);
    const adv = () => $$('.advance button').find((b) => /진행|ADVANCE|결과|RESULT/i.test(b.textContent));
    for (const i of [3, 1]) if (adv()?.disabled) await set(i, false);
    // still short of power: with plenty of oxygen stored, pause the oxygen plant for one shift
    const o2 = Number($$('.stat .val')[1]?.textContent || 0);
    if (adv()?.disabled && o2 >= 45) await set(0, false);
    // the chosen emergency response itself needs the power: take the other response
    const ch = $$('.event-card .choice');
    if (adv()?.disabled && ch.length > 1 && ch[0].classList.contains('picked')) { ch[1].click(); await w(200); }
    const a = adv();
    if (!a || a.disabled) return false;
    a.click(); await w(500);
    const m = $('.modal .actions button'); if (m) { m.click(); await w(400); }
    return true;
  }

  async function toShift(n) {
    const log = [];
    while ($('.mission') && shiftNo() < n) {
      const before = shiftNo();
      if (!(await baseTurn(log))) { log.push({ blocked: before }); break; }
      if (!$('.mission')) break;
      if (shiftNo() === before && !$('.results-hero')) {
        const r = $$('.advance button').find((b) => /결과|RESULT/i.test(b.textContent)); if (r) { r.click(); await w(500); }
        break;
      }
    }
    return { shift: shiftNo(), screen: $('.results-hero') ? 'results' : $('.mission') ? 'mission' : 'other', log };
  }
  async function toEnd() {
    const r = await toShift(13);
    const res = $$('.advance button').find((b) => /결과|RESULT/i.test(b.textContent));
    if (res) { res.click(); await w(600); }
    return { ...r, screen: $('.results-hero') ? 'results' : r.screen };
  }
  window.__play = { toShift, toEnd, shiftNo };
  return 'play ready';
})();
