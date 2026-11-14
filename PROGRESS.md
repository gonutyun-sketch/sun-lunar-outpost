# PROGRESS — SUN: Lunar Outpost

_Last updated: 2026-11-14_

## Status summary
P0 + P1 data work complete. Full 8-shift mission playable; solar power now uses a verified NASA LRO/LOLA value.

| Phase | Scope | Status |
|---|---|---|
| 1 | Project setup, base UI | ✅ Done |
| 2 | Resources, facilities, power budget, turns | ✅ Done |
| 3 | Radiation events, win/partial/fail, scoring | ✅ Done |
| 4 | NASA LOLA illumination integration + Science & Credits | ✅ Done (awaiting team review) |
| 5 | Design/animation polish, sound (optional) | ⏳ Next — wait for review |
| 6 | Full QA, README, deployment, submission assets | ⏳ Not started |

## Phase 4 — NASA data used
- Product: `AVGVISIB_85S_060M_201608` (LRO/LOLA average solar illumination, 85°S–90°S, 60 m/px), PDS LRO-L-LOLA-4-GDR-V1.0 V1.05, via https://pgda.gsfc.nasa.gov/products/69
- Site: 89.4749°S, 137.4431°W (222.5569°E), ridge near Shackleton crater. DN 22111 × 0.00004 = **0.88444** (fraction of time sunlit by any part of the solar disc, averaged over 18.6 years). Equals the map's DERIVED_MAXIMUM.
- Comparisons (same map): 300 m window mean 0.5536; Shackleton floor 0.
- Extraction: `tools/extract-illumination.mjs` (HTTP Range, ~50 KB/site). Orientation verified with 5 PSR crater floors (≈0).
- Integration: `sunlight = min(1, 0.88444 × scenarioModifier)`; `solar = round(30 × sunlight)`. Scenario modifiers (fictional) were chosen so solar values stay 27,24,17,8,11,20,29,18 → balance unchanged.
- SVS 4930 cited as visual reference only (no numbers taken).

## Remaining (priority order)
1. **P1** README.md (description, how to play, citations), screenshots.
2. **P1** Git remote + push; static deploy.
3. **P2** Phase 5 polish (shift transitions, scene detail, optional sound).
4. **P1** Final end-to-end QA at 1366×768, submission checklist.

## Known bugs / notes
- No git remote configured yet — commits are local only.
- At 1366×768 the System Control panel scrolls when several warnings appear.
- Site name kept cautious ("ridge near Shackleton crater"); we did not verify it lies on a specifically named ridge.

## Last test results (2026-11-14, after Phase 4)
- `npm run typecheck` ✅  `npm test` ✅ 20/20  `npm run build` ✅
- Browser 1366×768: reference plan → Mission Successful 95/100 A (unchanged); solar chip shows NASA vs SCENARIO badges; Science & Credits renders citations. No console errors.
