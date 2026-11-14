/**
 * Balance analysis helpers (used by tests, never by the UI).
 * - bestPlay: exact dynamic-programming search for the highest achievable score.
 * - simulate: seeded Monte-Carlo games with a policy (e.g. random clicking).
 */
import { activeExpedition, advanceShift, applyExpedition, canAdvance, canBuild, computeScore, createInitialState, getEvent, projectCurrentShift } from './engine';
import type { Facilities, GameState, MissionConfig, UpgradeId } from './types';
import { UPGRADE_IDS } from './types';

export interface Move {
  facilities: Facilities;
  build: UpgradeId | null;
  choice: string | null;
}

const ALL_FAC: Facilities[] = Array.from({ length: 16 }, (_, m) => ({
  oxygen: !!(m & 1), greenhouse: !!(m & 2), shelter: !!(m & 4), lab: !!(m & 8),
}));

/** Every move a player could make this shift. `pruned` drops moves that are never better (shelter outside storms). */
export function legalMoves(s: GameState, cfg: MissionConfig, pruned = false): Move[] {
  const ev = getEvent(cfg, s.shift);
  const builds: (UpgradeId | null)[] = [null, ...UPGRADE_IDS.filter((u) => canBuild(s, cfg, u))];
  const choices: (string | null)[] = ev ? ev.choices.map((c) => c.id) : [null];
  const facs = ALL_FAC.filter((f) => !(f.lab && s.resources.research >= cfg.capacity.research) && !(pruned && f.shelter && !ev?.radiation));
  const out: Move[] = [];
  for (const facilities of facs) for (const build of builds) for (const choice of choices) out.push({ facilities, build, choice });
  return out;
}

/** Apply a move; null if the turn cannot run (power deficit). */
export function play(s: GameState, cfg: MissionConfig, m: Move): GameState | null {
  // History is dropped during analysis to keep memory small (scores never depend on it).
  const cand: GameState = { ...s, history: [], facilities: m.facilities, build: m.build, choice: m.choice };
  if (!canAdvance(projectCurrentShift(cand, cfg))) return null;
  return advanceShift(cand, cfg);
}

const key = (s: GameState) => {
  const r = s.resources, u = s.upgrades;
  return `${s.shift}|${s.status}|${r.energy}|${r.oxygen}|${r.food}|${r.health}|${r.research}|${+u.solar}${+u.oxygen}${+u.battery}`;
};

/** Highest achievable final score and one plan that reaches it. */
export function bestPlay(cfg: MissionConfig): { score: number; plan: Move[]; states: number } {
  const memo = new Map<string, { score: number; move?: Move }>();
  const go = (s: GameState): number => {
    if (s.status !== 'playing') return computeScore(s, cfg).total;
    const k = key(s);
    const hit = memo.get(k);
    if (hit) return hit.score;
    let best: { score: number; move?: Move } = { score: -1 };
    for (const m of legalMoves(s, cfg, true)) {
      const n = play(s, cfg, m);
      if (!n) continue;
      const v = go(n);
      if (v > best.score) best = { score: v, move: m };
    }
    memo.set(k, best);
    return best.score;
  };
  const start = { ...createInitialState(cfg), expeditionsDone: cfg.expeditions.map((e) => e.id) };
  const score = go(start);
  const plan: Move[] = [];
  let s: GameState | undefined = start;
  while (s && s.status === 'playing') {
    const e = memo.get(key(s));
    if (!e?.move) break;
    plan.push(e.move);
    s = play(s, cfg, e.move) ?? undefined;
  }
  return { score, plan, states: memo.size };
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Policy = (s: GameState, moves: Move[], rand: () => number) => Move;
export const randomPolicy: Policy = (_s, moves, rand) => moves[Math.floor(rand() * moves.length)];

/** Run n games; each turn the policy picks among moves that can actually run. */
/** repairAt: shift at which the rover repair succeeds (null = never repaired; failures = failed attempts first). */
export function simulate(cfg: MissionConfig, n: number, policy: Policy, seed = 1, opts: { repairAt?: number | null; failures?: number; skip?: string[] } = {}) {
  const repairAt = opts.repairAt === undefined ? 2 : opts.repairAt;
  const rand = rng(seed);
  const tally = { success: 0, partial: 0, failed: 0, scoreSum: 0, gradeA: 0 };
  for (let g = 0; g < n; g++) {
    let s = createInitialState(cfg);
    while (s.status === 'playing') {
      for (let exp = activeExpedition(s, cfg); exp && repairAt !== null && s.shift >= repairAt && !opts.skip?.includes(exp.id); exp = activeExpedition(s, cfg)) {
        s = applyExpedition(s, cfg, exp.id, { success: true, failures: opts.failures ?? 0 });
      }
      const runnable = legalMoves(s, cfg).filter((m) => play(s, cfg, m));
      if (!runnable.length) { s = { ...s, status: 'failed', failReason: 'power' }; break; }
      s = play(s, cfg, policy(s, runnable, rand))!;
    }
    tally[s.status as 'success' | 'partial' | 'failed']++;
    const sc = computeScore(s, cfg);
    tally.scoreSum += sc.total;
    if (sc.grade === 'A') tally.gradeA++;
  }
  return { success: tally.success / n, partial: tally.partial / n, failed: tally.failed / n, avgScore: tally.scoreSum / n, gradeA: tally.gradeA / n };
}

/**
 * A "sensible novice" policy: simple rules a careful student might follow.
 * Prefers its wish list, then drops optional systems until the turn can run.
 */
export function sensiblePolicy(cfg: MissionConfig, opts: { build?: UpgradeId[]; choices?: Record<string, string> } = {}): Policy {
  const wishBuilds = opts.build ?? ['solar'];
  return (s, moves) => {
    const r = s.resources;
    const ev = getEvent(cfg, s.shift);
    const want = {
      oxygen: r.oxygen < 60,
      greenhouse: r.food < 55,
      lab: r.research < cfg.capacity.research && r.energy >= 25,
      shelter: false,
    };
    let choice: string | null = null;
    if (ev) {
      const ids = ev.choices.map((c) => c.id);
      choice = ev.radiation ? 'shelter' : ids[0];
      if (ev.id === 'dust' && r.health < 75) choice = 'wait';
      if (ev.radiation) want.lab = false;
      if (ev.radiation) want.shelter = true;
      if (opts.choices?.[ev.id]) choice = opts.choices[ev.id];
      const picked = ev.choices.find((c) => c.id === choice);
      if (picked?.disable?.includes('lab')) want.lab = false;
      if (!picked?.useShelter) want.shelter = false;
    }
    const build = wishBuilds.find((u) => !s.upgrades[u] && r.energy >= cfg.upgrades[u].energyCost + 20) ?? null;
    const prefs: Partial<Move>[] = [];
    const drops: (keyof typeof want | 'build' | 'choice')[] = ['build', 'lab', 'greenhouse', 'choice', 'shelter', 'oxygen'];
    let cur = { ...want }, b: UpgradeId | null = build, c = choice;
    prefs.push({ facilities: { ...cur }, build: b, choice: c });
    for (const d of drops) {
      if (d === 'build') b = null;
      else if (d === 'choice') c = ev ? ev.choices[ev.choices.length - 1].id : null;
      else cur = { ...cur, [d]: false };
      prefs.push({ facilities: { ...cur }, build: b, choice: c });
    }
    for (const p of prefs) {
      const m = moves.find((x) => x.build === p.build && x.choice === p.choice &&
        (Object.keys(p.facilities!) as (keyof Facilities)[]).every((k) => x.facilities[k] === p.facilities![k]));
      if (m) return m;
    }
    return moves[0];
  };
}
