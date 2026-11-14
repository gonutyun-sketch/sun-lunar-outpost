# HANDOFF — SUN: Lunar Outpost

Read PROGRESS.md first. Do not rebuild completed features.

## Tech
React 18 + TypeScript + Vite 5, Vitest. No backend, no external APIs at runtime. Static build in `dist/` (`base: './'`).

## Commands
```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test           # vitest, engine tests
npm run build      # -> dist/
```

## Structure
```
src/data/mission.json   All tunable numbers from GDD (resources, costs, FICTIONAL shift scenarioModifier, events)
src/data/site.json      NASA LRO/LOLA-derived site value + full provenance (do not edit without re-extracting)
tools/extract-illumination.mjs  Reproducible NASA pixel extraction (HTTP Range); node tools/extract-illumination.mjs
src/i18n/en.ts, ko.ts   UI text dictionaries (KO default). Add a key to en.ts → TypeScript requires it in ko.ts
src/i18n/en.learn.ts, ko.learn.ts  Difficulty, coach, warnings (.easy variants) and Science & Credits texts (merged into en/ko)
src/i18n/I18n.tsx       Language context, LangToggle, localStorage 'sun-lang'
src/game/types.ts       Shared types
src/game/config.ts      MISSION = original rules (= Hard); UI uses missionFor(state.difficulty)
src/game/difficulty.ts  Difficulty modes: per-mode fictional values (base, rover, help); missionFor(id) builds the config (NASA site data shared)
src/game/coach.ts       Beginner coach tips: picks ≤ 2 situation tips per shift (pure, tested)
src/game/difficulty.test.ts Config protection + balance per difficulty + coach + stuck-deficit regression
src/game/engine.ts      PURE simulation: simulateShift, advanceShift, getWarnings, computeScore
src/game/debrief.ts     Results text + 3 takeaways
src/game/engine.test.ts Unit tests (incl. a reference winning plan = 95/A)
src/game/analysis.ts    Balance bots: bestPlay (exact DP), sensiblePolicy, randomPolicy, simulate (seeded)
src/game/save.ts        Save/continue: versioned localStorage file, validation, checkpoint marker (pure, tested in save.test.ts)
src/game/balance.test.ts Strategy/balance tests (sensible bot wins, no-upgrade fails, every choice viable, random < 15%)
tools/best-play.test.ts Exact best-play search — run with `npm run analyze` (~4 min, 6 GB RAM)
src/ui/MissionScreen.tsx Top bar, scene, controls, power budget, log, shift report modal
src/ui/BaseScene.tsx    SVG lunar base
src/ui/ExploreScreen.tsx Rover exploration mode (Canvas loop, input, HUD, puzzle overlay, pause/fail/success)
src/rover/world.ts      Exploration map data (craters, rocks, blocks, shadow zones, sites)
src/rover/sim.ts        Rover physics + battery (pure, tested); stepRover(..., drainScale) and createRover(map, battery) for difficulty
src/rover/circuit.ts    Circuit rotation puzzle (pure, tested)
src/rover/pressure.ts   Pressure-regulation minigame (pure, tested)
src/rover/render.ts     Canvas drawing (zoom-aware camera)
src/rover/fx.ts         Visual-only state: particles, tracks, look-ahead camera, bursts, battery levels (pure, tested)
src/rover/touch.ts      Joystick vector, camera zoom, DPR cap (pure, tested)
tools/qa-responsive.js  Dev QA: layout checks + synthetic touch helpers (load in the browser console)
tools/qa-playthrough.js Dev QA: plays the whole mission through the UI (__play.toShift(n), __play.toEnd()) for save/continue tests
tools/qa-sweep.js       Dev QA: walks 28 screens (menu, how-to, 10 science tabs, difficulty, base, 3 missions, report, results) at the current viewport (use with ?devShift=9)
src/rover/difficulty.rover.test.ts  Rover/pressure/circuit settings per difficulty (movement identical, battery only)
src/ui/Screens.tsx      Starfield, MainMenu, DifficultySelect, HowToPlay, Credits (tabbed science hub), Results (+ graph)
src/App.tsx             Screen routing, effects toggle
```

## Rules (v2 — see src/game/engine.ts simulateShift)
Per shift:
1. sunlight = min(1, NASA site avg 0.88444 × fictional scenarioModifier[shift]); solar = round((30 + solar upgrade 10) × sunlight × event solarMult)
2. capacity = 100 (+40 with Battery upgrade); available = min(capacity, battery + solar)
3. demand = habitat 12 + running facilities (oxygen 7, or 4 upgraded; greenhouse 6; shelter 7; lab 8) + emergency energyCost + upgrade construction cost
4. available < 12 → mission FAILED (power). demand > available → turn blocked. Emergency shift without a decision → turn blocked.
5. oxygen += (20, or 22 upgraded) × oxygenProdMult − 14; food += 16 (greenhouse) − 12 + choice.food; clamp 0..100
6. radiation events: "shelter" choice locks shelter ON + lab OFF → protected; "work" → −radiationDamage; no decision impossible (blocked)
7. lab +1 research (goal 4). Upgrade queued this shift becomes active next shift.
8. fail: oxygen ≤ 0, food ≤ 0, health < 40, habitat power. After shift 12: research 4 → success else partial.
Score: survival 40 + round(30 × r/4) + round(20·health/100) + round(10·min(battery,30)/30).

## Rover expeditions
- Config: mission.json `expeditions` (id, fromShift, solarMult, failEnergyCost). Engine: `activeExpedition`, `solarDamageMult`, `applyExpedition`. State: `expeditionsDone`, `expeditionFails`.
- Flow: MissionScreen "LAUNCH ROVER" → App screen 'explore' (base state untouched) → ExploreScreen onExit({success, failures}) → applyExpedition → back to mission.
- Missions are step lists in ExploreScreen `MISSIONS` (kinds: goto, circuit, pickup, scan, pressure, collect, dock). Mission 3 (sampleSurvey) uses `collect` (hold E, DRILL_TIME) and `rewardResearch`. To add more missions: add an expedition in mission.json (fromShift, effect), a MissionDef with steps (e.g. a new `sample` kind), sites in world.ts, and `ex.*` keys in en.ts/ko.ts. Engine effects available: solarMult, oxygenMult, oxygenLeak, failEnergyCost, failOxygenCost; `expeditionLog` feeds the shift report.
- Tuning: ROVER constants in src/rover/sim.ts; map in world.ts; `npx vitest run src/rover` prints route times/battery.

## Difficulty modes
- One engine. `DIFFICULTIES` in src/game/difficulty.ts holds per-mode values: `base` (initial supplies, crew use, eventDamage multiplier, upgrade costs, rover failure cost, O₂ leak), `rover` (battery start, drainScale, rotateCost, pressure band pad / hold / wobble, circuit hint, shadow alerts, charge guide) and `help` (coach mode, warning tone).
- Hard = mission.json exactly (tested). Never put NASA values or the shift scenario into the per-mode values.
- GameState.difficulty is fixed at New Game and saved (save v2). v1 saves are migrated to Hard.
- To retune: change the numbers, run `npx vitest run src/game/difficulty.test.ts src/rover/difficulty.rover.test.ts` (prints random-player and rover margins per mode). Targets: sensible play A in every mode; Easy recovers from no upgrades + bad choices + failed sorties but random clicking < 60 % and never launching the rover still fails; Normal random < 35 %, upgrades worth > 5 points, skipping the O₂ repair is fatal; Hard unchanged.
- Warnings: Easy shows `warn.<code>.easy` texts — add one for every new warning code.

## Repository
- GitHub (public): https://github.com/gonutyun-sketch/sun-lunar-outpost — `origin`, branch `main`. Every push to main runs .github/workflows/deploy.yml (typecheck, tests, build, Pages deploy).

## Next tasks for the next AI
1. Human play-test of Easy/Normal with students; adjust DIFFICULTIES values if needed (see Difficulty modes).
2. Mission 1 route trade-off on Hard is now tiny (see PROGRESS.md Known issues) — team decision.
3. After deployment: add URL to README, run a full playthrough on the live URL.
4. Submission materials.

## Save notes
- Bump `SAVE_VERSION` in src/game/save.ts whenever GameState changes shape and add a migration in `loadGame` (v1 → v2 adds `difficulty: 'hard'`).
- `isValidState` checks every field the UI reads; extend it when you add state.
- Never write to the save while exploring except through App (checkpoint = base state + `exploring`).

## Rover visuals notes
- Anything that only changes what is drawn goes in src/rover/fx.ts / render.ts. Do not change ROVER constants, world.ts geometry or collision code without re-running `npx vitest run src/rover` and comparing route times.
- Respect `motion` (effects on and no reduced-motion) for anything animated; keep particle caps.

## Responsive / touch notes
- Breakpoints: >1100 desktop grid; ≤1100 single column + fixed bottom action bar; ≤640 phone; max-height 500 landscape = compact exploration HUD.
- Touch controls live in ExploreScreen (TouchStick, ActionButton); input feeds `Input.ax/ay` (analog) or drillHeld. Keep cleanup effects unmount-only (callbacks change every render).
- `?devShift=N` (dev only) starts at shift N for QA.

## Cautions
- Rebalancing: change src/data/mission.json, then `npm test` (fast bots) and `npm run analyze` (exact best). Keep random success < 15 % and every emergency choice viable.
- New emergency = add to mission.json events + `ev.<id>.*` and `edu.ev.<id>.*` keys in en.ts/ko.ts.
- Never hard-code UI text in components: add it to src/i18n/en.ts + ko.ts and use t('key'). Keep {placeholders} identical (tested).
- Avoid Korean particles (을/를, 이/가) directly after {number} placeholders — use 만큼 or rephrase.
- Keep engine pure (no React imports). Any rule change → update engine + balance tests.
- React keys: scene and shift banner share a parent — keep their keys distinct (scene-N / banner-N), or old scenes stack up.
- Never present gameplay values as NASA-measured. Only site.json averageSunlitFraction + nearbyComparisons are NASA-derived; UI marks them with the green NASA badge, everything else with the orange SCENARIO badge.
- To change site: run the tool with new lat/lon, update site.json, re-check that solar values / balance tests still hold.
- Never commit secrets/.env (already in .gitignore).
