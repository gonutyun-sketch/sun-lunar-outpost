/**
 * Pure simulation engine for SUN: Lunar Outpost.
 * No React / DOM imports — every function here is deterministic and unit-tested.
 * Base rules follow GDD v1.0 §3–9; v2 adds upgrades, interactive emergencies and chapters.
 */
import type {
  EventChoice,
  ExpeditionConfig,
  Facilities,
  FacilityId,
  FailReason,
  GameState,
  MissionConfig,
  MissionEvent,
  Resources,
  ScoreBreakdown,
  ShiftConfig,
  ShiftOutcome,
  UpgradeId,
  Upgrades,
  Warning,
} from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const NO_UPGRADES: Upgrades = { solar: false, oxygen: false, battery: false };

export function createInitialState(cfg: MissionConfig): GameState {
  return {
    shift: 1,
    resources: { ...cfg.initial },
    facilities: { oxygen: true, greenhouse: false, shelter: false, lab: false },
    upgrades: { ...NO_UPGRADES },
    build: null,
    choice: null,
    expeditionsDone: [],
    expeditionFails: 0,
    status: 'playing',
    history: [],
  };
}

export function getShiftConfig(cfg: MissionConfig, shift: number): ShiftConfig {
  const s = cfg.shifts.find((x) => x.shift === shift);
  if (!s) throw new Error(`No configuration for shift ${shift}`);
  return s;
}

/** Emergency resolved in this shift. */
export function getEvent(cfg: MissionConfig, shift: number): MissionEvent | undefined {
  return cfg.events.find((e) => e.shift === shift);
}
/** Emergency forecast during this shift (resolves next shift). */
export function getForecast(cfg: MissionConfig, shift: number): MissionEvent | undefined {
  return cfg.events.find((e) => e.warnShift === shift);
}
export function getChoice(cfg: MissionConfig, shift: number, choiceId: string | null): EventChoice | undefined {
  return choiceId ? getEvent(cfg, shift)?.choices.find((c) => c.id === choiceId) : undefined;
}
export function getChapter(cfg: MissionConfig, shift: number): number {
  return cfg.chapters.find((c) => shift >= c.from && shift <= c.to)?.id ?? 1;
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

/** Solar generation = round(peak output × shift sunlight × event multiplier). Upgrade raises peak output. */
export function solarGeneration(cfg: MissionConfig, shift: number, upgrades: Upgrades = NO_UPGRADES, mult = 1): number {
  const peak = cfg.solar.basePeakOutput + (upgrades.solar ? cfg.upgrades.solar.bonus ?? 0 : 0);
  // toFixed guards against binary float error (e.g. 30 × 0.35 = 10.4999…) so .5 always rounds up.
  return Math.round(Number((peak * shiftSunlight(cfg, shift) * mult).toFixed(6)));
}

/** Total solar energy over the whole scenario if the base sat at a site with the given average sunlit fraction. */
export function totalSolarWithSiteFraction(cfg: MissionConfig, fraction: number): number {
  const alt = { ...cfg, site: { ...cfg.site, averageSunlitFraction: fraction } };
  return cfg.shifts.reduce((sum, s) => sum + solarGeneration(alt, s.shift), 0);
}

export function batteryCapacity(cfg: MissionConfig, upgrades: Upgrades): number {
  return cfg.capacity.energy + (upgrades.battery ? cfg.upgrades.battery.bonus ?? 0 : 0);
}

export function facilityCost(cfg: MissionConfig, id: FacilityId, upgrades: Upgrades = NO_UPGRADES): number {
  if (id === 'oxygen' && upgrades.oxygen) return cfg.upgrades.oxygen.energyCostAfter ?? cfg.facilities.oxygen.energyCost;
  return cfg.facilities[id].energyCost;
}

export function oxygenOutput(cfg: MissionConfig, upgrades: Upgrades): number {
  return upgrades.oxygen ? cfg.upgrades.oxygen.producesAfter ?? cfg.facilities.oxygen.produces : cfg.facilities.oxygen.produces;
}

/** Lab cannot run once all milestones are complete; event choices may lock facilities this shift. */
export function isFacilityAvailable(state: GameState, cfg: MissionConfig, id: FacilityId): boolean {
  if (getChoice(cfg, state.shift, state.choice)?.disable?.includes(id)) return false;
  if (id === 'lab') return state.resources.research < cfg.capacity.research;
  return true;
}

/** Facility switched on by this shift's emergency decision (cannot be turned off this shift). */
export function isForcedOn(state: GameState, cfg: MissionConfig, id: FacilityId): boolean {
  return !!getChoice(cfg, state.shift, state.choice)?.enable?.includes(id);
}

export function canBuild(state: GameState, cfg: MissionConfig, id: UpgradeId): boolean {
  return state.status === 'playing' && !state.upgrades[id] && state.shift >= cfg.upgradeUnlockShift && state.shift < cfg.totalShifts;
}

export interface ShiftContext {
  upgrades?: Upgrades;
  build?: UpgradeId | null;
  choice?: string | null;
  /** Solar array damaged by an unfinished expedition (multiplies solar output). */
  damageMult?: number;
}

/** Expedition that can be launched now (available and not yet completed). */
export function activeExpedition(state: GameState, cfg: MissionConfig): ExpeditionConfig | undefined {
  if (state.status !== 'playing') return undefined;
  return cfg.expeditions.find((e) => state.shift >= e.fromShift && !state.expeditionsDone.includes(e.id));
}

/** Solar output multiplier from damage that an expedition has not repaired yet. */
export function solarDamageMult(state: GameState, cfg: MissionConfig): number {
  return cfg.expeditions
    .filter((e) => e.solarMult !== undefined && state.shift >= e.fromShift && !state.expeditionsDone.includes(e.id))
    .reduce((m, e) => m * (e.solarMult ?? 1), 1);
}

/**
 * Apply the result of a rover expedition to the base. Base time does not pass during an expedition.
 * Each failed attempt costs base energy (crew recovers the rover); success removes the damage.
 */
export function applyExpedition(state: GameState, cfg: MissionConfig, id: string, result: { success: boolean; failures: number }): GameState {
  const exp = cfg.expeditions.find((e) => e.id === id);
  if (!exp || state.status !== 'playing' || state.expeditionsDone.includes(id)) return state;
  const cost = exp.failEnergyCost * Math.max(0, result.failures);
  return {
    ...state,
    resources: { ...state.resources, energy: Math.max(0, state.resources.energy - cost) },
    expeditionsDone: result.success ? [...state.expeditionsDone, id] : state.expeditionsDone,
    expeditionFails: state.expeditionFails + Math.max(0, result.failures),
  };
}

/**
 * Simulate one shift. Used both for the live projection and for actual execution,
 * so the preview always matches the result.
 */
export function simulateShift(
  cfg: MissionConfig,
  shift: number,
  before: Resources,
  facilities: Facilities,
  ctx: ShiftContext = {},
): ShiftOutcome {
  const sc = getShiftConfig(cfg, shift);
  const upgrades = ctx.upgrades ?? NO_UPGRADES;
  const event = getEvent(cfg, shift);
  const choice = event ? getChoice(cfg, shift, ctx.choice ?? null) : undefined;
  const cap = cfg.capacity;
  const capacity = batteryCapacity(cfg, upgrades);

  // Facilities that can run this shift (event choices may lock some, or switch some on).
  const ran: Facilities = { ...facilities };
  for (const id of choice?.enable ?? []) ran[id] = true;
  for (const id of choice?.disable ?? []) ran[id] = false;
  if (before.research >= cap.research) ran.lab = false;

  // 1–2. Solar production, charge battery up to capacity.
  const damageMult = ctx.damageMult ?? 1;
  const solar = solarGeneration(cfg, shift, upgrades, (choice?.solarMult ?? 1) * damageMult);
  const sunlight = shiftSunlight(cfg, shift);
  const available = Math.min(capacity, before.energy + solar);

  // 3. Demand.
  const breakdown: ShiftOutcome['demandBreakdown'] = [{ id: 'habitat', cost: cfg.habitat.energyCost }];
  (Object.keys(cfg.facilities) as FacilityId[]).forEach((id) => {
    if (ran[id]) breakdown.push({ id, cost: facilityCost(cfg, id, upgrades) });
  });
  if (choice?.energyCost) breakdown.push({ id: 'event', cost: choice.energyCost });
  const build = ctx.build && !upgrades[ctx.build] ? ctx.build : undefined;
  if (build) breakdown.push({ id: 'build', cost: cfg.upgrades[build].energyCost });
  const demand = breakdown.reduce((s, b) => s + b.cost, 0);

  const habitatPowerFailure = available < cfg.habitat.energyCost;
  const optionalDeficit = habitatPowerFailure ? 0 : Math.max(0, demand - available);
  const needsChoice = !!event && !choice;

  // 4. Deduct demand (never negative). On habitat failure, the battery is drained and nothing else runs.
  const energy = habitatPowerFailure ? 0 : Math.max(0, available - demand);
  const running = (id: FacilityId) => ran[id] && !habitatPowerFailure;

  // Oxygen & food
  const oxygenProduced = running('oxygen') ? Math.round(oxygenOutput(cfg, upgrades) * (choice?.oxygenProdMult ?? 1)) : 0;
  const foodProduced = running('greenhouse') ? cfg.facilities.greenhouse.produces : 0;
  const oxygen = clamp(before.oxygen + oxygenProduced - cfg.crew.oxygenUse, 0, cap.oxygen);
  const food = clamp(before.food + foodProduced - cfg.crew.foodUse + (choice?.food ?? 0), 0, cap.food);

  // Radiation & other health effects
  let radiation: ShiftOutcome['radiation'] = 'none';
  let radiationDamage = 0;
  if (event?.radiation) {
    if (choice?.useShelter && running('shelter')) radiation = 'protected';
    else if (choice && !choice.useShelter) {
      radiation = 'partial';
      radiationDamage = choice.radiationDamage ?? event.radiation.damage;
    } else {
      radiation = 'exposed';
      radiationDamage = event.radiation.damage;
    }
  }
  const health = clamp(before.health - radiationDamage + (choice?.health ?? 0), 0, cap.health);

  // Research
  const researchGained = running('lab') && before.research < cap.research ? 1 : 0;

  return {
    shift,
    illumination: sunlight,
    scenarioModifier: sc.scenarioModifier,
    solar,
    solarDamaged: damageMult < 1,
    capacity,
    available,
    demand,
    demandBreakdown: breakdown,
    habitatPowerFailure,
    optionalDeficit,
    needsChoice,
    eventId: event?.id,
    choiceId: choice?.id,
    ran,
    oxygenProduced,
    foodProduced,
    radiation,
    radiationDamage,
    researchGained,
    built: habitatPowerFailure ? undefined : build,
    before: { ...before },
    after: { energy, oxygen, food, health, research: before.research + researchGained },
  };
}

export function projectCurrentShift(state: GameState, cfg: MissionConfig): ShiftOutcome {
  return simulateShift(cfg, state.shift, state.resources, state.facilities, {
    upgrades: state.upgrades,
    build: state.build,
    choice: state.choice,
    damageMult: solarDamageMult(state, cfg),
  });
}

/** Player may advance unless optional systems exceed available power or an emergency still needs a decision. */
export function canAdvance(outcome: ShiftOutcome): boolean {
  return outcome.optionalDeficit === 0 && !outcome.needsChoice;
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
  // A decision that requires a facility (e.g. "Shelter the crew") keeps it locked ON for this shift.
  if (state.facilities[id] && isForcedOn(state, cfg, id)) return state;
  return { ...state, facilities: { ...state.facilities, [id]: !state.facilities[id] } };
}

/** Queue (or un-queue) one upgrade for construction this shift. */
export function toggleBuild(state: GameState, cfg: MissionConfig, id: UpgradeId): GameState {
  if (!canBuild(state, cfg, id)) return state;
  return { ...state, build: state.build === id ? null : id };
}

/** Pick a decision for this shift's emergency. Choices that need a facility switch it on; locked ones switch off. */
export function chooseOption(state: GameState, cfg: MissionConfig, choiceId: string): GameState {
  if (state.status !== 'playing') return state;
  const choice = getEvent(cfg, state.shift)?.choices.find((c) => c.id === choiceId);
  if (!choice) return state;
  const facilities = { ...state.facilities };
  for (const id of choice.enable ?? []) facilities[id] = true;
  for (const id of choice.disable ?? []) facilities[id] = false;
  return { ...state, choice: choiceId, facilities };
}

/** Execute the current shift. Returns the same state if the turn is not allowed. */
export function advanceShift(state: GameState, cfg: MissionConfig): GameState {
  if (state.status !== 'playing') return state;
  const outcome = projectCurrentShift(state, cfg);
  if (!canAdvance(outcome)) return state;

  const history = [...state.history, { ...outcome, facilities: { ...state.facilities } }];
  const failReason = evaluateFailure(cfg, outcome);
  const upgrades = outcome.built ? { ...state.upgrades, [outcome.built]: true } : state.upgrades;
  const base = { ...state, resources: outcome.after, history, upgrades, build: null, choice: null };
  if (failReason) return { ...base, status: 'failed', failReason };

  // Lab switches off automatically once all milestones are complete.
  const facilities = outcome.after.research >= cfg.capacity.research ? { ...state.facilities, lab: false } : state.facilities;

  if (state.shift >= cfg.totalShifts) {
    const status = outcome.after.research >= cfg.capacity.research ? 'success' : 'partial';
    return { ...base, facilities, status };
  }
  return { ...base, facilities, shift: state.shift + 1 };
}

/** Warnings shown before the player confirms the turn. */
export function getWarnings(state: GameState, cfg: MissionConfig, o: ShiftOutcome): Warning[] {
  const w: Warning[] = [];
  const event = getEvent(cfg, state.shift);

  if (o.needsChoice) w.push({ level: 'critical', code: 'choiceNeeded', text: 'An emergency needs your decision before the shift can run.' });
  if (o.habitatPowerFailure) {
    w.push({
      level: 'critical',
      code: 'habitatFail',
      params: { available: o.available, habitat: cfg.habitat.energyCost },
      text: `Battery + solar (${o.available}) cannot cover the Main Habitat (${cfg.habitat.energyCost}). Advancing will end the mission.`,
    });
  } else if (o.optionalDeficit > 0) {
    w.push({
      level: 'critical',
      code: 'deficit',
      params: { deficit: o.optionalDeficit, demand: o.demand, available: o.available },
      text: `Power deficit of ${o.optionalDeficit}: switch off systems before advancing (need ${o.demand}, have ${o.available}).`,
    });
  }
  if (event?.radiation && o.choiceId && o.radiation === 'exposed') {
    w.push({ level: 'critical', code: 'radNoShelter', params: { dmg: event.radiation.damage }, text: `The shelter is OFF. Crew health will drop by ${event.radiation.damage}.` });
  }
  if (o.after.oxygen <= 0) w.push({ level: 'critical', code: 'o2Out', text: 'Oxygen will run out this shift.' });
  else if (o.after.oxygen <= 20) w.push({ level: 'caution', code: 'o2Low', params: { v: o.after.oxygen }, text: `Oxygen will be low (${o.after.oxygen}).` });
  if (o.after.food <= 0) w.push({ level: 'critical', code: 'foodOut', text: 'Food will run out this shift.' });
  else if (o.after.food <= 20) w.push({ level: 'caution', code: 'foodLow', params: { v: o.after.food }, text: `Food will be low (${o.after.food}).` });

  if (!o.habitatPowerFailure && o.optionalDeficit === 0 && state.shift < cfg.totalShifts) {
    const nextUpg = o.built ? { ...state.upgrades, [o.built]: true } : state.upgrades;
    const nextSolar = solarGeneration(cfg, state.shift + 1, nextUpg);
    if (o.after.energy + nextSolar < cfg.habitat.energyCost) {
      w.push({
        level: 'critical',
        code: 'nextHabitat',
        params: { energy: o.after.energy, solar: nextSolar, habitat: cfg.habitat.energyCost },
        text: `Next shift: battery ${o.after.energy} + solar ${nextSolar} will not power the habitat (${cfg.habitat.energyCost}).`,
      });
    } else if (o.after.energy < 15) {
      w.push({ level: 'caution', code: 'batteryLow', params: { v: o.after.energy }, text: `Battery reserve will be very low (${o.after.energy}).` });
    }
  }
  return w;
}

/** Scoring (max 100): survival 40, research 30 (scaled to the goal), crew safety 20, energy reserve 10. */
export function computeScore(state: GameState, cfg: MissionConfig): ScoreBreakdown {
  const survived = state.status === 'success' || state.status === 'partial';
  const survival = survived ? 40 : 0;
  const research = Math.round((30 * Math.min(cfg.capacity.research, state.resources.research)) / cfg.capacity.research);
  const safety = Math.round((20 * clamp(state.resources.health, 0, 100)) / 100);
  const energy = Math.round((10 * Math.min(30, Math.max(0, state.resources.energy))) / 30);
  const total = clamp(survival + research + safety + energy, 0, 100);
  const grade = total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 60 ? 'C' : total >= 40 ? 'D' : 'F';
  return { survival, research, safety, energy, total, grade };
}
