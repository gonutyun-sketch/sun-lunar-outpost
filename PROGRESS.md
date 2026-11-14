# PROGRESS — SUN: Lunar Outpost

_Last updated: 2026-11-14 (Phase 5)_

| Phase | Scope | Status |
|---|---|---|
| 1–3 | Setup, resources/facilities/turns, events, win/fail, scoring | ✅ Done |
| 4 | NASA LRO/LOLA illumination (0.88444) in solar formula, Science & Credits | ✅ Done (approved) |
| 5 | Science clarity, strategy testing, visual polish, deploy prep | ✅ Done (awaiting review) |
| 6 | Public deployment, final QA, submission | ⏳ Needs GitHub/hosting account action by the team |

## Phase 5 delivered
- Science: 88.44% explained as long-term Sun visibility (not efficiency/forecast) on Credits + mission tooltip; "Why the site matters" bars (88.4 / 55.4 / 0%) and game calculation (ridge 154 vs 300 m-average 95 energy over 8 shifts); badges "NASA LOLA" vs "FICTIONAL SCENARIO".
- Tests: `src/game/balance.test.ts` — 7 named strategies + exhaustive search of all legal decision paths (9,395 states) + restart check.
- Visuals: terrain dims with sunlight; animated power cables to running facilities; hover card ⇄ scene highlight ring; ONLINE/STANDBY tags; resource icons; shift banner transition; radiation streaks, red pulsing frame and alert strip; results grade ring, score bars, radiation bands on history graph.
- Layout: event briefing moved into scene strip; warnings above power budget (1366×768).
- Deploy prep: README.md, docs/screenshots/, `.github/workflows/deploy.yml` (GitHub Pages), branch renamed to `main`.

## Balance findings (for team decision — NOT changed)
Random-legal-choice player outcome (exact, all paths): success 45.0%, partial 12.4%, fail 42.7%; best score 100.
- No constant strategy (same switches every shift) wins → decisions matter.
- All-ON fails (power, Shift 4); no-oxygen / no-greenhouse / two unsheltered radiation events all fail.
- Game is fairly forgiving. Tested tweaks (random-player success): initial energy 45 → 36.0%; energy 40 → 28.7%; oxygen use 16 → 29.7%; food use 14 → 37.8%; lab cost 10 → 37.6%; O2 55 & food 60 → 32.9%. All remain winnable.

## Remaining (priority order)
1. **P0** Create GitHub repo, push, enable Pages (steps in HANDOFF.md) → public demo URL, add to README.
2. **P1** Team decision on difficulty (above). If changed: update mission.json + tests.
3. **P1** Final submission: Space Apps project page, demo video, AI disclosure.
4. **P2** Optional: sound, more scene detail.

## Known issues
- No git remote yet; commits local only.
- Control panel may still scroll slightly at 1366×768 when 2+ warnings are shown (all critical warnings are now above the fold).
- Mid-transition screenshots can show the fading shift banner (cosmetic).

## Last test results (2026-11-14)
- `npm run typecheck` ✅ · `npm test` ✅ 30/30 (2 files) · `npm run build` ✅ (JS 63 KB gzip)
- Browser 1366×768: full success 95 A (reference) and 97 A (late-lab plan); 90 A with one unsheltered radiation event; failure (oxygen) path; restart resets to Shift 1 with initial values; no new console errors after duplicate-key fix.
