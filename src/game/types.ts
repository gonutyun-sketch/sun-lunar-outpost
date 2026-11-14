export type FacilityId = 'oxygen' | 'greenhouse' | 'shelter' | 'lab';
export const FACILITY_IDS: FacilityId[] = ['oxygen', 'greenhouse', 'shelter', 'lab'];

export interface Resources {
  energy: number;
  oxygen: number;
  food: number;
  health: number;
  research: number;
}

export type Facilities = Record<FacilityId, boolean>;

export type ShiftEvent = 'warning' | 'radiation';

export interface ShiftConfig {
  shift: number;
  illumination: number;
  event?: ShiftEvent;
}

export interface MissionConfig {
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
  radiation: { healthDamage: number };
  failure: { minHealth: number };
  shifts: ShiftConfig[];
}

export type MissionStatus = 'playing' | 'success' | 'partial' | 'failed';
export type FailReason = 'oxygen' | 'food' | 'health' | 'power';
export type RadiationOutcome = 'none' | 'protected' | 'exposed';

export type WarningLevel = 'info' | 'caution' | 'critical';
export interface Warning {
  level: WarningLevel;
  text: string;
}

/** Result of simulating one shift with the current switches (used for both preview and execution). */
export interface ShiftOutcome {
  shift: number;
  illumination: number;
  solar: number;
  /** Battery after solar charging (capped at capacity), before any demand. */
  available: number;
  demand: number;
  demandBreakdown: { label: string; cost: number }[];
  /** Habitat cannot be powered => mission failure. */
  habitatPowerFailure: boolean;
  /** Optional systems need more energy than is available => turn must not execute. */
  optionalDeficit: number;
  radiation: RadiationOutcome;
  researchGained: number;
  before: Resources;
  after: Resources;
  explanations: string[];
}

export interface ShiftReport extends ShiftOutcome {
  facilities: Facilities;
}

export interface GameState {
  /** The shift the player is currently planning (1-based). */
  shift: number;
  resources: Resources;
  facilities: Facilities;
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
