import { useMemo, useState } from 'react';
import { MISSION } from '../game/config';
import {
  FACILITY_LABELS,
  advanceShift,
  canAdvance,
  getEventBriefing,
  getShiftConfig,
  getWarnings,
  isFacilityAvailable,
  projectCurrentShift,
  solarGeneration,
  toggleFacility,
} from '../game/engine';
import { FACILITY_IDS, type FacilityId, type GameState, type Resources, type ShiftReport } from '../game/types';
import { EDU_BY_SHIFT, FACILITY_EDU } from '../data/education';
import { BaseScene } from './BaseScene';

interface Props {
  state: GameState;
  setState: (s: GameState) => void;
  onFinish: () => void;
  onQuit: () => void;
  fx: boolean;
  onToggleFx: () => void;
}

const COLORS: Record<keyof Resources, string> = {
  energy: '#F4CA65',
  oxygen: '#56C7F2',
  food: '#6CE0B2',
  health: '#ff8fa0',
  research: '#56C7F2',
};

function Delta({ v }: { v: number }) {
  if (v === 0) return <span className="delta flat">±0</span>;
  return <span className={`delta ${v > 0 ? 'up' : 'down'}`}>{v > 0 ? `+${v}` : v}</span>;
}

function Stat({ name, k, value, next, warnAt, critAt }: {
  name: string; k: keyof Resources; value: number; next: number; warnAt: number; critAt: number;
}) {
  const cls = value <= critAt ? 'crit' : value <= warnAt ? 'warn' : '';
  return (
    <div className={`stat ${cls}`}>
      <div className="stat-head">
        <span className="name">{name}</span>
        <span>
          <span className="val">{value}</span>
          <Delta v={next - value} />
        </span>
      </div>
      <div className="bar" aria-hidden>
        <i style={{ width: `${value}%`, background: COLORS[k] }} />
      </div>
    </div>
  );
}

export function MissionScreen({ state, setState, onFinish, onQuit, fx, onToggleFx }: Props) {
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [eduFocus, setEduFocus] = useState<FacilityId | null>(null);

  const sc = getShiftConfig(MISSION, state.shift);
  const outcome = useMemo(() => projectCurrentShift(state, MISSION), [state]);
  const warnings = useMemo(() => getWarnings(state, MISSION, outcome), [state, outcome]);
  const briefing = getEventBriefing(MISSION, state.shift);
  const allowed = canAdvance(outcome);
  const r = state.resources;
  const nextSolar = state.shift < MISSION.totalShifts ? solarGeneration(MISSION, state.shift + 1) : null;
  const edu = eduFocus ? FACILITY_EDU[eduFocus] : EDU_BY_SHIFT[state.shift - 1];

  const onAdvance = () => {
    const next = advanceShift(state, MISSION);
    if (next === state) return;
    setState(next);
    setReport(next.history[next.history.length - 1]);
    setEduFocus(null);
  };

  const ended = state.status !== 'playing';

  return (
    <div className={`mission screen ${fx ? '' : 'no-fx'}`}>
      {/* ---------- Top bar ---------- */}
      <header className="topbar panel">
        <div className="brand">
          <h1>SUN-01</h1>
          <span className="shift">SHIFT {state.shift} / {MISSION.totalShifts}</span>
          <div className="shift-pips" aria-hidden>
            {MISSION.shifts.map((s) => (
              <span key={s.shift} className={s.shift < state.shift || (ended && s.shift === state.shift) ? 'done' : s.shift === state.shift ? 'now' : ''} />
            ))}
          </div>
        </div>
        <div className="stats">
          <Stat name="Battery" k="energy" value={r.energy} next={outcome.after.energy} warnAt={20} critAt={12} />
          <Stat name="Oxygen" k="oxygen" value={r.oxygen} next={outcome.after.oxygen} warnAt={30} critAt={15} />
          <Stat name="Food" k="food" value={r.food} next={outcome.after.food} warnAt={30} critAt={15} />
          <Stat name="Crew Health" k="health" value={r.health} next={outcome.after.health} warnAt={70} critAt={40} />
          <div className="stat">
            <div className="stat-head">
              <span className="name">Research</span>
              <span>
                <span className="val">{r.research}/{MISSION.capacity.research}</span>
                <Delta v={outcome.after.research - r.research} />
              </span>
            </div>
            <div className="research-dots" aria-hidden>
              {Array.from({ length: MISSION.capacity.research }, (_, i) => (
                <span key={i} className={i < r.research ? 'on' : ''} />
              ))}
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" onClick={onToggleFx} aria-pressed={fx}>Effects {fx ? 'ON' : 'OFF'}</button>
          <button className="icon-btn" onClick={onQuit}>Menu</button>
        </div>
      </header>

      {/* ---------- Center ---------- */}
      <div className="mission-main">
        <div className="scene-wrap panel">
          <BaseScene facilities={state.facilities} illumination={sc.illumination} radiation={sc.event === 'radiation'} shift={state.shift} />
          <div className="scene-overlay">
            <div className="chip">
              <span className="k">Solar this shift</span>
              <strong style={{ color: '#F4CA65' }}>+{outcome.solar}</strong> energy · illumination ×{sc.illumination.toFixed(2)}
            </div>
            <div className="chip">
              <span className="k">Next-shift outlook</span>
              {nextSolar === null ? 'Final shift' : <><strong style={{ color: '#F4CA65' }}>+{nextSolar}</strong> energy expected</>}
            </div>
          </div>
        </div>

        <aside className="controls panel" aria-label="System controls">
          <h2>SYSTEM CONTROL</h2>
          {briefing && <div className={`alert ${briefing.level}`} role="status">{briefing.text}</div>}

          <div className="fac on locked">
            <div className="title"><span className="led" />Main Habitat</div>
            <span className="switch-label">ALWAYS ON</span>
            <div className="meta"><span className="cost">−{MISSION.habitat.energyCost} energy</span><span>Essential life support & base operations</span></div>
          </div>

          {FACILITY_IDS.map((id) => {
            const on = state.facilities[id];
            const available = isFacilityAvailable(state, MISSION, id);
            const cfg = MISSION.facilities[id];
            const gain =
              id === 'oxygen' ? `+${MISSION.facilities.oxygen.produces} O₂`
              : id === 'greenhouse' ? `+${MISSION.facilities.greenhouse.produces} food`
              : id === 'shelter' ? (sc.event === 'radiation' ? 'Protects crew NOW' : 'Protects during radiation alerts')
              : available ? '+1 research milestone' : 'All milestones complete';
            return (
              <div key={id} className={`fac ${on ? 'on' : ''}`} onMouseEnter={() => setEduFocus(id)} onFocus={() => setEduFocus(id)}>
                <div className="title"><span className="led" />{FACILITY_LABELS[id]}</div>
                <button
                  className="switch"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${FACILITY_LABELS[id]} ${on ? 'on' : 'off'}`}
                  disabled={ended || (!on && !available)}
                  onClick={() => setState(toggleFacility(state, MISSION, id))}
                />
                <div className="meta"><span className="cost">−{cfg.energyCost} energy</span><span className="gain">{gain}</span></div>
              </div>
            );
          })}

          <div className="power-budget">
            <div className="tag">Power budget</div>
            <div className="power-meter" aria-hidden>
              <div className={`demand ${outcome.demand > outcome.available ? 'over' : ''}`} style={{ width: `${Math.min(100, (outcome.demand / Math.max(1, outcome.available)) * 100)}%` }} />
            </div>
            <div className="power-row"><span>Battery {r.energy} + solar {outcome.solar}</span><span className="v">{outcome.available}</span></div>
            {outcome.demandBreakdown.map((b) => (
              <div className="power-row" key={b.label}><span style={{ color: 'var(--muted)' }}>{b.label}</span><span className="v">−{b.cost}</span></div>
            ))}
            <div className="power-row total"><span>Battery after shift</span><span className="v" style={{ color: allowed ? 'var(--yellow)' : 'var(--red)' }}>{allowed ? outcome.after.energy : `−${outcome.optionalDeficit}`}</span></div>
          </div>

          {warnings.length > 0 && (
            <div className="alerts" role="alert">
              {warnings.map((w, i) => <div key={i} className={`alert ${w.level}`}>{w.text}</div>)}
            </div>
          )}
        </aside>
      </div>

      {/* ---------- Bottom ---------- */}
      <div className="bottom">
        <section className="log panel" aria-label="Mission log">
          <h2>MISSION LOG</h2>
          {state.history.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
              Welcome to SUN-01, Commander. Three astronauts depend on your decisions for {MISSION.totalShifts} shifts. Set the systems, check the power budget, then advance.
            </p>
          ) : (
            <ol>
              {[...state.history].reverse().map((h) => (
                <li key={h.shift}>
                  <b>S{h.shift}</b>
                  Solar +{h.solar}, used −{h.demand}. O₂ {h.after.oxygen - h.before.oxygen >= 0 ? '+' : ''}{h.after.oxygen - h.before.oxygen}, food {h.after.food - h.before.food >= 0 ? '+' : ''}{h.after.food - h.before.food}
                  {h.radiation === 'protected' && ' · radiation blocked'}
                  {h.radiation === 'exposed' && ` · radiation −${MISSION.radiation.healthDamage} health`}
                  {h.researchGained > 0 && ' · research milestone'}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="edu panel" aria-label="Science briefing">
          <h2>SCIENCE BRIEFING</h2>
          <span className="edu-title">{edu.title}</span>
          <p>{edu.text}</p>
        </section>
        <div className="advance panel">
          {ended ? (
            <button className="btn btn-primary" onClick={onFinish}>VIEW RESULTS</button>
          ) : (
            <button className="btn btn-primary" onClick={onAdvance} disabled={!allowed}>
              ADVANCE SHIFT ▸
            </button>
          )}
          <span className="hint">
            {ended ? 'Mission complete.' : allowed ? `Ends Shift ${state.shift} (12 h)` : 'Resolve the power deficit first'}
          </span>
        </div>
      </div>

      {report && (
        <ShiftReportModal
          report={report}
          state={state}
          onClose={() => setReport(null)}
          onResults={() => { setReport(null); onFinish(); }}
        />
      )}
    </div>
  );
}

function ShiftReportModal({ report, state, onClose, onResults }: {
  report: ShiftReport; state: GameState; onClose: () => void; onResults: () => void;
}) {
  const keys: [keyof Resources, string][] = [
    ['energy', 'Battery'], ['oxygen', 'Oxygen'], ['food', 'Food'], ['health', 'Health'], ['research', 'Research'],
  ];
  const ended = state.status !== 'playing';
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="modal panel">
        <span className="tag">Shift report</span>
        <h2 id="report-title">Shift {report.shift} complete</h2>
        <div className="deltas">
          {keys.map(([k, label]) => (
            <div key={k}>
              <div className="k">{label}</div>
              <div className="v">{report.after[k]}</div>
              <Delta v={report.after[k] - report.before[k]} />
            </div>
          ))}
        </div>
        <ul>{report.explanations.map((e, i) => <li key={i}>{e}</li>)}</ul>
        <div className="actions">
          {ended ? (
            <button className="btn btn-primary" onClick={onResults} autoFocus>VIEW MISSION RESULTS</button>
          ) : (
            <button className="btn btn-primary" onClick={onClose} autoFocus>BEGIN SHIFT {report.shift + 1}</button>
          )}
        </div>
      </div>
    </div>
  );
}
