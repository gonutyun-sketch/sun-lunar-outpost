import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { coachByDefault, coachTips } from '../game/coach';
import { difficultyOf, missionFor, type DifficultyId } from '../game/difficulty';
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
  type MissionConfig,
  type MissionEvent,
  type Resources,
  type ShiftReport,
  type UpgradeId,
} from '../game/types';
import { LangToggle, useI18n } from '../i18n/I18n';
import type { Key, Params, T } from '../i18n/translate';
import type { ResourceStep, TutorialEvent, TutorialProgress } from '../tutorial/progress';
import { BaseScene } from './BaseScene';
import { baseMessage, reportMessage, resourceToInspect, safeTrainingShift } from './baseTutorial';
import { TutorialGuide } from './TutorialGuide';
import { useWarningQueue, WarningBanner, type MissionWarning } from './WarningBanner';

interface Props {
  state: GameState;
  setState: (s: GameState) => void;
  onFinish: () => void;
  onQuit: () => void;
  /** Launch a rover expedition (exploration mode). */
  onExplore: (id: string) => void;
  fx: boolean;
  onToggleFx: () => void;
  seenWarnings: Set<string>;
  tutorial: TutorialProgress | null;
  teach: (event: TutorialEvent) => void;
  practice: boolean;
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

/** Player's choice to show or hide coach tips, remembered per difficulty (null = difficulty default). */
const coachKey = (d: DifficultyId) => `sun-coach-${d}`;
function readCoachPref(d: DifficultyId): boolean | null {
  try { const v = localStorage.getItem(coachKey(d)); return v === 'on' ? true : v === 'off' ? false : null; } catch { return null; }
}
function writeCoachPref(d: DifficultyId, on: boolean) {
  try { localStorage.setItem(coachKey(d), on ? 'on' : 'off'); } catch { /* storage unavailable */ }
}

/** Small difficulty label shown in the top bar and on the results screen. */
export function DifficultyBadge({ id }: { id: DifficultyId }) {
  const { t } = useI18n();
  return <span className={`diff-chip diff-${id}`} title={t('diff.chipTip')}><i aria-hidden />{t(`diff.${id}.name` as Key)}</span>;
}

function inspectMeter(inspect?: () => void) {
  return inspect && { role: 'button', tabIndex: 0, onClick: inspect, onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(); }
  } };
}

function Stat({ name, short, tip, k, value, next, warnAt, critAt, max = 100, inspect }: {
  name: string; short: string; tip: string; k: keyof Resources; value: number; next: number; warnAt: number; critAt: number; max?: number; inspect?: () => void;
}) {
  const cls = value <= critAt ? 'crit' : value <= warnAt ? 'warn' : '';
  return (
    <div className={`stat ${cls}`} title={tip} data-tutorial-target={`resource-${k}`} {...inspectMeter(inspect)}>
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
export function choiceParams(ev: MissionEvent, c: EventChoice, cfg: MissionConfig): Params {
  return {
    energy: c.energyCost ?? 0,
    pct: Math.round((c.oxygenProdMult ?? 1) * 100),
    shelter: cfg.facilities.shelter.energyCost,
    dmg: c.radiationDamage ?? ev.radiation?.damage ?? 0,
    health: c.health ?? 0,
    mult: c.solarMult ?? 1,
    food: c.food ?? 0,
  };
}

/** Localised explanation of a finished shift, built from the engine's outcome numbers. */
export function explainReport(r: ShiftReport, t: T, cfg: MissionConfig): string[] {
  const out: string[] = [];
  const wasted = r.before.energy + r.solar - r.available;
  const pct = Math.round(r.illumination * 100);
  out.push(wasted > 0 ? t('exp.solarWasted', { solar: r.solar, pct, wasted }) : t('exp.solar', { solar: r.solar, pct }));
  out.push(t('exp.used', { n: r.habitatPowerFailure ? r.available : r.demand }));
  if (r.habitatPowerFailure) out.push(t('exp.habitatFail'));
  if (r.solarDamaged) out.push(t('exp.solarDamaged', { pct: Math.round((cfg.expeditions[0]?.solarMult ?? 1) * 100) }));
  if (r.oxygenDamaged || r.oxygenLeak) out.push(t('exp.oxygenDamaged', { pct: Math.round((cfg.expeditions.find((e) => e.id === 'oxygenRepair')?.oxygenMult ?? 1) * 100), leak: r.oxygenLeak }));
  const ev = r.eventId ? cfg.events.find((e) => e.id === r.eventId) : undefined;
  const choice = ev?.choices.find((c) => c.id === r.choiceId);
  if (ev && choice) out.push(t('exp.event', { title: t(`ev.${ev.id}.title` as Key), choice: t(`ev.${ev.id}.${choice.id}` as Key) }));
  out.push(r.oxygenProduced > 0
    ? t('exp.o2Prod', { prod: r.oxygenProduced, use: cfg.crew.oxygenUse })
    : t('exp.o2Off', { use: cfg.crew.oxygenUse }));
  out.push(r.foodProduced > 0
    ? t('exp.foodOn', { prod: r.foodProduced, use: cfg.crew.foodUse })
    : t('exp.foodOff', { use: cfg.crew.foodUse }));
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
  const cfg = missionFor(state.difficulty);
  const chosen = state.choice;
  return (
    <div className={`event-card ${ev.radiation ? 'radiation' : ''} ${chosen ? 'decided' : ''}`} role="group" aria-label={t(`ev.${ev.id}.title` as Key)}>
      <div className="event-head">
        <span className="badge-data game">{t('ev.badge')}</span>
        <span className={`event-state ${chosen ? 'done' : ''}`}>{t(chosen ? 'ev.chosen' : 'ev.decide')}</span>
      </div>
      <h3>{ev.radiation ? '☢ ' : '⚠ '}{t(`ev.${ev.id}.title` as Key)}</h3>
      {!chosen && <p className="event-desc">{t(`ev.${ev.id}.desc` as Key)}</p>}
      <div className="event-choices" data-tutorial-target="emergency">
        {ev.choices.map((c) => (
          <button key={c.id} type="button" className={`choice ${chosen === c.id ? 'picked' : ''}`} aria-pressed={chosen === c.id}
            disabled={state.status !== 'playing'} onClick={() => onChoose(c.id)}>
            <b>{t(`ev.${ev.id}.${c.id}` as Key)}</b>
            <small>{t(`ev.${ev.id}.${c.id}.fx` as Key, choiceParams(ev, c, cfg))}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function UpgradePanel({ state, setState, onFocus }: { state: GameState; setState: (s: GameState) => void; onFocus: (k: string | null) => void }) {
  const { t } = useI18n();
  const cfg = missionFor(state.difficulty);
  const U = cfg.upgrades;
  const eff: Record<UpgradeId, string> = {
    solar: t('upg.solar.eff', { a: cfg.solar.basePeakOutput, b: cfg.solar.basePeakOutput + (U.solar.bonus ?? 0) }),
    oxygen: t('upg.oxygen.eff', { c1: cfg.facilities.oxygen.energyCost, c2: U.oxygen.energyCostAfter ?? 0, p1: cfg.facilities.oxygen.produces, p2: U.oxygen.producesAfter ?? 0 }),
    battery: t('upg.battery.eff', { a: cfg.capacity.energy, b: cfg.capacity.energy + (U.battery.bonus ?? 0) }),
  };
  return (
    <div className="upgrades" data-tutorial-target="upgrades">
      <div className="upg-head"><span className="tag">{t('upg.title')}</span><small>{t('upg.note')}</small></div>
      {UPGRADE_IDS.map((id) => {
        const installed = state.upgrades[id];
        const building = state.build === id;
        const can = canBuild(state, cfg, id);
        const label = installed ? t('upg.installed')
          : building ? t('upg.building')
          : state.shift < cfg.upgradeUnlockShift ? t('upg.locked', { n: cfg.upgradeUnlockShift })
          : !can ? t('upg.tooLate') : t('upg.build');
        const tip = installed ? t('upg.tipInstalled') : building ? t('upg.tipCancel') : t('upg.tipBuild', { n: U[id].energyCost });
        return (
          <div key={id} className={`upg ${installed ? 'installed' : ''} ${building ? 'building' : ''}`}
            onMouseEnter={() => onFocus(`upg.${id}`)} onMouseLeave={() => onFocus(null)}>
            <div className="upg-text">
              <b>{t(`upg.${id}` as Key)}</b>
              <small>{eff[id]}</small>
            </div>
            <button type="button" className="upg-btn" data-tutorial-target={`upgrade-${id}`} disabled={installed || (!can && !building)} title={tip} aria-pressed={building}
              onFocus={() => onFocus(`upg.${id}`)} onBlur={() => onFocus(null)}
              onClick={() => setState(toggleBuild(state, cfg, id))}>
              <span>{label}</span>
              {!installed && <em>{t('upg.cost', { n: U[id].energyCost })}</em>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function MissionScreen({ state, setState, onFinish, onQuit, onExplore, fx, onToggleFx, seenWarnings, tutorial, teach, practice }: Props) {
  const { t } = useI18n();
  const scope = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState<ShiftReport | null>(() =>
    tutorial?.base === 'report' && tutorial.status !== 'skipped' ? state.history.find(previous => previous.shift === 1) ?? null : null);
  const [focus, setFocus] = useState<string | null>(null);
  const [roverMenu, setRoverMenu] = useState(false);
  const { warning, add: warn } = useWarningQueue();
  const cfg = missionFor(state.difficulty);
  const diff = difficultyOf(state.difficulty);
  const [coachPref, setCoachPref] = useState<boolean | null>(() => readCoachPref(state.difficulty));

  const outcome = useMemo(() => projectCurrentShift(state, cfg), [state]);
  const warnings = useMemo(() => getWarnings(state, cfg, outcome), [state, outcome]);
  const guidance = tutorial?.status === 'active' ? tutorial : null;
  const firstShift = !!guidance && guidance.base !== 'done' && guidance.base !== 'report' && state.shift === 1;
  const allowed = canAdvance(outcome) && (!firstShift || (guidance.base === 'advance' && safeTrainingShift(cfg, outcome)));
  const guidedMessage = guidance && !report ? baseMessage(guidance, state, cfg, outcome, teach) : undefined;
  const currentMeter = resourceToInspect(guidance);
  const inspect = (step: ResourceStep) => currentMeter === step && !report ? () => teach({ type: 'observe', step }) : undefined;
  const skipGuide = () => teach({ type: 'skip' });
  const pauseGuide = () => teach({ type: 'pause' });
  const r = state.resources;
  const ended = state.status !== 'playing';
  const event = getEvent(cfg, state.shift);
  const forecast = getForecast(cfg, state.shift);
  const chapter = getChapter(cfg, state.shift);
  const chapterStart = cfg.chapters.find((c) => c.from === state.shift);
  const capacity = batteryCapacity(cfg, state.upgrades);
  const nextUpgrades = outcome.built ? { ...state.upgrades, [outcome.built]: true } : state.upgrades;
  const nextSolar = state.shift < cfg.totalShifts ? solarGeneration(cfg, state.shift + 1, nextUpgrades) : null;
  const lastBuilt = state.history[state.history.length - 1]?.built ?? null;
  const expeditions = activeExpeditions(state, cfg);
  const damagePct = Math.round(solarDamageMult(state, cfg) * 100);
  const o2DamagePct = Math.round(oxygenDamageMult(state, cfg) * 100);
  const leak = oxygenLeak(state, cfg);
  const powerDeficit = outcome.habitatPowerFailure || outcome.optionalDeficit > 0;
  const solarFaultStarted = outcome.solarDamaged && cfg.expeditions.some(e => e.id === 'solarRepair' && e.fromShift === state.shift);
  const oxygenFaultStarted = outcome.oxygenDamaged && cfg.expeditions.some(e => e.id === 'oxygenRepair' && e.fromShift === state.shift);
  useEffect(() => {
    if (ended) return;
    const next: MissionWarning[] = [];
    if (event) {
      next.push({ id: `emergency-${state.shift}`, tone: event.radiation ? 'critical' : 'caution',
        title: `ev.${event.id}.title` as Key, action: 'notice.emergency.action' });
    }
    if (powerDeficit) {
      next.push({ id: `power-${state.shift}`, tone: 'critical', title: 'notice.power.title',
        action: outcome.habitatPowerFailure ? 'notice.habitat.action' : 'notice.power.action' });
    }
    if (solarFaultStarted) next.push({ id: 'solar-fault', tone: 'caution', title: 'notice.solar.title', action: 'notice.solar.action' });
    if (oxygenFaultStarted) next.push({ id: 'oxygen-fault', tone: 'caution', title: 'notice.oxygen.title', action: 'notice.oxygen.action' });
    const unseen = next.filter(({ id }) => !seenWarnings.has(id));
    for (const { id } of unseen) seenWarnings.add(id);
    warn(...unseen);
  }, [ended, event, state.shift, powerDeficit, outcome.habitatPowerFailure, solarFaultStarted, oxygenFaultStarted, seenWarnings, warn]);
  const scene = useMemo(() => ({
    facilities: outcome.ran,
    sunlight: outcome.illumination,
    radiation: !!event?.radiation && !ended,
    dust: event?.id === 'dust' && state.choice !== 'eva',
    solarFault: outcome.solarDamaged,
    oxygenFault: outcome.oxygenDamaged || (event?.id === 'o2fault' && state.choice !== 'repair'),
    pumpFault: event?.id === 'pump' && state.choice !== 'replace',
    powerAlert: outcome.habitatPowerFailure || outcome.optionalDeficit > 0 || outcome.after.energy < cfg.habitat.energyCost,
    habitatOffline: outcome.habitatPowerFailure,
    battery: Math.min(1, r.energy / capacity),
    upgrades: state.upgrades,
    building: state.build,
    fresh: lastBuilt,
  }), [outcome, event, ended, state.choice, state.upgrades, state.build, lastBuilt, r.energy, capacity]);
  const coachOpen = !ended && (coachPref ?? coachByDefault(diff.help.coach, state.shift));
  const tips = useMemo(() => (coachOpen ? coachTips(state, cfg, outcome) : []), [coachOpen, state, cfg, outcome]);
  const setCoach = (on: boolean) => { setCoachPref(on); writeCoachPref(state.difficulty, on); };
  /** Easy mode explains warnings in friendlier words; Normal/Hard keep the situation + numbers. */
  const warnText = (code: string, params?: Params) =>
    t((diff.help.tone === 'friendly' ? `warn.${code}.easy` : `warn.${code}`) as Key, params);
  const facFocus = focus && FACILITY_IDS.includes(focus as FacilityId) ? (focus as FacilityId) : null;
  // Science briefing: hovered facility/upgrade > current emergency > shift card.
  const eduKey = focus ? `edu.${focus}` : event ? `edu.ev.${event.id}` : `edu.${state.shift}`;
  const facName = (id: string) => t(`fac.${id}` as Key);
  const demandName = (id: string) =>
    id === 'event' ? t('power.event') : id === 'build' && state.build ? t('power.build', { name: t(`upg.${state.build}` as Key) }) : facName(id);

  const onAdvance = () => {
    if (!allowed) return;
    const next = advanceShift(state, cfg);
    if (next === state) return;
    const result = next.history[next.history.length - 1];
    setState(next);
    setReport(result);
    teach({ type: 'advance', report: result });
    setFocus(null);
  };
  const closeReport = () => { setReport(null); teach({ type: 'close-report' }); };

  return (
    <div ref={scope} className={`mission screen ${guidedMessage ? 'mission-guided' : ''} ${fx ? '' : 'no-fx'} ${event?.radiation && !ended ? 'rad-alert' : ''}`}>
      <WarningBanner warning={warning} />
      {/* ---------- Top bar ---------- */}
      <header className="topbar panel">
        <div className="brand">
          <h1>SUN-01</h1>
          <span className="shift">{t('mission.shift', { n: state.shift, total: cfg.totalShifts })}</span>
          <DifficultyBadge id={state.difficulty} />
          {practice && <span className="tutorial-practice-tag">{t('tut.practice.tag')}</span>}
          <span className="chapter-tag" title={t(`chapter.${chapter}.goal` as Key)}>{t('chapter.label', { n: chapter })} · {t(`chapter.${chapter}.title` as Key)}</span>
          <div className="shift-pips" aria-hidden>
            {cfg.shifts.map((s) => (
              <span key={s.shift}
                className={`${s.shift < state.shift || (ended && s.shift === state.shift) ? 'done' : s.shift === state.shift ? 'now' : ''} ${cfg.chapters.some((c) => c.from === s.shift && s.shift > 1) ? 'ch' : ''} ${getEvent(cfg, s.shift) ? 'ev' : ''}`} />
            ))}
          </div>
        </div>
        <div className="stats" data-tutorial-target="resources">
          <Stat name={t('res.energy')} short={t('res.short.energy')} tip={t('res.tip.energy')} k="energy" value={r.energy} next={outcome.after.energy} warnAt={20} critAt={12} max={capacity} inspect={inspect('energy')} />
          <Stat name={t('res.oxygen')} short={t('res.short.oxygen')} tip={t('res.tip.oxygen')} k="oxygen" value={r.oxygen} next={outcome.after.oxygen} warnAt={30} critAt={15} inspect={inspect('oxygen')} />
          <Stat name={t('res.food')} short={t('res.short.food')} tip={t('res.tip.food')} k="food" value={r.food} next={outcome.after.food} warnAt={30} critAt={15} inspect={inspect('food')} />
          <Stat name={t('res.health')} short={t('res.short.health')} tip={t('res.tip.health')} k="health" value={r.health} next={outcome.after.health} warnAt={70} critAt={40} inspect={inspect('health')} />
          <div className="stat" title={t('res.tip.research')} data-tutorial-target="resource-research" {...inspectMeter(inspect('research'))}>
            <div className="stat-head">
              <span className="name"><Icon k="research" /><span className="long">{t('res.research')}</span><span className="short">{t('res.short.research')}</span></span>
              <span>
                <span className="val">{r.research}/{cfg.capacity.research}</span>
                <Delta v={outcome.after.research - r.research} />
              </span>
            </div>
            <div className="research-dots" aria-hidden>
              {Array.from({ length: cfg.capacity.research }, (_, i) => (
                <span key={i} className={i < r.research ? 'on' : ''} />
              ))}
            </div>
          </div>
        </div>
        <div className="topbar-actions">
          <LangToggle className="compact" />
          {!ended && tutorial?.status === 'paused' && <button type="button" className="icon-btn" onClick={() => teach({ type: 'resume' })}>{t('tut.resume')}</button>}
          {!ended && (
            <button className={`icon-btn coach-btn ${coachOpen ? 'on' : ''}`} onClick={() => setCoach(!coachOpen)} aria-pressed={coachOpen} title={t('coach.toggleTip')}>
              {t(coachOpen ? 'coach.hide' : 'coach.show')}
            </button>
          )}
          <button className="icon-btn" onClick={onToggleFx} aria-pressed={fx} title={t('mission.fxTip')}>
            {t('mission.fx', { state: t(fx ? 'mission.fxOn' : 'mission.fxOff') })}
          </button>
          <button className="icon-btn" onClick={onQuit} title={t(practice ? 'tut.practice.exit' : 'mission.menuTip')}>{t(practice ? 'tut.practice.exit' : 'mission.menu')}</button>
        </div>
      </header>

      {guidedMessage && (
        <div className="tutorial-base-slot">
          <TutorialGuide message={guidedMessage} scope={scope} onPause={pauseGuide} onSkip={skipGuide} reveal />
        </div>
      )}

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
            <div className="chip" data-tutorial-target="solar">
              <span className="k">{t('chip.solar')}</span>
              <strong style={{ color: '#F4CA65' }}>+{outcome.solar}</strong> {t('chip.energy')} · {t('chip.sunlit', { pct: Math.round(outcome.illumination * 100) })}
              <div className="sun-calc">
                <span className="badge-data measured" title={t('chip.nasaTip')}>{t('chip.nasaBadge')}</span> {t('chip.sunVisible', { pct: Math.round(cfg.site.averageSunlitFraction * 100) })}
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
          {tips.length > 0 && (
            <div className="coach" role="note" aria-label={t('coach.title')}>
              <div className="coach-head">
                <span className="coach-badge" aria-hidden>?</span>
                <b>{t('coach.title')}</b>
                <button type="button" className="coach-close" onClick={() => setCoach(false)} aria-label={t('coach.hide')}>✕</button>
              </div>
              <ul>
                {tips.map((k) => <li key={k}>{t(`coach.${k}` as Key, { goal: cfg.capacity.research, o2: cfg.crew.oxygenUse, food: cfg.crew.foodUse, habitat: cfg.habitat.energyCost })}</li>)}
              </ul>
            </div>
          )}
          {event && !ended && (
            <EventCard state={state} ev={event} onChoose={(id) => {
              const next = chooseOption(state, cfg, id);
              if (next === state) return;
              setState(next);
              if (next.choice === id) teach({ type: 'lesson', lesson: 'emergency' });
            }} />
          )}

          <div className="fac on locked slim">
            <div className="title"><span className="led" />{facName('habitat')}<span className="state on">{t('controls.alwaysOn')}</span></div>
            <div className="meta"><span className="cost">{t('controls.cost', { n: cfg.habitat.energyCost })}</span><span>{t('controls.habitatDesc')}</span></div>
          </div>

          {FACILITY_IDS.map((id) => {
            const on = state.facilities[id];
            const lockedByEvent = !!event && (event.choices.find((c) => c.id === state.choice)?.disable ?? []).includes(id);
            const forcedOn = isForcedOn(state, cfg, id);
            const available = isFacilityAvailable(state, cfg, id);
            const gain =
              id === 'oxygen' ? t('gain.oxygen', { n: oxygenOutput(cfg, state.upgrades) })
              : id === 'greenhouse' ? t('gain.food', { n: cfg.facilities.greenhouse.produces })
              : id === 'shelter' ? t(event?.radiation ? 'gain.shelterNow' : 'gain.shelter')
              : t(r.research < cfg.capacity.research ? 'gain.lab' : 'gain.labDone');
            const name = facName(id);
            const stateLabel = lockedByEvent ? t('controls.locked') : t(on ? 'controls.online' : 'controls.standby');
            return (
              <div key={id} className={`fac ${on && !lockedByEvent ? 'on' : ''} ${lockedByEvent ? 'event-locked' : ''}`}
                onMouseEnter={() => setFocus(id)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(id)} onBlur={() => setFocus(null)}>
                <div className="title"><span className="led" />{name}<span className={`state ${on && !lockedByEvent ? 'on' : ''}`}>{stateLabel}</span></div>
                <button
                  className="switch"
                  data-tutorial-target={`facility-${id}`}
                  role="switch"
                  aria-checked={on && !lockedByEvent}
                  aria-label={t('switch.aria', { name, state: t(on ? 'switch.on' : 'switch.off') })}
                  title={lockedByEvent || forcedOn ? t('switch.tipLocked') : !on && !available ? t('switch.tipDone') : t(on ? 'switch.tipOn' : 'switch.tipOff', { name })}
                  disabled={ended || lockedByEvent || forcedOn || (!on && !available)}
                  onClick={() => {
                    const next = toggleFacility(state, cfg, id);
                    if (next === state) return;
                    setFocus(id);
                    setState(next);
                    teach({ type: 'switch', facility: id, before: on, after: next.facilities[id] });
                  }}
                />
                <div className="meta"><span className="cost">{t('controls.cost', { n: facilityCost(cfg, id, state.upgrades) })}</span><span className="gain">{gain}</span></div>
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
                <div key={i} className={`alert ${w.level}`}>{w.code ? warnText(w.code, w.params) : w.text}</div>
              ))}
            </div>
          )}

          <div className="power-budget" data-tutorial-target="power">
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
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{t('log.welcome', { shifts: cfg.totalShifts })}</p>
          ) : (
            <ol>
              {[...state.history].reverse().map((h) => {
                const ev = h.eventId ? cfg.events.find((e) => e.id === h.eventId) : undefined;
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
        <div className="advance panel" data-tutorial-dock>
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
            <button className="btn btn-primary" data-tutorial-target="advance" onClick={onAdvance} disabled={!allowed} title={allowed ? t('advance.tip') : firstShift ? t('tut.advance.wait') : outcome.needsChoice ? t('warn.choiceNeeded') : t('advance.hintBlocked')}>
              {t('advance.btn')}
            </button>
          )}
          <span className="hint">
            {ended ? t('advance.hintDone') : allowed ? t('advance.hintEnds', { n: state.shift }) : firstShift && guidance.base !== 'advance'
              ? t('tut.advance.wait') : outcome.needsChoice ? t('ev.decide') : t('advance.hintBlocked')}
          </span>
        </div>
      </div>

      {report && (
        <ShiftReportModal
          report={report}
          state={state}
          scope={scope}
          guided={guidance?.base === 'report' && report.shift === 1 && !ended}
          onSkip={skipGuide}
          onClose={closeReport}
          onResults={() => { setReport(null); onFinish(); }}
        />
      )}
    </div>
  );
}

function ShiftReportModal({ report, state, scope, guided, onSkip, onClose, onResults }: {
  report: ShiftReport; state: GameState; scope: RefObject<HTMLDivElement>; guided: boolean; onSkip: () => void; onClose: () => void; onResults: () => void;
}) {
  const { t } = useI18n();
  const cfg = missionFor(state.difficulty);
  const keys: (keyof Resources)[] = ['energy', 'oxygen', 'food', 'health', 'research'];
  const ended = state.status !== 'playing';
  const chapterDone = state.status !== 'failed' ? cfg.chapters.find((c) => c.to === report.shift) : undefined;
  const highlights: { cls: string; text: string }[] = [];
  if (report.built) highlights.push({ cls: 'up', text: t('report.upgrade', { name: t(`upg.${report.built}` as Key) }) });
  if (report.researchGained) highlights.push({ cls: 'sci', text: t('report.milestone', { n: report.after.research, max: cfg.capacity.research }) });
  if (chapterDone) highlights.push({ cls: 'ch', text: t('report.chapterDone', { n: chapterDone.id, title: t(`chapter.${chapterDone.id}.title` as Key) }) });
  if (report.radiation === 'protected') highlights.push({ cls: 'safe', text: t('exp.radSafe') });
  for (const x of state.expeditionLog.filter((e) => e.shift === report.shift)) {
    const exCfg = cfg.expeditions.find((e) => e.id === x.id);
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
        {guided && <TutorialGuide message={reportMessage(report)} scope={scope} onSkip={onSkip} />}
        <div className="deltas" data-tutorial-target="report">
          {keys.map((k) => (
            <div key={k}>
              <div className="k">{t(`res.short.${k}` as Key)}</div>
              <div className="v">{report.after[k]}</div>
              <Delta v={report.after[k] - report.before[k]} />
            </div>
          ))}
        </div>
        <ul>{explainReport(report, t, cfg).map((e, i) => <li key={i}>{e}</li>)}</ul>
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
