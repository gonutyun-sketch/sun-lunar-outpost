/** Pure helpers that turn a finished mission into educational observations (GDD §9, §10). */
import { FAIL_MESSAGES, shiftSunlight } from './engine';
import type { GameState, MissionConfig } from './types';

export function missionTitle(state: GameState): string {
  if (state.status === 'success') return 'Mission Successful';
  if (state.status === 'partial') return 'Mission Incomplete';
  return 'Mission Failed';
}

export function missionSummary(state: GameState, cfg: MissionConfig): string {
  if (state.status === 'failed' && state.failReason) {
    return `${FAIL_MESSAGES[state.failReason].reason} The mission ended during Shift ${state.history.length}.`;
  }
  if (state.status === 'partial') {
    return `The crew survived all ${cfg.totalShifts} shifts, but only ${state.resources.research} of ${cfg.capacity.research} research milestones were completed.`;
  }
  return `All ${cfg.totalShifts} shifts completed, crew safe, and all ${cfg.capacity.research} research milestones achieved.`;
}

export function takeaways(state: GameState, cfg: MissionConfig): string[] {
  const out: string[] = [];
  const h = state.history;

  // 1. Primary lesson: failure cause, or power planning.
  if (state.status === 'failed' && state.failReason) {
    out.push(FAIL_MESSAGES[state.failReason].lesson);
  } else {
    const minBattery = h.length ? Math.min(...h.map((r) => r.after.energy)) : state.resources.energy;
    const darkest = [...cfg.shifts].sort((a, b) => a.scenarioModifier - b.scenarioModifier)[0];
    const pct = Math.round(shiftSunlight(cfg, darkest.shift) * 100);
    out.push(
      `Your battery dropped as low as ${minBattery}. Even at one of the best-lit spots at the South Pole (sunlit ${Math.round(cfg.site.averageSunlitFraction * 100)}% of the time on average, NASA LRO/LOLA), the dark period in Shift ${darkest.shift} (${pct}% sunlight) shows why polar bases need energy storage.`,
    );
  }

  // 2. Radiation
  const radiationShifts = h.filter((r) => r.radiation !== 'none');
  const exposed = radiationShifts.filter((r) => r.radiation === 'exposed').length;
  if (radiationShifts.length === 0) {
    out.push(
      'Solar particle events can arrive with little warning. Space-weather forecasts give crews time to reach a shielded shelter.',
    );
  } else if (exposed === 0) {
    out.push(
      `You protected the crew in ${radiationShifts.length} radiation event${radiationShifts.length > 1 ? 's' : ''}. Acting on forecasts and keeping power in reserve for the shelter is exactly how real missions plan for space weather.`,
    );
  } else {
    out.push(
      `The crew was exposed in ${exposed} radiation event${exposed > 1 ? 's' : ''}. Without Earth’s atmosphere and magnetic field, a shielded shelter is the main defence against solar particle events.`,
    );
  }

  // 3. Science vs survival trade-off
  const r = state.resources.research;
  if (r >= cfg.capacity.research) {
    out.push(
      'You completed all research goals. Science is the reason for the mission, but every lab shift had to be balanced against life support.',
    );
  } else {
    out.push(
      `Research reached ${r}/${cfg.capacity.research}. The lab competes with life support for limited power — scheduling experiments during sunlit shifts makes room for both.`,
    );
  }
  return out;
}
