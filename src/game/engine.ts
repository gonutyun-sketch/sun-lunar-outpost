/**
 * Pure simulation engine for SUN: Lunar Outpost.
 * No React / DOM imports — every function here is deterministic and unit-tested.
 * Rules follow Game Design Document v1.0, sections 3–9.
 */
import type {
  Facilities,
  FacilityId,
  FailReason,
  GameState,
  MissionConfig,
  Resources,
  ScoreBreakdown,
  ShiftConfig,
  ShiftOutcome,
  Warning,
} from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const FACILITY_LABELS: Record<FacilityId, string> = {
  oxygen: 'Oxygen Recycling',
  greenhouse: 'Hydroponic Greenhouse',
  shelter: 'Radiation Shelter',
  lab: 'Science Laboratory',
};

export function createInitialState(cfg: MissionConfig): GameState {
  return {
    shift: 1,
    resources: { ...cfg.initial },
    facilities: { oxygen: true, greenhouse: false, shelter: false, lab: false },
    status: 'playing',
    history: [],
  };
}

export function getShiftConfig(cfg: MissionConfig, shift: number): ShiftConfig {
  const s = cfg.shifts.find((x) => x.shift === shift);
  if (!s) throw new Error(`No configuration for shift ${shift}`);
  return s;
}

/**
 * Fraction of this shift with sunlight on the panels:
 *   NASA LRO/LOLA long-term average sunlit fraction for the site (src/data/site.json)
 *   × FICTIONAL training-scenario modifier for the shift, capped at 1.
 */
export function shiftSunlight(cfg: MissionConfig, shift: number): number {
  const f = cfg.site.averageSunlitFraction * getShiftConfig(cfg, shift).scenarioModifier;
  return Number(Math.min(1, f).toFixed(4));
}

/** GDD §5: Solar generation = round(basePeakOutput × shift sunlight fraction). */
export function solarGeneration(cfg: MissionConfig, shift: number): number {
  // toFixed guards against binary float error (e.g. 30 × 0.35 = 10.4999…) so .5 always rounds up.
  return Math.round(Number((cfg.solar.basePeakOutput * shiftSunlight(cfg, shift)).toFixed(6)));
}

export function facilityCost(cfg: MissionConfig, id: FacilityId): number {
  return cfg.facilities[id].energyCost;
}

/** Lab cannot run once all milestones are complete. */
export function isFacilityAvailable(state: GameState, cfg: MissionConfig, id: FacilityId): boolean {
  if (id === 'lab') return state.resources.research < cfg.capacity.research;
  return true;
}

export function energyDemand(cfg: MissionConfig, facilities: Facilities) {
  const breakdown: { label: string; cost: number }[] = [
    { label: 'Main Habitat', cost: cfg.habitat.energyCost },
  ];
  (Object.keys(cfg.facilities) as FacilityId[]).forEach((id) => {
    if (facilities[id]) breakdown.push({ label: FACILITY_LABELS[id], cost: facilityCost(cfg, id) });
  });
  return { total: breakdown.reduce((s, b) => s + b.cost, 0), breakdown };
}

/**
 * Simulate one shift (GDD §7 steps 7–8). Used both for the live projection
 * and for actual execution so the preview always matches the result.
 */
export function simulateShift(
  cfg: MissionConfig,
  shift: number,
  before: Resources,
  facilities: Facilities,
): ShiftOutcome {
  const sc = getShiftConfig(cfg, shift);
  const cap = cfg.capacity;
  const explanations: string[] = [];

  // 1–2. Solar production, charge battery up to capacity.
  const solar = solarGeneration(cfg, shift);
  const sunlight = shiftSunlight(cfg, shift);
  const available = Math.min(cap.energy, before.energy + solar);
  const wasted = before.energy + solar - available;
  explanations.push(
    `Solar panels generated ${solar} energy (sunlight for ${Math.round(sunlight * 100)}% of the shift)` +
      (wasted > 0 ? `; ${wasted} was lost because the battery was full.` : '.'),
  );

  // 3. Demand of all enabled facilities.
  const { total: demand, breakdown } = energyDemand(cfg, facilities);
  const habitatPowerFailure = available < cfg.habitat.energyCost;
  const optionalDeficit = habitatPowerFailure ? 0 : Math.max(0, demand - available);

  // 4. Deduct demand (never negative). On habitat failure, the battery is drained.
  const energy = habitatPowerFailure ? 0 : Math.max(0, available - demand);
  explanations.push(`Base systems used ${habitatPowerFailure ? available : demand} energy.`);
  if (habitatPowerFailure) {
    explanations.push('Not enough power to keep the Main Habitat running — life support shut down.');
  }

  const running = (id: FacilityId) => facilities[id] && !habitatPowerFailure;

  // Oxygen
  const oxyProd = running('oxygen') ? cfg.facilities.oxygen.produces : 0;
  const oxygen = clamp(before.oxygen + oxyProd - cfg.crew.oxygenUse, 0, cap.oxygen);
  explanations.push(
    oxyProd > 0
      ? `Oxygen recycling produced +${oxyProd}; the crew breathed −${cfg.crew.oxygenUse}.`
      : `Oxygen recycling was off; the crew breathed −${cfg.crew.oxygenUse}.`,
  );

  // Food
  const foodProd = running('greenhouse') ? cfg.facilities.greenhouse.produces : 0;
  const food = clamp(before.food + foodProd - cfg.crew.foodUse, 0, cap.food);
  explanations.push(
    foodProd > 0
      ? `The greenhouse grew +${foodProd} food; the crew ate −${cfg.crew.foodUse}.`
      : `The greenhouse was off; the crew ate −${cfg.crew.foodUse}.`,
  );

  // Radiation event
  let health = before.health;
  let radiation: ShiftOutcome['radiation'] = 'none';
  if (sc.event === 'radiation') {
    if (running('shelter')) {
      radiation = 'protected';
      explanations.push('Solar radiation alert! The crew sheltered in time and stayed safe.');
    } else {
      radiation = 'exposed';
      health = clamp(health - cfg.radiation.healthDamage, 0, cap.health);
      explanations.push(
        `Solar radiation alert! The shelter was not active — crew health −${cfg.radiation.healthDamage}.`,
      );
    }
  }

  // Research
  const researchGained = running('lab') && before.research < cap.research ? 1 : 0;
  if (researchGained) explanations.push('The laboratory completed a research milestone.');

  return {
    shift,
    illumination: sunlight,
    scenarioModifier: sc.scenarioModifier,
    solar,
    available,
    demand,
    demandBreakdown: breakdown,
    habitatPowerFailure,
    optionalDeficit,
    radiation,
    researchGained,
    before: { ...before },
    after: { energy, oxygen, food, health, research: before.research + researchGained },
    explanations,
  };
}

export function projectCurrentShift(state: GameState, cfg: MissionConfig): ShiftOutcome {
  return simulateShift(cfg, state.shift, state.resources, state.facilities);
}

/** Player may advance unless optional systems exceed available power (GDD §5.6). */
export function canAdvance(outcome: ShiftOutcome): boolean {
  return outcome.optionalDeficit === 0;
}

export function evaluateFailure(cfg: MissionConfig, o: ShiftOutcome): FailReason | undefined {
  if (o.habitatPowerFailure) return 'power';
  if (o.after.oxygen <= 0) return 'oxygen';
  if (o.after.food <= 0) return 'food';
  if (o.after.health < cfg.failure.minHealth) return 'health';
  return undefined;
}

export function toggleFacility(state: GameState, cfg: MissionConfig, id: FacilityId): GameState {
  if (state.status !== 'playing') return state;
  if (!state.facilities[id] && !isFacilityAvailable(state, cfg, id)) return state;
  return { ...state, facilities: { ...state.facilities, [id]: !state.facilities[id] } };
}

/** Execute the current shift. Returns the same state if the turn is not allowed. */
export function advanceShift(state: GameState, cfg: MissionConfig): GameState {
  if (state.status !== 'playing') return state;
  const outcome = projectCurrentShift(state, cfg);
  if (!canAdvance(outcome)) return state;

  const history = [...state.history, { ...outcome, facilities: { ...state.facilities } }];
  const failReason = evaluateFailure(cfg, outcome);
  if (failReason) {
    return { ...state, resources: outcome.after, history, status: 'failed', failReason };
  }

  const resources = outcome.after;
  // Lab switches off automatically once all milestones are complete.
  const facilities =
    resources.research >= cfg.capacity.research ? { ...state.facilities, lab: false } : state.facilities;

  if (state.shift >= cfg.totalShifts) {
    const status = resources.research >= cfg.capacity.research ? 'success' : 'partial';
    return { ...state, resources, facilities, history, status };
  }
  return { ...state, shift: state.shift + 1, resources, facilities, history };
}

/** Warnings shown before the player confirms the turn (GDD §7 step 5). */
export function getWarnings(state: GameState, cfg: MissionConfig, o: ShiftOutcome): Warning[] {
  const w: Warning[] = [];
  const sc = getShiftConfig(cfg, state.shift);

  if (o.habitatPowerFailure) {
    w.push({
      level: 'critical',
      text: `Battery + solar (${o.available}) cannot cover the Main Habitat (${cfg.habitat.energyCost}). Advancing will end the mission.`,
    });
  } else if (o.optionalDeficit > 0) {
    w.push({
      level: 'critical',
      text: `Power deficit of ${o.optionalDeficit}: switch off systems before advancing (need ${o.demand}, have ${o.available}).`,
    });
  }
  if (sc.event === 'radiation' && !state.facilities.shelter) {
    w.push({ level: 'critical', text: 'Radiation alert this shift — the shelter is OFF. Crew health will drop by 35.' });
  }
  if (o.after.oxygen <= 0) w.push({ level: 'critical', text: 'Oxygen will run out this shift.' });
  else if (o.after.oxygen <= 20) w.push({ level: 'caution', text: `Oxygen will be low (${o.after.oxygen}).` });
  if (o.after.food <= 0) w.push({ level: 'critical', text: 'Food will run out this shift.' });
  else if (o.after.food <= 20) w.push({ level: 'caution', text: `Food will be low (${o.after.food}).` });

  if (!o.habitatPowerFailure && o.optionalDeficit === 0 && state.shift < cfg.totalShifts) {
    const nextSolar = solarGeneration(cfg, state.shift + 1);
    if (o.after.energy + nextSolar < cfg.habitat.energyCost) {
      w.push({
        level: 'critical',
        text: `Next shift: battery ${o.after.energy} + solar ${nextSolar} will not power the habitat (${cfg.habitat.energyCost}).`,
      });
    } else if (o.after.energy < 15) {
      w.push({ level: 'caution', text: `Battery reserve will be very low (${o.after.energy}).` });
    }
  }
  return w;
}

/** Event briefing for the current shift (GDD §6). */
export function getEventBriefing(cfg: MissionConfig, shift: number): Warning | null {
  const sc = cfg.shifts.find((s) => s.shift === shift);
  if (!sc?.event) return null;
  if (sc.event === 'warning') {
    return {
      level: 'caution',
      text: `Space weather forecast: a solar radiation event may hit during Shift ${shift + 1}. Plan energy so the Emergency Radiation Shelter can be powered next shift.`,
    };
  }
  return {
    level: 'critical',
    text: 'SOLAR RADIATION ALERT: energetic particles are expected this shift. Activate the Emergency Radiation Shelter to protect the crew.',
  };
}

/** GDD §9 scoring. */
export function computeScore(state: GameState, cfg: MissionConfig): ScoreBreakdown {
  const survived = state.status === 'success' || state.status === 'partial';
  const survival = survived ? 40 : 0;
  const research = Math.min(cfg.capacity.research, state.resources.research) * 10;
  const safety = Math.round((20 * clamp(state.resources.health, 0, 100)) / 100);
  const energy = Math.round((10 * Math.min(30, Math.max(0, state.resources.energy))) / 30);
  const total = clamp(survival + research + safety + energy, 0, 100);
  const grade = total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 60 ? 'C' : total >= 40 ? 'D' : 'F';
  return { survival, research, safety, energy, total, grade };
}

export const FAIL_MESSAGES: Record<FailReason, { reason: string; lesson: string }> = {
  oxygen: {
    reason: 'Oxygen supply reached zero.',
    lesson:
      'Life support is the first priority on any crewed mission. Recycling systems need a steady power budget because the crew consumes oxygen every hour.',
  },
  food: {
    reason: 'Food supply reached zero.',
    lesson:
      'Growing food in space takes energy and time. Long missions must plan food production well before supplies run low.',
  },
  health: {
    reason: 'Crew health fell below the safe limit (40).',
    lesson:
      'Outside Earth’s magnetic field and atmosphere, solar particle events are a serious hazard. Shielded shelters and early warnings protect astronauts.',
  },
  power: {
    reason: 'The Main Habitat lost power.',
    lesson:
      'Near the lunar poles sunlight changes with terrain and time. Batteries must store enough energy to survive low-light periods.',
  },
};
