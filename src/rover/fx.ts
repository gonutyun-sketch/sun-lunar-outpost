/**
 * Visual-only state for the exploration view (pure, no DOM, unit-tested).
 * Nothing here feeds back into the rover physics, battery, collisions or mission rules —
 * it only decides what to draw: particles (capped), wheel tracks, a smooth look-ahead camera,
 * feedback bursts and repair animations.
 */
import type { Rover } from './sim';

export type ParticleKind = 'dust' | 'gas' | 'spark' | 'sparkle';
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; decay: number; size: number; kind: ParticleKind }
export type BurstKind = 'ok' | 'info' | 'ping' | 'big' | 'warn';
export interface Burst { x: number; y: number; t0: number; kind: BurstKind; text?: string }
export interface TrackPoint { x: number; y: number; a: number; t: number; gap: boolean }
export interface Camera { x: number; y: number; ready: boolean }

/** Hard limits keep the frame cost bounded on low-end phones. */
export const FX_LIMITS = { particles: 140, tracks: 320, bursts: 8, trackStep: 7, trackLife: 45 };

export interface Vis {
  particles: Particle[];
  tracks: TrackPoint[];
  bursts: Burst[];
  cam: Camera;
  /** Distance driven (px), drives the wheel-tread animation. */
  odo: number;
  /** Smoothed speed (px/s) and longitudinal acceleration (px/s²) for body lean / brake lights. */
  speed: number;
  accel: number;
  /** Time (s, visual clock) when a facility was repaired, for the "lights back on" animation. */
  solarFixedAt: number | null;
  oxygenFixedAt: number | null;
}

export function createVis(): Vis {
  return { particles: [], tracks: [], bursts: [], cam: { x: 0, y: 0, ready: false }, odo: 0, speed: 0, accel: 0, solarFixedAt: null, oxygenFixedAt: null };
}

/** Add a particle; when full, the oldest is replaced (never grows past the cap). */
export function emit(v: Vis, p: Particle): void {
  if (v.particles.length >= FX_LIMITS.particles) v.particles.shift();
  v.particles.push(p);
}

export function burst(v: Vis, b: Burst): void {
  if (v.bursts.length >= FX_LIMITS.bursts) v.bursts.shift();
  v.bursts.push(b);
}

/** Advance particles in place (no per-frame array allocation) and drop finished bursts. */
export function stepVis(v: Vis, dt: number, now: number): void {
  const ps = v.particles;
  let w = 0;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    p.life -= dt * p.decay;
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = p.kind === 'gas' ? 0.6 : 2.2; // gas drifts, dust settles quickly
    p.vx *= Math.exp(-k * dt);
    p.vy *= Math.exp(-k * dt);
    ps[w++] = p;
  }
  ps.length = w;
  while (v.bursts.length && now - v.bursts[0].t0 > 1.6) v.bursts.shift();
}

/** Track the rover's speed/acceleration (smoothed) and odometer for animation. */
export function trackMotion(v: Vis, r: Rover, dt: number): void {
  if (dt <= 0) return;
  const sp = Math.hypot(r.vx, r.vy);
  const k = 1 - Math.exp(-dt * 10);
  const a = (sp - v.speed) / dt;
  v.accel += (a - v.accel) * k;
  v.speed = sp;
  v.odo += sp * dt;
}

/** Record a wheel-track point every few px of travel (ring buffer). */
export function addTrack(v: Vis, r: Rover, now: number): void {
  const last = v.tracks[v.tracks.length - 1];
  const d = last ? Math.hypot(r.x - last.x, r.y - last.y) : Infinity;
  if (d < FX_LIMITS.trackStep) return;
  if (v.tracks.length >= FX_LIMITS.tracks) v.tracks.shift();
  // a jump (restart, teleport) starts a new track segment instead of drawing a line across the map
  v.tracks.push({ x: r.x, y: r.y, a: r.angle, t: now, gap: !last || d > 40 });
}

export function pruneTracks(v: Vis, now: number): void {
  while (v.tracks.length && now - v.tracks[0].t > FX_LIMITS.trackLife) v.tracks.shift();
}

/**
 * Smooth camera with a look-ahead in the driving direction (see more of where you are going),
 * clamped to the map and always keeping the rover well inside the view.
 * viewW/viewH are in world units (CSS px / zoom).
 */
export function updateCamera(cam: Camera, r: Rover, viewW: number, viewH: number, mapW: number, mapH: number, dt: number, smooth = true): Camera {
  const look = 0.5; // seconds of travel to look ahead
  const maxX = viewW * 0.2, maxY = viewH * 0.2;
  const lx = Math.max(-maxX, Math.min(maxX, r.vx * look));
  const ly = Math.max(-maxY, Math.min(maxY, r.vy * look));
  const tx = r.x + lx - viewW / 2, ty = r.y + ly - viewH / 2;
  if (!cam.ready || !smooth) { cam.x = tx; cam.y = ty; cam.ready = true; }
  else {
    const k = 1 - Math.exp(-dt * 5);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }
  // keep the rover at least 25 % away from every edge (fast turns can never hide it)
  const mx = viewW * 0.25, my = viewH * 0.25;
  cam.x = Math.max(r.x - viewW + mx, Math.min(r.x - mx, cam.x));
  cam.y = Math.max(r.y - viewH + my, Math.min(r.y - my, cam.y));
  // clamp to the map (a map smaller than the view is centred)
  cam.x = mapW <= viewW ? (mapW - viewW) / 2 : Math.max(0, Math.min(mapW - viewW, cam.x));
  cam.y = mapH <= viewH ? (mapH - viewH) / 2 : Math.max(0, Math.min(mapH - viewH, cam.y));
  return cam;
}

/** Battery warning level for HUD/canvas: 0 ok, 1 low (< 25), 2 critical (< 10). */
export function batteryLevel(b: number): 0 | 1 | 2 {
  return b < 10 ? 2 : b < 25 ? 1 : 0;
}

/** Joystick direction snap: within `deg` of an axis the stick drives exactly straight (easier corridors). */
export function snapDirection(x: number, y: number, deg = 8): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m === 0) return { x: 0, y: 0 };
  const a = Math.atan2(y, x);
  const q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
  if (Math.abs(a - q) > (deg * Math.PI) / 180) return { x, y };
  return { x: Math.cos(q) * m, y: Math.sin(q) * m };
}
