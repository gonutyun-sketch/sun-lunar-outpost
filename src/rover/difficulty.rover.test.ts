/**
 * Rover missions per difficulty: only battery and puzzle values change. Movement, collisions,
 * the map and the success conditions are identical in every mode.
 */
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, DIFFICULTY_IDS, type DifficultyId } from '../game/difficulty';
import { createCircuit, rotateTile, targetMasks, wrongTiles } from './circuit';
import { createPressureGame, inBand, stepPressure, type PressureGame } from './pressure';
import { DOCK, driveRoute, ROUTES, type RouteId } from './routes';
import { createRover, ROVER, stepRover, type Input, type Rover } from './sim';
import { MAP } from './world';

const NONE: Input = { up: false, down: false, left: false, right: false };
const tuneOf = (d: DifficultyId) => DIFFICULTIES[d].rover;

function drive(start: Rover, waypoints: [number, number][], scale: number, maxT = 120) {
  let r = start, t = 0;
  const dt = 1 / 60;
  for (const [wx, wy] of waypoints) {
    while (Math.hypot(r.x - wx, r.y - wy) > 30 && t < maxT) {
      const dx = wx - r.x, dy = wy - r.y;
      r = stepRover(MAP, r, { right: dx > 12, left: dx < -12, down: dy > 12, up: dy < -12 }, dt, false, scale).rover;
      t += dt;
    }
  }
  return { r, t };
}

/** Mission 3 survey on the sunny detour, drilling 4 s per sample, then home (same route as rover.test.ts). */
function survey(d: DifficultyId) {
  const tn = tuneOf(d);
  const s1: [number, number] = [MAP.sites.sample1.x, MAP.sites.sample1.y];
  const s2: [number, number] = [MAP.sites.sample2.x, MAP.sites.sample2.y];
  const s3: [number, number] = [MAP.sites.sample3.x, MAP.sites.sample3.y];
  let r = createRover(MAP, tn.batteryStart), t = 0, min = r.battery;
  for (const leg of [[[1100, 1100], s3], [[1450, 1590], [2050, 1590], s1], [[2440, 1400], s2]] as [number, number][][]) {
    const res = drive(r, leg, tn.drainScale);
    r = res.r; t += res.t;
    for (let i = 0; i < 240; i++) r = stepRover(MAP, r, NONE, 1 / 60, true, tn.drainScale).rover;
    min = Math.min(min, r.battery);
  }
  const home = drive(r, [[1500, 1080], [1000, 1000], [860, 900]], tn.drainScale);
  return { end: home.r.battery, t: t + home.t, pos: [Math.round(home.r.x), Math.round(home.r.y)] };
}

describe('rover difficulty settings', () => {
  it('Hard keeps the original rover values', () => {
    const h = tuneOf('hard');
    expect(h.batteryStart).toBe(ROVER.batteryStart);
    expect(h.drainScale).toBe(1);
    expect(h.rotateCost).toBe(ROVER.rotateCost);
    expect(h.pressureBandPad).toBe(0);
    expect(h.circuitHint).toBe('none');
  });

  it('easier modes are more forgiving in every rover setting', () => {
    const [e, n, h] = DIFFICULTY_IDS.map(tuneOf);
    expect(e.batteryStart).toBeGreaterThan(n.batteryStart);
    expect(n.batteryStart).toBeGreaterThan(h.batteryStart);
    expect(e.drainScale).toBeLessThan(n.drainScale);
    expect(n.drainScale).toBeLessThan(h.drainScale);
    expect(e.pressureHold).toBeLessThan(h.pressureHold);
    expect(e.pressureBandPad).toBeGreaterThan(n.pressureBandPad);
    expect(e.batteryStart).toBeLessThanOrEqual(ROVER.batteryMax);
  });

  it('drain scale changes battery only: the rover drives exactly the same path at the same speed', () => {
    const route: [number, number][] = [[1100, 700], [1350, 380], [1700, 380]];
    const a = drive(createRover(MAP), route, 1);
    const b = drive(createRover(MAP), route, 0.6);
    expect(b.r.x).toBe(a.r.x);
    expect(b.r.y).toBe(a.r.y);
    expect(b.t).toBe(a.t);
    expect(b.r.battery).toBeGreaterThan(a.r.battery);
    // drains scale (shadow, deep shadow, driving); the small sunlight charge is the same in every mode
    const dark = { ...createRover(MAP), x: MAP.shadows[0].x + 100, y: MAP.shadows[0].y - 200 };
    expect(80 - stepRover(MAP, dark, NONE, 1, false, 0.6).rover.battery).toBeCloseTo(ROVER.shadowDrain * 0.6, 6);
    const sunny = { ...createRover(MAP), x: 900, y: 200 };
    expect(stepRover(MAP, sunny, NONE, 1, false, 0.6).rover.battery).toBeCloseTo(80 + ROVER.sunCharge, 6);
    // charging pad rate is the same in every mode
    const pad = { ...createRover(MAP), x: MAP.charger.x, y: MAP.charger.y, battery: 50 };
    expect(stepRover(MAP, pad, NONE, 1, false, 0.6).rover.battery).toBe(50 + ROVER.padCharge);
  });

  it('Mission 3 full survey: every mode finishes; Easy leaves the most battery, Hard the original margin', () => {
    const r = Object.fromEntries(DIFFICULTY_IDS.map((d) => [d, survey(d)])) as Record<DifficultyId, ReturnType<typeof survey>>;
    // eslint-disable-next-line no-console
    console.log('[survey by difficulty]', DIFFICULTY_IDS.map((d) => `${d} ${r[d].end.toFixed(1)}`).join(' | '));
    expect(r.hard.end).toBeGreaterThan(0);
    expect(r.normal.end).toBeGreaterThan(r.hard.end + 15);
    expect(r.easy.end).toBeGreaterThan(r.normal.end + 15);
    expect(r.easy.pos).toEqual(r.hard.pos); // same route and end point
  });

  /** Mission 1 round trip: out by one route, repair (seconds at the site, in shadow, 6 rotations), home by a route. */
  function m1(d: DifficultyId, out: RouteId, home: RouteId, repairSec: number) {
    const tn = tuneOf(d);
    const go = driveRoute(createRover(MAP, tn.batteryStart), ROUTES[out], tn.drainScale);
    let r = go.rover;
    for (let i = 0; i < repairSec * 60; i++) r = stepRover(MAP, r, NONE, 1 / 60, true, tn.drainScale).rover;
    r = { ...r, battery: r.battery - 6 * tn.rotateCost };
    const back = driveRoute(r, [...ROUTES[home].slice(0, -1).reverse(), DOCK], tn.drainScale);
    return { arrive: go.rover.battery, arriveT: go.time, home: back.rover.battery, minHome: Math.min(r.battery, back.rover.battery), docked: Math.hypot(back.rover.x - DOCK[0], back.rover.y - DOCK[1]) < 40 };
  }

  it('Mission 1 in every mode: both routes reach the array; the shortcut is faster, the sunny detour saves battery', () => {
    const rows = DIFFICULTY_IDS.map((d) => {
      const s = m1(d, 'shadow', 'shadow', 15), y = m1(d, 'sunny', 'sunny', 15);
      return { d, s, y };
    });
    // eslint-disable-next-line no-console
    console.log('[M1 by difficulty]', rows.map(({ d, s, y }) =>
      `${d}: shortcut ${s.arriveT.toFixed(1)}s arrive ${s.arrive.toFixed(1)} home ${s.home.toFixed(1)} | sunny ${y.arriveT.toFixed(1)}s arrive ${y.arrive.toFixed(1)} home ${y.home.toFixed(1)}`).join(' || '));
    for (const { d, s, y } of rows) {
      expect(s.docked && y.docked, d).toBe(true);
      expect(s.arriveT).toBeLessThan(y.arriveT);
      expect(y.arrive - s.arrive, d).toBeGreaterThan(4); // arrival gap grows with the drain scale
      expect(y.home - s.home, d).toBeGreaterThan(8); // round trip: the sunny route keeps a clear reserve
      expect(s.home, d).toBeGreaterThan(10); // the shortcut both ways is risky but possible with a normal repair
    }
    const hard = rows[2];
    expect(hard.y.arrive - hard.s.arrive).toBeGreaterThan(7);
    expect(hard.y.home - hard.s.home).toBeGreaterThan(12);
    expect(rows[0].y.home).toBeGreaterThan(65); // Easy: a big reserve on the sunny route
  });

  it('Mission 1 on Hard: a slow repair after the shortcut leaves almost nothing — the sunny way home rescues it', () => {
    const risky = m1('hard', 'shadow', 'shadow', 25);
    const rescue = m1('hard', 'shadow', 'sunny', 25);
    expect(risky.home).toBeLessThan(8);
    expect(rescue.home).toBeGreaterThan(risky.home + 4);
    expect(m1('normal', 'shadow', 'shadow', 25).home).toBeGreaterThan(20); // Normal: one slow repair is not fatal
  });

  it('Mission 2 full trip (depot, check all three valves, 15 s pressure work, dock) is possible in every mode', () => {
    const v = (id: 'valveA' | 'valveB' | 'valveC'): [number, number] => [MAP.sites[id].x, MAP.sites[id].y];
    for (const d of DIFFICULTY_IDS) {
      const tn = tuneOf(d);
      let r = driveRoute(createRover(MAP, tn.batteryStart), [[MAP.sites.depot.x + 60, MAP.sites.depot.y + 60]], tn.drainScale).rover;
      r = driveRoute(r, [[90, 600], [80, 420], v('valveA'), v('valveB'), v('valveC')], tn.drainScale).rover;
      for (let i = 0; i < 15 * 60; i++) r = stepRover(MAP, r, NONE, 1 / 60, true, tn.drainScale).rover;
      const home = driveRoute(r, [[330, 300], [80, 420], [90, 600], [700, 760], DOCK], tn.drainScale);
      expect(home.rover.battery, d).toBeGreaterThan(d === 'hard' ? 15 : 35);
      expect(Math.hypot(home.rover.x - DOCK[0], home.rover.y - DOCK[1])).toBeLessThan(40);
    }
  });

  it('Mission 1 circuit: the hint knows the right position of every rotatable tile', () => {
    let c = createCircuit();
    expect(wrongTiles(c)).toBe(3);
    for (const [i, m] of targetMasks()) while (c.tiles[i].mask !== m) c = rotateTile(c, i);
    expect(wrongTiles(c)).toBe(0);
  });
});

/** Pressure bot (careful taps) from rover.test.ts; returns time to solve and peak wobble. */
function regulate(g0: PressureGame, style: 'careful' | 'reckless', maxT = 120) {
  let g = g0, t = 0, tap = 0, maxWobble = 0;
  const dt = 1 / 60;
  while (!g.done && t < maxT) {
    const err = g.gauges.map((x) => (inBand(x) ? 0 : Math.abs((x.band[0] + x.band[1]) / 2 - x.p)));
    const sel = err.indexOf(Math.max(...err));
    const x = g.gauges[sel];
    const mid = (x.band[0] + x.band[1]) / 2;
    let dir: -1 | 0 | 1 = Math.abs(mid - x.p) < 3 ? 0 : mid > x.p ? 1 : -1;
    if (style === 'careful') { tap = (tap + dt) % 0.5; if (tap > 0.2) dir = 0; }
    g = stepPressure(g, sel, dir, dt).game;
    maxWobble = Math.max(maxWobble, ...g.gauges.map((q) => q.wobble));
    t += dt;
  }
  return { g, t, maxWobble };
}

describe('Mission 2 pressure puzzle by difficulty', () => {
  const game = (d: DifficultyId) => { const tn = tuneOf(d); return createPressureGame({ bandPad: tn.pressureBandPad, hold: tn.pressureHold, wobbleScale: tn.wobbleScale }); };

  it('Hard equals the original puzzle', () => {
    expect(game('hard')).toEqual(createPressureGame());
  });

  it('Easy has wider bands and a shorter hold; careful play solves it in every mode', () => {
    const e = game('easy'), h = game('hard');
    e.gauges.forEach((g, i) => {
      expect(g.band[0]).toBeLessThan(h.gauges[i].band[0]);
      expect(g.band[1]).toBeGreaterThan(h.gauges[i].band[1]);
    });
    const times = DIFFICULTY_IDS.map((d) => regulate(game(d), 'careful'));
    // eslint-disable-next-line no-console
    console.log('[pressure by difficulty]', DIFFICULTY_IDS.map((d, i) => `${d} ${times[i].t.toFixed(1)} s`).join(' | '));
    for (const r of times) expect(r.g.done).toBe(true);
    expect(times[0].t).toBeLessThan(times[2].t);
  });

  it('holding a valve too long still causes wobble, but less on Easy', () => {
    // hold gauge 1's valve open for 1.2 s from the same start in each mode
    const held = (d: DifficultyId) => {
      let g = game(d);
      for (let i = 0; i < 72; i++) g = stepPressure(g, 0, 1, 1 / 60).game;
      return g.gauges[0];
    };
    const e = held('easy'), n = held('normal'), h = held('hard');
    expect(e.valve).toBeCloseTo(h.valve, 6); // the valve itself responds the same
    expect(e.wobble).toBeGreaterThan(0);
    expect(e.wobble).toBeLessThan(n.wobble);
    expect(n.wobble).toBeLessThan(h.wobble);
    expect(regulate(game('hard'), 'reckless', 20).g.done).toBe(false);
  });
});
