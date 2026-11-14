/**
 * Difficulty modes: NASA data protection, rule ordering, and balance evidence per mode
 * (deterministic bots from analysis.ts). The Hard mode is the original game and keeps its own
 * tests in balance.test.ts.
 */
import { describe, expect, it } from 'vitest';
import raw from '../data/mission.json';
import site from '../data/site.json';
import { legalMoves, play, randomPolicy, sensiblePolicy, simulate, type Policy } from './analysis';
import { MISSION } from './config';
import { coachByDefault, coachTips } from './coach';
import { DIFFICULTIES, DIFFICULTY_IDS, isDifficulty, LEGACY_DIFFICULTY, missionFor, type DifficultyId } from './difficulty';
import { advanceShift, chooseOption, createInitialState, getWarnings, projectCurrentShift, shiftSunlight, solarGeneration, toggleFacility } from './engine';
import type { MissionConfig } from './types';

const all = DIFFICULTY_IDS.map((d) => [d, missionFor(d)] as const);
const lastChoices = (cfg: MissionConfig) => Object.fromEntries(cfg.events.map((e) => [e.id, e.choices[e.choices.length - 1].id]));
const sloppy = (cfg: MissionConfig, p: number): Policy => {
  const good = sensiblePolicy(cfg);
  return (s, moves, rand) => (rand() < p ? randomPolicy(s, moves, rand) : good(s, moves, rand));
};

describe('difficulty config', () => {
  it('NASA site data, sunlight scenario, solar output and the mission goal are identical in every mode', () => {
    for (const [, cfg] of all) {
      expect(cfg.site).toBe(MISSION.site);
      expect(cfg.site).toEqual(site);
      expect(cfg.site.averageSunlitFraction).toBe(0.88444);
      expect(cfg.shifts).toEqual(raw.shifts);
      expect(cfg.solar).toEqual(raw.solar);
      expect(cfg.capacity).toEqual(raw.capacity);
      expect(cfg.totalShifts).toBe(12);
      expect(cfg.habitat).toEqual(raw.habitat);
      expect(cfg.facilities).toEqual(raw.facilities);
      expect(cfg.events.map((e) => [e.id, e.shift, e.warnShift])).toEqual(raw.events.map((e) => [e.id, e.shift, e.warnShift]));
      for (const s of cfg.shifts) {
        expect(shiftSunlight(cfg, s.shift)).toBe(shiftSunlight(MISSION, s.shift));
        expect(solarGeneration(cfg, s.shift)).toBe(solarGeneration(MISSION, s.shift));
      }
    }
  });

  it('Hard is exactly the original mission.json rules', () => {
    const { difficulty, site: _s, ...hard } = missionFor('hard');
    expect(difficulty).toBe('hard');
    expect(hard).toEqual(raw);
    expect(LEGACY_DIFFICULTY).toBe('hard');
  });

  it('easier modes give more supplies and less damage, never the other way round', () => {
    const [e, n, h] = DIFFICULTY_IDS.map((d) => DIFFICULTIES[d].base);
    for (const k of ['energy', 'oxygen', 'food'] as const) {
      expect(e.initial[k]).toBeGreaterThanOrEqual(n.initial[k]);
      expect(n.initial[k]).toBeGreaterThanOrEqual(h.initial[k]);
    }
    expect(e.eventDamage).toBeLessThan(n.eventDamage);
    expect(n.eventDamage).toBeLessThan(h.eventDamage);
    expect(e.roverFailEnergy).toBeLessThan(h.roverFailEnergy);
    expect(e.crew.oxygenUse).toBeLessThanOrEqual(h.crew.oxygenUse);
    for (const u of ['solar', 'oxygen', 'battery'] as const) expect(e.upgradeCost[u]).toBeLessThanOrEqual(n.upgradeCost[u]);
  });

  it('a new game starts with its difficulty and that mode’s supplies', () => {
    for (const [d, cfg] of all) {
      const s = createInitialState(cfg);
      expect(s.difficulty).toBe(d);
      expect(s.resources).toEqual(cfg.initial);
    }
    expect(isDifficulty('easy')).toBe(true);
    expect(isDifficulty('extreme')).toBe(false);
    expect(missionFor(undefined)).toBe(missionFor('hard'));
  });
});

describe('balance per difficulty', () => {
  it.each(DIFFICULTY_IDS)('%s: sensible play wins with grade A; every emergency choice can still win', (d) => {
    const cfg = missionFor(d);
    const r = simulate(cfg, 1, sensiblePolicy(cfg), 1);
    expect(r.success).toBe(1);
    expect(r.avgScore).toBeGreaterThanOrEqual(90);
    for (const ev of cfg.events) for (const c of ev.choices) {
      expect(simulate(cfg, 1, sensiblePolicy(cfg, { choices: { [ev.id]: c.id } }), 1).success, `${d} ${ev.id}:${c.id}`).toBe(1);
    }
  });

  it.each(DIFFICULTY_IDS)('%s: no first-shift move can end the mission (beginner protection)', (d) => {
    const cfg = missionFor(d);
    const s = createInitialState(cfg);
    for (const m of legalMoves(s, cfg)) {
      const n = play(s, cfg, m);
      if (n) expect(n.status).toBe('playing');
    }
  });

  it('random clicking does not win reliably in any mode (Easy is not automatic)', () => {
    const res = all.map(([d, cfg]) => [d, simulate(cfg, 1000, randomPolicy, 7, { skip: ['sampleSurvey'] })] as const);
    // eslint-disable-next-line no-console
    console.log('[random by difficulty]', res.map(([d, r]) => `${d} win ${(r.success * 100).toFixed(0)}% fail ${(r.failed * 100).toFixed(0)}%`).join(' | '));
    const r = Object.fromEntries(res) as Record<DifficultyId, (typeof res)[number][1]>;
    expect(r.easy.success).toBeLessThan(0.6);
    expect(r.easy.failed).toBeGreaterThan(0.25);
    expect(r.normal.success).toBeLessThan(0.35);
    expect(r.hard.success).toBeLessThan(0.15);
    expect(r.easy.success).toBeGreaterThan(r.normal.success);
    expect(r.normal.success).toBeGreaterThan(r.hard.success);
  });

  it('Easy: typical beginner mistakes are recoverable, but the rover missions still matter', () => {
    const cfg = missionFor('easy');
    // no upgrades + always the second emergency choice + one failed rover attempt per mission
    expect(simulate(cfg, 1, sensiblePolicy(cfg, { build: [], choices: lastChoices(cfg) }), 1, { failures: 1 }).success).toBe(1);
    expect(simulate(cfg, 1, sensiblePolicy(cfg, { build: [] }), 1, { failures: 2 }).success).toBe(1);
    expect(simulate(cfg, 1, sensiblePolicy(cfg), 1, { skip: ['oxygenRepair'] }).success).toBe(1);
    expect(simulate(cfg, 1, sensiblePolicy(cfg), 1, { repairAt: 9 }).success).toBe(1);
    expect(simulate(cfg, 400, sloppy(cfg, 0.3), 3).success).toBeGreaterThan(0.95);
    // never launching the rover still fails: exploring is part of the mission
    expect(simulate(cfg, 1, sensiblePolicy(cfg), 1, { repairAt: null }).success).toBe(0);
  });

  it('Normal: upgrades and repairs matter, one or two failed sorties are recoverable', () => {
    const cfg = missionFor('normal');
    const base = simulate(cfg, 1, sensiblePolicy(cfg), 1);
    const noUpg = simulate(cfg, 1, sensiblePolicy(cfg, { build: [] }), 1);
    expect(noUpg.success).toBe(1);
    expect(noUpg.avgScore).toBeLessThan(base.avgScore - 5);
    expect(simulate(cfg, 1, sensiblePolicy(cfg), 1, { failures: 2 }).success).toBe(1);
    expect(simulate(cfg, 1, sensiblePolicy(cfg), 1, { skip: ['oxygenRepair'] }).failed).toBe(1);
    // mistakes add up: no upgrades AND two failures per mission is too much
    expect(simulate(cfg, 1, sensiblePolicy(cfg, { build: [] }), 1, { failures: 2 }).success).toBe(0);
  });

  it('Hard: the original difficulty (upgrades and the O₂ repair are required)', () => {
    const cfg = missionFor('hard');
    expect(simulate(cfg, 1, sensiblePolicy(cfg, { build: [] }), 1).failed).toBe(1);
    expect(simulate(cfg, 1, sensiblePolicy(cfg), 1, { skip: ['oxygenRepair'] }).failed).toBe(1);
  });
});

describe('stuck-feeling power deficit (regression, found in browser QA on Hard shift 11)', () => {
  it('when the chosen storm shelter itself causes the deficit, the warning points to the other response, which fits', () => {
    const cfg = missionFor('hard');
    // battery 5 + solar 13 = 18 < habitat 12 + shelter 7; oxygen already off
    let s = { ...createInitialState(cfg), shift: 11, resources: { energy: 5, oxygen: 100, food: 30, health: 90, research: 4 }, upgrades: { solar: true, oxygen: false, battery: false }, facilities: { oxygen: false, greenhouse: false, shelter: false, lab: false } };
    s = chooseOption(s, cfg, 'shelter');
    const o = projectCurrentShift(s, cfg);
    expect(o.optionalDeficit).toBeGreaterThan(0);
    expect(getWarnings(s, cfg, o).map((w) => w.code)).toContain('tryOtherChoice');
    const other = chooseOption(s, cfg, 'work');
    const o2 = projectCurrentShift(other, cfg);
    expect(o2.optionalDeficit).toBe(0);
    expect(getWarnings(other, cfg, o2).map((w) => w.code)).not.toContain('tryOtherChoice');
    expect(advanceShift(other, cfg).status).toBe('playing');
  });
});

describe('coach tips', () => {
  const cfg = missionFor('easy');
  it('shift 1 explains power and oxygen; at most two tips at once', () => {
    const s = createInitialState(cfg);
    const tips = coachTips(s, cfg, projectCurrentShift(s, cfg));
    expect(tips).toEqual(['power', 'oxygen']);
  });
  it('switching everything on gives the power-shortage tip first', () => {
    let s = createInitialState(cfg);
    for (const f of ['greenhouse', 'shelter', 'lab'] as const) s = toggleFacility(s, cfg, f);
    s = { ...s, resources: { ...s.resources, energy: 5 } };
    expect(coachTips(s, cfg, projectCurrentShift(s, cfg))[0]).toBe('deficit');
  });
  it('an emergency without a decision asks for one; finished missions show no tips', () => {
    const s = { ...createInitialState(cfg), shift: 3 };
    expect(coachTips(s, cfg, projectCurrentShift(s, cfg))).toContain('event');
    const done = advanceShift({ ...createInitialState(cfg), shift: 12 }, cfg);
    expect(coachTips(done, cfg, projectCurrentShift(done, cfg))).toEqual([]);
  });
  it('tips are open every shift on Easy, the first two on Normal, closed on Hard', () => {
    expect([1, 6, 12].map((n) => coachByDefault(DIFFICULTIES.easy.help.coach, n))).toEqual([true, true, true]);
    expect([1, 2, 3].map((n) => coachByDefault(DIFFICULTIES.normal.help.coach, n))).toEqual([true, true, false]);
    expect(coachByDefault(DIFFICULTIES.hard.help.coach, 1)).toBe(false);
  });
});
