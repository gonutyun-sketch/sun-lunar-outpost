import { canAdvance, canBuild, evaluateFailure, facilityCost, isFacilityAvailable, projectCurrentShift } from '../game/engine';
import { UPGRADE_IDS, type GameState, type MissionConfig, type ShiftOutcome, type ShiftReport } from '../game/types';
import type { Key } from '../i18n/translate';
import { RESOURCE_STEPS, type ResourceStep, type TutorialEvent, type TutorialProgress } from '../tutorial/progress';
import type { GuideMessage } from './TutorialGuide';

export function safeTrainingShift(cfg: MissionConfig, outcome: ShiftOutcome) {
  return canAdvance(outcome) && !evaluateFailure(cfg, outcome);
}

export function resourceToInspect(guide: TutorialProgress | null): ResourceStep | undefined {
  return guide?.status === 'active' ? RESOURCE_STEPS.find(resource => resource === guide.base) : undefined;
}

export function baseMessage(guide: TutorialProgress, state: GameState, cfg: MissionConfig, outcome: ShiftOutcome,
  send: (event: TutorialEvent) => void): GuideMessage | undefined {
  const { base } = guide;
  const stage = (n: number) => [n, 7] as const;
  const observe = (step: 'solar' | 'preview') => ({ label: 'tut.checked' as const, run: () => send({ type: 'observe', step }) });
  const resource = resourceToInspect(guide);
  if (resource) {
    return { id: resource, title: `tut.res.${resource}` as Key, body: `tut.res.${resource}.line` as Key,
      target: `resource-${resource}`, stage: stage(1), mood: 'thinking',
      params: { n: state.resources[resource], goal: cfg.capacity.research } };
  }
  if (base === 'solar') return {
    id: base, title: 'tut.solar.h', body: 'tut.solar.line', target: 'solar', stage: stage(2), mood: 'thinking',
    params: { solar: outcome.solar, use: outcome.demand }, action: observe(base),
  };
  if (base === 'air' || base === 'air-on') {
    return { id: base, title: state.facilities.oxygen ? 'tut.air.off' : 'tut.air.on',
      body: base === 'air-on' && !state.facilities.oxygen ? 'tut.air.changed' : 'tut.air.line',
      params: { power: facilityCost(cfg, 'oxygen', state.upgrades), n: outcome.oxygenProduced }, target: 'facility-oxygen', stage: stage(3),
      mood: base === 'air-on' ? 'happy' : 'ready' };
  }
  if (base === 'greenhouse' || base === 'greenhouse-on') {
    return { id: base, title: state.facilities.greenhouse ? 'tut.farm.off' : 'tut.farm.on',
      body: base === 'greenhouse-on' && !state.facilities.greenhouse ? 'tut.farm.changed' : 'tut.farm.line',
      params: { power: facilityCost(cfg, 'greenhouse', state.upgrades), n: cfg.facilities.greenhouse.produces }, target: 'facility-greenhouse', stage: stage(4),
      mood: base === 'greenhouse-on' ? 'happy' : 'ready' };
  }
  if (base === 'preview') return {
    id: base, title: 'tut.preview.h', body: 'tut.preview.line', target: 'resources', stage: stage(5), mood: 'thinking',
    params: { power: outcome.after.energy, oxygen: outcome.after.oxygen, food: outcome.after.food }, action: observe(base),
  };
  if (base === 'advance') {
    const failure = evaluateFailure(cfg, outcome);
    const safe = safeTrainingShift(cfg, outcome);
    return { id: base, title: safe ? 'tut.advance.h' : 'tut.advance.fix', body: safe ? 'tut.advance.line' : failure === 'oxygen' ? 'tut.advance.o2'
      : failure === 'food' ? 'tut.advance.food' : 'tut.advance.power',
      target: safe ? 'advance' : failure === 'oxygen' ? 'facility-oxygen' : failure === 'food' ? 'facility-greenhouse' : 'power',
      stage: stage(6), mood: safe ? 'ready' : 'caution' };
  }
  if (base !== 'done' || state.status !== 'playing') return;

  if (outcome.needsChoice && !guide.lessons.emergency) return {
    id: 'emergency', title: 'tut.emergency.h', body: 'tut.emergency.line', target: 'emergency', mood: 'caution',
  };
  const later = (lesson: 'upgrade' | 'lab') => ({ label: 'tut.later' as const, run: () => send({ type: 'lesson', lesson }) });

  if (!guide.lessons.upgrade) {
    if (state.build) return {
      id: 'upgrade-queued', title: 'tut.upgrade.queued', body: 'tut.upgrade.queuedLine', target: `upgrade-${state.build}`,
      mood: 'happy', action: { label: 'tut.checked', run: () => send({ type: 'lesson', lesson: 'upgrade' }) },
      params: { cost: cfg.upgrades[state.build].energyCost },
    };
    const affordable = UPGRADE_IDS.filter(id => canBuild(state, cfg, id) && safeTrainingShift(cfg, projectCurrentShift({ ...state, build: id }, cfg)));
    if (affordable.length) return {
      id: 'upgrade', title: 'tut.upgrade.h', body: 'tut.upgrade.line', target: affordable.length === 1 ? `upgrade-${affordable[0]}` : 'upgrades',
      mood: 'thinking', action: later('upgrade'),
    };
  }

  if (guide.lessons.lab || !isFacilityAvailable(state, cfg, 'lab')) return;
  const trial = state.facilities.lab ? outcome : projectCurrentShift({ ...state, facilities: { ...state.facilities, lab: true } }, cfg);
  if (!safeTrainingShift(cfg, trial)) return;
  return { id: 'lab', title: state.facilities.lab ? 'tut.lab.on' : 'tut.lab.h', body: state.facilities.lab ? 'tut.lab.forecast' : 'tut.lab.line',
    target: state.facilities.lab ? 'resource-research' : 'facility-lab', mood: state.facilities.lab ? 'happy' : 'ready', action: later('lab'),
    params: { n: state.resources.research, goal: cfg.capacity.research, cost: cfg.facilities.lab.energyCost, gain: trial.researchGained } };
}

export function reportMessage(report: ShiftReport): GuideMessage {
  const food = report.foodProduced > 0;
  const oxygen = report.oxygenProduced > 0;
  const value = food ? report.after.food : oxygen ? report.after.oxygen : report.after.energy;
  const produced = food ? report.foodProduced : oxygen ? report.oxygenProduced : report.solar;
  return { id: 'report', title: 'tut.report.h', body: food ? 'tut.report.food' : oxygen ? 'tut.report.oxygen' : 'tut.report.energy',
    params: { produced, value }, target: 'report', stage: [7, 7], mood: 'happy' };
}
