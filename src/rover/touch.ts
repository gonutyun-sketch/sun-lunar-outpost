/**
 * Touch-input helpers (pure, unit-tested).
 * - joystickVector: finger offset from the joystick centre → analog direction (|v| ≤ 1) with a dead zone.
 * - cameraZoom: how much of the world to show for a given view size (small screens zoom out
 *   so the player still sees enough terrain; world coordinates and collisions never change).
 * - renderDpr: device-pixel ratio used for the canvas backing store (capped for performance).
 */
export interface Vec { x: number; y: number; mag: number }

export function joystickVector(dx: number, dy: number, radius: number, dead = 0.15): Vec {
  const d = Math.hypot(dx, dy);
  if (radius <= 0 || d === 0) return { x: 0, y: 0, mag: 0 };
  const m = Math.min(1, d / radius);
  if (m < dead) return { x: 0, y: 0, mag: 0 };
  // rescale so the response starts at 0 just outside the dead zone and reaches 1 at the rim
  const mag = (m - dead) / (1 - dead);
  return { x: (dx / d) * mag, y: (dy / d) * mag, mag };
}

/** Knob position (px from centre), clamped to the rim. */
export function knobOffset(dx: number, dy: number, radius: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (d <= radius || d === 0) return { x: dx, y: dy };
  return { x: (dx / d) * radius, y: (dy / d) * radius };
}

/** Desktop (≥ ~900×520 CSS px) sees the world 1:1; smaller views zoom out, never below 0.5. */
export function cameraZoom(viewW: number, viewH: number): number {
  return Math.max(0.5, Math.min(1, viewW / 900, viewH / 520));
}

export function renderDpr(deviceDpr: number): number {
  return Math.max(1, Math.min(2, deviceDpr || 1));
}
