# PROGRESS — SUN: Lunar Outpost

_Last updated: 2026-11-15 (difficulty modes, learning pages)_

| Phase | Scope | Status |
|---|---|---|
| 1–3 | Setup, resources/facilities/turns, events, win/fail, scoring | ✅ Done |
| 4 | NASA LRO/LOLA illumination (0.88444) in solar formula, Science & Credits | ✅ Done (approved) |
| 5 | Science clarity, strategy testing, visual polish, deploy prep | ✅ Done (awaiting review) |
| 5b | Korean / English localisation (default KO, switch anytime, saved) | ✅ Done |
| 7 | Gameplay v2: 12 shifts / 3 chapters, 3 upgrades, 5 interactive emergencies, rebalance | ✅ Done (awaiting play-test review) |
| 8 | Rover exploration P0: drive, collide, battery, Mission 1 (solar repair) + circuit puzzle, linked to base | ✅ Done (awaiting play-test) |
| 8b | Rover P1: Mission 2 — oxygen plant repair (parts, leak scan, pressure minigame) | ✅ Done (awaiting play-test) |
| 8c | Rover P1: Mission 3 — science survey (3 samples, free order, deep-shadow risk, hold-E drilling) | ✅ Done (awaiting play-test) |
| 9 | Cross-platform: responsive layouts, touch joystick/action button, touch minigames, canvas DPR/resize/zoom | ✅ Done (awaiting review; not yet tested on a physical device) |
| 10 | Save & continue (localStorage, versioned, exploration checkpoint) | ✅ Done |
| 11 | Rover polish: graphics, mission effects, camera/feedback, battery warnings, performance | ✅ Done (emulator-tested only) |
| 11b | Pixel / 2.5D redesign (OpenAI Codex, PR #1) | ✅ Merged by the team |
| 12 | Difficulty modes, beginner help, Science & Credits learning hub, QA | ✅ Done on branch feature/difficulty-education-qa (awaiting review / student play-test) |
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
- Rover battery (fictional, separate from base): start 80/100. Sunlight −0.4/s, shadow −1.5/s, deep shadow −3/s, driving adds −0.25/s, charging pad +12/s, puzzle rotation −0.5, and 0 triggers failure. The map shows the same training shadow boundaries used for battery drain. NASA's illumination value of 0.88444 is separate from these zones.
- Mission 1 "Emergency solar array repair" (Shift 2, chosen because Shift 3 already has the O₂ emergency): from Shift 2 base solar is ×0.8 until repaired (persists into later shifts). Success restores 100 %. Each failed attempt (battery 0) costs the base 8 energy; retry is allowed. Base time does not pass during an expedition; App keeps the base state, only `applyExpedition` changes it.
- Route measurements (bot, before the Codex merge): shadowed north shortcut ≈10.7 s / battery 72 at site; sunny south detour ≈12.2 s / 79. After the merge (sunlight now drains 0.4/s, larger shadows): north 64.4, south 65.0 (Hard). Real UI run: reach site 71.7, after puzzle in shadow 39, back at dock 24 (low-battery warning) — tension present.
- Balance with the repair (sensible bot): repair at Shift 2 → success 90; after 2 failed attempts → 84; never repaired → partial (research goal missed). Random clicking (with repair) 9 % success.

## Rover Mission 2 — oxygen plant repair (2026-11-14)
- Shift 6 (no emergency that shift). Until repaired: recycler ×0.5 and −4 O₂ leak per shift. Each failed attempt: −8 base energy, −5 O₂ (O₂ never drops below 1 outside a shift). Abort without trying: no cost.
- Steps: pick up parts at the supply depot (near base) → drive to the remote O₂ plant (NW) past a rock ridge (shadowed west gap 5.0 s vs sunny east detour 7.0 s) → scan valves with E (leak puffs are a visual clue; first attempt leak = valve C, not the nearest) → pressure minigame → dock.
- Pressure minigame (`src/rover/pressure.ts`): 3 gauges with leaks and target bands; ↑/↓ hold or on-screen buttons; a tap gives a small kick; holding accelerates past the "calm" speed → wobble; >95 vents. Hold all in band 3 s. Bots: careful taps 11.5 s; long holds never stabilise.
- Base hookup: several pending missions each get a launch button; damage alerts; shift report shows rover results (success / failures with costs) and damage lines; results screen lists completed rover missions.
- Balance (sensible bot): both repairs → win 90; one failed attempt on each → win 84; skip O₂ repair → mission fails.
- Fixes found in play-test: shelter switched on by "Shelter the crew" now turns off after the storm (it silently cost 7 energy every later shift); rock moved to remove a trap pocket on the east detour; render loop stops safely if a late frame arrives after closing.

## Rover Mission 3 — science survey (2026-11-14)
- Shift 8 (forecast-only shift), available to the end. An opportunity, not damage: success = research +1 milestone; each failed attempt −8 base energy. Skipping has no direct cost.
- Three sample beacons in different directions, player chooses the order: S1 deep in a permanently shadowed crater floor (FICTIONAL training zone, heaters −3/s, frost visual), S2 sunny far east, S3 in a small-crater shadow. Stop and HOLD E for 4 s to drill (moving cancels); then dock.
- Measured (bot, 4 s drills): risky route through the deep zone ends with battery 53.7, safer southern edge 57.8; in real play, idling in the deep zone drained the rover to 0 (failure path verified).
- Rover launcher: one "LAUNCH ROVER (n)" button opens a menu when several missions are pending (3 stacked buttons pushed the Advance button off a 768 px screen).
- Fix found in play-test: changing an emergency decision from "Shelter the crew" to "Keep working" left the shelter ON (silent −7 energy); the previous decision's forced facility is now switched back off.
- Balance: with the research goal of 4 the +1 milestone mainly saves a lab shift for a human; the simple bot shows no score change (it runs the lab whenever it can), so the goal was not raised.
- Estimated hands-on time: Mission 1 ≈ 40–50 s, Mission 2 ≈ 1.5 min, Mission 3 ≈ 1–1.5 min at bot speed; a first-time human with retries ≈ 4–6 min total (target was 6–8; see Remaining).

## Cross-platform & responsive (2026-11-14)
- Touch (Pointer Events, per-pointer capture, multitouch): joystick bottom-left (analog, dead zone, normalised), context action button bottom-right (tap = E, hold = drilling with progress ring), ❚❚ pause, ✕ close on puzzles; shown only when relevant; touch UI on coarse pointers / touch points / first touch.
- Safety: pointercancel / lost capture / blur / tab hidden release every input; hidden tab pauses the mission; long-press context menu blocked in the game; `touch-action: none` only on the game view and controls; menus scroll normally.
- Canvas: CSS size vs backing store (DPR capped at 2), ResizeObserver, camera zoom 0.5–1 for small views (world coordinates/collisions unchanged), off-screen arrow in screen space.
- Layout: <1100 px single-column base screen with fixed bottom action bar (Advance + rover launcher); <640 px phone layout (short resource names, chips under the scene, 3-col report deltas); compact exploration HUD in short landscape; 44 px targets on touch (`html.touch` + pointer: coarse); safe-area insets; dvh heights.
- QA tools (dev only): `?devShift=N` start shift, `tools/qa-responsive.js` (overflow / cut / <44 px / overlap checks + synthetic touch), `tools/qa-sweep.js` (15 screens per viewport).

## Save & continue (2026-11-14)
- `src/game/save.ts` (pure, tested): localStorage key `sun-save` = `{ v: 1, savedAt, state: GameState, exploring }`. No personal data. Language (`sun-lang`) and effects (`sun-fx`) keep their own keys.
- Autosave in App on every game-state change while a game is open (mission / explore / results).
- Exploration checkpoint: the base state is never changed while exploring, so the save always holds the last safe base state plus `exploring: <id>`. Reload during a run → menu notice, back at the base before launch (nothing gained or lost; the mission can be relaunched). The result is applied once when the run ends (`applyExpedition` ignores a repeated success; App guards double exit).
- Load validation: wrong JSON / other version / invalid shape → save removed, menu notice, normal new start. An error boundary also clears the save and returns to the menu if a screen ever crashes on unexpected data.
- Menu: CONTINUE (shows shift n/12, or "mission finished · view results") + NEW GAME (confirmation dialog only when an unfinished mission would be overwritten). Results → RESTART starts a new game.
- Known limit: reloading mid-expedition also discards failed attempts made during that run (no cost applied) — accepted for the checkpoint design.

## Rover polish (2026-11-14)
- Visual-only state in `src/rover/fx.ts` (pure, tested): particles (cap 140, in-place update), wheel tracks (cap 320, fade 45 s), feedback bursts (cap 8), smooth look-ahead camera (rover always ≥ 25 % from the view edges), battery levels, joystick axis snap. Physics/battery/collisions/mission rules in `sim.ts`/`world.ts` are **unchanged** (route-time tests unchanged).
- Render (`render.ts`): six-wheel rover with moving treads, rocker arms, solar deck with glint, camera mast, headlights (beam in shadow), brake lights, blinking status LED, body lean on accel/brake, drill vibration; terrain with albedo patches, craterlets, pebbles, crater ejecta and west/east lighting, faceted rocks; deep shadow with mist, rim glow and frost; distinct solar rows (cells, posts, glint, cracked/red broken panels, sparks, status lamps) vs oxygen plant (white tanks with cyan bands, compressor, pipes with O₂ flow when working); clearer goal markers (rotating dashes, bobbing arrow, filled when in reach); off-screen arrow with distance.
- Mission effects: M1 current flowing through powered circuit tiles + array lights up panel by panel after repair; M2 gas particles from the leaking valve + cyan pressure rings and pipe flow when stabilised; M3 regolith spray and vibration while drilling, sample burst, "all samples" big burst + toast.
- Feedback: arrival ping (and short vibration on touch), success/info/warning bursts, "too far" message when E is pressed out of range, battery warnings at < 25 % and < 10 % (toast, red screen pulse, blinking HUD), soft bump (rate-limited shake + dust/sparks).
- Touch: joystick hit area +26 px, near-axis snap (±8°, speed unchanged), haptics where supported.
- Performance: only the visible terrain part is copied per frame; paused/briefing screens redraw at ~12 fps; dt capped at 50 ms (hidden tab / slow device never makes the rover jump); effects off or OS reduced-motion → no particles, shake, vibration or animated pulses.

## Difficulty modes & learning (2026-11-15)
- `src/game/difficulty.ts`: Easy / Normal / Hard on one engine; Hard = the original mission.json (players found it hard). NASA site data, sunlight scenario, solar output, research goal, map and win rules are shared and tested to stay identical.

| | Easy | Normal | Hard |
|---|---|---|---|
| Start energy / O₂ / food | 64 / 74 / 78 | 60 / 72 / 76 | 55 / 65 / 70 |
| Crew O₂ / food per shift | 13 / 11 | 14 / 12 | 14 / 12 |
| Emergency damage (storm 1 / storm 2 / work 1 / work 2 / EVA) | ×0.6: 21 / 27 / 12 / 15 / 6 | ×0.8: 28 / 36 / 16 / 20 / 8 | 35 / 45 / 20 / 25 / 10 |
| Upgrade cost solar / O₂ / battery | 14 / 9 / 8 | 17 / 11 / 9 | 20 / 12 / 10 |
| Rover failure cost energy (O₂, Mission 2) · leak until repaired | 4 (2) · 2 | 6 (4) · 4 | 8 (5) · 4 |
| Rover battery start · drain · rotation cost | 100 · ×0.6 · 0.25 | 90 · ×0.8 · 0.4 | 80 · ×1 · 0.5 |
| Pressure puzzle band · hold · wobble | ±4 · 2 s · ×0.5 | ±2 · 2.5 s · ×0.75 | 0 · 3 s · ×1 |
| Circuit hint · shadow alerts · charge guide | dotted target wiring · yes · < 45 | wrong-tile count · yes · < 30 | none · no · no |
| Coach tips · warnings | every shift · plain words | shifts 1–2 · standard | on request · standard |

- Evidence (bots, src/game/difficulty.test.ts): sensible play 99 / 94 / 90 (A in all); random clicking wins 47 % / 24 % / 10 %; Easy survives no upgrades + always the second emergency choice + 1 failed sortie per mission (85), but never launching the rover fails; Normal without upgrades wins with a lower score (84 vs 94), 2 failed sorties per mission recoverable, skipping the O₂ repair fatal; no first-shift move can end the mission in any mode. Rover (src/rover/difficulty.rover.test.ts): Mission 3 survey ends with battery 64.9 / 43.2 / 21.5; careful pressure play 9.3 / 10.7 / 11.5 s; path, speed and collisions identical.
- Save v2 stores the difficulty; v1 saves migrate to Hard (same rules), kept and re-saved. Results show the difficulty and "compare scores within the same difficulty".
- Beginner help: coach tips (src/game/coach.ts) with a HELP toggle remembered per difficulty; Easy warning texts; rover briefing tips, circuit hints, wrong-valve explanation, shadow alerts, charging-pad guide.
- Science & Credits: 10 tabs (survive, NASA data, pole, power, life support, rovers, real vs game, questions, sources, team & AI), short text + "Learn more", glossary, 8 check questions linked to topics. New facts only from NASA Moon facts / LRO / Artemis pages (gravity 1/6, ≈127 °C / ≈−173 °C, thin exosphere, polar ice, 382 kg Apollo samples); no new measured values in the game.
- Fixes: a power deficit caused by the chosen emergency response (e.g. shelter on Hard shift 11 with oxygen already off) now says the other response fits (regression test); vibration is skipped before the first tap (Chrome logged errors); menu footer audience; Korean particle after a number.

## Remaining (priority order)
1. **P0** Repo is public at https://github.com/gonutyun-sketch/sun-lunar-outpost (pushed 2026-11-14, full history). Remaining: enable Pages (Settings → Pages → Source: GitHub Actions), re-run the workflow, add the live URL to README.
2. **P1** Student play-test of Easy/Normal (real devices); tune `DIFFICULTIES` if needed. Review PR for feature/difficulty-education-qa and merge.
3. **P1** Final submission: Space Apps project page, demo video, AI disclosure.
4. **P2** Optional: sound, more scene detail.

## Known issues
- Since the Codex merge the rover also drains in sunlight, so on Hard the Mission 1 sunny detour saves only ≈0.6 battery over the shadow shortcut (test still passes). Team decision: keep, or restore a bigger trade-off (would change rover rules).
- The automated UI bots slow down when the browser pane renders below ~20 fps (dt cap 50 ms makes game time slower than real time); use the frame shim noted in tools/qa-playthrough.js.
- Control panel may still scroll slightly at 1366×768 when 2+ warnings are shown (all critical warnings are now above the fold).
- Mid-transition screenshots can show the fading shift banner (cosmetic).

## Last test results (2026-11-15, difficulty + learning)
- `npm run typecheck` ✅ · `npm test` ✅ 113/113 (new: 19 difficulty/coach/regression, 8 rover-by-difficulty, 5 save) · `npm run build` ✅ (dev hooks absent from bundle; production preview: no console errors).
- Browser (dev server, UI bot + shortcuts for the minigames): full 12-shift games with all 3 rover missions on every mode — Easy success A 90, Normal success B 89, Hard success B 84 (Hard needed the "other response" at shift 11 → found and fixed the stuck-feeling warning). Continue after reload restored mode and shift; reload during Mission 1 kept mode and base state; New game over a saved mission asks first; results → New mission opens the difficulty screen with the last mode selected; a hand-made v1 save loaded as Hard with a notice and was re-saved as v2.
- Viewport sweep (tools/qa-sweep.js, 28–29 screens incl. 10 science tabs, difficulty select, coach tips, 3 missions): 320×568, 375×667, 390×844, 844×390, 768×1024, 1024×768 (touch layout), 1366×768, 1920×1080 — all OK (no horizontal scroll, cut-off or overlapping controls, touch targets ≥ 44 px). Korean and English checked on the new screens.
- NOT verified: real phones/tablets, real students (comprehension and difficulty feel), real vibration; the browser pane rendered slowly, so a timer frame shim was used for the automated runs.
