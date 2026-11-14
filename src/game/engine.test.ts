import { describe, expect, it } from 'vitest';
import { MISSION } from './config';
import {
  advanceShift,
  canAdvance,
  computeScore,
  createInitialState,
  projectCurrentShift,
  simulateShift,
  shiftSunlight,
  solarGeneration,
  toggleFacility,
} from './engine';
import type { Facilities, GameState } from './types';

const OFF: Facilities = { oxygen: false, greenhouse: false, shelter: false, lab: false };
const set = (s: GameState, f: Partial<Facilities>): GameState => ({ ...s, facilities: { ...OFF, ...f } });

describe('solar generation', () => {
  it('matches round(30 × modifier) for every shift', () => {
    const expected = [27, 24, 17, 8, 11, 20, 29, 18];
    expected.forEach((v, i) => expect(solarGeneration(MISSION, i + 1)).toBe(v));
  });
});

describe('simulateShift', () => {
  it('applies GDD formulas for shift 1 with oxygen on', () => {
    const o = simulateShift(MISSION, 1, MISSION.initial, { ...OFF, oxygen: true });
    expect(o.available).toBe(82); // 55 + 27
    expect(o.demand).toBe(19); // 12 + 7
    expect(o.after.energy).toBe(63);
    expect(o.after.oxygen).toBe(71); // 65 + 20 - 14
    expect(o.after.food).toBe(58); // 70 - 12
    expect(o.after.health).toBe(100);
  });

  it('caps battery at 100 before deducting demand', () => {
    const o = simulateShift(MISSION, 1, { ...MISSION.initial, energy: 95 }, OFF);
    expect(o.available).toBe(100);
    expect(o.after.energy).toBe(88);
  });

  it('greenhouse adds 16 food and costs 6 energy', () => {
    const o = simulateShift(MISSION, 1, MISSION.initial, { ...OFF, greenhouse: true });
    expect(o.after.food).toBe(74);
    expect(o.demand).toBe(18);
  });

  it('reports optional deficit instead of going negative', () => {
    const o = simulateShift(MISSION, 4, { ...MISSION.initial, energy: 10 }, {
      oxygen: true, greenhouse: true, shelter: true, lab: true,
    });
    expect(o.available).toBe(18);
    expect(o.habitatPowerFailure).toBe(false);
    expect(o.optionalDeficit).toBe(22); // 40 - 18
    expect(canAdvance(o)).toBe(false);
  });

  it('flags habitat power failure when available < 12', () => {
    const o = simulateShift(MISSION, 4, { ...MISSION.initial, energy: 3 }, OFF);
    expect(o.available).toBe(11);
    expect(o.habitatPowerFailure).toBe(true);
    expect(o.after.energy).toBe(0);
  });

  it('radiation hits for 35 without shelter and is blocked with it', () => {
    const exposed = simulateShift(MISSION, 4, MISSION.initial, OFF);
    expect(exposed.radiation).toBe('exposed');
    expect(exposed.after.health).toBe(65);
    const safe = simulateShift(MISSION, 4, MISSION.initial, { ...OFF, shelter: true });
    expect(safe.radiation).toBe('protected');
    expect(safe.after.health).toBe(100);
  });

  it('lab adds one milestone, never above 3', () => {
    expect(simulateShift(MISSION, 1, MISSION.initial, { ...OFF, lab: true }).after.research).toBe(1);
    expect(
      simulateShift(MISSION, 1, { ...MISSION.initial, research: 3 }, { ...OFF, lab: true }).after.research,
    ).toBe(3);
  });
});

describe('advanceShift & mission outcomes', () => {
  it('does not execute a turn with an optional-system deficit', () => {
    let s = createInitialState(MISSION);
    s = { ...set(s, { oxygen: true, greenhouse: true, shelter: true, lab: true }), resources: { ...s.resources, energy: 0 } };
    // available 27 < demand 40
    expect(advanceShift(s, MISSION)).toBe(s);
  });

  it('fails with power when habitat cannot be powered', () => {
    let s = createInitialState(MISSION);
    s = { ...set(s, {}), shift: 4, resources: { ...s.resources, energy: 2 } };
    const r = advanceShift(s, MISSION);
    expect(r.status).toBe('failed');
    expect(r.failReason).toBe('power');
  });

  it('fails when oxygen reaches zero', () => {
    let s = createInitialState(MISSION);
    s = { ...set(s, {}), resources: { ...s.resources, oxygen: 14 } };
    const r = advanceShift(s, MISSION);
    expect(r.failReason).toBe('oxygen');
  });

  it('two unsheltered radiation events fail on crew health', () => {
    let s = createInitialState(MISSION);
    s = { ...set(s, {}), shift: 7, resources: { ...s.resources, health: 65 } };
    const r = advanceShift(s, MISSION);
    expect(r.resources.health).toBe(30);
    expect(r.failReason).toBe('health');
  });

  it('reference plan achieves full success with score 95 (A)', () => {
    const plan: Partial<Facilities>[] = [
      { oxygen: true, greenhouse: true, lab: true },
      { oxygen: true, lab: true },
      { oxygen: true, lab: true },
      { oxygen: true, shelter: true },
      { greenhouse: true },
      { oxygen: true },
      { greenhouse: true, shelter: true },
      { oxygen: true },
    ];
    let s = createInitialState(MISSION);
    for (const p of plan) {
      s = set(s, p);
      expect(canAdvance(projectCurrentShift(s, MISSION))).toBe(true);
      s = advanceShift(s, MISSION);
    }
    expect(s.status).toBe('success');
    expect(s.resources).toEqual({ energy: 15, oxygen: 73, food: 22, health: 100, research: 3 });
    expect(s.history).toHaveLength(8);
    const score = computeScore(s, MISSION);
    expect(score).toMatchObject({ survival: 40, research: 30, safety: 20, energy: 5, total: 95, grade: 'A' });
  });

  it('survives without research => partial', () => {
    const plan: Partial<Facilities>[] = [
      { oxygen: true, greenhouse: true },
      { oxygen: true },
      { oxygen: true },
      { shelter: true },
      { greenhouse: true },
      { oxygen: true },
      { shelter: true, oxygen: true },
      { greenhouse: true },
    ];
    let s = createInitialState(MISSION);
    for (const p of plan) s = advanceShift(set(s, p), MISSION);
    expect(s.status).toBe('partial');
    expect(computeScore(s, MISSION).research).toBe(0);
  });

  it('ignores input after the mission ends', () => {
    const s: GameState = { ...createInitialState(MISSION), status: 'failed', failReason: 'food' };
    expect(advanceShift(s, MISSION)).toBe(s);
    expect(toggleFacility(s, MISSION, 'lab')).toBe(s);
  });
});

describe('computeScore', () => {
  it('never exceeds 100 or goes below 0', () => {
    const s: GameState = {
      ...createInitialState(MISSION),
      status: 'success',
      resources: { energy: 100, oxygen: 100, food: 100, health: 100, research: 3 },
    };
    expect(computeScore(s, MISSION).total).toBe(100);
    const f: GameState = {
      ...createInitialState(MISSION),
      status: 'failed',
      resources: { energy: 0, oxygen: 0, food: 0, health: 0, research: 0 },
    };
    expect(computeScore(f, MISSION).total).toBe(0);
  });
});

describe('NASA site data integration', () => {
  it('site value equals DN × label scaling factor (0.00004)', () => {
    expect(MISSION.site.rawDN * 0.00004).toBeCloseTo(MISSION.site.averageSunlitFraction, 6);
    expect(MISSION.site.averageSunlitFraction).toBeGreaterThan(0);
    expect(MISSION.site.averageSunlitFraction).toBeLessThanOrEqual(1);
  });

  it('cites the PGDA product, data file and Mazarico et al. 2011', () => {
    expect(MISSION.site.source.productPage).toBe('https://pgda.gsfc.nasa.gov/products/69');
    expect(MISSION.site.source.dataUrl).toContain('AVGVISIB_85S_060M_201608.IMG');
    expect(MISSION.site.source.citation).toContain('10.1016/j.icarus.2010.10.030');
  });

  it('shift sunlight = min(1, site average × scenario modifier)', () => {
    for (const s of MISSION.shifts) {
      const f = shiftSunlight(MISSION, s.shift);
      expect(f).toBeCloseTo(Math.min(1, MISSION.site.averageSunlitFraction * s.scenarioModifier), 4);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it('solar output follows the site value (changing the site changes power)', () => {
    const darker = { ...MISSION, site: { ...MISSION.site, averageSunlitFraction: 0.5 } };
    expect(solarGeneration(darker, 1)).toBe(Math.round(30 * 0.5 * 1.02));
    expect(solarGeneration(darker, 1)).toBeLessThan(solarGeneration(MISSION, 1));
  });
});
