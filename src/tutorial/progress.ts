import type { FacilityId, GameState, Resources, ShiftReport } from '../game/types';

export const RESOURCE_STEPS = ['energy', 'oxygen', 'food', 'health', 'research'] as const satisfies readonly (keyof Resources)[];
const BASE_STEPS = [...RESOURCE_STEPS, 'solar', 'air', 'air-on', 'greenhouse', 'greenhouse-on', 'preview', 'advance', 'report', 'done'] as const;
export type ResourceStep = (typeof RESOURCE_STEPS)[number];
export type BaseStep = (typeof BASE_STEPS)[number];
export type ExtraLesson = 'upgrade' | 'emergency' | 'lab';
type RoverSkill = 'moved' | 'battery' | 'rotated' | 'docked' | 'solar';
const EXTRA_LESSONS: readonly ExtraLesson[] = ['upgrade', 'emergency', 'lab'];
const ROVER_SKILLS: readonly RoverSkill[] = ['moved', 'battery', 'rotated', 'docked', 'solar'];

export interface TutorialProgress {
  v: 1;
  status: 'active' | 'paused' | 'skipped' | 'complete';
  base: BaseStep;
  lessons: Record<ExtraLesson, boolean>;
  rover: Record<RoverSkill, boolean>;
}

export type TutorialEvent =
  | { type: 'pause' | 'resume' | 'skip' }
  | { type: 'observe'; step: ResourceStep | 'solar' | 'preview' }
  | { type: 'switch'; facility: FacilityId; before: boolean; after: boolean }
  | { type: 'advance'; report: ShiftReport }
  | { type: 'close-report' }
  | { type: 'lesson'; lesson: ExtraLesson }
  | { type: 'rover'; skill: RoverSkill };

export const TUTORIAL_PREF_KEY = 'sun-tutorial-choice';

export function startTutorial(): TutorialProgress {
  return {
    v: 1, status: 'active', base: 'energy',
    lessons: { upgrade: false, emergency: false, lab: false },
    rover: { moved: false, battery: false, rotated: false, docked: false, solar: false },
  };
}

export function learn(progress: TutorialProgress | null, event: TutorialEvent): TutorialProgress | null {
  if (!progress || progress.status === 'complete' || progress.status === 'skipped') return progress;
  if (event.type === 'skip') return { ...progress, status: 'skipped', base: progress.base === 'report' ? 'done' : progress.base };
  if (event.type === 'pause' && progress.status === 'active') return { ...progress, status: 'paused' };
  if (event.type === 'resume' && progress.status === 'paused') return { ...progress, status: 'active' };

  let { base, rover, lessons } = progress;
  if (event.type === 'advance' && event.report.shift === 1 && base !== 'done') base = 'report';
  if (event.type === 'close-report' && base === 'report') base = 'done';
  // Observe actual optional achievements while paused so returning to the guide won't demand them again.
  if ((event.type === 'lesson' || event.type === 'advance') && base === 'done') {
    const upgrade = lessons.upgrade || (event.type === 'lesson' ? event.lesson === 'upgrade' : !!event.report.built);
    const emergency = lessons.emergency || (event.type === 'lesson' ? event.lesson === 'emergency' : !!event.report.choiceId);
    const lab = lessons.lab || (event.type === 'lesson' ? event.lesson === 'lab' : event.report.researchGained > 0);
    if (upgrade !== lessons.upgrade || emergency !== lessons.emergency || lab !== lessons.lab) lessons = { upgrade, emergency, lab };
  }
  if (event.type === 'rover' && !rover[event.skill] && (progress.status === 'active' || event.skill === 'docked' || event.skill === 'solar')) {
    rover = { ...rover, [event.skill]: true };
  }
  if (progress.status === 'active' && event.type === 'observe' && base === event.step) {
    base = BASE_STEPS[BASE_STEPS.indexOf(base) + 1];
  }
  if (progress.status === 'active' && event.type === 'switch' && event.before !== event.after) {
    if (event.facility === 'oxygen' && (base === 'air' || base === 'air-on')) base = event.after ? 'greenhouse' : 'air-on';
    if (event.facility === 'greenhouse' && (base === 'greenhouse' || base === 'greenhouse-on')) base = event.after ? 'preview' : 'greenhouse-on';
  }

  if (base === progress.base && rover === progress.rover && lessons === progress.lessons) return progress;
  const done = base === 'done' && rover.docked && rover.solar && EXTRA_LESSONS.every(lesson => lessons[lesson]);
  return { ...progress, base, rover, lessons, status: done ? 'complete' : progress.status };
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** An invalid optional guide never invalidates the mission checkpoint. */
export function readTutorial(value: unknown, state: GameState): TutorialProgress | null {
  if (!record(value) || value.v !== 1 || !BASE_STEPS.includes(value.base as BaseStep)) return null;
  const { status, lessons, rover } = value;
  if (status !== 'active' && status !== 'paused' && status !== 'skipped' && status !== 'complete') return null;
  if (!record(lessons) || !EXTRA_LESSONS.every(key => typeof lessons[key] === 'boolean')) return null;
  if (!record(rover) || !ROVER_SKILLS.every(key => typeof rover[key] === 'boolean')) return null;
  const base = value.base as BaseStep;
  if (base === 'report' && !state.history.some(report => report.shift === 1)) return null;
  return {
    v: 1, status, base: state.shift > 1 && base !== 'report' ? 'done' : base,
    lessons: { upgrade: !!lessons.upgrade, emergency: !!lessons.emergency, lab: !!lessons.lab },
    rover: { moved: !!rover.moved, battery: !!rover.battery, rotated: !!rover.rotated, docked: !!rover.docked, solar: !!rover.solar },
  };
}

export function learnedToMove(rover: { x: number; y: number; driven: number }, start: { x: number; y: number }): boolean {
  return rover.driven >= 0.3 && Math.hypot(rover.x - start.x, rover.y - start.y) >= 48;
}
