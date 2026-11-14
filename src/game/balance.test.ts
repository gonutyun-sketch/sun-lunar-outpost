/**
 * Gameplay / balance verification for the 12-shift mission.
 * Uses deterministic bots (src/game/analysis.ts):
 *  - a "sensible novice" that follows simple, explainable rules,
 *  - careless strategies,
 *  - seeded random clicking (Monte Carlo).
 * The exact best-play search (bestPlay) is too slow for CI (~4 min); its last result is recorded in PROGRESS.md.
 */
import { describe, expect, it } from 'vitest';
import { MISSION } from './config';
import { legalMoves, play, randomPolicy, sensiblePolicy, simulate, type Move } from './analysis';
import { createInitialState } from './engine';
import type { Facilities, GameState } from './types';

/** Play a fixed setting every shift; emergencies take their first option. */
function constant(f: Facilities): GameState {
  let s = createInitialState(MISSION);
  while (s.status === 'playing') {
    const ev = MISSION.events.find((e) => e.shift === s.shift);
    const n = play(s, MISSION, { facilities: f, build: null, choice: ev ? ev.choices[0].id : null });
    if (!n) return { ...s, status: 'failed', failReason: 'power' };
    s = n;
  }
  return s;
}

describe('thoughtful play wins, careless play fails', () => {
  it('sensible play with the Solar upgrade succeeds with grade A', () => {
    const r = simulate(MISSION, 1, sensiblePolicy(MISSION), 1);
    expect(r.success).toBe(1);
    expect(r.avgScore).toBeGreaterThanOrEqual(90);
  });

  it('the same sensible play WITHOUT any upgrade fails — upgrades matter', () => {
    expect(simulate(MISSION, 1, sensiblePolicy(MISSION, { build: [] }), 1).failed).toBe(1);
  });

  it('building all three upgrades also works (different path)', () => {
    expect(simulate(MISSION, 1, sensiblePolicy(MISSION, { build: ['solar', 'battery', 'oxygen'] }), 1).success).toBe(1);
  });

  it('every emergency choice can still lead to success (no trap options), with different scores', () => {
    const scores: number[] = [];
    for (const ev of MISSION.events) for (const c of ev.choices) {
      const r = simulate(MISSION, 1, sensiblePolicy(MISSION, { choices: { [ev.id]: c.id } }), 1);
      expect(r.success, `${ev.id}:${c.id}`).toBe(1);
      scores.push(r.avgScore);
    }
    expect(new Set(scores).size).toBeGreaterThan(1);
  });

  it('no constant strategy (same switches every shift) achieves success', () => {
    for (let m = 0; m < 16; m++) {
      const f = { oxygen: !!(m & 1), greenhouse: !!(m & 2), shelter: !!(m & 4), lab: !!(m & 8) };
      expect(constant(f).status, JSON.stringify(f)).not.toBe('success');
    }
  });

  it('everything ON every shift runs out of power', () => {
    const s = constant({ oxygen: true, greenhouse: true, shelter: true, lab: true });
    expect(s.status).toBe('failed');
    expect(s.failReason).toBe('power');
  });

  it('random clicking rarely succeeds and usually fails', () => {
    const r = simulate(MISSION, 3000, randomPolicy, 7);
    // eslint-disable-next-line no-console
    console.log('[balance] random player', JSON.stringify(r));
    expect(r.success).toBeLessThan(0.15);
    expect(r.failed).toBeGreaterThan(0.7);
  });

  it('the move generator offers upgrades and both emergency options', () => {
    const s = { ...createInitialState(MISSION), shift: 3 };
    const moves: Move[] = legalMoves(s, MISSION);
    expect(new Set(moves.map((m) => m.build))).toEqual(new Set([null, 'solar', 'oxygen', 'battery']));
    expect(new Set(moves.map((m) => m.choice))).toEqual(new Set(['repair', 'patch']));
  });

  it('restart produces an identical fresh state', () => {
    expect(createInitialState(MISSION)).toEqual(createInitialState(MISSION));
  });
});
