import { describe, expect, it } from 'vitest';
import { createCircuit, isSolved, powered, rotateMask, rotateTile, N, E, S, W } from './circuit';
import { createRover, ROVER, stepRover, type Input, type Rover } from './sim';
import { inShadow, MAP } from './world';

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
  it('charges in sunlight, drains in shadow, extra drain while moving, fast on the pad', () => {
    const sun = { ...createRover(MAP), x: 300, y: 300 };
    expect(inShadow(MAP, 300, 300)).toBe(false);
    expect(stepRover(MAP, sun, NONE, 1).rover.battery).toBeCloseTo(81, 5);
    const sh = MAP.shadows[0];
    const dark = { ...createRover(MAP), x: sh.x + 100, y: sh.y - 200 };
    expect(inShadow(MAP, dark.x, dark.y)).toBe(true);
    expect(stepRover(MAP, dark, NONE, 1).rover.battery).toBeCloseTo(78.5, 5);
    expect(stepRover(MAP, { ...createRover(MAP), x: MAP.charger.x, y: MAP.charger.y, battery: 50 }, NONE, 1).rover.battery).toBeCloseTo(62, 5);
    const res = stepRover(MAP, { ...dark, vx: 100 }, NONE, 0.1);
    expect(res.rate).toBeCloseTo(-1.75, 5);
  });

  it('route choice matters: shadowed shortcut is faster, sunny detour saves battery', () => {
    const target: [number, number] = [MAP.sites.solarB.x, MAP.sites.solarB.y];
    const north = drive(createRover(MAP), [[1100, 700], [1350, 380], [1700, 380], [1850, 560], target]);
    const south = drive(createRover(MAP), [[1150, 1080], [1600, 1110], [2000, 1080], [2200, 820], target]);
    // eslint-disable-next-line no-console
    console.log('[route] north', north.t.toFixed(1), 's battery', north.r.battery.toFixed(1), '| south', south.t.toFixed(1), 's battery', south.r.battery.toFixed(1));
    expect(Math.hypot(north.r.x - target[0], north.r.y - target[1])).toBeLessThan(40);
    expect(Math.hypot(south.r.x - target[0], south.r.y - target[1])).toBeLessThan(40);
    expect(north.t).toBeLessThan(south.t);
    expect(north.r.battery).toBeLessThan(south.r.battery);
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
