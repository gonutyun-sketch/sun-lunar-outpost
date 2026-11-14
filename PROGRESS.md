# PROGRESS — SUN: Lunar Outpost

_Last updated: 2026-11-14 (Phase 5)_

| Phase | Scope | Status |
|---|---|---|
| 1–3 | Setup, resources/facilities/turns, events, win/fail, scoring | ✅ Done |
| 4 | NASA LRO/LOLA illumination (0.88444) in solar formula, Science & Credits | ✅ Done (approved) |
| 5 | Science clarity, strategy testing, visual polish, deploy prep | ✅ Done (awaiting review) |
| 5b | Korean / English localisation (default KO, switch anytime, saved) | ✅ Done |
| 7 | Gameplay v2: 12 shifts / 3 chapters, 3 upgrades, 5 interactive emergencies, rebalance | ✅ Done (awaiting play-test review) |
| 8 | Rover exploration P0: drive, collide, battery, Mission 1 (solar repair) + circuit puzzle, linked to base | ✅ Done (awaiting play-test) |
| 8b | Rover P1: Mission 2 (oxygen parts), Mission 3 (samples), more minigames | ⏳ Not started (on hold for review) |
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

## Localisation (KO/EN)
- Dictionary system: `src/i18n/en.ts` (reference keys), `src/i18n/ko.ts` (TypeScript forces every key), `translate.ts` (pure), `I18n.tsx` (context, `LangToggle`, `rich` for **bold**).
- Default language Korean; setting stored in localStorage `sun-lang`; `<html lang>` follows it. Toggle on main menu, mission top bar, How to Play, Credits, Results.
- Engine unchanged in logic: warnings now also carry `code`+`params`; power breakdown rows carry `id`. UI translates; engine English text kept for tests/logs.
- Shift-report explanations rebuilt in UI from the same outcome numbers (`explainReport`). Debrief takes a translator.
- Kept in original form on purpose: NASA product/dataset IDs, paper citation, URLs, file names, formula functions (min/round), tech/font names, ISS/LED acronyms, game title "SUN: Lunar Outpost".
- Font: Noto Sans KR added (Google Fonts) + `word-break: keep-all` for Korean.

## Gameplay v2 (2026-11-14)
Diagnosis of v1: 4 on/off switches with an arithmetic optimum; only 2 radiation alerts (always "shelter on"); no progression; ~5 min; random clicking won 45%.

Added (data in src/data/mission.json, rules in src/game/engine.ts):
- **12 shifts, 3 chapters** (1–4 establish, 5–8 expand, 9–12 escalation); research goal 4 (score scales 30 × r/4).
- **Upgrades** (from shift 2, one per shift, energy paid now, active next shift): Solar +10 peak (cost 20), Oxygen recycler 7→4 energy & +20→+22 O₂ (cost 12), Battery 100→140 (cost 10). Drawn on the base (2nd panel row, 3rd tank, bigger battery bank).
- **5 fictional emergencies**, each forecast one shift ahead, each with 2 choices; the shift cannot run until the player decides: O₂ fault (repair −10 energy / patch 40% output), storm 1 (shelter: shelter ON + lab closed / work: −20 health), dust (EVA −10 health / stay inside: solar ×0.3), pump (replace −8 energy / harvest +10 food, greenhouse off), major storm (shelter / work −25 health).
- Feedback: chapter banners, decision cards, forecast strip, ONLINE/LOCKED states, report highlights (upgrade online, research milestone n/4, chapter complete, sheltered), decisions & upgrades on the results screen.
- Rebalance: scenario modifiers (fictional) raised by +0.08 and battery capacity kept at 100 after testing variants.

Balance evidence (src/game/balance.test.ts + `npm run analyze`):
- Exact best play: **100/100** (7.66 M states searched; expert plan builds Solar + Oxygen, shelters both storms, harvests early).
- "Sensible novice" bot (simple rules) + Solar upgrade: success, 90 (A). Same bot **without upgrades fails**. All three upgrades: success.
- Every emergency choice still allows success (scores 86–94) → no trap options, real trade-offs.
- No constant strategy wins; everything-ON fails on power.
- Random clicking: success 9.2 %, fail 84 % (v1: 45 % success).

## Rover exploration (P0, 2026-11-14)
- New mode `src/ui/ExploreScreen.tsx` (Canvas 2D) + pure logic in `src/rover/`: `world.ts` (2600×1600 map: base, dock, charging pad, O₂ plant, solar farm with segment B, craters, boulder field, 4 shadow zones), `sim.ts` (acceleration, drag, smooth turning, normalised diagonals, circle/rect sliding collisions, battery), `circuit.ts` (3×3 rotation puzzle, 6 rotations), `render.ts` (terrain cached offscreen, lights, dust particles, headlight cone in shadow, objective marker + off-screen arrow, bump shake).
- Controls: WASD/arrows drive, E interact, Esc pause (or leave puzzle), R restart with confirmation. Puzzle: click, or ←/→ + E/Space, or 1–3.
- Rover battery (fictional, separate from base): start 80/100, sun +1/s, shadow −1.5/s, driving −0.25/s, charging pad +12/s, puzzle rotation −0.5, 0 = failure. Shadows are labelled a training scenario; the NASA 0.88444 is not used per tile.
- Mission 1 "Emergency solar array repair" (Shift 2, chosen because Shift 3 already has the O₂ emergency): from Shift 2 base solar is ×0.8 until repaired (persists into later shifts). Success restores 100 %. Each failed attempt (battery 0) costs the base 8 energy; retry is allowed. Base time does not pass during an expedition; App keeps the base state, only `applyExpedition` changes it.
- Route measurements (bot): shadowed north shortcut ≈10.7 s / battery 72 at site; sunny south detour ≈12.2 s / 79. Real UI run: reach site 71.7, after puzzle in shadow 39, back at dock 24 (low-battery warning) — tension present.
- Balance with the repair (sensible bot): repair at Shift 2 → success 90; after 2 failed attempts → 84; never repaired → partial (research goal missed). Random clicking (with repair) 9 % success.

## Remaining (priority order)
1. **P0** Create GitHub repo, push, enable Pages (steps in HANDOFF.md) → public demo URL, add to README.
2. **P1** Team decision on difficulty (above). If changed: update mission.json + tests.
3. **P1** Final submission: Space Apps project page, demo video, AI disclosure.
4. **P2** Optional: sound, more scene detail.

## Known issues
- No git remote yet; commits local only.
- Control panel may still scroll slightly at 1366×768 when 2+ warnings are shown (all critical warnings are now above the fold).
- Mid-transition screenshots can show the fading shift banner (cosmetic).

## Last test results (2026-11-14, rover P0)
- `npm run typecheck` ✅ · `npm test` ✅ 48/48 (engine 23, rover 10, balance 10, i18n 5) · `npm run build` ✅ (dev-only rover hook absent from bundle)
- Browser 1366×768, real keyboard events: Korean — Shift 2 rover button + damage alert → briefing → drive to segment B (prompt E) → puzzle solved with ←/→/E → return → dock with E → success; base kept Shift 2 and resources, solar +22 → +27, button/alert gone. English — battery-out failure screen, Try again (battery 80 at dock), R restart confirmation, Esc pause, Back to base → base energy −8, mission still open; game continued to the end (Mission Failed, power, Shift 11 for careless no-repair play). No console errors.
