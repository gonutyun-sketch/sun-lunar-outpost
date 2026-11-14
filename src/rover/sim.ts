/**
 * Rover physics and battery — pure functions (no DOM), unit-tested.
 * Battery numbers are FICTIONAL gameplay values (see ROVER below).
 */
import { inShadow, onCharger, type WorldMap } from './world';

export const ROVER = {
  radius: 22,
  maxSpeed: 150, // px/s
  accel: 620, // px/s² while a key is held
  drag: 4.2, // 1/s exponential damping when no input
  turnRate: 10, // how fast the heading follows the velocity
  batteryMax: 100,
  batteryStart: 80,
  sunCharge: 1, // per second in sunlight
  shadowDrain: 1.5, // per second in shadow
  moveDrain: 0.25, // extra per second while moving
  padCharge: 12, // per second on the charging pad
  rotateCost: 0.5, // per circuit rotation (robot arm)
};

export interface Input {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface Rover {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // radians, 0 = east
  battery: number;
  /** Seconds spent moving (stats). */
  driven: number;
}

export function createRover(m: WorldMap): Rover {
  return { x: m.start.x, y: m.start.y, vx: 0, vy: 0, angle: m.start.angle, battery: ROVER.batteryStart, driven: 0 };
}

const angleLerp = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * Math.min(1, t);
};

/** Push the rover out of a circle and remove the velocity component into it (slide along walls). */
function collideCircle(r: Rover, cx: number, cy: number, cr: number): boolean {
  const dx = r.x - cx, dy = r.y - cy;
  const min = cr + ROVER.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2) || 0.0001;
  const nx = dx / d, ny = dy / d;
  r.x = cx + nx * min;
  r.y = cy + ny * min;
  const vn = r.vx * nx + r.vy * ny;
  if (vn < 0) { r.vx -= vn * nx; r.vy -= vn * ny; }
  return true;
}

function collideRect(r: Rover, x: number, y: number, w: number, h: number): boolean {
  const px = Math.max(x, Math.min(r.x, x + w));
  const py = Math.max(y, Math.min(r.y, y + h));
  const dx = r.x - px, dy = r.y - py;
  if (dx * dx + dy * dy >= ROVER.radius ** 2) return false;
  if (dx === 0 && dy === 0) { r.y = y - ROVER.radius; r.vy = Math.min(0, r.vy); return true; }
  return collideCircle(r, px, py, 0);
}

export interface StepResult {
  rover: Rover;
  /** Hit something this step (for feedback). */
  bumped: boolean;
  inShadow: boolean;
  charging: boolean;
  moving: boolean;
  /** Battery change per second at this moment (for the HUD). */
  rate: number;
}

/** Advance the rover by dt seconds. `frozen` = no driving (e.g. while repairing), battery still changes. */
export function stepRover(m: WorldMap, prev: Rover, input: Input, dt: number, frozen = false): StepResult {
  const r: Rover = { ...prev };
  let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (frozen || r.battery <= 0) { ix = 0; iy = 0; }
  const len = Math.hypot(ix, iy);
  if (len > 0) {
    r.vx += (ix / len) * ROVER.accel * dt;
    r.vy += (iy / len) * ROVER.accel * dt;
    // gentle damping of the sideways component so turns feel smooth, not icy
    const k = Math.exp(-1.6 * dt);
    const dirx = ix / len, diry = iy / len;
    const along = r.vx * dirx + r.vy * diry;
    r.vx = dirx * along + (r.vx - dirx * along) * k;
    r.vy = diry * along + (r.vy - diry * along) * k;
  } else {
    const k = Math.exp(-ROVER.drag * dt);
    r.vx *= k;
    r.vy *= k;
  }
  const sp = Math.hypot(r.vx, r.vy);
  if (sp > ROVER.maxSpeed) { r.vx *= ROVER.maxSpeed / sp; r.vy *= ROVER.maxSpeed / sp; }
  if (sp < 2 && len === 0) { r.vx = 0; r.vy = 0; }

  r.x += r.vx * dt;
  r.y += r.vy * dt;

  let bumped = false;
  for (const c of m.craters) bumped = collideCircle(r, c.x, c.y, c.r) || bumped;
  for (const c of m.rocks) bumped = collideCircle(r, c.x, c.y, c.r) || bumped;
  for (const b of m.blocks) bumped = collideRect(r, b.x, b.y, b.w, b.h) || bumped;
  // world edges
  const R = ROVER.radius;
  if (r.x < R) { r.x = R; r.vx = Math.max(0, r.vx); bumped = true; }
  if (r.y < R) { r.y = R; r.vy = Math.max(0, r.vy); bumped = true; }
  if (r.x > m.w - R) { r.x = m.w - R; r.vx = Math.min(0, r.vx); bumped = true; }
  if (r.y > m.h - R) { r.y = m.h - R; r.vy = Math.min(0, r.vy); bumped = true; }

  const speed = Math.hypot(r.vx, r.vy);
  const moving = speed > 8;
  if (moving) {
    r.angle = angleLerp(r.angle, Math.atan2(r.vy, r.vx), ROVER.turnRate * dt);
    r.driven += dt;
  }

  const shadow = inShadow(m, r.x, r.y);
  const charging = onCharger(m, r.x, r.y);
  const rate = charging ? ROVER.padCharge : (shadow ? -ROVER.shadowDrain : ROVER.sunCharge) - (moving ? ROVER.moveDrain : 0);
  r.battery = Math.max(0, Math.min(ROVER.batteryMax, r.battery + rate * dt));

  return { rover: r, bumped, inShadow: shadow, charging, moving, rate };
}

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
