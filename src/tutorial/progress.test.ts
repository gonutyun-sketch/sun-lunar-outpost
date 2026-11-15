import { describe, expect, it } from 'vitest';
import { DIFFICULTY_IDS, missionFor } from '../game/difficulty';
import { advanceShift, createInitialState, projectCurrentShift, toggleFacility } from '../game/engine';
import { loadGame, SAVE_KEY, saveGame, type KV } from '../game/save';
import { baseMessage, safeTrainingShift } from '../ui/baseTutorial';
import { learn, learnedToMove, RESOURCE_STEPS, startTutorial, type TutorialEvent } from './progress';

function memory(): KV {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}

function observing() {
  return [...RESOURCE_STEPS, 'solar' as const].reduce((progress, step) => learn(progress, { type: 'observe', step })!, startTutorial());
}

describe('interactive tutorial', () => {
  it('checks the real HUD meters in order and ignores unrelated actions', () => {
    const opening = startTutorial();
    expect(learn(opening, { type: 'observe', step: 'oxygen' })).toBe(opening);
    expect(learn(opening, { type: 'switch', facility: 'lab', before: false, after: true })).toBe(opening);
    expect(observing().base).toBe('air');
  });

  it.each(DIFFICULTY_IDS)('teaches the real first shift without spending supplies prematurely (%s)', difficulty => {
    const cfg = missionFor(difficulty);
    let state = createInitialState(cfg);
    let progress = observing();
    const present = () => baseMessage(progress, state, cfg, projectCurrentShift(state, cfg), () => {});
    const act = (facility: 'oxygen' | 'greenhouse') => {
      const next = toggleFacility(state, cfg, facility);
      progress = learn(progress, { type: 'switch', facility, before: state.facilities[facility], after: next.facilities[facility] })!;
      state = next;
    };
    expect(present()?.title).toBe('tut.air.off');
    expect(learn(progress, { type: 'switch', facility: 'oxygen', before: true, after: true })).toBe(progress);
    act('oxygen');
    expect(present()?.params?.n).toBe(0);
    expect(progress.base).toBe('air-on');
    act('oxygen');
    act('greenhouse');
    expect(progress.base).toBe('preview');
    expect(state.resources).toEqual(cfg.initial);
    progress = learn(progress, { type: 'observe', step: 'preview' })!;
    expect(safeTrainingShift(cfg, projectCurrentShift(state, cfg))).toBe(true);
    const unsafe = { ...state, resources: { ...state.resources, oxygen: 1 }, facilities: { ...state.facilities, oxygen: false } };
    expect(safeTrainingShift(cfg, projectCurrentShift(unsafe, cfg))).toBe(false);
    const advanced = advanceShift(state, cfg);
    progress = learn(progress, { type: 'advance', report: advanced.history[0] })!;
    expect(progress.base).toBe('report');
    expect(advanced.history[0].foodProduced).toBe(cfg.facilities.greenhouse.produces);
    expect(learn(progress, { type: 'close-report' })?.base).toBe('done');
    expect(learn(progress, { type: 'skip' })?.base).toBe('done');
  });

  it('guides an already-on greenhouse through off and on, matching the actual switch', () => {
    const progress = { ...startTutorial(), base: 'greenhouse' as const };
    const off = learn(progress, { type: 'switch', facility: 'greenhouse', before: true, after: false });
    expect(off?.base).toBe('greenhouse-on');
    expect(learn(off, { type: 'switch', facility: 'greenhouse', before: false, after: true })?.base).toBe('preview');
    expect(learn(progress, { type: 'switch', facility: 'oxygen', before: true, after: false })).toBe(progress);
  });

  it('pauses, resumes, skips and ignores repeat events', () => {
    const opened = startTutorial();
    const paused = learn(opened, { type: 'pause' });
    expect(learn(paused, { type: 'observe', step: 'energy' })).toBe(paused);
    const resumed = learn(paused, { type: 'resume' });
    expect(learn(resumed, { type: 'observe', step: 'energy' })?.base).toBe('oxygen');
    const skipped = learn(resumed, { type: 'skip' });
    expect(learn(skipped, { type: 'resume' })).toBe(skipped);
    const optional = { ...startTutorial(), base: 'done' as const };
    const events: TutorialEvent[] = [
      { type: 'lesson', lesson: 'upgrade' }, { type: 'lesson', lesson: 'emergency' }, { type: 'lesson', lesson: 'lab' },
      { type: 'rover', skill: 'docked' }, { type: 'rover', skill: 'solar' },
    ];
    const done = events.reduce((p, e) => learn(p, e)!, optional as ReturnType<typeof startTutorial>);
    expect(done.status).toBe('complete');
    expect(learn(done, events[0])).toBe(done);
  });

  it('counts travelled distance and not just pressing a control', () => {
    const start = { x: 200, y: 300 };
    expect(learnedToMove({ x: 200, y: 300, driven: 0.6 }, start)).toBe(false);
    expect(learnedToMove({ x: 250, y: 300, driven: 0 }, start)).toBe(false);
    expect(learnedToMove({ x: 229, y: 340, driven: 0.6 }, start)).toBe(true);
  });

  it('stores active steps alongside v2 state and ignores damaged tutorial records', () => {
    const cfg = missionFor('easy');
    const state = createInitialState(cfg);
    const storage = memory();
    const progress = learn(observing(), { type: 'switch', facility: 'oxygen', before: true, after: false });
    const updated = toggleFacility(state, cfg, 'oxygen');
    expect(saveGame(storage, updated, null, 20, progress)).toBe(true);
    expect(loadGame(storage, cfg)).toMatchObject({ kind: 'ok', save: { v: 2, state: updated, tutorial: progress } });
    const file = JSON.parse(storage.getItem(SAVE_KEY)!);
    storage.setItem(SAVE_KEY, JSON.stringify({ ...file, tutorial: { v: 1, base: 'invented' } }));
    const loaded = loadGame(storage, cfg);
    expect(loaded).toMatchObject({ kind: 'ok', save: { v: 2, state: updated } });
    if (loaded.kind === 'ok') expect(loaded.save).not.toHaveProperty('tutorial');
  });
});
