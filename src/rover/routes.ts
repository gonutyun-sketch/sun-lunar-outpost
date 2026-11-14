/**
 * Mission 1 reference routes (pure, tested). Used for the briefing hints and the route mini-map, so the
 * numbers shown to students are computed by the same rover simulation the game uses.
 * - Shadow shortcut: hugs the big crater, through its shadow — shortest and fastest, battery-hungry.
 * - Sunny detour: south along the sunlit edge of the boulder field, then north — a little longer, saves battery.
 * Battery values are FICTIONAL training values; the shadows on this map are a training scenario, not NASA data.
 */
import { createRover, stepRover, type Rover } from './sim';
import { MAP, shadowLevel, type WorldMap } from './world';

export type Pt = [number, number];
const SOLAR_B: Pt = [MAP.sites.solarB.x, MAP.sites.solarB.y];
export const DOCK: Pt = [MAP.sites.dock.x, MAP.sites.dock.y];

export const ROUTES = {
  shadow: [[1180, 900], [1340, 820], [1500, 840], [1660, 780], [1820, 780], [1980, 740], SOLAR_B] as Pt[],
  sunny: [[1180, 980], [1340, 1080], [1500, 1080], [1660, 960], [1800, 840], [1930, 640], [2060, 560], SOLAR_B] as Pt[],
};
export type RouteId = keyof typeof ROUTES;

export interface RouteRun {
  rover: Rover;
  /** Seconds of driving. */
  time: number;
  /** Seconds spent in sunlight, shadow and deep shadow. */
  zones: [number, number, number];
  /** Battery used (start − end). */
  used: number;
}

/** Drive waypoints like a keyboard player (8 directions) and report time, battery and shadow time. */
export function driveRoute(start: Rover, waypoints: Pt[], drainScale = 1, m: WorldMap = MAP, maxT = 120): RouteRun {
  let r = start, time = 0;
  const zones: [number, number, number] = [0, 0, 0];
  const dt = 1 / 60;
  for (const [wx, wy] of waypoints) {
    while (Math.hypot(r.x - wx, r.y - wy) > 30 && time < maxT) {
      const dx = wx - r.x, dy = wy - r.y;
      r = stepRover(m, r, { right: dx > 12, left: dx < -12, down: dy > 12, up: dy < -12 }, dt, false, drainScale).rover;
      time += dt;
      zones[shadowLevel(m, r.x, r.y)] += dt;
    }
  }
  return { rover: r, time, zones, used: start.battery - r.battery };
}

/** Briefing estimate for one route from the dock to solar segment B (rounded for display). */
export function routeEstimate(id: RouteId, battery: number, drainScale: number): { time: number; used: number } {
  const run = driveRoute(createRover(MAP, battery), ROUTES[id], drainScale);
  return { time: Math.round(run.time), used: Math.round(run.used) };
}
