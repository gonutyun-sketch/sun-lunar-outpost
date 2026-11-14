import { useMemo, useState } from 'react';
import { MISSION } from '../game/config';
import {
  advanceShift,
  canAdvance,
  getShiftConfig,
  getWarnings,
  isFacilityAvailable,
  projectCurrentShift,
  solarGeneration,
  toggleFacility,
} from '../game/engine';
import { FACILITY_IDS, type FacilityId, type GameState, type Resources, type ShiftReport } from '../game/types';
import { LangToggle, useI18n } from '../i18n/I18n';
import type { Key, T } from '../i18n/translate';
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

/** Minimal 16px line icons for the resource dashboard. */
function Icon({ k }: { k: keyof Resources }) {
  const c = COLORS[k];
  const paths: Record<keyof Resources, JSX.Element> = {
    energy: <><rect x="2" y="4" width="11" height="8" rx="1.5" fill="none" stroke={c} strokeWidth="1.5" /><rect x="13" y="6.5" width="1.6" height="3" fill={c} /><path d="M7.5 5.5 L5.5 8.5 H8 L6.5 11" fill="none" stroke={c} strokeWidth="1.3" /></>,
    oxygen: <><circle cx="6" cy="9" r="3.6" fill="none" stroke={c} strokeWidth="1.5" /><circle cx="11.5" cy="5" r="2.2" fill="none" stroke={c} strokeWidth="1.3" /></>,
    food: <path d="M3 13 C3 6 8 3 13 3 C13 9 9 13 3 13 Z M3 13 L9 7" fill="none" stroke={c} strokeWidth="1.5" />,
    health: <path d="M8 13.5 L2.8 8.3 A3 3 0 0 1 8 4.3 A3 3 0 0 1 13.2 8.3 Z" fill="none" stroke={c} strokeWidth="1.5" />,
    research: <path d="M6 2.5 H10 M7 2.5 V7 L3 13 H13 L9 7 V2.5" fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />,
  };
  return <svg className="ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden>{paths[k]}</svg>;
}

function Delta({ v }: { v: number }) {
  if (v === 0) return <span className="delta flat">±0</span>;
  return <span className={`delta ${v > 0 ? 'up' : 'down'}`}>{v > 0 ? `+${v}` : v}</span>;
}

const signed = (v: number) => (v >= 0 ? `+${v}` : `${v}`);

function Stat({ name, tip, k, value, next, warnAt, critAt }: {
  name: string; tip: string; k: keyof Resources; value: number; next: number; warnAt: number; critAt: number;
}) {
  const cls = value <= critAt ? 'crit' : value <= warnAt ? 'warn' : '';
  return (
    <div className={`stat ${cls}`} title={tip}>
      <div className="stat-head">
        <span className="name"><Icon k={k} />{name}</span>
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

/** Localised explanation of a finished shift, built from the engine's outcome numbers (same data the engine used). */
export function explainReport(r: ShiftReport, t: T): string[] {
  const out: string[] = [];
  const wasted = r.before.energy + r.solar - r.available;
  const pct = Math.round(r.illumination * 100);
  out.push(wasted > 0 ? t('exp.solarWasted', { solar: r.solar, pct, wasted }) : t('exp.solar', { solar: r.solar, pct }));
  out.push(t('exp.used', { n: r.habitatPowerFailure ? r.available : r.demand }));
  if (r.habitatPowerFailure) out.push(t('exp.habitatFail'));
  const running = (id: FacilityId) => r.facilities[id] && !r.habitatPowerFailure;
  out.push(running('oxygen')
    ? t('exp.o2On', { prod: MISSION.facilities.oxygen.produces, use: MISSION.crew.oxygenUse })
    : t('exp.o2Off', { use: MISSION.crew.oxygenUse }));
  out.push(running('greenhouse')
    ? t('exp.foodOn', { prod: MISSION.facilities.greenhouse.produces, use: MISSION.crew.foodUse })
    : t('exp.foodOff', { use: MISSION.crew.foodUse }));
  if (r.radiation === 'protected') out.push(t('exp.radSafe'));
  if (r.radiation === 'exposed') out.push(t('exp.radHit', { dmg: MISSION.radiation.healthDamage }));
  if (r.researchGained) out.push(t('exp.research'));
  return out;
}

export function MissionScreen({ state, setState, onFinish, onQuit, fx, onToggleFx }: Props) {
  const { t } = useI18n();
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [eduFocus, setEduFocus] = useState<FacilityId | null>(null);

  const sc = getShiftConfig(MISSION, state.shift);
  const outcome = useMemo(() => projectCurrentShift(state, MISSION), [state]);
  const warnings = useMemo(() => getWarnings(state, MISSION, outcome), [state, outcome]);
  const allowed = canAdvance(outcome);
  const r = state.resources;
  const nextSolar = state.shift < MISSION.totalShifts ? solarGeneration(MISSION, state.shift + 1) : null;
  const eduKey = eduFocus ?? String(state.shift);
  const facName = (id: FacilityId | 'habitat') => t(`fac.${id}` as Key);

  const onAdvance = () => {
    const next = advanceShift(state, MISSION);
    if (next === state) return;
    setState(next);
    setReport(next.history[next.history.length - 1]);
    setEduFocus(null);
  };

  const ended = state.status !== 'playing';

  return (
    <div className={`mission screen ${fx ? '' : 'no-fx'} ${sc.event === 'radiation' && !ended ? 'rad-alert' : ''}`}>
      {/* ---------- Top bar ---------- */}
      <header className="topbar panel">
        <div className="brand">
          <h1>SUN-01</h1>
          <span className="shift">{t('mission.shift', { n: state.shift, total: MISSION.totalShifts })}</span>
          <div className="shift-pips" aria-hidden>
            {MISSION.shifts.map((s) => (
              <span key={s.shift} className={s.shift < state.shift || (ended && s.shift === state.shift) ? 'done' : s.shift === state.shift ? 'now' : ''} />
            ))}
          </div>
        </div>
        <div className="stats">
          <Stat name={t('res.energy')} tip={t('res.tip.energy')} k="energy" value={r.energy} next={outcome.after.energy} warnAt={20} critAt={12} />
          <Stat name={t('res.oxygen')} tip={t('res.tip.oxygen')} k="oxygen" value={r.oxygen} next={outcome.after.oxygen} warnAt={30} critAt={15} />
          <Stat name={t('res.food')} tip={t('res.tip.food')} k="food" value={r.food} next={outcome.after.food} warnAt={30} critAt={15} />
          <Stat name={t('res.health')} tip={t('res.tip.health')} k="health" value={r.health} next={outcome.after.health} warnAt={70} critAt={40} />
          <div className="stat" title={t('res.tip.research')}>
            <div className="stat-head">
              <span className="name"><Icon k="research" />{t('res.research')}</span>
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
          <LangToggle className="compact" />
          <button className="icon-btn" onClick={onToggleFx} aria-pressed={fx} title={t('mission.fxTip')}>
            {t('mission.fx', { state: t(fx ? 'mission.fxOn' : 'mission.fxOff') })}
          </button>
          <button className="icon-btn" onClick={onQuit} title={t('mission.menuTip')}>{t('mission.menu')}</button>
        </div>
      </header>

      {/* ---------- Center ---------- */}
      <div className="mission-main">
        <div className="scene-wrap panel">
          <BaseScene key={`scene-${state.shift}`} facilities={state.facilities} illumination={outcome.illumination} radiation={sc.event === 'radiation'} shift={state.shift} highlight={eduFocus} />
          {!ended && (
            <div className="shift-banner" key={`banner-${state.shift}`} aria-hidden>
              <span>{t('banner.shift', { n: state.shift })}</span>
              <small>{t(sc.event === 'radiation' ? 'banner.radiation' : sc.event === 'warning' ? 'banner.warning' : 'banner.normal')}</small>
            </div>
          )}
          {sc.event && !ended && (
            <div className={`event-strip ${sc.event}`} role="status">
              <b>{t(sc.event === 'radiation' ? 'strip.radiationTitle' : 'strip.warningTitle')}</b>{' '}
              {sc.event === 'radiation' ? t('strip.radiation') : t('strip.warning', { next: state.shift + 1 })}
            </div>
          )}
          <div className="scene-overlay">
            <div className="chip">
              <span className="k">{t('chip.solar')}</span>
              <strong style={{ color: '#F4CA65' }}>+{outcome.solar}</strong> {t('chip.energy')} · {t('chip.sunlit', { pct: Math.round(outcome.illumination * 100) })}
              <div className="sun-calc">
                <span className="badge-data measured" title={t('chip.nasaTip')}>{t('chip.nasaBadge')}</span> {t('chip.sunVisible', { pct: Math.round(MISSION.site.averageSunlitFraction * 100) })}
                {' × '}
                <span className="badge-data game" title={t('chip.scenarioTip')}>{t('chip.scenarioBadge')}</span> ×{sc.scenarioModifier.toFixed(2)}
              </div>
            </div>
            <div className="chip">
              <span className="k">{t('chip.next')}</span>
              {nextSolar === null ? t('chip.final') : <><strong style={{ color: '#F4CA65' }}>+{nextSolar}</strong> {t('chip.expected')}</>}
            </div>
          </div>
        </div>

        <aside className="controls panel" aria-label={t('controls.aria')}>
          <h2>{t('controls.title')}</h2>

          <div className="fac on locked">
            <div className="title"><span className="led" />{facName('habitat')}</div>
            <span className="switch-label">{t('controls.alwaysOn')}</span>
            <div className="meta"><span className="cost">{t('controls.cost', { n: MISSION.habitat.energyCost })}</span><span>{t('controls.habitatDesc')}</span></div>
          </div>

          {FACILITY_IDS.map((id) => {
            const on = state.facilities[id];
            const available = isFacilityAvailable(state, MISSION, id);
            const cfg = MISSION.facilities[id];
            const gain =
              id === 'oxygen' ? t('gain.oxygen', { n: MISSION.facilities.oxygen.produces })
              : id === 'greenhouse' ? t('gain.food', { n: MISSION.facilities.greenhouse.produces })
              : id === 'shelter' ? t(sc.event === 'radiation' ? 'gain.shelterNow' : 'gain.shelter')
              : t(available ? 'gain.lab' : 'gain.labDone');
            const name = facName(id);
            return (
              <div key={id} className={`fac ${on ? 'on' : ''}`} onMouseEnter={() => setEduFocus(id)} onMouseLeave={() => setEduFocus(null)} onFocus={() => setEduFocus(id)} onBlur={() => setEduFocus(null)}>
                <div className="title"><span className="led" />{name}<span className={`state ${on ? 'on' : ''}`}>{t(on ? 'controls.online' : 'controls.standby')}</span></div>
                <button
                  className="switch"
                  role="switch"
                  aria-checked={on}
                  aria-label={t('switch.aria', { name, state: t(on ? 'switch.on' : 'switch.off') })}
                  title={!on && !available ? t('switch.tipDone') : t(on ? 'switch.tipOn' : 'switch.tipOff', { name })}
                  disabled={ended || (!on && !available)}
                  onClick={() => setState(toggleFacility(state, MISSION, id))}
                />
                <div className="meta"><span className="cost">{t('controls.cost', { n: cfg.energyCost })}</span><span className="gain">{gain}</span></div>
              </div>
            );
          })}

          {warnings.length > 0 && (
            <div className="alerts" role="alert">
              {warnings.map((w, i) => (
                <div key={i} className={`alert ${w.level}`}>{w.code ? t(`warn.${w.code}` as Key, w.params) : w.text}</div>
              ))}
            </div>
          )}

          <div className="power-budget">
            <div className="tag">{t('power.title')}</div>
            <div className="power-meter" aria-hidden>
              <div className={`demand ${outcome.demand > outcome.available ? 'over' : ''}`} style={{ width: `${Math.min(100, (outcome.demand / Math.max(1, outcome.available)) * 100)}%` }} />
            </div>
            <div className="power-row"><span>{t('power.supply', { b: r.energy, s: outcome.solar })}</span><span className="v">{outcome.available}</span></div>
            {outcome.demandBreakdown.map((b) => (
              <div className="power-row" key={b.id}><span style={{ color: 'var(--muted)' }}>{facName(b.id)}</span><span className="v">−{b.cost}</span></div>
            ))}
            <div className="power-row total"><span>{t('power.after')}</span><span className="v" style={{ color: allowed ? 'var(--yellow)' : 'var(--red)' }}>{allowed ? outcome.after.energy : `−${outcome.optionalDeficit}`}</span></div>
          </div>

        </aside>
      </div>

      {/* ---------- Bottom ---------- */}
      <div className="bottom">
        <section className="log panel" aria-label={t('log.aria')}>
          <h2>{t('log.title')}</h2>
          {state.history.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{t('log.welcome', { shifts: MISSION.totalShifts })}</p>
          ) : (
            <ol>
              {[...state.history].reverse().map((h) => (
                <li key={h.shift}>
                  <b>{t('log.shift', { n: h.shift })}</b>
                  {t('log.entry', { solar: h.solar, demand: h.demand, o2: signed(h.after.oxygen - h.before.oxygen), food: signed(h.after.food - h.before.food) })}
                  {h.radiation === 'protected' && t('log.radBlocked')}
                  {h.radiation === 'exposed' && t('log.radHit', { dmg: MISSION.radiation.healthDamage })}
                  {h.researchGained > 0 && t('log.research')}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="edu panel" aria-label={t('edu.aria')}>
          <h2>{t('edu.heading')}</h2>
          <span className="edu-title">{t(`edu.${eduKey}.title` as Key)}</span>
          <p>{t(`edu.${eduKey}.text` as Key)}</p>
        </section>
        <div className="advance panel">
          {ended ? (
            <button className="btn btn-primary" onClick={onFinish}>{t('advance.results')}</button>
          ) : (
            <button className="btn btn-primary" onClick={onAdvance} disabled={!allowed} title={allowed ? t('advance.tip') : t('advance.hintBlocked')}>
              {t('advance.btn')}
            </button>
          )}
          <span className="hint">
            {ended ? t('advance.hintDone') : allowed ? t('advance.hintEnds', { n: state.shift }) : t('advance.hintBlocked')}
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
  const { t } = useI18n();
  const keys: (keyof Resources)[] = ['energy', 'oxygen', 'food', 'health', 'research'];
  const ended = state.status !== 'playing';
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="modal panel">
        <span className="tag">{t('report.tag')}</span>
        <h2 id="report-title">{t('report.title', { n: report.shift })}</h2>
        <div className="deltas">
          {keys.map((k) => (
            <div key={k}>
              <div className="k">{t(`res.short.${k}` as Key)}</div>
              <div className="v">{report.after[k]}</div>
              <Delta v={report.after[k] - report.before[k]} />
            </div>
          ))}
        </div>
        <ul>{explainReport(report, t).map((e, i) => <li key={i}>{e}</li>)}</ul>
        <div className="actions">
          {ended ? (
            <button className="btn btn-primary" onClick={onResults} autoFocus>{t('report.results')}</button>
          ) : (
            <button className="btn btn-primary" onClick={onClose} autoFocus>{t('report.next', { n: report.shift + 1 })}</button>
          )}
        </div>
      </div>
    </div>
  );
}
