# AI Usage Disclosure — SUN: Lunar Outpost

## Tools
- **Claude Code (Anthropic, Claude Opus 5.5)** — development assistant.
- **Codex (OpenAI)** — pixel art and interface implementation and browser verification.

## Scope of AI assistance
- Project scaffolding (React + TypeScript + Vite configuration).
- Simulation engine and unit tests, implemented from the team's Game Design Document v1.0.
- UI components and CSS.
- Vector (SVG) illustrations of the lunar base, starfield and Moon — **AI-generated code-drawn artwork**, original, no external image assets.
- Original code-drawn pixel artwork for the outpost, rover, terrain and mission equipment, plus the updated menu, base and rover interfaces. The raster art is generated locally by the game from its source code.
- Phase 5 visual polish (CSS/SVG effects), strategy & balance analysis tests, README and GitHub Pages workflow.
- Gameplay screenshots in docs/screenshots/ are captures of the actual game (not generated images).
- Korean/English localisation system and the Korean translation of all UI and educational text (to be reviewed by Korean-speaking team members).
- Gameplay v2 design proposal and implementation (upgrades, emergencies, chapters), balance bots and the exact best-play search; the numbers were tuned by simulation and should be reviewed by the team after human play-testing.
- Save & continue system (localStorage, validation, checkpoint) and rover visual/feedback polish (procedural Canvas art, effects, camera), with tests and QA scripts.
- Cross-platform pass: responsive CSS, touch joystick/action controls, canvas sizing, QA scripts.
- Rover Mission 3 (science survey, deep-shadow training zone, drilling) and the rover launcher menu.
- Rover Mission 2 (supply depot, remote O₂ plant, leak scan, pressure minigame) and its tuning by simulated players.
- Rover exploration mode: map, physics, battery model, circuit puzzle, Canvas renderer (procedural, no external assets) and KO/EN texts.
- Draft educational text (science briefings, takeaways) — reviewed by the team for accuracy.

## Human contributions
- Game concept, Game Design Document, rules, numbers and balancing targets (Team SUN).
- Review and approval of all AI output.

## Data sources
- Gameplay numbers (costs, consumption, radiation events, per-shift scenario modifiers) come from the team's GDD and are fictional training values.
- **NASA data:** one value (0.88444 average sunlit fraction) and two comparison values were extracted by an AI-written script (tools/extract-illumination.mjs) directly from the NASA LRO/LOLA PDS product AVGVISIB_85S_060M_201608 (https://pgda.gsfc.nasa.gov/products/69). The AI did not invent or estimate these numbers; they are read from the data file and can be re-run by anyone. Map orientation was checked against known permanently shadowed craters. Citation: Mazarico et al. (2011), Icarus 211, 1066–1081.
- AI choices the team should review: the site coordinate (chosen as the map's highest-value pixel), the cautious site name, and the scenario modifiers (chosen so existing game balance is unchanged).

## Third-party assets
- Fonts: Orbitron, Inter (SIL Open Font License) via Google Fonts.
- No AI service or API is called at runtime.
