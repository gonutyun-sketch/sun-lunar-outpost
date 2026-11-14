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
src/i18n/I18n.tsx       Language context, LangToggle, localStorage 'sun-lang'
src/game/types.ts       Shared types
src/game/config.ts      Loads mission.json as MissionConfig
src/game/engine.ts      PURE simulation: simulateShift, advanceShift, getWarnings, computeScore
src/game/debrief.ts     Results text + 3 takeaways
src/game/engine.test.ts Unit tests (incl. a reference winning plan = 95/A)
src/game/balance.test.ts Strategy tests + exhaustive decision-path analysis (prints [balance] line)
src/ui/MissionScreen.tsx Top bar, scene, controls, power budget, log, shift report modal
src/ui/BaseScene.tsx    SVG lunar base
src/ui/Screens.tsx      Starfield, MainMenu, HowToPlay, Credits, Results (+ graph)
src/App.tsx             Screen routing, effects toggle
```

## Rules (GDD v1.0)
Per shift, in `simulateShift`:
1. sunlight = min(1, site.averageSunlitFraction (0.88444, NASA) × scenarioModifier[shift] (fictional)); solar = round(30 × sunlight) (float-safe, .5 up) → 27,24,17,8,11,20,29,18
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

## Deployment (not done yet — needs the team's accounts)
Option A — GitHub Pages (workflow already in .github/workflows/deploy.yml):
1. Create an empty public repo on github.com (e.g. sun-lunar-outpost), no README.
2. `git remote add origin https://github.com/<user>/sun-lunar-outpost.git`
3. `git push -u origin main`
4. Repo Settings → Pages → Source: "GitHub Actions". The workflow runs typecheck + tests + build and publishes.
5. URL: https://<user>.github.io/sun-lunar-outpost/ → put it in README "Live demo".
Option B — fastest, no Git: `npm run build`, then drag the `dist/` folder onto https://app.netlify.com/drop.
(vite base is './', so the build works under any sub-path.)

## Next tasks for the next AI
1. After deployment: add URL to README, run a full playthrough on the live URL.
2. Apply the team's difficulty decision (see PROGRESS.md "Balance findings") if any.
3. Submission materials.

## Cautions
- Never hard-code UI text in components: add it to src/i18n/en.ts + ko.ts and use t('key'). Keep {placeholders} identical (tested).
- Avoid Korean particles (을/를, 이/가) directly after {number} placeholders — use 만큼 or rephrase.
- Keep engine pure (no React imports). Any rule change → update engine + balance tests.
- React keys: scene and shift banner share a parent — keep their keys distinct (scene-N / banner-N), or old scenes stack up.
- Never present gameplay values as NASA-measured. Only site.json averageSunlitFraction + nearbyComparisons are NASA-derived; UI marks them with the green NASA badge, everything else with the orange SCENARIO badge.
- To change site: run the tool with new lat/lon, update site.json, re-check that solar values / balance tests still hold.
- Never commit secrets/.env (already in .gitignore).
