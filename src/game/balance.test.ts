/**
 * Gameplay / balance verification (Phase 5).
 * 1. Named strategies a real player might try.
 * 2. Exhaustive search over every legal decision path (16 switch combinations × 8 shifts)
 *    to prove that decisions matter and no fixed strategy guarantees a win.
 */
import { describe, expect, it } from 'vitest';
import { MISSION } from './config';
import { advanceShift, canAdvance, computeScore, createInitialState, projectCurrentShift } from './engine';
import type { Facilities, GameState, MissionStatus } from './types';

const OFF: Facilities = { oxygen: false, greenhouse: false, shelter: false, lab: false };
const ALL_CONFIGS: Facilities[] = Array.from({ length: 16 }, (_, m) => ({
  oxygen: !!(m & 1), greenhouse: !!(m & 2), shelter: !!(m & 4), lab: !!(m & 8),
}));

/** Play a list of per-shift settings. Stops early on a blocked turn (returns blocked=true). */
function play(plan: (Partial<Facilities> | ((s: GameState) => Partial<Facilities>))[]) {
  let s = createInitialState(MISSION);
  for (const step of plan) {
    if (s.status !== 'playing') break;
    const f = typeof step === 'function' ? step(s) : step;
    s = { ...s, facilities: { ...OFF, ...f } };
    if (!canAdvance(projectCurrentShift(s, MISSION))) return { state: s, blocked: true };
    s = advanceShift(s, MISSION);
  }
  return { state: s, blocked: false };
}

describe('named strategies', () => {
  it('survival-first (life support + shelter, no lab) => partial, crew safe', () => {
    const { state } = play([
      { oxygen: true, greenhouse: true }, { oxygen: true, greenhouse: true }, { oxygen: true },
      { shelter: true }, { greenhouse: true }, { oxygen: true }, { shelter: true, oxygen: true }, { greenhouse: true },
    ]);
    expect(state.status).toBe('partial');
    expect(state.resources.health).toBe(100);
    expect(computeScore(state, MISSION).research).toBe(0);
  });

  it('research rush (lab every early shift, ignore food) => fails on food or power', () => {
    const { state, blocked } = play([
      { oxygen: true, lab: true }, { oxygen: true, lab: true }, { oxygen: true, lab: true },
      { oxygen: true, shelter: true }, { oxygen: true }, { oxygen: true }, { oxygen: true, shelter: true }, { oxygen: true },
    ]);
    expect(blocked || state.status === 'failed').toBe(true);
  });

  it('power shortage: everything ON every shift drains the battery => habitat power failure in Shift 4', () => {
    const { state } = play(Array(8).fill({ oxygen: true, greenhouse: true, shelter: true, lab: true }));
    expect(state.status).toBe('failed');
    expect(state.failReason).toBe('power');
    expect(state.history).toHaveLength(4);
  });

  it('power deficit: optional systems beyond available energy block the turn (no silent execution)', () => {
    const all = { oxygen: true, greenhouse: true, shelter: true, lab: true };
    const { blocked, state } = play([
      all, all, { oxygen: true, greenhouse: true, lab: true }, // battery 42 -> 26 -> 10
      { oxygen: true, greenhouse: true, shelter: true }, // Shift 4: 10+8=18 available, 32 needed
    ]);
    expect(blocked).toBe(true);
    expect(state.shift).toBe(4);
  });

  it('poor allocation: no oxygen recycling => oxygen failure', () => {
    const { state } = play(Array(8).fill({ greenhouse: true }));
    expect(state.status).toBe('failed');
    expect(state.failReason).toBe('oxygen');
  });

  it('radiation: one unprotected event is survivable (−35), two are fatal', () => {
    const base = [
      { oxygen: true, greenhouse: true, lab: true }, { oxygen: true, lab: true }, { oxygen: true, lab: true },
    ];
    const one = play([...base, { oxygen: true }, { greenhouse: true }, { oxygen: true }, { greenhouse: true, shelter: true }, { oxygen: true }]);
    expect(one.state.status).toBe('success');
    expect(one.state.resources.health).toBe(65);
    const two = play([...base, { oxygen: true }, { greenhouse: true }, { oxygen: true }, { greenhouse: true }, { oxygen: true }]);
    expect(two.state.status).toBe('failed');
    expect(two.state.failReason).toBe('health');
  });

  it('food neglect => food failure', () => {
    const { state } = play(Array(8).fill({ oxygen: true }));
    expect(state.status).toBe('failed');
    expect(state.failReason).toBe('food');
  });
});

describe('exhaustive balance analysis', () => {
  type Tally = Record<MissionStatus | 'blocked', number>;
  type Prob = { success: number; partial: number; failed: number };
  const pmemo = new Map<string, Prob>();
  /** Probability of each outcome for a player choosing uniformly among legal settings each shift. */
  function randomPlayer(s: GameState): Prob {
    if (s.status !== 'playing') return { success: +(s.status === 'success'), partial: +(s.status === 'partial'), failed: +(s.status === 'failed') };
    const r = s.resources;
    const key = `${s.shift}|${r.energy}|${r.oxygen}|${r.food}|${r.health}|${r.research}`;
    const hit = pmemo.get(key);
    if (hit) return hit;
    const kids: Prob[] = [];
    for (const f of ALL_CONFIGS) {
      if (f.lab && r.research >= MISSION.capacity.research) continue;
      const cand = { ...s, facilities: f };
      if (!canAdvance(projectCurrentShift(cand, MISSION))) continue;
      kids.push(randomPlayer(advanceShift(cand, MISSION)));
    }
    const out = kids.reduce((a, k) => ({ success: a.success + k.success / kids.length, partial: a.partial + k.partial / kids.length, failed: a.failed + k.failed / kids.length }), { success: 0, partial: 0, failed: 0 });
    pmemo.set(key, out);
    return out;
  }
  const memo = new Map<string, Tally>();
  let bestScore = 0;

  function explore(s: GameState): Tally {
    const r = s.resources;
    const key = `${s.shift}|${r.energy}|${r.oxygen}|${r.food}|${r.health}|${r.research}|${s.status}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const t: Tally = { playing: 0, success: 0, partial: 0, failed: 0, blocked: 0 };
    if (s.status !== 'playing') {
      t[s.status] = 1;
      bestScore = Math.max(bestScore, computeScore(s, MISSION).total);
    } else {
      for (const f of ALL_CONFIGS) {
        if (f.lab && r.research >= MISSION.capacity.research) continue;
        const cand = { ...s, facilities: f };
        if (!canAdvance(projectCurrentShift(cand, MISSION))) { t.blocked++; continue; }
        const sub = explore(advanceShift(cand, MISSION));
        (Object.keys(t) as (keyof Tally)[]).forEach((k) => (t[k] += sub[k]));
      }
    }
    memo.set(key, t);
    return t;
  }

  const total = explore(createInitialState(MISSION));
  const finished = total.success + total.partial + total.failed;

  const rnd = randomPlayer(createInitialState(MISSION));

  it('full success is reachable; random play fails often (regression guard)', () => {
    // eslint-disable-next-line no-console
    console.log('[balance]', JSON.stringify({ paths: { ...total, finished }, randomPlayer: rnd, bestScore, states: memo.size }));
    expect(total.success).toBeGreaterThan(0);
    expect(rnd.success).toBeLessThan(0.5); // baseline 45.0% (see PROGRESS.md balance notes)
    expect(rnd.failed).toBeGreaterThan(0.35); // baseline 42.7%
    expect(bestScore).toBeLessThanOrEqual(100);
  });

  it('no constant setting (same switches every shift) achieves full success', () => {
    for (const f of ALL_CONFIGS) {
      const { state } = play(Array(8).fill(f));
      expect(state.status, JSON.stringify(f)).not.toBe('success');
    }
  });

  it('restart produces an identical fresh state', () => {
    const a = createInitialState(MISSION);
    const b = createInitialState(MISSION);
    expect(a).toEqual(b);
    expect(a.history).toHaveLength(0);
    expect(a.resources).toEqual(MISSION.initial);
  });
});
