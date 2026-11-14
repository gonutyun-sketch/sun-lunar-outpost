import { MISSION } from '../game/config';
import { computeScore } from '../game/engine';
import { missionSummary, missionTitle, takeaways } from '../game/debrief';
import type { GameState, Resources } from '../game/types';

/* ---------------- Animated background ---------------- */
const BG_STARS = Array.from({ length: 140 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return { i, x: (a - Math.floor(a)) * 100, y: (b - Math.floor(b)) * 100, r: ((a * b) % 1 + 1) % 1 * 1.4 + 0.3, d: (i % 9) * 0.5 };
});

export function Starfield() {
  return (
    <div className="starfield" aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="mg" cx="0.35" cy="0.35">
            <stop offset="0" stopColor="#d9dde4" />
            <stop offset="0.7" stopColor="#8f96a3" />
            <stop offset="1" stopColor="#4b505b" />
          </radialGradient>
          <radialGradient id="halo">
            <stop offset="0.6" stopColor="#56C7F2" stopOpacity="0.15" />
            <stop offset="1" stopColor="#56C7F2" stopOpacity="0" />
          </radialGradient>
        </defs>
        {BG_STARS.map((s) => (
          <circle key={s.i} cx={s.x} cy={s.y} r={s.r * 0.12} fill="#cfe3ff" className="twinkle" style={{ animationDelay: `${s.d}s` }} />
        ))}
        <g className="moon-drift">
          <circle cx="50" cy="128" r="62" fill="url(#halo)" />
          <circle cx="50" cy="128" r="52" fill="url(#mg)" />
          <circle cx="34" cy="94" r="5" fill="#7a808c" opacity="0.6" />
          <circle cx="60" cy="88" r="3" fill="#7a808c" opacity="0.6" />
          <circle cx="72" cy="100" r="6" fill="#7a808c" opacity="0.5" />
          <circle cx="47" cy="104" r="2.2" fill="#7a808c" opacity="0.6" />
        </g>
      </svg>
    </div>
  );
}

/* ---------------- Main menu ---------------- */
export function MainMenu({ onStart, onHow, onCredits }: { onStart: () => void; onHow: () => void; onCredits: () => void }) {
  return (
    <div className="screen menu">
      <div className="kicker">NASA SPACE APPS CHALLENGE 2026 · JUNIOR ASTRONAUT MISSION TRAINER</div>
      <h1><span className="sun">SUN</span>: Lunar Outpost</h1>
      <p className="sub">
        Command a three-person research base near the Moon’s South Pole. Balance power, oxygen, food and
        radiation safety for eight shifts — and still get the science done.
      </p>
      <div className="menu-buttons">
        <button className="btn btn-primary" onClick={onStart} autoFocus>START MISSION</button>
        <button className="btn" onClick={onHow}>How to Play</button>
        <button className="btn" onClick={onCredits}>Science &amp; Credits</button>
      </div>
      <div className="menu-foot">Team SUN · Educational game for ages 12–18 · 8–12 minutes</div>
    </div>
  );
}

/* ---------------- How to play ---------------- */
export function HowToPlay({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const f = MISSION.facilities;
  return (
    <div className="screen info-page">
      <header>
        <h1>How to Play</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onBack}>Back</button>
          <button className="btn btn-primary" onClick={onStart}>Start Mission</button>
        </div>
      </header>
      <section className="panel">
        <h2>YOUR GOAL</h2>
        <p>Keep the crew of SUN-01 alive for <b>{MISSION.totalShifts} shifts</b> (12 hours each) and complete <b>{MISSION.capacity.research} research milestones</b>. Every system needs electricity — and there is never enough for everything.</p>
      </section>
      <section className="panel">
        <h2>EACH SHIFT</h2>
        <ol>
          <li>Read the resources, the solar outlook and any space-weather warning.</li>
          <li>Switch facilities ON or OFF. The power budget and projected changes update instantly.</li>
          <li>Fix any power deficit (you cannot run more systems than your energy allows).</li>
          <li>Press <b>ADVANCE SHIFT</b> and read the shift report explaining what changed.</li>
        </ol>
      </section>
      <section className="panel">
        <h2>FACILITIES</h2>
        <table>
          <thead><tr><th>System</th><th>Energy / shift</th><th>Effect</th></tr></thead>
          <tbody>
            <tr><td>Main Habitat (always on)</td><td>{MISSION.habitat.energyCost}</td><td>Keeps the base alive. If it cannot be powered, the mission fails.</td></tr>
            <tr><td>Oxygen Recycling</td><td>{f.oxygen.energyCost}</td><td>+{f.oxygen.produces} oxygen. Crew always uses −{MISSION.crew.oxygenUse}.</td></tr>
            <tr><td>Hydroponic Greenhouse</td><td>{f.greenhouse.energyCost}</td><td>+{f.greenhouse.produces} food. Crew always eats −{MISSION.crew.foodUse}.</td></tr>
            <tr><td>Radiation Shelter</td><td>{f.shelter.energyCost}</td><td>Protects the crew during a radiation alert (otherwise −{MISSION.radiation.healthDamage} health).</td></tr>
            <tr><td>Science Laboratory</td><td>{f.lab.energyCost}</td><td>+1 research milestone per shift (max {MISSION.capacity.research}).</td></tr>
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>POWER</h2>
        <p>Solar panels charge the battery (max {MISSION.capacity.energy}) at the start of each shift, then all running systems draw from it. Sunlight changes from shift to shift, so save energy before dark periods.</p>
      </section>
      <section className="panel">
        <h2>WIN &amp; LOSE</h2>
        <ul>
          <li><b>Full success:</b> survive all shifts, crew health ≥ {MISSION.failure.minHealth}, oxygen and food above zero, {MISSION.capacity.research} research milestones.</li>
          <li><b>Incomplete:</b> the crew survives but research is unfinished.</li>
          <li><b>Failure:</b> oxygen or food reaches zero, crew health falls below {MISSION.failure.minHealth}, or the habitat loses power.</li>
        </ul>
        <p>Score (max 100): survival 40 · research 30 · crew safety 20 · remaining energy 10.</p>
      </section>
    </div>
  );
}

/* ---------------- Science & credits ---------------- */
export function Credits({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen info-page">
      <header>
        <h1>Science &amp; Credits</h1>
        <button className="btn" onClick={onBack}>Back</button>
      </header>
      <section className="panel">
        <h2>DATA IN THIS GAME</h2>
        <p>
          <span className="badge-data game">GAMEPLAY SCENARIO</span>{' '}
          Shift illumination modifiers (×0.25 – ×0.95), radiation events, facility costs and all resource units are
          simplified training values. They are <b>not</b> measured NASA data and are not forecasts for any real date.
        </p>
        <p>
          <span className="badge-data measured">NASA SOURCE</span>{' '}
          Site illumination calibration from NASA Lunar Reconnaissance Orbiter (LOLA) polar illumination products is
          being integrated. Until it is verified, no value in the game is labelled as NASA-measured.
        </p>
      </section>
      <section className="panel">
        <h2>TEAM</h2>
        <p>Team SUN — NASA Space Apps Challenge 2026, “Build a Junior Astronaut Mission Trainer”.</p>
      </section>
      <section className="panel">
        <h2>AI TOOL DISCLOSURE</h2>
        <p>
          Source code, the vector lunar-base illustrations, and educational text were drafted with the help of
          Claude Code (Anthropic) and reviewed by the team. No AI service is used while the game runs.
          See AI_USAGE.md in the repository for details.
        </p>
      </section>
      <section className="panel">
        <h2>TECHNOLOGY</h2>
        <p>React, TypeScript and Vite. Fonts: Orbitron and Inter (SIL Open Font License, via Google Fonts).</p>
      </section>
    </div>
  );
}

/* ---------------- Results ---------------- */
const SERIES: { k: keyof Resources; label: string; color: string }[] = [
  { k: 'energy', label: 'Battery', color: '#F4CA65' },
  { k: 'oxygen', label: 'Oxygen', color: '#56C7F2' },
  { k: 'food', label: 'Food', color: '#6CE0B2' },
  { k: 'health', label: 'Crew health', color: '#ff8fa0' },
];

function HistoryGraph({ state }: { state: GameState }) {
  const points: Resources[] = [MISSION.initial, ...state.history.map((h) => h.after)];
  const W = 600, H = 240, L = 34, R = 10, T = 10, B = 28;
  const n = MISSION.totalShifts;
  const x = (i: number) => L + (i / n) * (W - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Resource history by shift">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(86,199,242,0.12)" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#8ea3bd">{v}</text>
          </g>
        ))}
        {Array.from({ length: n + 1 }, (_, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#8ea3bd">{i === 0 ? 'Start' : `S${i}`}</text>
        ))}
        <line x1={L} x2={W - R} y1={y(MISSION.failure.minHealth)} y2={y(MISSION.failure.minHealth)} stroke="#ff8fa0" strokeDasharray="4 4" strokeOpacity="0.5" />
        {SERIES.map((s) => (
          <g key={s.k}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" points={points.map((p, i) => `${x(i)},${y(p[s.k])}`).join(' ')} />
            {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p[s.k])} r="3" fill={s.color} />)}
          </g>
        ))}
      </svg>
      <div className="legend">
        {SERIES.map((s) => <span key={s.k}><i style={{ background: s.color }} />{s.label}</span>)}
        <span><i style={{ background: '#ff8fa0', opacity: 0.5 }} />Health safety limit ({MISSION.failure.minHealth})</span>
      </div>
    </>
  );
}

export function Results({ state, onRestart, onMenu }: { state: GameState; onRestart: () => void; onMenu: () => void }) {
  const score = computeScore(state, MISSION);
  const lessons = takeaways(state, MISSION);
  return (
    <div className="screen results">
      <section className={`results-hero panel ${state.status}`}>
        <div>
          <span className="tag">Mission debrief · SUN-01</span>
          <h1>{missionTitle(state)}</h1>
          <p>{missionSummary(state, MISSION)}</p>
        </div>
        <div className="grade">
          <div className="letter">{score.grade}</div>
          <div className="pts">{score.total} / 100</div>
        </div>
      </section>
      <div className="results-grid">
        <section className="score-card panel">
          <h2>SCORE</h2>
          <div className="score-row"><span>Mission survival</span><span className="v">{score.survival} / 40</span></div>
          <div className="score-row"><span>Research ({state.resources.research}/{MISSION.capacity.research})</span><span className="v">{score.research} / 30</span></div>
          <div className="score-row"><span>Crew safety (health {state.resources.health})</span><span className="v">{score.safety} / 20</span></div>
          <div className="score-row"><span>Energy reserve ({state.resources.energy})</span><span className="v">{score.energy} / 10</span></div>
          <div className="score-row total"><span>Total</span><span className="v">{score.total}</span></div>
        </section>
        <section className="graph-card panel">
          <h2>RESOURCE HISTORY</h2>
          <HistoryGraph state={state} />
        </section>
      </div>
      <section className="takeaways panel">
        <h2>WHAT THIS MISSION TEACHES</h2>
        <ol>{lessons.map((l, i) => <li key={i}>{l}</li>)}</ol>
      </section>
      <div className="results-actions">
        <button className="btn btn-primary" onClick={onRestart} autoFocus>RESTART MISSION</button>
        <button className="btn" onClick={onMenu}>Main Menu</button>
      </div>
    </div>
  );
}
