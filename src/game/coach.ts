/**
 * Coach tips for beginners (pure, tested). Picks at most two short, situation-based tips for the
 * current shift. Which shifts show tips depends on the difficulty (src/game/difficulty.ts):
 * Easy = every shift, Normal = the first two shifts, Hard = only when the player opens help.
 */
import { activeExpeditions, getEvent, getForecast } from './engine';
import type { GameState, MissionConfig, ShiftOutcome } from './types';

export type CoachTip =
  | 'deficit' | 'habitat' | 'event' | 'storm' | 'battery' | 'oxygenLow' | 'foodLow'
  | 'rover' | 'forecast' | 'upgrade' | 'power' | 'oxygen' | 'greenhouse' | 'lab' | 'advance';

/** Ordered by urgency; the first two that apply are shown. */
export function coachTips(state: GameState, cfg: MissionConfig, o: ShiftOutcome, max = 2): CoachTip[] {
  if (state.status !== 'playing') return [];
  const r = state.resources;
  const ev = getEvent(cfg, state.shift);
  const tips: CoachTip[] = [];
  const add = (t: CoachTip, when: boolean) => { if (when && !tips.includes(t)) tips.push(t); };
  add('habitat', o.habitatPowerFailure);
  add('deficit', o.optionalDeficit > 0);
  add('event', !!ev && !state.choice);
  add('storm', !!ev?.radiation && state.choice !== null && o.radiation !== 'protected');
  add('oxygenLow', o.after.oxygen <= 30 && !o.ran.oxygen);
  add('foodLow', o.after.food <= 30 && !o.ran.greenhouse);
  add('battery', !o.habitatPowerFailure && o.optionalDeficit === 0 && o.after.energy < 15 && state.shift < cfg.totalShifts);
  add('rover', activeExpeditions(state, cfg).length > 0);
  add('forecast', !!getForecast(cfg, state.shift));
  add('upgrade', state.shift === cfg.upgradeUnlockShift && !state.build && !Object.values(state.upgrades).some(Boolean));
  add('power', state.shift === 1);
  add('oxygen', state.shift === 1);
  add('greenhouse', r.food < 55 && !state.facilities.greenhouse);
  add('lab', state.shift >= 2 && r.research < cfg.capacity.research && !state.facilities.lab && r.energy >= 25);
  add('advance', state.shift === 1);
  return tips.slice(0, max);
}

/** Coach panel open by default? (the player can always open or close it) */
export function coachByDefault(mode: 'guided' | 'intro' | 'off', shift: number): boolean {
  return mode === 'guided' || (mode === 'intro' && shift <= 2);
}
