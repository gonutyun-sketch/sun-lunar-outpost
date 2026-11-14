export type FacilityId = 'oxygen' | 'greenhouse' | 'shelter' | 'lab';
export const FACILITY_IDS: FacilityId[] = ['oxygen', 'greenhouse', 'shelter', 'lab'];

export type UpgradeId = 'solar' | 'oxygen' | 'battery';
export const UPGRADE_IDS: UpgradeId[] = ['solar', 'oxygen', 'battery'];
export type Upgrades = Record<UpgradeId, boolean>;

export interface Resources {
  energy: number;
  oxygen: number;
  food: number;
  health: number;
  research: number;
}

export type Facilities = Record<FacilityId, boolean>;

export interface ShiftConfig {
  shift: number;
  /** FICTIONAL training-scenario multiplier applied to the NASA site average. */
  scenarioModifier: number;
}

/** One player choice in an emergency. All effects apply only to the event shift. */
export interface EventChoice {
  id: string;
  /** Extra energy drawn this shift (counts toward the power budget). */
  energyCost?: number;
  /** One-time resource changes applied at the end of the shift. */
  food?: number;
  health?: number;
  /** Multipliers for this shift. */
  solarMult?: number;
  oxygenProdMult?: number;
  /** Facilities that cannot run this shift. */
  disable?: FacilityId[];
  /** Facilities switched ON automatically when this choice is picked. */
  enable?: FacilityId[];
  /** Radiation events: damage taken with this choice (shelter choice uses the shelter rule instead). */
  radiationDamage?: number;
  /** Radiation events: crew is protected only if the shelter is running. */
  useShelter?: boolean;
}

/** FICTIONAL training emergency. Announced at `warnShift`, resolved at `shift`. */
export interface MissionEvent {
  id: string;
  shift: number;
  warnShift: number;
  radiation?: { damage: number };
  choices: EventChoice[];
}

export interface UpgradeConfig {
  energyCost: number;
  /** solar: added to basePeakOutput; battery: added to energy capacity. */
  bonus?: number;
  /** oxygen: new recycler energy cost and production. */
  energyCostAfter?: number;
  producesAfter?: number;
}

export interface ChapterConfig {
  id: number;
  from: number;
  to: number;
}

/** NASA LRO/LOLA-derived site record (src/data/site.json). */
export interface SiteData {
  name: string;
  baseLabel: string;
  latitude: number;
  longitude: number;
  longitudeNote: string;
  averageSunlitFraction: number;
  rawDN: number;
  nearbyComparisons: { label: string; value: number }[];
  source: {
    provider: string;
    product: string;
    productPage: string;
    dataUrl: string;
    labelUrl: string;
    projectionReference: string;
    citation: string;
    visualization: string;
  };
  units: string;
  extraction: string;
  limitations: string[];
  extractedOn: string;
}

export interface MissionConfig {
  site: SiteData;
  missionName: string;
  totalShifts: number;
  initial: Resources;
  capacity: Resources;
  solar: { basePeakOutput: number; note: string };
  habitat: { energyCost: number };
  crew: { oxygenUse: number; foodUse: number };
  facilities: {
    oxygen: { energyCost: number; produces: number };
    greenhouse: { energyCost: number; produces: number };
    shelter: { energyCost: number };
    lab: { energyCost: number };
  };
  upgrades: Record<UpgradeId, UpgradeConfig>;
  /** First shift in which upgrades can be built. */
  upgradeUnlockShift: number;
  failure: { minHealth: number };
  chapters: ChapterConfig[];
  events: MissionEvent[];
  shifts: ShiftConfig[];
}

export type MissionStatus = 'playing' | 'success' | 'partial' | 'failed';
export type FailReason = 'oxygen' | 'food' | 'health' | 'power';
export type RadiationOutcome = 'none' | 'protected' | 'exposed' | 'partial';

export type WarningLevel = 'info' | 'caution' | 'critical';
export type WarningCode =
  | 'habitatFail' | 'deficit' | 'radNoShelter' | 'o2Out' | 'o2Low' | 'foodOut' | 'foodLow' | 'nextHabitat' | 'batteryLow'
  | 'choiceNeeded';
export interface Warning {
  level: WarningLevel;
  /** Stable message id for localisation (UI translates `warn.<code>` with `params`). */
  code?: WarningCode;
  params?: Record<string, number>;
  /** English text (kept for logs/tests). */
  text: string;
}

export type DemandId = FacilityId | 'habitat' | 'event' | 'build';

/** Result of simulating one shift with the current switches (used for both preview and execution). */
export interface ShiftOutcome {
  shift: number;
  /** Fraction of the shift with sunlight = min(1, site average × scenario modifier). */
  illumination: number;
  scenarioModifier: number;
  solar: number;
  /** Battery capacity in force this shift. */
  capacity: number;
  /** Battery after solar charging (capped at capacity), before any demand. */
  available: number;
  demand: number;
  demandBreakdown: { id: DemandId; cost: number }[];
  /** Habitat cannot be powered => mission failure. */
  habitatPowerFailure: boolean;
  /** Optional systems need more energy than is available => turn must not execute. */
  optionalDeficit: number;
  /** An emergency this shift still needs a decision => turn must not execute. */
  needsChoice: boolean;
  eventId?: string;
  choiceId?: string;
  /** Facilities that actually ran (after event restrictions). */
  ran: Facilities;
  oxygenProduced: number;
  foodProduced: number;
  radiation: RadiationOutcome;
  radiationDamage: number;
  researchGained: number;
  built?: UpgradeId;
  before: Resources;
  after: Resources;
}

export interface ShiftReport extends ShiftOutcome {
  facilities: Facilities;
}

export interface GameState {
  /** The shift the player is currently planning (1-based). */
  shift: number;
  resources: Resources;
  facilities: Facilities;
  upgrades: Upgrades;
  /** Upgrade queued for construction this shift (paid this shift, active from the next). */
  build: UpgradeId | null;
  /** Player's decision for this shift's emergency, if any. */
  choice: string | null;
  status: MissionStatus;
  failReason?: FailReason;
  history: ShiftReport[];
}

export interface ScoreBreakdown {
  survival: number;
  research: number;
  safety: number;
  energy: number;
  total: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}
