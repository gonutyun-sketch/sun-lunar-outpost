# SUN: Lunar Outpost

**NASA Space Apps Challenge 2026 · "Build a Junior Astronaut Mission Trainer" · Team SUN**

An educational strategy game for elementary and middle-school students, with three difficulty modes (Easy / Normal / Hard). You command SUN-01, a three-person research base near the Moon's South Pole. Over twelve 12-hour shifts in three chapters you balance power, oxygen, food, radiation safety and science, build upgrades, and respond to five forecast emergencies — every decision is a trade-off. Korean and English.

![Mission screen](docs/screenshots/mission.jpg)

## Play
- **Source:** https://github.com/gonutyun-sketch/sun-lunar-outpost
- **Live demo:** _GitHub Pages URL (https://gonutyun-sketch.github.io/sun-lunar-outpost/) once Pages is enabled with source "GitHub Actions"_
- Locally: `npm install` then `npm run dev`, and open http://localhost:5173

## How to play
1. Each shift, switch facilities on or off: Oxygen Recycling, Hydroponic Greenhouse, Radiation Shelter, Science Lab. The Main Habitat is always on.
2. Check the power budget. Solar panels charge the battery first, and then every running system draws from it.
3. Build upgrades (Solar, Oxygen Recycler, Battery): pay energy now, gain from the next shift.
4. Emergencies are forecast one shift ahead; when one arrives, choose one of two responses.
5. Press **ADVANCE SHIFT** and read the shift report.
6. Launch the rover for hands-on repair and science missions (keyboard WASD/arrows + E, or the on-screen joystick and action button on phones and tablets).

**Difficulty** (chosen at New Game, saved with the mission):

| | Easy (recommended) | Normal | Hard (original rules) |
|---|---|---|---|
| Start energy / oxygen / food | 64 / 74 / 78 | 60 / 72 / 76 | 55 / 65 / 70 |
| Crew oxygen / food use per shift | 13 / 11 | 14 / 12 | 14 / 12 |
| Emergency damage | ×0.6 | ×0.8 | ×1 |
| Upgrade cost (solar / O₂ / battery) | 14 / 9 / 8 | 17 / 11 / 9 | 20 / 12 / 10 |
| Rover battery start / drain | 100 / ×0.6 | 90 / ×0.8 | 80 / ×1 |
| Help | coach tips every shift, plain-word warnings, puzzle hints | tips in shifts 1–2, light hints | on request only |

NASA data (site, 88.44% sunlight, sources), the sunlight scenario, solar output, map, movement and win conditions are the same in every mode; only fictional training values change. The **HELP** button in the base screen shows or hides coach tips at any time.

Progress (including the difficulty) is saved automatically in your browser (no account, no personal data): use **CONTINUE** on the main menu to resume. Saves from older versions load as Hard, which is the same rule set.

**Full success:** survive 12 shifts, keep crew health ≥ 40, keep oxygen and food above 0, and complete 4 research milestones. **Score:** survival 40 + research 30 + crew safety 20 + energy reserve 10.

## NASA data
The base sits at **89.4749°S, 137.4431°W**, a ridge near Shackleton crater. Its solar power uses the **NASA LRO/LOLA average solar illumination** product `AVGVISIB_85S_060M_201608` ([PGDA product 69](https://pgda.gsfc.nasa.gov/products/69)):

| Location (same NASA map) | Average time sunlit |
|---|---|
| SUN-01 site pixel (60 m) | **88.44%** |
| 300 m × 300 m area around it | 55.36% |
| Shackleton crater floor | 0% (permanent shadow) |

- **What 88.44% means:** the long-term (18.6-year) share of time that any part of the Sun's disc is visible from the site. It is **not** solar-panel efficiency, and it is **not** a forecast.
- **In the game:** `sunlight = min(1, 0.88444 × fictional scenario modifier)` and `solar = round(30 × sunlight)`. The per-shift modifiers, radiation events, costs and resource units are fictional training values.
- **Extraction:** `node tools/extract-illumination.mjs` reads only the needed rows of the NASA file using HTTP Range requests. Map orientation was verified against known permanently shadowed craters.
- **Citation:** Mazarico, E., et al. (2011), *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030. Visual reference: NASA SVS 4930.

## Tech
React 18 + TypeScript + Vite, plus Vitest. The game is a static site with no backend, accounts, or runtime AI. All simulation rules are pure functions in `src/game/engine.ts` and are covered by unit tests (116 in total, incl. difficulty balance, save/continue and rover physics) plus balance bots; an exact best-play search (`npm run analyze`) confirms a perfect 100 is possible.

```bash
npm run typecheck
npm test
npm run build   # -> dist/
```

## Learn more in the game
**Science & Credits** has ten tabs: surviving on the Moon, NASA data (LRO/LOLA, what 88.44% means), the South Pole and sunlight, solar power and batteries, oxygen/food/radiation, lunar rovers, real science vs game values, questions to check understanding, sources, and team & AI use. Each card has a short explanation and an optional "Learn more".

## AI disclosure
Built by Team SUN (one person) with help from Claude Code (Anthropic) and OpenAI Codex. See [AI_USAGE.md](AI_USAGE.md).

## Screenshots
| Radiation alert | Results |
|---|---|
| ![Radiation](docs/screenshots/radiation.jpg) | ![Results](docs/screenshots/results.jpg) |
