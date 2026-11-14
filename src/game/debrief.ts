/**
 * Pure helpers that turn a finished mission into educational observations (GDD §9, §10).
 * Text comes from the i18n dictionaries via the translator `t`; the logic is unchanged.
 */
import { shiftSunlight } from './engine';
import type { T } from '../i18n/translate';
import type { GameState, MissionConfig } from './types';

export function missionTitle(state: GameState, t: T): string {
  if (state.status === 'success') return t('results.success');
  if (state.status === 'partial') return t('results.partial');
  return t('results.failed');
}

export function missionSummary(state: GameState, cfg: MissionConfig, t: T): string {
  if (state.status === 'failed' && state.failReason) {
    return t('results.sumFail', { reason: t(`fail.${state.failReason}`), n: state.history.length });
  }
  if (state.status === 'partial') {
    return t('results.sumPartial', { shifts: cfg.totalShifts, r: state.resources.research, max: cfg.capacity.research });
  }
  return t('results.sumSuccess', { shifts: cfg.totalShifts, max: cfg.capacity.research });
}

export function takeaways(state: GameState, cfg: MissionConfig, t: T): string[] {
  const out: string[] = [];
  const h = state.history;

  // 1. Primary lesson: failure cause, or power planning.
  if (state.status === 'failed' && state.failReason) {
    out.push(t(`lesson.${state.failReason}`));
  } else {
    const minBattery = h.length ? Math.min(...h.map((r) => r.after.energy)) : state.resources.energy;
    const darkest = [...cfg.shifts].sort((a, b) => a.scenarioModifier - b.scenarioModifier)[0];
    out.push(
      t('take.power', {
        min: minBattery,
        site: Math.round(cfg.site.averageSunlitFraction * 100),
        shift: darkest.shift,
        pct: Math.round(shiftSunlight(cfg, darkest.shift) * 100),
      }),
    );
  }

  // 2. Radiation
  const radiationShifts = h.filter((r) => r.radiation !== 'none');
  const exposed = radiationShifts.filter((r) => r.radiation === 'exposed').length;
  if (radiationShifts.length === 0) out.push(t('take.radNone'));
  else if (exposed === 0) out.push(t(radiationShifts.length === 1 ? 'take.radSafe1' : 'take.radSafeN', { n: radiationShifts.length }));
  else out.push(t(exposed === 1 ? 'take.radHit1' : 'take.radHitN', { n: exposed }));

  // 3. Science vs survival trade-off
  const r = state.resources.research;
  out.push(r >= cfg.capacity.research ? t('take.researchDone') : t('take.researchPart', { r, max: cfg.capacity.research }));
  return out;
}
