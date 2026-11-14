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
src/data/mission.json   All tunable numbers from GDD (resources, costs, shift illumination, events)
src/data/education.ts   Science briefing text (per shift + per facility)
src/game/types.ts       Shared types
src/game/config.ts      Loads mission.json as MissionConfig
src/game/engine.ts      PURE simulation: simulateShift, advanceShift, getWarnings, computeScore
src/game/debrief.ts     Results text + 3 takeaways
src/game/engine.test.ts Unit tests (incl. a reference winning plan = 95/A)
src/ui/MissionScreen.tsx Top bar, scene, controls, power budget, log, shift report modal
src/ui/BaseScene.tsx    SVG lunar base
src/ui/Screens.tsx      Starfield, MainMenu, HowToPlay, Credits, Results (+ graph)
src/App.tsx             Screen routing, effects toggle
```

## Rules (GDD v1.0)
Per shift, in `simulateShift`:
1. solar = round(30 × illumination[shift]) (float-safe rounding, .5 rounds up) → 27,24,17,8,11,20,29,18
2. available = min(100, battery + solar)
3. demand = 12 (habitat) + oxygen 7 + greenhouse 6 + shelter 7 + lab 8 (enabled only)
4. available < 12 → habitat power failure → mission FAILED ('power')
5. demand > available → turn blocked (UI shows deficit), state unchanged
6. battery = available − demand
7. oxygen = clamp(o + 20·on − 14, 0..100); food = clamp(f + 16·on − 12, 0..100)
8. Shift 4 & 7 radiation: shelter on → protected, else health −35
9. lab on & research < 3 → +1 (lab auto-switches off at 3)
10. fail if oxygen ≤ 0, food ≤ 0, health < 40. After shift 8: research 3 → success else partial.
Score: survival 40 (success/partial) + 10/milestone + round(20·health/100) + round(10·min(battery,30)/30).

## Next tasks for the next AI
1. Phase 4 NASA data (see PROGRESS.md). Suggested approach: keep `illumination` per shift as gameplay modifiers but add a site factor from a cited LOLA average-illumination product; formula becomes round(30 × siteFactor × modifier) or calibrate base output — update tests and How-to-Play accordingly.
2. Write README.md; deploy; add screenshots.

## Cautions
- Keep engine pure (no React imports). Any rule change → update engine tests.
- Never present gameplay values as NASA-measured.
- Never commit secrets/.env (already in .gitignore).
