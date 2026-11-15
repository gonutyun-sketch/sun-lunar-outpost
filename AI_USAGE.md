# AI Usage Disclosure — SUN: Lunar Outpost

## Tools
- **Claude Code (Anthropic, Claude Opus 5.5)** — development assistant.
- **Codex (OpenAI)** — pixel art and interface implementation and browser verification (merged via PR #1, commits by "Codex").

## Scope of AI assistance
- Project scaffolding (React + TypeScript + Vite configuration).
- Simulation engine and unit tests, implemented from the team's Game Design Document v1.0.
- UI components and CSS.
- Vector (SVG) illustrations of the lunar base, starfield and Moon — **AI-generated code-drawn artwork**, original, no external image assets.
- Original code-drawn pixel artwork for the outpost, rover, terrain and mission equipment, plus the updated menu, base and rover interfaces. The raster art is generated locally by the game from its source code.
- Interactive tutorial with a four-expression, code-drawn astronaut, English and Korean guidance, and in-browser checks for keyboard and touch flows (Codex).
- Visual consistency pass on the projected rover wheels, the outpost and field solar racks, and the expedition and information panels. The tutorial outline was aligned with its DOM targets and checked against the live game in both languages (Codex).
- Phase 5 visual polish (CSS/SVG effects), strategy & balance analysis tests, README and GitHub Pages workflow.
- Gameplay screenshots in docs/screenshots/ are captures of the actual game (not generated images).
- Korean/English localisation system and the Korean translation of all UI and educational text (to be reviewed by Korean-speaking team members).
- Gameplay v2 design proposal and implementation (upgrades, emergencies, chapters), balance bots and the exact best-play search; the numbers were tuned by simulation and should be reviewed by the team after human play-testing.
- Difficulty modes (Easy/Normal/Hard) on one engine with per-mode fictional values, chosen by balance simulation; save v2 with v1 migration; beginner coach tips and friendlier warnings; rover/puzzle hints per mode; the tabbed Science & Credits learning pages (texts checked against NASA Moon facts / LRO pages; no new measured values); a fix for a stuck-feeling power deficit; tests and QA scripts (Claude Code).
- Game audio: Web Audio sound engine, synthesised effects and ambience, sound settings, tests (Claude Code).
- Integration and deployment: merged PR #2 and #3 and enabled GitHub Pages on the team's instruction, then verified the live site with automated keyboard play-throughs and layout checks (Claude Code).
- Rover route rebalance after the pixel redesign: route analysis (simulation + grid search), new fictional battery values, reference routes and the Mission 1 route guide/mini map (Claude Code).
- Save & continue system (localStorage, validation, checkpoint) and rover visual/feedback polish (procedural Canvas art, effects, camera), with tests and QA scripts.
- Cross-platform pass: responsive CSS, touch joystick/action controls, canvas sizing, QA scripts.
- Rover Mission 3 (science survey, deep-shadow training zone, drilling) and the rover launcher menu.
- Rover Mission 2 (supply depot, remote O₂ plant, leak scan, pressure minigame) and its tuning by simulated players.
- Rover exploration mode: map, physics, battery model, circuit puzzle, Canvas renderer (procedural, no external assets) and KO/EN texts.
- Draft educational text (science briefings, takeaways) — reviewed by the team for accuracy.

## Human contributions
- Game concept, Game Design Document, rules, numbers and balancing targets (Team SUN).
- Educational goal, gameplay and design direction, play-testing and feedback (e.g. "the game is too hard"), difficulty requirements.
- Review and approval of all AI output.

## How to record future contributions
Add the tool (or person), what it did and the commits/PR to the lists above, and to the "Who did what" section in the game (`team.role.*` keys in src/i18n/en.learn.ts and ko.learn.ts).

## Data sources
- Gameplay numbers (costs, consumption, radiation events, per-shift scenario modifiers) come from the team's GDD and are fictional training values.
- **NASA data:** one value (0.88444 average sunlit fraction) and two comparison values were extracted by an AI-written script (tools/extract-illumination.mjs) directly from the NASA LRO/LOLA PDS product AVGVISIB_85S_060M_201608 (https://pgda.gsfc.nasa.gov/products/69). The AI did not invent or estimate these numbers; they are read from the data file and can be re-run by anyone. Map orientation was checked against known permanently shadowed craters. Citation: Mazarico et al. (2011), Icarus 211, 1066–1081.
- AI choices the team should review: the site coordinate (chosen as the map's highest-value pixel), the cautious site name, and the scenario modifiers (chosen so existing game balance is unchanged).

## Game audio
- All sound effects and ambience are **synthesised in the browser by the game's own code** (Web Audio API: oscillators, filtered noise, envelopes) — `src/audio/sfx.ts`. No audio files, no downloaded or third-party sounds, no voices, no TTS.
- The background music is an original generative piece composed in code (`src/audio/music.ts`: four slow pad chords in D with a lydian colour, a low drone and random pentatonic bell notes with echo and reverb, all synthesised live). It was written with Claude Code on the team's request ("space feeling"); no existing music was used or imitated.
- The sound recipes and the audio engine (`src/audio/engine.ts`) were written with Claude Code (Anthropic) on the team's instructions and checked by listening tests and signal measurements in the browser.
- Game sounds are a fictional feedback layer (rover sensors, base machines). They are not recordings from the Moon or NASA, and NASA did not provide or endorse them.

## Third-party assets
- Fonts: Orbitron, Inter (SIL Open Font License) via Google Fonts.
- No AI service or API is called at runtime.
- No external audio assets (all sound is generated by the game's code).
