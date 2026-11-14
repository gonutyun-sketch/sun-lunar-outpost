import { describe, expect, it } from 'vitest';
import { MISSION } from './config';
import { missionFor } from './difficulty';
import { legalMoves, play, rng, sensiblePolicy, type Move } from './analysis';
import { activeExpedition, advanceShift, applyExpedition, computeScore, createInitialState, toggleFacility } from './engine';
import { SAVE_KEY, SAVE_VERSION, clearSave, hasProgress, isValidState, loadGame, saveGame, type KV } from './save';
import type { GameState } from './types';

function memory(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/** Play the sensible bot (rover repairs succeed when available) until `untilShift` or the end. */
function playTo(untilShift: number): GameState {
  const policy = sensiblePolicy(MISSION);
  const rand = rng(1);
  let s = createInitialState(MISSION);
  while (s.status === 'playing' && s.shift < untilShift) {
    for (let e = activeExpedition(s, MISSION); e; e = activeExpedition(s, MISSION)) s = applyExpedition(s, MISSION, e.id, { success: true, failures: 0 });
    const moves = legalMoves(s, MISSION).filter((m) => play(s, MISSION, m));
    s = step(s, policy(s, moves, rand));
  }
  return s;
}

/** Real engine step (analysis.play drops history to save memory; the save must keep it). */
function step(s: GameState, m: Move): GameState {
  return advanceShift({ ...s, facilities: m.facilities, build: m.build, choice: m.choice }, MISSION);
}

/** Save, "reload the page" (new parse from storage), and return the loaded state. */
function roundTrip(kv: KV, s: GameState, exploring: string | null = null): GameState {
  expect(saveGame(kv, s, exploring)).toBe(true);
  const r = loadGame(kv, MISSION);
  if (r.kind !== 'ok') throw new Error(`load failed: ${r.kind}`);
  return r.save.state;
}

describe('save & continue', () => {
  it('shift 1: a fresh game with a changed switch survives a reload', () => {
    const kv = memory();
    const s = toggleFacility(createInitialState(MISSION), MISSION, 'greenhouse');
    const back = roundTrip(kv, s);
    expect(back).toEqual(s);
    expect(back.facilities.greenhouse).toBe(true);
  });

  it('shift 6: resources, upgrades, decisions, history and rover results are restored exactly', () => {
    const kv = memory();
    const s = playTo(6);
    expect(s.shift).toBe(6);
    expect(s.history).toHaveLength(5);
    expect(s.expeditionsDone).toContain('solarRepair');
    const back = roundTrip(kv, s);
    expect(back).toEqual(s);
    // the game continues identically after loading
    const a = playTo(6), b = back;
    const m = legalMoves(a, MISSION).filter((x) => play(a, MISSION, x))[0];
    expect(step(b, m)).toEqual(step(a, m));
  });

  it('mission success is saved once and cannot be applied twice', () => {
    const kv = memory();
    let s = playTo(2);
    s = applyExpedition(s, MISSION, 'solarRepair', { success: true, failures: 1 });
    const back = roundTrip(kv, s);
    expect(back.expeditionsDone).toEqual(['solarRepair']);
    expect(back.expeditionLog).toHaveLength(1);
    // a duplicate result (e.g. double tap, or after reload) changes nothing
    expect(applyExpedition(back, MISSION, 'solarRepair', { success: true, failures: 1 })).toBe(back);
  });

  it('mission failure is saved with its cost', () => {
    const kv = memory();
    const s0 = playTo(2);
    const s = applyExpedition(s0, MISSION, 'solarRepair', { success: false, failures: 2 });
    const back = roundTrip(kv, s);
    expect(back.resources.energy).toBe(s0.resources.energy - 2 * 8);
    expect(back.expeditionFails).toBe(2);
    expect(back.expeditionsDone).toEqual([]);
  });

  it('reload during exploration resumes from the last safe base state (checkpoint)', () => {
    const kv = memory();
    const base = playTo(2);
    saveGame(kv, base, 'solarRepair'); // App saves the base state with the exploring marker
    const r = loadGame(kv, MISSION);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.save.exploring).toBe('solarRepair');
    expect(r.save.state).toEqual(base); // no reward or cost applied
    expect(activeExpedition(r.save.state, MISSION)?.id).toBe('solarRepair'); // can be relaunched
  });

  it('after shift 12 the finished mission and score are saved', () => {
    const kv = memory();
    const s = playTo(99);
    expect(s.status).toBe('success');
    const back = roundTrip(kv, s);
    expect(computeScore(back, MISSION)).toEqual(computeScore(s, MISSION));
    expect(hasProgress({ v: 1, savedAt: 0, state: back, exploring: null })).toBe(false); // nothing to lose
  });

  it('new game: clearing removes the save; progress detection', () => {
    const kv = memory();
    const s = playTo(4);
    saveGame(kv, s);
    expect(hasProgress({ v: 1, savedAt: 0, state: s, exploring: null })).toBe(true);
    expect(hasProgress({ v: 1, savedAt: 0, state: createInitialState(MISSION), exploring: null })).toBe(false);
    clearSave(kv);
    expect(loadGame(kv, MISSION).kind).toBe('none');
  });

  it('corrupt, wrong-version or tampered saves are discarded and the game starts normally', () => {
    const good = playTo(5);
    const cases: [string, string][] = [
      ['parse', '{not json'],
      ['parse', ''],
      ['shape', 'null'],
      ['shape', '[1,2]'],
      ['version', JSON.stringify({ v: SAVE_VERSION + 1, state: good })],
      ['version', JSON.stringify({ state: good })],
      ['shape', JSON.stringify({ v: SAVE_VERSION, state: { ...good, shift: 40 } })],
      ['shape', JSON.stringify({ v: SAVE_VERSION, state: { ...good, resources: { ...good.resources, oxygen: 'x' } } })],
      ['shape', JSON.stringify({ v: SAVE_VERSION, state: { ...good, history: good.history.slice(1) } })],
      ['shape', JSON.stringify({ v: SAVE_VERSION, state: { ...good, expeditionsDone: ['solarRepair', 'solarRepair'] } })],
      ['shape', JSON.stringify({ v: SAVE_VERSION, state: { ...good, choice: 'nonsense' } })],
      ['shape', JSON.stringify({ v: SAVE_VERSION, state: { ...good, status: 'won' } })],
    ];
    for (const [reason, raw] of cases) {
      const kv = memory();
      kv.setItem(SAVE_KEY, raw);
      const r = loadGame(kv, MISSION);
      expect(r, raw.slice(0, 40)).toEqual({ kind: 'invalid', reason });
      expect(kv.getItem(SAVE_KEY)).toBeNull(); // removed, so the next start is clean
    }
  });

  it('works without storage (private mode) and when writing throws', () => {
    expect(loadGame(null, MISSION).kind).toBe('none');
    expect(saveGame(null, createInitialState(MISSION))).toBe(false);
    const full: KV = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(saveGame(full, createInitialState(MISSION))).toBe(false);
  });

  it.each(['easy', 'normal', 'hard'] as const)('%s: the difficulty is saved and restored, also mid-expedition', (d) => {
    const cfg = missionFor(d);
    const kv = memory();
    let s = createInitialState(cfg);
    for (let i = 0; i < 3; i++) {
      const m = legalMoves(s, cfg).filter((x) => play(s, cfg, x))[0];
      s = advanceShift({ ...s, facilities: m.facilities, build: m.build, choice: m.choice }, cfg);
    }
    const back = roundTrip(kv, s);
    expect(back.difficulty).toBe(d);
    expect(back).toEqual(s);
    const mid = roundTrip(kv, s, 'solarRepair'); // reload while the rover is out
    expect(mid.difficulty).toBe(d);
    // the result is applied once with this difficulty's cost, a repeat is ignored
    const after = applyExpedition(mid, cfg, 'solarRepair', { success: true, failures: 1 });
    expect(after.resources.energy).toBe(mid.resources.energy - cfg.expeditions[0].failEnergyCost);
    expect(applyExpedition(after, cfg, 'solarRepair', { success: true, failures: 1 })).toBe(after);
  });

  it('a version-1 save (before difficulties) is migrated to Hard — the same rules — and kept', () => {
    const kv = memory();
    const { difficulty: _d, ...old } = playTo(4);
    kv.setItem(SAVE_KEY, JSON.stringify({ v: 1, savedAt: 5, state: old, exploring: null }));
    const r = loadGame(kv, MISSION);
    if (r.kind !== 'ok') throw new Error(r.kind);
    expect(r.migratedFrom).toBe(1);
    expect(r.save.state.difficulty).toBe('hard');
    expect(r.save.state.shift).toBe(4);
    expect(r.save.state.history).toHaveLength(3);
    // written back as v2, so the next load needs no migration
    expect(JSON.parse(kv.getItem(SAVE_KEY)!).v).toBe(SAVE_VERSION);
    const again = loadGame(kv, MISSION);
    expect(again.kind === 'ok' && again.migratedFrom).toBe(undefined);
  });

  it('a v2 save with a missing or unknown difficulty is rejected safely', () => {
    const good = playTo(3);
    for (const state of [{ ...good, difficulty: undefined }, { ...good, difficulty: 'extreme' }]) {
      const kv = memory();
      kv.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, state }));
      expect(loadGame(kv, MISSION)).toEqual({ kind: 'invalid', reason: 'shape' });
    }
  });

  it('stores no personal data — only the versioned game state', () => {
    const kv = memory();
    saveGame(kv, playTo(3), null, 123);
    const file = JSON.parse(kv.getItem(SAVE_KEY)!);
    expect(Object.keys(file).sort()).toEqual(['exploring', 'savedAt', 'state', 'v']);
    expect(isValidState(file.state, MISSION)).toBe(true);
  });
});
