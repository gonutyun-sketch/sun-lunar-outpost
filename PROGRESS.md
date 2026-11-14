# PROGRESS — SUN: Lunar Outpost

_Last updated: 2026-11-14_

## Status summary
Phases 1–3 (P0) are functionally complete: the full 8-shift mission is playable from menu to results.

| Phase | Scope | Status |
|---|---|---|
| 1 | Project setup, base UI (menu, how-to-play, credits, mission, results) | ✅ Done |
| 2 | Resources, facilities, power budget, turn system | ✅ Done |
| 3 | Radiation events (S3/S6 warnings, S4/S7 alerts), victory/partial/failure, scoring | ✅ Done |
| 4 | NASA LOLA illumination calibration + education polish | ⏳ Next (P1) |
| 5 | Design/animation polish, sound (optional) | ⏳ Partially done (P2) |
| 6 | Full QA, deployment, submission assets | ⏳ Not started |

## Completed
- Pure engine `src/game/engine.ts` (simulateShift, advanceShift, warnings, score) — 16 unit tests.
- Mission config in `src/data/mission.json` (all GDD numbers).
- SVG lunar base scene with facility lights, greenhouse glow, shelter shield, radiation pulse.
- Power budget preview; Advance is blocked when optional systems exceed available power.
- Habitat power failure → mission failure.
- Shift report modal explaining every change; mission log; per-shift science briefing.
- Results: grade, score breakdown, resource history graph, 3 takeaways, restart.
- Effects ON/OFF toggle + prefers-reduced-motion support.

## Remaining (priority order)
1. **P1** Phase 4: find & verify a NASA LOLA/LRO south-pole illumination value for a named site, store in `src/data/site.json` with citation, use it in solar formula, show source in Credits. Do NOT label anything NASA-measured until verified.
2. **P1** README.md (project description, how to play, citation), screenshots.
3. **P1** Git remote + push; static deploy (GitHub Pages / Vercel / Netlify).
4. **P2** Visual polish, shift transition animation, optional sound.

## Known bugs / notes
- No git remote configured yet (scratch workspace) — commits are local only.
- At 1366×768 the System Control panel scrolls when several warnings appear (acceptable; consider compacting).

## Last test results (2026-11-14)
- `npm run typecheck` ✅  `npm test` ✅ 16/16  `npm run build` ✅
- Browser (1366×768, Chromium): reference plan → Mission Successful, 95/100 A (matches unit test); all-off plan → Failed (oxygen) at Shift 5, 23/100 F. No console errors.
