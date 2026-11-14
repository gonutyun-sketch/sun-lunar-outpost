import { describe, expect, it } from 'vitest';
import { MISSION } from './config';
import {
  activeExpedition,
  advanceShift,
  applyExpedition,
  batteryCapacity,
  canAdvance,
  chooseOption,
  computeScore,
  createInitialState,
  getChapter,
  getEvent,
  getForecast,
  projectCurrentShift,
  shiftSunlight,
  simulateShift,
  solarDamageMult,
  solarGeneration,
  toggleBuild,
  toggleFacility,
} from './engine';
import type { Facilities, GameState, Upgrades } from './types';

const OFF: Facilities = { oxygen: false, greenhouse: false, shelter: false, lab: false };
const NOUP: Upgrades = { solar: false, oxygen: false, battery: false };
// Helper state for isolated rule tests: the rover repair is already done unless a test says otherwise.
const at = (shift: number, patch: Partial<GameState> = {}): GameState => ({ ...createInitialState(MISSION), expeditionsDone: ['solarRepair'], shift, ...patch });

describe('mission structure', () => {
  it('has 12 shifts in 3 chapters and 5 forecast emergencies', () => {
    expect(MISSION.totalShifts).toBe(12);
    expect(MISSION.shifts).toHaveLength(12);
    expect([1, 4, 5, 8, 9, 12].map((s) => getChapter(MISSION, s))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(MISSION.events).toHaveLength(5);
    for (const e of MISSION.events) {
      expect(e.warnShift).toBe(e.shift - 1); // always forecast one shift ahead
      expect(getForecast(MISSION, e.warnShift)?.id).toBe(e.id);
      expect(e.choices.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('solar & NASA site value', () => {
  it('sunlight = min(1, site average × scenario modifier) and never exceeds 1', () => {
    for (const s of MISSION.shifts) {
      const f = shiftSunlight(MISSION, s.shift);
      expect(f).toBeCloseTo(Math.min(1, MISSION.site.averageSunlitFraction * s.scenarioModifier), 4);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
  it('solar = round(peak × sunlight); the Solar upgrade raises peak output', () => {
    expect(solarGeneration(MISSION, 1)).toBe(Math.round(30 * shiftSunlight(MISSION, 1)));
    const up = { ...NOUP, solar: true };
    expect(solarGeneration(MISSION, 1, up)).toBe(Math.round((30 + MISSION.upgrades.solar.bonus!) * shiftSunlight(MISSION, 1)));
  });
  it('NASA value equals DN × label scaling factor and is cited', () => {
    expect(MISSION.site.rawDN * 0.00004).toBeCloseTo(MISSION.site.averageSunlitFraction, 6);
    expect(MISSION.site.source.productPage).toBe('https://pgda.gsfc.nasa.gov/products/69');
    expect(MISSION.site.source.citation).toContain('10.1016/j.icarus.2010.10.030');
  });
});

describe('simulateShift — base rules', () => {
  it('shift 1 with oxygen on', () => {
    const o = simulateShift(MISSION, 1, MISSION.initial, { ...OFF, oxygen: true });
    const solar = solarGeneration(MISSION, 1);
    expect(o.available).toBe(Math.min(100, 55 + solar));
    expect(o.demand).toBe(19);
    expect(o.after.energy).toBe(o.available - 19);
    expect(o.after.oxygen).toBe(71);
    expect(o.after.food).toBe(58);
  });
  it('caps battery at capacity before deducting demand', () => {
    const o = simulateShift(MISSION, 1, { ...MISSION.initial, energy: 95 }, OFF);
    expect(o.available).toBe(100);
    expect(o.after.energy).toBe(88);
  });
  it('blocks optional deficit and fails on habitat power', () => {
    const d = simulateShift(MISSION, 6, { ...MISSION.initial, energy: 10 }, { oxygen: true, greenhouse: true, shelter: true, lab: true });
    expect(d.optionalDeficit).toBeGreaterThan(0);
    expect(canAdvance(d)).toBe(false);
    const f = simulateShift(MISSION, 6, { ...MISSION.initial, energy: 0 }, OFF);
    expect(f.available).toBeLessThan(12);
    expect(f.habitatPowerFailure).toBe(true);
  });
  it('lab adds one milestone, never above the goal', () => {
    expect(simulateShift(MISSION, 1, MISSION.initial, { ...OFF, lab: true }).after.research).toBe(1);
    const cap = MISSION.capacity.research;
    expect(simulateShift(MISSION, 1, { ...MISSION.initial, research: cap }, { ...OFF, lab: true }).after.research).toBe(cap);
  });
});

describe('upgrades', () => {
  it('cost energy now and take effect next shift; not before unlock or on the last shift', () => {
    let s = at(2);
    s = toggleBuild(s, MISSION, 'battery');
    expect(s.build).toBe('battery');
    const o = projectCurrentShift(s, MISSION);
    expect(o.demandBreakdown.find((b) => b.id === 'build')?.cost).toBe(MISSION.upgrades.battery.energyCost);
    expect(o.capacity).toBe(100); // not yet
    const n = advanceShift(s, MISSION);
    expect(n.upgrades.battery).toBe(true);
    expect(n.build).toBeNull();
    expect(batteryCapacity(MISSION, n.upgrades)).toBe(100 + MISSION.upgrades.battery.bonus!);
    expect(toggleBuild(at(1), MISSION, 'solar').build).toBeNull();
    expect(toggleBuild(at(12), MISSION, 'solar').build).toBeNull();
  });
  it('oxygen upgrade makes the recycler cheaper and stronger', () => {
    const up = { ...NOUP, oxygen: true };
    const o = simulateShift(MISSION, 1, MISSION.initial, { ...OFF, oxygen: true }, { upgrades: up });
    expect(o.demand).toBe(12 + MISSION.upgrades.oxygen.energyCostAfter!);
    expect(o.oxygenProduced).toBe(MISSION.upgrades.oxygen.producesAfter);
  });
});

describe('emergencies', () => {
  const ev = (id: string) => MISSION.events.find((e) => e.id === id)!;

  it('an emergency shift cannot run until a choice is made', () => {
    const s = at(ev('o2fault').shift);
    expect(projectCurrentShift(s, MISSION).needsChoice).toBe(true);
    expect(advanceShift(s, MISSION)).toBe(s);
    expect(canAdvance(projectCurrentShift(chooseOption(s, MISSION, 'repair'), MISSION))).toBe(true);
  });
  it('oxygen fault: repair costs energy; patch cuts output to 40%', () => {
    const shift = ev('o2fault').shift;
    const repair = projectCurrentShift(chooseOption(at(shift), MISSION, 'repair'), MISSION);
    expect(repair.demandBreakdown.find((b) => b.id === 'event')?.cost).toBe(10);
    expect(repair.oxygenProduced).toBe(20);
    const patch = projectCurrentShift(chooseOption(at(shift), MISSION, 'patch'), MISSION);
    expect(patch.oxygenProduced).toBe(8);
  });
  it('storm: shelter protects and closes the lab; working costs partial health', () => {
    const e = ev('storm1');
    const sh = chooseOption(at(e.shift, { facilities: { ...OFF, oxygen: true, lab: true } }), MISSION, 'shelter');
    expect(sh.facilities.shelter).toBe(true);
    expect(sh.facilities.lab).toBe(false);
    expect(toggleFacility(sh, MISSION, 'lab').facilities.lab).toBe(false); // locked
    const o = projectCurrentShift(sh, MISSION);
    expect(o.radiation).toBe('protected');
    expect(o.after.health).toBe(100);
    const wk = projectCurrentShift(chooseOption(at(e.shift), MISSION, 'work'), MISSION);
    expect(wk.radiation).toBe('partial');
    expect(wk.after.health).toBe(100 - e.choices.find((c) => c.id === 'work')!.radiationDamage!);
    // the shelter stays locked ON for this decision
    expect(toggleFacility(sh, MISSION, 'shelter').facilities.shelter).toBe(true);
    // with no decision at all the crew would be fully exposed (turn is blocked until they decide)
    const none = projectCurrentShift(at(e.shift), MISSION);
    expect(none.needsChoice).toBe(true);
    expect(none.radiationDamage).toBe(e.radiation!.damage);
  });
  it('dust: EVA costs health; waiting cuts solar to 30%', () => {
    const shift = ev('dust').shift;
    const eva = projectCurrentShift(chooseOption(at(shift), MISSION, 'eva'), MISSION);
    expect(eva.after.health).toBe(90);
    expect(eva.solar).toBe(solarGeneration(MISSION, shift));
    const wait = projectCurrentShift(chooseOption(at(shift), MISSION, 'wait'), MISSION);
    expect(wait.solar).toBe(solarGeneration(MISSION, shift, NOUP, 0.3));
  });
  it('pump: replace costs energy; early harvest gives food but stops the greenhouse', () => {
    const shift = ev('pump').shift;
    const base = at(shift, { facilities: { ...OFF, greenhouse: true } });
    const h = projectCurrentShift(chooseOption(base, MISSION, 'harvest'), MISSION);
    expect(h.foodProduced).toBe(0);
    expect(h.after.food).toBe(70 - 12 + 10);
    const r = projectCurrentShift(chooseOption(base, MISSION, 'replace'), MISSION);
    expect(r.foodProduced).toBe(16);
    expect(r.demandBreakdown.find((b) => b.id === 'event')?.cost).toBe(8);
  });
  it('event choice resets after the shift', () => {
    const shift = ev('o2fault').shift;
    const n = advanceShift(chooseOption(at(shift), MISSION, 'patch'), MISSION);
    expect(n.choice).toBeNull();
    expect(n.history[0].choiceId).toBe('patch');
    expect(getEvent(MISSION, n.shift)).toBeUndefined();
  });
});

describe('rover expedition: solar repair', () => {
  const fresh = (shift: number): GameState => ({ ...createInitialState(MISSION), shift });
  it('damage starts at shift 2 and reduces solar until repaired', () => {
    expect(activeExpedition(fresh(1), MISSION)).toBeUndefined();
    expect(solarDamageMult(fresh(1), MISSION)).toBe(1);
    const s2 = fresh(2);
    expect(activeExpedition(s2, MISSION)?.id).toBe('solarRepair');
    const o = projectCurrentShift(s2, MISSION);
    expect(o.solarDamaged).toBe(true);
    expect(o.solar).toBe(solarGeneration(MISSION, 2, NOUP, 0.8));
  });
  it('success removes the damage; base time does not pass', () => {
    const s = applyExpedition(fresh(2), MISSION, 'solarRepair', { success: true, failures: 0 });
    expect(s.shift).toBe(2);
    expect(s.resources).toEqual(MISSION.initial);
    expect(activeExpedition(s, MISSION)).toBeUndefined();
    expect(projectCurrentShift(s, MISSION).solar).toBe(solarGeneration(MISSION, 2));
    expect(applyExpedition(s, MISSION, 'solarRepair', { success: true, failures: 3 })).toBe(s); // cannot apply twice
  });
  it('each failed attempt costs base energy and the damage stays', () => {
    const s = applyExpedition(fresh(2), MISSION, 'solarRepair', { success: false, failures: 2 });
    expect(s.resources.energy).toBe(55 - 16);
    expect(s.expeditionFails).toBe(2);
    expect(activeExpedition(s, MISSION)?.id).toBe('solarRepair');
    const z = applyExpedition({ ...fresh(2), resources: { ...MISSION.initial, energy: 5 } }, MISSION, 'solarRepair', { success: false, failures: 1 });
    expect(z.resources.energy).toBe(0); // never negative
  });
  it('the damage persists into later shifts until repaired', () => {
    let s = fresh(2);
    s = advanceShift(s, MISSION);
    expect(s.shift).toBe(3);
    expect(solarDamageMult(s, MISSION)).toBe(0.8);
  });
});

describe('outcomes & score', () => {
  it('fails when oxygen reaches zero', () => {
    const r = advanceShift(at(1, { facilities: OFF, resources: { ...MISSION.initial, oxygen: 14 } }), MISSION);
    expect(r.failReason).toBe('oxygen');
  });
  it('ignores input after the mission ends', () => {
    const s: GameState = { ...createInitialState(MISSION), status: 'failed', failReason: 'food' };
    expect(advanceShift(s, MISSION)).toBe(s);
    expect(toggleFacility(s, MISSION, 'lab')).toBe(s);
    expect(chooseOption(s, MISSION, 'repair')).toBe(s);
  });
  it('research points scale to the goal; total stays within 0–100', () => {
    const full: GameState = { ...createInitialState(MISSION), status: 'success', resources: { energy: 100, oxygen: 100, food: 100, health: 100, research: 4 } };
    expect(computeScore(full, MISSION)).toMatchObject({ research: 30, total: 100, grade: 'A' });
    const half: GameState = { ...full, resources: { ...full.resources, research: 2 } };
    expect(computeScore(half, MISSION).research).toBe(15);
    const zero: GameState = { ...full, status: 'failed', resources: { energy: 0, oxygen: 0, food: 0, health: 0, research: 0 } };
    expect(computeScore(zero, MISSION).total).toBe(0);
  });
});
