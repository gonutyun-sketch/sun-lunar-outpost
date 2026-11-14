/**
 * Difficulty modes (Easy / Normal / Hard) — one shared engine, per-mode parameters.
 *
 * `missionFor(id)` returns the shared mission config with a few FICTIONAL gameplay values overridden
 * (starting supplies, crew use, emergency damage, upgrade cost, rover-failure cost). Nothing that comes
 * from NASA (src/data/site.json: location, average sunlit fraction, units, sources) is ever changed, and
 * neither are the shift sunlight scenario, the solar panel output or the research goal: the Moon is the
 * same in every mode, only the training base is more or less forgiving.
 *
 * Hard keeps exactly the rules of the original single-difficulty game (players said it was hard), so
 * saves made before difficulties existed are restored as Hard without any change in rules.
 */
import raw from '../data/mission.json';
import site from '../data/site.json';
import type { MissionConfig, Resources, UpgradeId } from './types';

export type DifficultyId = 'easy' | 'normal' | 'hard';
export const DIFFICULTY_IDS: DifficultyId[] = ['easy', 'normal', 'hard'];
/** Recommended for first-time players (pre-selected on the difficulty screen). */
export const DEFAULT_DIFFICULTY: DifficultyId = 'easy';
/** Saves from before difficulties existed used exactly the Hard rules. */
export const LEGACY_DIFFICULTY: DifficultyId = 'hard';

export const isDifficulty = (x: unknown): x is DifficultyId => typeof x === 'string' && (DIFFICULTY_IDS as string[]).includes(x);

/** Fictional base-game values that differ between modes. */
export interface BaseTuning {
  initial: Pick<Resources, 'energy' | 'oxygen' | 'food'>;
  crew: { oxygenUse: number; foodUse: number };
  /** Multiplies emergency damage (radiation, working through a storm, the dust EVA). */
  eventDamage: number;
  upgradeCost: Record<UpgradeId, number>;
  /** Cost of each failed rover attempt, and the Mission 2 leak per shift until it is repaired. */
  roverFailEnergy: number;
  roverFailOxygen: number;
  oxygenLeak: number;
}

/** Fictional rover/minigame values that differ between modes (movement and collisions never change). */
export interface RoverTuning {
  batteryStart: number;
  /** Multiplies every battery drain (sunlight, shadow, deep shadow, driving). Charging is unchanged. */
  drainScale: number;
  /** Battery per circuit rotation. */
  rotateCost: number;
  /** Mission 2: widens every gauge's target band by this many points on each side. */
  pressureBandPad: number;
  /** Mission 2: seconds all gauges must stay in band. */
  pressureHold: number;
  /** Mission 2: how strongly holding a valve too long makes the pressure wobble. */
  wobbleScale: number;
  /** Mission 1: 'path' shows the target wiring faintly; 'count' says how many tiles are still wrong; 'none'. */
  circuitHint: 'path' | 'count' | 'none';
  /** Mission 3: big warning when entering a shadow, and a guide to the charging pad when the battery is low. */
  shadowAlerts: boolean;
  /** Show the charging pad as a marker when the battery falls below this level (0 = never). */
  chargeGuideBelow: number;
}

/** How much the game explains. */
export interface HelpTuning {
  /** Coach tips in the base screen: 'guided' (all shifts), 'intro' (first shifts only), 'off'. */
  coach: 'guided' | 'intro' | 'off';
  /** Warning wording: friendly explanation, situation + expected result, or numbers only. */
  tone: 'friendly' | 'standard' | 'brief';
}

export interface DifficultyConfig {
  id: DifficultyId;
  base: BaseTuning;
  rover: RoverTuning;
  help: HelpTuning;
}

/** Original values (Hard) — read from mission.json so the two can never drift apart. */
const HARD_BASE: BaseTuning = {
  initial: { energy: raw.initial.energy, oxygen: raw.initial.oxygen, food: raw.initial.food },
  crew: { ...raw.crew },
  eventDamage: 1,
  upgradeCost: { solar: raw.upgrades.solar.energyCost, oxygen: raw.upgrades.oxygen.energyCost, battery: raw.upgrades.battery.energyCost },
  roverFailEnergy: 8,
  roverFailOxygen: 5,
  oxygenLeak: 4,
};

/**
 * Values chosen from the balance simulations in src/game/balance.test.ts (see PROGRESS.md):
 * Easy — a careful beginner wins comfortably and survives several mistakes, random clicking still loses.
 * Normal — sensible play wins, a few mistakes are survivable, upgrades and repairs clearly matter.
 * Hard — the original rules.
 */
export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  easy: {
    id: 'easy',
    base: {
      initial: { energy: 64, oxygen: 74, food: 78 },
      crew: { oxygenUse: 13, foodUse: 11 },
      eventDamage: 0.6,
      upgradeCost: { solar: 14, oxygen: 9, battery: 8 },
      roverFailEnergy: 4,
      roverFailOxygen: 2,
      oxygenLeak: 2,
    },
    rover: { batteryStart: 100, drainScale: 0.6, rotateCost: 0.25, pressureBandPad: 4, pressureHold: 2, wobbleScale: 0.5, circuitHint: 'path', shadowAlerts: true, chargeGuideBelow: 45 },
    help: { coach: 'guided', tone: 'friendly' },
  },
  normal: {
    id: 'normal',
    base: {
      initial: { energy: 60, oxygen: 72, food: 76 },
      crew: { oxygenUse: 14, foodUse: 12 },
      eventDamage: 0.8,
      upgradeCost: { solar: 17, oxygen: 11, battery: 9 },
      roverFailEnergy: 6,
      roverFailOxygen: 4,
      oxygenLeak: 4,
    },
    rover: { batteryStart: 90, drainScale: 0.8, rotateCost: 0.4, pressureBandPad: 2, pressureHold: 2.5, wobbleScale: 0.75, circuitHint: 'count', shadowAlerts: true, chargeGuideBelow: 30 },
    help: { coach: 'intro', tone: 'standard' },
  },
  hard: {
    id: 'hard',
    base: HARD_BASE,
    rover: { batteryStart: 80, drainScale: 1, rotateCost: 0.5, pressureBandPad: 0, pressureHold: 3, wobbleScale: 1, circuitHint: 'none', shadowAlerts: false, chargeGuideBelow: 0 },
    help: { coach: 'off', tone: 'brief' },
  },
};

export function difficultyOf(id: DifficultyId | undefined): DifficultyConfig {
  return DIFFICULTIES[id && isDifficulty(id) ? id : LEGACY_DIFFICULTY];
}

/** Build a mission config from the shared rules and one set of base tuning values (pure). */
export function buildMission(tune: BaseTuning, id: DifficultyId): MissionConfig {
  const base = raw as unknown as Omit<MissionConfig, 'site' | 'difficulty'>;
  const dmg = (v: number) => Math.round(v * tune.eventDamage);
  return {
    ...base,
    difficulty: id,
    // NASA-derived site data: shared object, never modified
    site: site as MissionConfig['site'],
    initial: { ...base.initial, ...tune.initial },
    crew: { ...tune.crew },
    upgrades: {
      solar: { ...base.upgrades.solar, energyCost: tune.upgradeCost.solar },
      oxygen: { ...base.upgrades.oxygen, energyCost: tune.upgradeCost.oxygen },
      battery: { ...base.upgrades.battery, energyCost: tune.upgradeCost.battery },
    },
    events: base.events.map((e) => ({
      ...e,
      ...(e.radiation ? { radiation: { damage: dmg(e.radiation.damage) } } : {}),
      choices: e.choices.map((c) => ({
        ...c,
        ...(c.radiationDamage !== undefined ? { radiationDamage: dmg(c.radiationDamage) } : {}),
        ...(c.health !== undefined && c.health < 0 ? { health: -dmg(-c.health) } : {}),
      })),
    })),
    expeditions: base.expeditions.map((x) => ({
      ...x,
      failEnergyCost: tune.roverFailEnergy,
      ...(x.failOxygenCost !== undefined ? { failOxygenCost: tune.roverFailOxygen } : {}),
      ...(x.oxygenLeak !== undefined ? { oxygenLeak: tune.oxygenLeak } : {}),
    })),
  };
}

const CACHE = new Map<DifficultyId, MissionConfig>();
/** Mission config for a difficulty (memoised: the same object every call). */
export function missionFor(id: DifficultyId | undefined): MissionConfig {
  const d = difficultyOf(id);
  let cfg = CACHE.get(d.id);
  if (!cfg) { cfg = buildMission(d.base, d.id); CACHE.set(d.id, cfg); }
  return cfg;
}
