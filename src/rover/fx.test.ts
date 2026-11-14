import { describe, expect, it } from 'vitest';
import { FX_LIMITS, addTrack, batteryLevel, burst, createVis, emit, pruneTracks, snapDirection, stepVis, trackMotion, updateCamera } from './fx';
import { createRover, stepRover } from './sim';
import { MAP } from './world';

const dust = (x = 0) => ({ x, y: 0, vx: 10, vy: 0, life: 1, decay: 1, size: 2, kind: 'dust' as const });

describe('visual effects state (render-only)', () => {
  it('particle count never exceeds the cap; oldest are replaced', () => {
    const v = createVis();
    for (let i = 0; i < FX_LIMITS.particles * 3; i++) emit(v, dust(i));
    expect(v.particles).toHaveLength(FX_LIMITS.particles);
    expect(v.particles[v.particles.length - 1].x).toBe(FX_LIMITS.particles * 3 - 1);
  });

  it('particles move, fade and are removed in place', () => {
    const v = createVis();
    emit(v, dust());
    const arr = v.particles;
    stepVis(v, 0.1, 0);
    expect(v.particles).toBe(arr); // same array: no per-frame allocation
    expect(v.particles[0].x).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) stepVis(v, 0.1, 0);
    expect(v.particles).toHaveLength(0);
  });

  it('bursts expire and are capped', () => {
    const v = createVis();
    for (let i = 0; i < 20; i++) burst(v, { x: 0, y: 0, t0: 0, kind: 'ok' });
    expect(v.bursts.length).toBe(FX_LIMITS.bursts);
    stepVis(v, 0.016, 2);
    expect(v.bursts).toHaveLength(0);
  });

  it('wheel tracks: sampled by distance, capped, gaps after a jump, faded out by age', () => {
    const v = createVis();
    const r = createRover(MAP);
    for (let i = 0; i < 1000; i++) addTrack(v, { ...r, x: r.x + i * 3 }, i * 0.01);
    expect(v.tracks.length).toBeLessThanOrEqual(FX_LIMITS.tracks);
    addTrack(v, { ...r, x: 2000, y: 1200 }, 11);
    expect(v.tracks[v.tracks.length - 1].gap).toBe(true);
    pruneTracks(v, 11 + FX_LIMITS.trackLife + 1);
    expect(v.tracks).toHaveLength(0);
  });

  it('camera: looks ahead, stays inside the map and keeps the rover away from the edges', () => {
    const r = { ...createRover(MAP), x: 1300, y: 800, vx: 150, vy: 0 };
    const cam = { x: 0, y: 0, ready: false };
    updateCamera(cam, r, 900, 520, MAP.w, MAP.h, 0.016);
    expect(cam.x + 450).toBeGreaterThan(r.x); // view centre is ahead of the rover
    for (const pos of [{ x: 30, y: 30 }, { x: MAP.w - 30, y: MAP.h - 30 }, { x: 1300, y: 800 }]) {
      const c = { x: 0, y: 0, ready: true };
      for (let i = 0; i < 300; i++) updateCamera(c, { ...r, ...pos, vx: -150, vy: 150 }, 900, 520, MAP.w, MAP.h, 0.016);
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + 900).toBeLessThanOrEqual(MAP.w); expect(c.y + 520).toBeLessThanOrEqual(MAP.h);
      expect(pos.x).toBeGreaterThanOrEqual(c.x); expect(pos.x).toBeLessThanOrEqual(c.x + 900);
      expect(pos.y).toBeGreaterThanOrEqual(c.y); expect(pos.y).toBeLessThanOrEqual(c.y + 520);
    }
    // a sudden jump (e.g. restart) can never leave the rover off-screen
    const c = { x: 0, y: 0, ready: true };
    updateCamera(c, { ...r, x: 1500, y: 900 }, 900, 520, MAP.w, MAP.h, 0.016);
    expect(1500 - c.x).toBeLessThanOrEqual(900 * 0.75 + 1);
    expect(900 - c.y).toBeLessThanOrEqual(520 * 0.75 + 1);
  });

  it('battery warning levels', () => {
    expect([batteryLevel(80), batteryLevel(24.9), batteryLevel(9.9), batteryLevel(0)]).toEqual([0, 1, 2, 2]);
  });

  it('joystick snap keeps the stick strength (speed) and only straightens near-axis input', () => {
    const s = snapDirection(0.7, 0.05);
    expect(s.y).toBeCloseTo(0, 9);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(Math.hypot(0.7, 0.05), 9);
    expect(snapDirection(0.5, 0.5)).toEqual({ x: 0.5, y: 0.5 }); // diagonals untouched
    expect(snapDirection(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('motion tracking does not touch the rover physics', () => {
    const v = createVis();
    const before = createRover(MAP);
    const step = stepRover(MAP, before, { up: false, down: false, left: false, right: true }, 0.05);
    const copy = JSON.stringify(step.rover);
    trackMotion(v, step.rover, 0.05);
    expect(JSON.stringify(step.rover)).toBe(copy);
    expect(v.odo).toBeGreaterThan(0);
  });
});
