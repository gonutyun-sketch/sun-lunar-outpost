import { useMemo, useState } from 'react';
import { MISSION } from '../game/config';
import {
  activeExpeditions,
  advanceShift,
  batteryCapacity,
  canAdvance,
  canBuild,
  chooseOption,
  facilityCost,
  getChapter,
  getEvent,
  getForecast,
  getWarnings,
  isFacilityAvailable,
  isForcedOn,
  oxygenDamageMult,
  oxygenLeak,
  oxygenOutput,
  projectCurrentShift,
  solarDamageMult,
  solarGeneration,
  toggleBuild,
  toggleFacility,
} from '../game/engine';
import {
  FACILITY_IDS,
  UPGRADE_IDS,
  type EventChoice,
  type FacilityId,
  type GameState,
  type MissionEvent,
  type Resources,
  type ShiftReport,
  type UpgradeId,
} from '../game/types';
import { LangToggle, useI18n } from '../i18n/I18n';
import type { Key, Params, T } from '../i18n/translate';
import { BaseScene } from './BaseScene';

interface Props {
  state: GameState;
  setState: (s: GameState) => void;
  onFinish: () => void;
  onQuit: () => void;
  /** Launch a rover expedition (exploration mode). */
  onExplore: (id: string) => void;
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

function RoverIcon() {
  return <svg className="rover-icon" width="20" height="16" viewBox="0 0 20 16" shapeRendering="crispEdges" aria-hidden>
    <path d="M4 7h12v1h2v4H2V9h2zM10 4h4v3h-4zM12 2h1v2h-1zM2 13h4v2H2zm6 0h4v2H8zm6 0h4v2h-4z" fill="currentColor" />
    <path d="M5 8h4v2H5zm9 0h2v2h-2z" fill="#172033" />
  </svg>;
}

function Delta({ v }: { v: number }) {
  if (v === 0) return <span className="delta flat">±0</span>;
  return <span className={`delta ${v > 0 ? 'up' : 'down'}`}>{v > 0 ? `+${v}` : v}</span>;
}

const signed = (v: number) => (v >= 0 ? `+${v}` : `${v}`);

function Stat({ name, short, tip, k, value, next, warnAt, critAt, max = 100 }: {
  name: string; short: string; tip: string; k: keyof Resources; value: number; next: number; warnAt: number; critAt: number; max?: number;
}) {
  const cls = value <= critAt ? 'crit' : value <= warnAt ? 'warn' : '';
  return (
    <div className={`stat ${cls}`} title={tip}>
      <div className="stat-head">
        <span className="name"><Icon k={k} /><span className="long">{name}</span><span className="short">{short}</span></span>
        <span>
          <span className="val">{value}</span>
          {max !== 100 && <span className="cap">/{max}</span>}
          <Delta v={next - value} />
        </span>
      </div>
      <div className="bar" aria-hidden>
        <i style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: COLORS[k] }} />
      </div>
    </div>
  );
}

/** Numbers used inside event choice texts. */
export function choiceParams(ev: MissionEvent, c: EventChoice): Params {
  return {
    energy: c.energyCost ?? 0,
    pct: Math.round((c.oxygenProdMult ?? 1) * 100),
    shelter: MISSION.facilities.shelter.energyCost,
    dmg: c.radiationDamage ?? ev.radiation?.damage ?? 0,
    health: c.health ?? 0,
    mult: c.solarMult ?? 1,
    food: c.food ?? 0,
  };
}

/** Localised explanation of a finished shift, built from the engine's outcome numbers. */
export function explainReport(r: ShiftReport, t: T): string[] {
  const out: string[] = [];
  const wasted = r.before.energy + r.solar - r.available;
  const pct = Math.round(r.illumination * 100);
  out.push(wasted > 0 ? t('exp.solarWasted', { solar: r.solar, pct, wasted }) : t('exp.solar', { solar: r.solar, pct }));
  out.push(t('exp.used', { n: r.habitatPowerFailure ? r.available : r.demand }));
  if (r.habitatPowerFailure) out.push(t('exp.habitatFail'));
  if (r.solarDamaged) out.push(t('exp.solarDamaged', { pct: Math.round((MISSION.expeditions[0]?.solarMult ?? 1) * 100) }));
  if (r.oxygenDamaged || r.oxygenLeak) out.push(t('exp.oxygenDamaged', { pct: Math.round((MISSION.expeditions.find((e) => e.id === 'oxygenRepair')?.oxygenMult ?? 1) * 100), leak: r.oxygenLeak }));
  const ev = r.eventId ? MISSION.events.find((e) => e.id === r.eventId) : undefined;
  const choice = ev?.choices.find((c) => c.id === r.choiceId);
  if (ev && choice) out.push(t('exp.event', { title: t(`ev.${ev.id}.title` as Key), choice: t(`ev.${ev.id}.${choice.id}` as Key) }));
  out.push(r.oxygenProduced > 0
    ? t('exp.o2Prod', { prod: r.oxygenProduced, use: MISSION.crew.oxygenUse })
    : t('exp.o2Off', { use: MISSION.crew.oxygenUse }));
  out.push(r.foodProduced > 0
    ? t('exp.foodOn', { prod: r.foodProduced, use: MISSION.crew.foodUse })
    : t('exp.foodOff', { use: MISSION.crew.foodUse }));
  if (choice?.food) out.push(t('exp.eventFood', { n: choice.food }));
  if (choice?.health) out.push(t('exp.eventHealth', { n: choice.health }));
  if (r.radiation === 'protected') out.push(t('exp.radSafe'));
  if (r.radiation === 'exposed') out.push(t('exp.radHit', { dmg: r.radiationDamage }));
  if (r.radiation === 'partial') out.push(t('exp.radPartial', { dmg: r.radiationDamage }));
  if (r.researchGained) out.push(t('exp.research'));
  if (r.built) out.push(t('exp.built', { name: t(`upg.${r.built}` as Key) }));
  return out;
}

function EventCard({ state, ev, onChoose }: { state: GameState; ev: MissionEvent; onChoose: (id: string) => void }) {
  const { t } = useI18n();
  const chosen = state.choice;
  return (
    <div className={`event-card ${ev.radiation ? 'radiation' : ''} ${chosen ? 'decided' : ''}`} role="group" aria-label={t(`ev.${ev.id}.title` as Key)}>
      <div className="event-head">
        <span className="badge-data game">{t('ev.badge')}</span>
        <span className={`event-state ${chosen ? 'done' : ''}`}>{t(chosen ? 'ev.chosen' : 'ev.decide')}</span>
      </div>
      <h3>{ev.radiation ? '☢ ' : '⚠ '}{t(`ev.${ev.id}.title` as Key)}</h3>
      {!chosen && <p className="event-desc">{t(`ev.${ev.id}.desc` as Key)}</p>}
      <div className="event-choices">
        {ev.choices.map((c) => (
          <button key={c.id} type="button" className={`choice ${chosen === c.id ? 'picked' : ''}`} aria-pressed={chosen === c.id}
            disabled={state.status !== 'playing'} onClick={() => onChoose(c.id)}>
            <b>{t(`ev.${ev.id}.${c.id}` as Key)}</b>
            <small>{t(`ev.${ev.id}.${c.id}.fx` as Key, choiceParams(ev, c))}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function UpgradePanel({ state, setState, onFocus }: { state: GameState; setState: (s: GameState) => void; onFocus: (k: string | null) => void }) {
  const { t } = useI18n();
  const U = MISSION.upgrades;
  const eff: Record<UpgradeId, string> = {
    solar: t('upg.solar.eff', { a: MISSION.solar.basePeakOutput, b: MISSION.solar.basePeakOutput + (U.solar.bonus ?? 0) }),
    oxygen: t('upg.oxygen.eff', { c1: MISSION.facilities.oxygen.energyCost, c2: U.oxygen.energyCostAfter ?? 0, p1: MISSION.facilities.oxygen.produces, p2: U.oxygen.producesAfter ?? 0 }),
    battery: t('upg.battery.eff', { a: MISSION.capacity.energy, b: MISSION.capacity.energy + (U.battery.bonus ?? 0) }),
  };
  return (
    <div className="upgrades">
      <div className="upg-head"><span className="tag">{t('upg.title')}</span><small>{t('upg.note')}</small></div>
      {UPGRADE_IDS.map((id) => {
        const installed = state.upgrades[id];
        const building = state.build === id;
        const can = canBuild(state, MISSION, id);
        const label = installed ? t('upg.installed')
          : building ? t('upg.building')
          : state.shift < MISSION.upgradeUnlockShift ? t('upg.locked', { n: MISSION.upgradeUnlockShift })
          : !can ? t('upg.tooLate') : t('upg.build');
        const tip = installed ? t('upg.tipInstalled') : building ? t('upg.tipCancel') : t('upg.tipBuild', { n: U[id].energyCost });
        return (
          <div key={id} className={`upg ${installed ? 'installed' : ''} ${building ? 'building' : ''}`}
            onMouseEnter={() => onFocus(`upg.${id}`)} onMouseLeave={() => onFocus(null)}>
            <div className="upg-text">
              <b>{t(`upg.${id}` as Key)}</b>
              <small>{eff[id]}</small>
            </div>
            <button type="button" className="upg-btn" disabled={installed || (!can && !building)} title={tip} aria-pressed={building}
              onFocus={() => onFocus(`upg.${id}`)} onBlur={() => onFocus(null)}
              onClick={() => setState(toggleBuild(state, MISSION, id))}>
              <span>{label}</span>
              {!installed && <em>{t('upg.cost', { n: U[id].energyCost })}</em>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function MissionScreen({ state, setState, onFinish, onQuit, onExplore, fx, onToggleFx }: Props) {
  const { t } = useI18n();
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [roverMenu, setRoverMenu] = useState(false);

  const outcome = useMemo(() => projectCurrentShift(state, MISSION), [state]);
  const warnings = useMemo(() => getWarnings(state, MISSION, outcome), [state, outcome]);
  const allowed = canAdvance(outcome);
  const r = state.resources;
  const ended = state.status !== 'playing';
  const event = getEvent(MISSION, state.shift);
  const forecast = getForecast(MISSION, state.shift);
  const chapter = getChapter(MISSION, state.shift);
  const chapterStart = MISSION.chapters.find((c) => c.from === state.shift);
  const capacity = batteryCapacity(MISSION, state.upgrades);
  const nextUpgrades = outcome.built ? { ...state.upgrades, [outcome.built]: true } : state.upgrades;
  const nextSolar = state.shift < MISSION.totalShifts ? solarGeneration(MISSION, state.shift + 1, nextUpgrades) : null;
  const lastBuilt = state.history[state.history.length - 1]?.built ?? null;
  const expeditions = activeExpeditions(state, MISSION);
  const damagePct = Math.round(solarDamageMult(state, MISSION) * 100);
  const o2DamagePct = Math.round(oxygenDamageMult(state, MISSION) * 100);
  const leak = oxygenLeak(state, MISSION);
  const scene = useMemo(() => ({
    facilities: outcome.ran,
    sunlight: outcome.illumination,
    radiation: !!event?.radiation && !ended,
    dust: event?.id === 'dust' && state.choice !== 'eva',
    solarFault: outcome.solarDamaged,
    oxygenFault: outcome.oxygenDamaged || (event?.id === 'o2fault' && state.choice !== 'repair'),
    pumpFault: event?.id === 'pump' && state.choice !== 'replace',
    powerAlert: outcome.habitatPowerFailure || outcome.optionalDeficit > 0 || outcome.after.energy < MISSION.habitat.energyCost,
    habitatOffline: outcome.habitatPowerFailure,
    battery: Math.min(1, r.energy / capacity),
    upgrades: state.upgrades,
    building: state.build,
    fresh: lastBuilt,
  }), [outcome, event, ended, state.choice, state.upgrades, state.build, lastBuilt, r.energy, capacity]);
  const facFocus = focus && FACILITY_IDS.includes(focus as FacilityId) ? (focus as FacilityId) : null;
  // Science briefing: hovered facility/upgrade > current emergency > shift card.
  const eduKey = focus ? `edu.${focus}` : event ? `edu.ev.${event.id}` : `edu.${state.shift}`;
  const facName = (id: string) => t(`fac.${id}` as Key);
  const demandName = (id: string) =>
    id === 'event' ? t('power.event') : id === 'build' && state.build ? t('power.build', { name: t(`upg.${state.build}` as Key) }) : facName(id);

  const onAdvance = () => {
    const next = advanceShift(state, MISSION);
    if (next === state) return;
    setState(next);
    setReport(next.history[next.history.length - 1]);
    setFocus(null);
  };

  return (
    <div className={`mission screen ${fx ? '' : 'no-fx'} ${event?.radiation && !ended ? 'rad-alert' : ''}`}>
      {/* ---------- Top bar ---------- */}
      <header className="topbar panel">
        <div className="brand">
          <h1>SUN-01</h1>
          <span className="shift">{t('mission.shift', { n: state.shift, total: MISSION.totalShifts })}</span>
          <span className="chapter-tag" title={t(`chapter.${chapter}.goal` as Key)}>{t('chapter.label', { n: chapter })} · {t(`chapter.${chapter}.title` as Key)}</span>
          <div className="shift-pips" aria-hidden>
            {MISSION.shifts.map((s) => (
              <span key={s.shift}
                className={`${s.shift < state.shift || (ended && s.shift === state.shift) ? 'done' : s.shift === state.shift ? 'now' : ''} ${MISSION.chapters.some((c) => c.from === s.shift && s.shift > 1) ? 'ch' : ''} ${getEvent(MISSION, s.shift) ? 'ev' : ''}`} />
            ))}
          </div>
        </div>
        <div className="stats">
          <Stat name={t('res.energy')} short={t('res.short.energy')} tip={t('res.tip.energy')} k="energy" value={r.energy} next={outcome.after.energy} warnAt={20} critAt={12} max={capacity} />
          <Stat name={t('res.oxygen')} short={t('res.short.oxygen')} tip={t('res.tip.oxygen')} k="oxygen" value={r.oxygen} next={outcome.after.oxygen} warnAt={30} critAt={15} />
          <Stat name={t('res.food')} short={t('res.short.food')} tip={t('res.tip.food')} k="food" value={r.food} next={outcome.after.food} warnAt={30} critAt={15} />
          <Stat name={t('res.health')} short={t('res.short.health')} tip={t('res.tip.health')} k="health" value={r.health} next={outcome.after.health} warnAt={70} critAt={40} />
          <div className="stat" title={t('res.tip.research')}>
            <div className="stat-head">
              <span className="name"><Icon k="research" /><span className="long">{t('res.research')}</span><span className="short">{t('res.short.research')}</span></span>
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
          <BaseScene state={scene} shift={state.shift} highlight={facFocus} fx={fx} />
          {!ended && (
            <div className={`shift-banner ${chapterStart ? 'chapter' : ''}`} key={`banner-${state.shift}`} aria-hidden>
              {chapterStart ? (
                <>
                  <small>{t('chapter.label', { n: chapterStart.id })}</small>
                  <span>{t(`chapter.${chapterStart.id}.title` as Key)}</span>
                  <em>{t(`chapter.${chapterStart.id}.goal` as Key)}</em>
                </>
              ) : (
                <>
                  <span>{t('banner.shift', { n: state.shift })}</span>
                  <small>{event ? t(`ev.${event.id}.title` as Key) : t('banner.normal')}</small>
                </>
              )}
            </div>
          )}
          {forecast && !ended && (
            <div className={`event-strip ${forecast.radiation ? 'radiation-fc' : 'warning'}`} role="status">
              <b>{t('ev.forecastTitle')}</b>{' '}
              {t('ev.forecast', { title: t(`ev.${forecast.id}.title` as Key), hint: t(`ev.${forecast.id}.hint` as Key, { dmg: forecast.radiation?.damage ?? 0 }) })}
              <span className="badge-data game">{t('ev.badge')}</span>
            </div>
          )}
          <div className="scene-overlay">
            <div className="chip">
              <span className="k">{t('chip.solar')}</span>
              <strong style={{ color: '#F4CA65' }}>+{outcome.solar}</strong> {t('chip.energy')} · {t('chip.sunlit', { pct: Math.round(outcome.illumination * 100) })}
              <div className="sun-calc">
                <span className="badge-data measured" title={t('chip.nasaTip')}>{t('chip.nasaBadge')}</span> {t('chip.sunVisible', { pct: Math.round(MISSION.site.averageSunlitFraction * 100) })}
                {' × '}
                <span className="badge-data game" title={t('chip.scenarioTip')}>{t('chip.scenarioBadge')}</span> ×{outcome.scenarioModifier.toFixed(2)}
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
          {event && !ended && (
            <EventCard state={state} ev={event} onChoose={(id) => setState(chooseOption(state, MISSION, id))} />
          )}

          <div className="fac on locked slim">
            <div className="title"><span className="led" />{facName('habitat')}<span className="state on">{t('controls.alwaysOn')}</span></div>
            <div className="meta"><span className="cost">{t('controls.cost', { n: MISSION.habitat.energyCost })}</span><span>{t('controls.habitatDesc')}</span></div>
          </div>

          {FACILITY_IDS.map((id) => {
            const on = state.facilities[id];
            const lockedByEvent = !!event && (event.choices.find((c) => c.id === state.choice)?.disable ?? []).includes(id);
            const forcedOn = isForcedOn(state, MISSION, id);
            const available = isFacilityAvailable(state, MISSION, id);
            const gain =
              id === 'oxygen' ? t('gain.oxygen', { n: oxygenOutput(MISSION, state.upgrades) })
              : id === 'greenhouse' ? t('gain.food', { n: MISSION.facilities.greenhouse.produces })
              : id === 'shelter' ? t(event?.radiation ? 'gain.shelterNow' : 'gain.shelter')
              : t(r.research < MISSION.capacity.research ? 'gain.lab' : 'gain.labDone');
            const name = facName(id);
            const stateLabel = lockedByEvent ? t('controls.locked') : t(on ? 'controls.online' : 'controls.standby');
            return (
              <div key={id} className={`fac ${on && !lockedByEvent ? 'on' : ''} ${lockedByEvent ? 'event-locked' : ''}`}
                onMouseEnter={() => setFocus(id)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(id)} onBlur={() => setFocus(null)}>
                <div className="title"><span className="led" />{name}<span className={`state ${on && !lockedByEvent ? 'on' : ''}`}>{stateLabel}</span></div>
                <button
                  className="switch"
                  role="switch"
                  aria-checked={on && !lockedByEvent}
                  aria-label={t('switch.aria', { name, state: t(on ? 'switch.on' : 'switch.off') })}
                  title={lockedByEvent || forcedOn ? t('switch.tipLocked') : !on && !available ? t('switch.tipDone') : t(on ? 'switch.tipOn' : 'switch.tipOff', { name })}
                  disabled={ended || lockedByEvent || forcedOn || (!on && !available)}
                  onClick={() => { setFocus(id); setState(toggleFacility(state, MISSION, id)); }}
                />
                <div className="meta"><span className="cost">{t('controls.cost', { n: facilityCost(MISSION, id, state.upgrades) })}</span><span className="gain">{gain}</span></div>
              </div>
            );
          })}

          <UpgradePanel state={state} setState={setState} onFocus={setFocus} />

          {expeditions.map((x) => (
            <div key={x.id} className="alert caution expedition-alert">
              {x.id === 'oxygenRepair' ? t('ex.o2.pending', { pct: o2DamagePct, leak }) : x.id === 'sampleSurvey' ? t('ex.sc.pending') : t('ex.pending', { pct: damagePct })}
            </div>
          ))}

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
              <div className="power-row" key={b.id}><span style={{ color: 'var(--muted)' }}>{demandName(b.id)}</span><span className="v">−{b.cost}</span></div>
            ))}
            <div className="power-row total"><span>{t('power.after')}</span><span className="v" style={{ color: outcome.optionalDeficit === 0 ? 'var(--yellow)' : 'var(--red)' }}>{outcome.optionalDeficit === 0 ? outcome.after.energy : `−${outcome.optionalDeficit}`}</span></div>
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
              {[...state.history].reverse().map((h) => {
                const ev = h.eventId ? MISSION.events.find((e) => e.id === h.eventId) : undefined;
                return (
                  <li key={h.shift}>
                    <b>{t('log.shift', { n: h.shift })}</b>
                    {t('log.entry', { solar: h.solar, demand: h.demand, o2: signed(h.after.oxygen - h.before.oxygen), food: signed(h.after.food - h.before.food) })}
                    {ev && h.choiceId && <span className="log-ev"> · {t(`ev.${ev.id}.${h.choiceId}` as Key)}</span>}
                    {h.radiation === 'protected' && t('log.radBlocked')}
                    {(h.radiation === 'exposed' || h.radiation === 'partial') && t('log.radPartial', { dmg: h.radiationDamage })}
                    {h.researchGained > 0 && t('log.research')}
                    {h.built && <span className="log-up">{t('log.built', { name: t(`upg.${h.built}` as Key) })}</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <section className="edu panel" aria-label={t('edu.aria')}>
          <h2>{t('edu.heading')}</h2>
          <span className="edu-title">{t(`${eduKey}.title` as Key)}</span>
          <p>{t(`${eduKey}.text` as Key)}</p>
        </section>
        <div className="advance panel">
          {!ended && expeditions.length > 0 && (
            <div className="rover-launch">
              {roverMenu && expeditions.length > 1 && (
                <div className="rover-menu panel" role="menu">
                  {expeditions.map((x) => (
                    <button key={x.id} role="menuitem" className="btn btn-rover" onClick={() => { setRoverMenu(false); onExplore(x.id); }}
                      title={t(x.id === 'oxygenRepair' ? 'ex.o2.launchTip' : x.id === 'sampleSurvey' ? 'ex.sc.launchTip' : 'ex.launchTip')}>
                      <RoverIcon /> {t(`ex.short.${x.id}` as Key)}
                    </button>
                  ))}
                </div>
              )}
              <button className="btn btn-rover" aria-expanded={expeditions.length > 1 ? roverMenu : undefined}
                title={expeditions.length === 1 ? t(expeditions[0].id === 'oxygenRepair' ? 'ex.o2.launchTip' : expeditions[0].id === 'sampleSurvey' ? 'ex.sc.launchTip' : 'ex.launchTip') : undefined}
                onClick={() => (expeditions.length === 1 ? onExplore(expeditions[0].id) : setRoverMenu((v) => !v))}>
                <RoverIcon /> {expeditions.length === 1 ? t(`ex.short.${expeditions[0].id}` as Key) : `${t('ex.launch')} (${expeditions.length})`}
              </button>
            </div>
          )}
          {ended ? (
            <button className="btn btn-primary" onClick={onFinish}>{t('advance.results')}</button>
          ) : (
            <button className="btn btn-primary" onClick={onAdvance} disabled={!allowed} title={allowed ? t('advance.tip') : outcome.needsChoice ? t('warn.choiceNeeded') : t('advance.hintBlocked')}>
              {t('advance.btn')}
            </button>
          )}
          <span className="hint">
            {ended ? t('advance.hintDone') : allowed ? t('advance.hintEnds', { n: state.shift }) : outcome.needsChoice ? t('ev.decide') : t('advance.hintBlocked')}
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
  const chapterDone = state.status !== 'failed' ? MISSION.chapters.find((c) => c.to === report.shift) : undefined;
  const highlights: { cls: string; text: string }[] = [];
  if (report.built) highlights.push({ cls: 'up', text: t('report.upgrade', { name: t(`upg.${report.built}` as Key) }) });
  if (report.researchGained) highlights.push({ cls: 'sci', text: t('report.milestone', { n: report.after.research, max: MISSION.capacity.research }) });
  if (chapterDone) highlights.push({ cls: 'ch', text: t('report.chapterDone', { n: chapterDone.id, title: t(`chapter.${chapterDone.id}.title` as Key) }) });
  if (report.radiation === 'protected') highlights.push({ cls: 'safe', text: t('exp.radSafe') });
  for (const x of state.expeditionLog.filter((e) => e.shift === report.shift)) {
    const exCfg = MISSION.expeditions.find((e) => e.id === x.id);
    const name = t(`ex.short.${x.id}` as Key);
    if (x.success) highlights.push({ cls: 'up', text: t('report.exOk', { name }) });
    if (x.failures) highlights.push({ cls: 'fail', text: t('report.exFail', { name, n: x.failures, e: x.failures * (exCfg?.failEnergyCost ?? 0), o2: x.failures * (exCfg?.failOxygenCost ?? 0) }) });
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="modal panel">
        <span className="tag">{t('report.tag')}</span>
        <h2 id="report-title">{t('report.title', { n: report.shift })}</h2>
        {highlights.length > 0 && (
          <div className="highlights">
            {highlights.map((h, i) => <span key={i} className={`hl ${h.cls}`}>{h.text}</span>)}
          </div>
        )}
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
