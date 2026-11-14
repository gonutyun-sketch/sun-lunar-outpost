import { describe, expect, it } from 'vitest';
import { createCircuit, isSolved, powered, rotateMask, rotateTile, N, E, S, W } from './circuit';
import { createRover, ROVER, stepRover, type Input, type Rover } from './sim';
import { driveRoute, ROUTES } from './routes';
import { inShadow, MAP, shadowLevel } from './world';

const NONE: Input = { up: false, down: false, left: false, right: false };
const hold = (dirs: Partial<Input>): Input => ({ ...NONE, ...dirs });

/** Waypoint-following driver (8-direction keys, like a player). Returns rover + seconds. */
function drive(start: Rover, waypoints: [number, number][], maxT = 120) {
  let r = start, t = 0;
  const dt = 1 / 60;
  for (const [wx, wy] of waypoints) {
    while (Math.hypot(r.x - wx, r.y - wy) > 30 && t < maxT) {
      const dx = wx - r.x, dy = wy - r.y;
      const inp = hold({ right: dx > 12, left: dx < -12, down: dy > 12, up: dy < -12 });
      r = stepRover(MAP, r, inp, dt).rover;
      t += dt;
    }
  }
  return { r, t };
}

describe('rover physics', () => {
  it('accelerates smoothly toward the input and caps speed', () => {
    let r = createRover(MAP);
    r = stepRover(MAP, r, hold({ right: true }), 0.05).rover;
    expect(r.vx).toBeGreaterThan(0);
    expect(r.vx).toBeLessThan(ROVER.maxSpeed);
    for (let i = 0; i < 120; i++) r = stepRover(MAP, r, hold({ right: true }), 1 / 60).rover;
    expect(Math.hypot(r.vx, r.vy)).toBeLessThanOrEqual(ROVER.maxSpeed + 0.001);
  });
  it('decelerates when keys are released', () => {
    let r = { ...createRover(MAP), vx: 150 };
    for (let i = 0; i < 60; i++) r = stepRover(MAP, r, NONE, 1 / 60).rover;
    expect(Math.abs(r.vx)).toBeLessThan(5);
  });
  it('diagonal input is normalised (no faster diagonals)', () => {
    let a = createRover(MAP), b = createRover(MAP);
    for (let i = 0; i < 30; i++) {
      a = stepRover(MAP, a, hold({ right: true }), 1 / 60).rover;
      b = stepRover(MAP, b, hold({ right: true, down: true }), 1 / 60).rover;
    }
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(Math.hypot(a.vx, a.vy), 0);
  });
  it('cannot drive through a crater: slides around it', () => {
    const c = MAP.craters[0];
    let r: Rover = { ...createRover(MAP), x: c.x - c.r - 80, y: c.y };
    for (let i = 0; i < 180; i++) r = stepRover(MAP, r, hold({ right: true }), 1 / 60).rover;
    expect(Math.hypot(r.x - c.x, r.y - c.y)).toBeGreaterThanOrEqual(c.r + ROVER.radius - 0.5);
  });
  it('cannot leave the map', () => {
    let r: Rover = { ...createRover(MAP), x: 40, y: 40 };
    for (let i = 0; i < 120; i++) r = stepRover(MAP, r, hold({ left: true, up: true }), 1 / 60).rover;
    expect(r.x).toBeGreaterThanOrEqual(ROVER.radius);
    expect(r.y).toBeGreaterThanOrEqual(ROVER.radius);
  });
  it('stops driving at 0 battery', () => {
    let r: Rover = { ...createRover(MAP), battery: 0 };
    r = stepRover(MAP, r, hold({ right: true }), 0.2).rover;
    expect(r.vx).toBe(0);
  });
});

describe('rover battery (fictional training values)', () => {
  it('sunlight trickle-charges while stopped and barely drains while driving; shadow drains fast; the pad charges fastest', () => {
    const sun = { ...createRover(MAP), x: 900, y: 200 };
    expect(inShadow(MAP, 900, 200)).toBe(false);
    const resting = stepRover(MAP, sun, NONE, 1);
    expect(resting.rover.battery).toBeCloseTo(80 + ROVER.sunCharge, 5);
    expect(resting.rate).toBeGreaterThan(0);
    const sunlightDrive = stepRover(MAP, { ...sun, vx: 100 }, NONE, 0.1);
    expect(sunlightDrive.rate).toBeCloseTo(ROVER.sunCharge - ROVER.moveDrain, 5);
    expect(sunlightDrive.rate).toBeLessThan(0); // driving still uses a little more than the solar deck makes
    const sh = MAP.shadows[0];
    const dark = { ...createRover(MAP), x: sh.x + 100, y: sh.y - 200 };
    expect(inShadow(MAP, dark.x, dark.y)).toBe(true);
    expect(stepRover(MAP, dark, NONE, 1).rover.battery).toBeCloseTo(80 - ROVER.shadowDrain, 5);
    expect(stepRover(MAP, { ...createRover(MAP), x: MAP.charger.x, y: MAP.charger.y, battery: 50 }, NONE, 1).rover.battery).toBeCloseTo(50 + ROVER.padCharge, 5);
    const res = stepRover(MAP, { ...dark, vx: 100 }, NONE, 0.1);
    expect(res.rate).toBeCloseTo(-ROVER.shadowDrain - ROVER.moveDrain, 5);
    // a full minute parked in the sun gives only a little back: the pad is the real charger
    expect(ROVER.sunCharge * 60).toBeLessThan(ROVER.padCharge * 2);
  });

  it('drains inside the shadow zone and switches back to the sunlight rate across its edge', () => {
    const edge = MAP.shadows[0];
    const legacySunlight = { ...createRover(MAP), x: edge.x - 365, y: edge.y };
    const inside = stepRover(MAP, legacySunlight, NONE, 1);
    expect(inside.inShadow).toBe(true);
    expect(inside.rate).toBe(-ROVER.shadowDrain);
    const outside = stepRover(MAP, { ...legacySunlight, x: edge.x - edge.r }, NONE, 1);
    expect(outside.inShadow).toBe(false);
    expect(outside.rate).toBe(ROVER.sunCharge);
  });

  it('uses only the stronger drain in overlapping shadow zones and prioritizes the charging pad', () => {
    const point = { ...createRover(MAP), x: 2225, y: 1340, battery: 50 };
    expect(shadowLevel(MAP, point.x, point.y)).toBe(2);
    expect(stepRover(MAP, point, NONE, 1).rate).toBe(-ROVER.deepDrain);
    const testMap = { ...MAP, charger: { x: point.x, y: point.y, r: 40 } };
    const charge = stepRover(testMap, point, NONE, 1);
    expect(charge.charging).toBe(true);
    expect(charge.rover.battery).toBe(50 + ROVER.padCharge);
  });
  it('route choice matters (Hard values): the shadow shortcut is faster, the sunny detour clearly saves battery', () => {
    const target: [number, number] = [MAP.sites.solarB.x, MAP.sites.solarB.y];
    const short = driveRoute(createRover(MAP), ROUTES.shadow);
    const sunny = driveRoute(createRover(MAP), ROUTES.sunny);
    // eslint-disable-next-line no-console
    console.log('[route M1] shadow', short.time.toFixed(1), 's battery', short.rover.battery.toFixed(1), `(shadow ${short.zones[1].toFixed(1)} s)`,
      '| sunny', sunny.time.toFixed(1), 's battery', sunny.rover.battery.toFixed(1), `(shadow ${sunny.zones[1].toFixed(1)} s)`);
    for (const r of [short, sunny]) expect(Math.hypot(r.rover.x - target[0], r.rover.y - target[1])).toBeLessThan(40);
    expect(short.time).toBeLessThan(sunny.time);
    expect(short.zones[1]).toBeGreaterThan(sunny.zones[1] * 2);
    expect(sunny.rover.battery - short.rover.battery).toBeGreaterThan(7); // was ≈0.6 after the shadow expansion
    // the classic route around the crater's north side is in shadow too, and costs even more
    const north = driveRoute(createRover(MAP), [[1100, 700], [1350, 380], [1700, 380], [1850, 560], target]);
    expect(sunny.rover.battery - north.rover.battery).toBeGreaterThan(10);
  });
});

describe('circuit repair puzzle', () => {
  it('rotates masks clockwise', () => {
    expect(rotateMask(N)).toBe(E);
    expect(rotateMask(W)).toBe(N);
    expect(rotateMask(N | E)).toBe(E | S);
  });
  it('starts unsolved, fixed tiles cannot rotate, solvable in 6 rotations', () => {
    let c = createCircuit();
    expect(isSolved(c)).toBe(false);
    const fixed = c.tiles.findIndex((t) => !t.rotatable);
    expect(rotateTile(c, fixed)).toBe(c);
    const rot = c.tiles.map((t, i) => (t.rotatable ? i : -1)).filter((i) => i >= 0);
    expect(rot).toHaveLength(3);
    let n = 0;
    for (const i of rot) while (!(powered(c).has(i) && n < 50 && isTileRight(c, i))) { c = rotateTile(c, i); n++; }
    expect(isSolved(c)).toBe(true);
    expect(n).toBe(6);
  });
});

/** Helper: is tile i in its solved orientation? (solution masks from createCircuit) */
function isTileRight(c: ReturnType<typeof createCircuit>, i: number) {
  const solution: Record<number, number> = { 0: S | E, 2: W | S, 8: N | E };
  return c.tiles[i].mask === solution[i];
}

import { createPressureGame, inBand, P, stepPressure, type PressureGame } from './pressure';

/** Bot: per gauge, aim the valve at (band centre + leak/response) using short taps or long holds. */
function regulate(style: 'careful' | 'reckless', maxT = 120) {
  let g: PressureGame = createPressureGame();
  let t = 0, sel = 0, tap = 0;
  const dt = 1 / 60;
  let maxWobble = 0;
  while (!g.done && t < maxT) {
    // pick the gauge furthest from its band
    const err = g.gauges.map((x) => (inBand(x) ? 0 : Math.abs((x.band[0] + x.band[1]) / 2 - x.p)));
    sel = err.indexOf(Math.max(...err));
    const x = g.gauges[sel];
    const mid = (x.band[0] + x.band[1]) / 2; // the player only sees the needle
    let dir: -1 | 0 | 1 = Math.abs(mid - x.p) < 3 ? 0 : mid > x.p ? 1 : -1;
    if (style === 'careful') { tap = (tap + dt) % 0.5; if (tap > 0.2) dir = 0; } // short taps
    g = stepPressure(g, sel, dir, dt).game;
    maxWobble = Math.max(maxWobble, ...g.gauges.map((q) => q.wobble));
    t += dt;
  }
  return { g, t, maxWobble };
}

describe('pressure regulation minigame', () => {
  it('starts unsolved with gauges outside their bands', () => {
    const g = createPressureGame();
    expect(g.done).toBe(false);
    expect(g.gauges.some((x) => !inBand(x))).toBe(true);
  });
  it('doing nothing never succeeds (leaks pull pressure away)', () => {
    let g = createPressureGame();
    for (let i = 0; i < 60 * 30; i++) g = stepPressure(g, 0, 0, 1 / 60).game;
    expect(g.done).toBe(false);
  });
  it('careful tapping solves it; reckless holding builds much more wobble', () => {
    const careful = regulate('careful');
    const reckless = regulate('reckless');
    // eslint-disable-next-line no-console
    console.log('[pressure] careful', careful.t.toFixed(1), 's wobble', careful.maxWobble.toFixed(2), 'vents', careful.g.vents,
      '| reckless', reckless.t.toFixed(1), 's wobble', reckless.maxWobble.toFixed(2), 'vents', reckless.g.vents, 'done', reckless.g.done);
    expect(careful.g.done).toBe(true);
    expect(careful.t).toBeLessThan(45);
    expect(reckless.maxWobble).toBeGreaterThan(careful.maxWobble + 5);
    // rushing is never better: either it never stabilises or it is slower with vents
    expect(!reckless.g.done || (reckless.t > careful.t && reckless.g.vents > 0)).toBe(true);
  });
  it('over-pressure vents the gauge and resets the hold timer', () => {
    let g = createPressureGame();
    g = { ...g, stable: 2, gauges: g.gauges.map((x, i) => (i === 0 ? { ...x, p: 94.9, valve: 100 } : x)) };
    const r = stepPressure(g, 0, 1, 0.2);
    expect(r.vented).toBe(0);
    expect(r.game.gauges[0].p).toBe(P.ventTo);
    expect(r.game.stable).toBe(0);
    expect(r.game.vents).toBe(1);
  });
  it('needs a continuous hold of all three gauges in band', () => {
    let g = createPressureGame();
    g = { ...g, gauges: g.gauges.map((x) => ({ ...x, p: (x.band[0] + x.band[1]) / 2, valve: (x.band[0] + x.band[1]) / 2 + x.leak / P.response })) };
    for (let i = 0; i < 60 * (P.hold + 0.2); i++) g = stepPressure(g, 0, 0, 1 / 60).game;
    expect(g.done).toBe(true);
  });
});

describe('mission 2 map routes', () => {
  it('ridge blocks the direct way; shadowed west gap is shorter than the sunny east detour', () => {
    const valve: [number, number] = [MAP.sites.valveA.x, MAP.sites.valveA.y];
    const depot = { ...createRover(MAP), x: MAP.sites.depot.x, y: MAP.sites.depot.y };
    const west = drive(depot, [[90, 600], [80, 420], valve]);
    const east = drive(depot, [[700, 620], [710, 400], [420, 330], valve]);
    // eslint-disable-next-line no-console
    console.log('[route M2] west', west.t.toFixed(1), 's battery', west.r.battery.toFixed(1), '| east', east.t.toFixed(1), 's battery', east.r.battery.toFixed(1));
    expect(Math.hypot(west.r.x - valve[0], west.r.y - valve[1])).toBeLessThan(40);
    expect(Math.hypot(east.r.x - valve[0], east.r.y - valve[1])).toBeLessThan(40);
    expect(west.t).toBeLessThan(east.t);
    expect(west.r.battery).toBeLessThan(east.r.battery);
    // straight north from the depot hits the ridge
    let r = depot;
    for (let i = 0; i < 240; i++) r = stepRover(MAP, r, hold({ up: true }), 1 / 60).rover;
    expect(r.y).toBeGreaterThan(470);
  });
});

describe('mission 3: science survey terrain', () => {
  it('the permanently shadowed crater floor drains fastest (training value)', () => {
    const s = MAP.sites.sample1;
    expect(shadowLevel(MAP, s.x, s.y)).toBe(2);
    const r = stepRover(MAP, { ...createRover(MAP), x: s.x, y: s.y }, NONE, 1);
    expect(r.deep).toBe(true);
    expect(r.rover.battery).toBeCloseTo(80 - ROVER.deepDrain, 5);
    expect(ROVER.deepDrain).toBeGreaterThan(ROVER.shadowDrain);
    expect(shadowLevel(MAP, MAP.sites.sample2.x, MAP.sites.sample2.y)).toBe(0); // sunny east site
    expect(shadowLevel(MAP, MAP.sites.sample3.x, MAP.sites.sample3.y)).toBe(1); // moderate shadow
  });

  /** Drive a sample loop, drilling 4 s at each site, then return to the dock. */
  function survey(order: [number, number][][]) {
    let r = createRover(MAP), t = 0;
    for (const leg of order) {
      const d = drive(r, leg);
      r = d.r; t += d.t;
      for (let i = 0; i < 240; i++) r = stepRover(MAP, r, NONE, 1 / 60, true).rover; // drilling 4 s
      t += 4;
    }
    const home = drive(r, [[1500, 1080], [1000, 1000], [860, 900]]);
    return { battery: home.r.battery, t: t + home.t, min: Math.min(home.r.battery, r.battery) };
  }

  it('a full survey is possible; the shortcut through the deep shadow costs far more battery than the sunny detour', () => {
    const s1: [number, number] = [MAP.sites.sample1.x, MAP.sites.sample1.y];
    const s2: [number, number] = [MAP.sites.sample2.x, MAP.sites.sample2.y];
    const s3: [number, number] = [MAP.sites.sample3.x, MAP.sites.sample3.y];
    // risky: S3 → straight across the dark crater floor to S1 → S2
    const risky = survey([[[1100, 1100], s3], [[1700, 1420], s1], [[2440, 1400], s2]]);
    // safer: S3 → S1 entering from the south edge only → S2 along the sunny southern rim
    const safe = survey([[[1100, 1100], s3], [[1450, 1590], [2050, 1590], s1], [[2440, 1400], s2]]);
    // eslint-disable-next-line no-console
    console.log('[survey] risky', risky.t.toFixed(1), 's battery', risky.battery.toFixed(1), '| safe', safe.t.toFixed(1), 's battery', safe.battery.toFixed(1));
    expect(risky.battery).toBeGreaterThan(0);
    expect(safe.battery).toBeGreaterThan(0);
    expect(risky.battery).toBeLessThan(safe.battery);
  });
});

import { cameraZoom, joystickVector, knobOffset, renderDpr } from './touch';

describe('touch input helpers', () => {
  it('joystick: dead zone, normalised magnitude, clamped at the rim', () => {
    expect(joystickVector(5, 0, 60).mag).toBe(0); // inside dead zone
    const full = joystickVector(200, 0, 60);
    expect(full.mag).toBeCloseTo(1, 6);
    expect(full.x).toBeCloseTo(1, 6);
    const diag = joystickVector(100, 100, 60);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 6); // diagonals are not faster
    const half = joystickVector(0, -30, 60);
    expect(half.y).toBeLessThan(0);
    expect(half.mag).toBeGreaterThan(0.3);
    expect(half.mag).toBeLessThan(0.5);
    expect(knobOffset(120, 0, 60)).toEqual({ x: 60, y: 0 });
  });
  it('analog stick drives the rover; partial tilt is slower; keys still take priority', () => {
    let full = createRover(MAP), part = createRover(MAP);
    for (let i = 0; i < 120; i++) {
      full = stepRover(MAP, full, { ...NONE, ax: 1, ay: 0 }, 1 / 60).rover;
      part = stepRover(MAP, part, { ...NONE, ax: 0.4, ay: 0 }, 1 / 60).rover;
    }
    expect(full.vx).toBeGreaterThan(part.vx);
    expect(Math.hypot(full.vx, full.vy)).toBeLessThanOrEqual(ROVER.maxSpeed + 0.001);
    const diag = stepRover(MAP, createRover(MAP), { ...NONE, ax: Math.SQRT1_2, ay: Math.SQRT1_2 }, 0.1).rover;
    const straight = stepRover(MAP, createRover(MAP), { ...NONE, ax: 1, ay: 0 }, 0.1).rover;
    expect(Math.hypot(diag.vx, diag.vy)).toBeCloseTo(Math.hypot(straight.vx, straight.vy), 3);
    const keys = stepRover(MAP, createRover(MAP), { ...NONE, left: true, ax: 1, ay: 0 }, 0.1).rover;
    expect(keys.vx).toBeLessThan(0); // keyboard wins over a resting thumb
  });
  it('camera zoom and DPR limits', () => {
    expect(cameraZoom(1366, 600)).toBe(1);
    expect(cameraZoom(390, 500)).toBe(0.5);
    expect(cameraZoom(844, 300)).toBeCloseTo(300 / 520, 6);
    expect(renderDpr(3)).toBe(2);
    expect(renderDpr(0)).toBe(1);
  });
});
