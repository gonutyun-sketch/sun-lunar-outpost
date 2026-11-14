/**
 * Responsive / touch QA checks — paste into the browser console on the dev server
 * (npm run dev, open http://localhost:5173/?devShift=8) at any viewport size, or inject via automation.
 *
 *   __qa.check('label')   → layout report for the current screen:
 *       - horizontal page overflow
 *       - visible buttons/controls cut off by the viewport (outside left/right edges)
 *       - touch targets smaller than 44×44 CSS px (only reported on coarse pointers)
 *       - overlapping primary controls (advance button vs rover launcher, joystick vs action button)
 *   __qa.touchDrag(el, dx, dy, ms)   → synthetic touch-pointer drag (pointerdown/move/up, pointerType 'touch')
 *   __qa.press(el) / __qa.release(el) → synthetic touch press / release on a button
 */
(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const overlap = (a, b) => {
    if (!a || !b || !vis(a) || !vis(b)) return false;
    const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
    return !(r.right <= q.left || q.right <= r.left || r.bottom <= q.top || q.bottom <= r.top);
  };
  function check(label) {
    // measure final layout: entrance animations (e.g. the action button pop) would otherwise be caught mid-scale,
    // and a hidden browser pane never advances them
    for (const a of document.getAnimations?.() ?? []) { try { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); } catch { /* ignore */ } }
    const coarse = matchMedia('(pointer: coarse)').matches || document.documentElement.classList.contains('touch');
    const W = innerWidth;
    const out = { label, vw: `${innerWidth}x${innerHeight}`, hScroll: document.documentElement.scrollWidth > W + 1, cut: [], small: [], overlaps: [] };
    const controls = [...document.querySelectorAll('button, [role=switch], .gauge, .touch-stick')].filter(vis);
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      // inside a horizontally scrollable container is fine
      const scroller = el.closest('table, .ex-overlay, .modal');
      if (!scroller && (r.left < -1 || r.right > W + 1)) out.cut.push((el.textContent || el.className).trim().slice(0, 30));
      if (coarse && (r.width < 43.5 || r.height < 43.5) && !el.closest('.cz-tile')) {
        // switches carry an invisible 44px ::before hit area
        const s = getComputedStyle(el, '::before');
        const ok = el.matches('[role=switch]') && s.content !== 'none';
        if (!ok) out.small.push(`${(el.textContent || el.getAttribute('aria-label') || el.className).trim().slice(0, 18)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    const adv = document.querySelector('.advance .btn-primary');
    const rover = document.querySelector('.rover-launch > .btn-rover');
    if (overlap(adv, rover)) out.overlaps.push('advance/rover');
    if (overlap(document.querySelector('.touch-stick'), document.querySelector('.action-btn'))) out.overlaps.push('stick/action');
    if (adv) { const r = adv.getBoundingClientRect(); out.advanceVisible = r.bottom <= innerHeight + 1 && r.top >= 0; }
    return out;
  }
  const fire = (el, type, x, y, id = 7) =>
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }));
  const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  async function touchDrag(el, dx, dy, ms = 300, id = 7) {
    const [x, y] = center(el);
    fire(el, 'pointerdown', x, y, id);
    fire(el, 'pointermove', x + dx, y + dy, id);
    await new Promise((r) => setTimeout(r, ms));
    fire(el, 'pointerup', x + dx, y + dy, id);
  }
  const press = (el, id = 9) => { const [x, y] = center(el); fire(el, 'pointerdown', x, y, id); };
  const release = (el, id = 9) => { const [x, y] = center(el); fire(el, 'pointerup', x, y, id); };
  window.__qa = { check, touchDrag, press, release, fire, center };
  return 'qa ready';
})();
