/**
 * Top-down exploration map (FICTIONAL training terrain).
 * Sunlit and shadowed zones here are an educational scenario — they are NOT per-tile NASA measurements.
 * (The NASA LOLA value 0.88444 is the long-term average for the base site only.)
 * Units: world pixels. The view scrolls with the rover.
 */

export interface Circle { x: number; y: number; r: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface Site {
  id: 'base' | 'dock' | 'solarB' | 'oxygen' | 'samples' | 'solarFarm';
  x: number;
  y: number;
  /** Interaction radius. */
  r: number;
}

export interface WorldMap {
  w: number;
  h: number;
  start: { x: number; y: number; angle: number };
  /** Impassable circles: crater cores, boulders. */
  craters: Circle[];
  rocks: Circle[];
  /** Impassable rectangles: buildings, panel rows. */
  blocks: Rect[];
  /** Shadow zones (training scenario). Circles; a point inside any circle is in shadow. */
  shadows: Circle[];
  /** Fast-charging pad. */
  charger: Circle;
  sites: Record<Site['id'], Site>;
}

export const MAP: WorldMap = {
  w: 2600,
  h: 1600,
  start: { x: 860, y: 900, angle: 0 },
  craters: [
    { x: 1430, y: 640, r: 170 }, // big crater between base and the solar farm
    { x: 1960, y: 1270, r: 150 }, // sample crater (permanently shadowed training zone)
    { x: 1150, y: 1280, r: 90 },
    { x: 420, y: 1300, r: 110 },
    { x: 2350, y: 980, r: 95 },
  ],
  rocks: [
    // boulder field on the sunny southern route
    { x: 1250, y: 960, r: 34 }, { x: 1340, y: 1010, r: 26 }, { x: 1420, y: 940, r: 30 },
    { x: 1520, y: 1000, r: 38 }, { x: 1610, y: 930, r: 28 }, { x: 1700, y: 1020, r: 34 },
    { x: 1800, y: 900, r: 30 }, { x: 1880, y: 990, r: 26 }, { x: 1300, y: 880, r: 22 },
    { x: 1660, y: 840, r: 24 }, { x: 1960, y: 840, r: 30 }, { x: 2050, y: 930, r: 24 },
    // scattered
    { x: 620, y: 420, r: 30 }, { x: 980, y: 300, r: 26 }, { x: 2300, y: 250, r: 28 },
    { x: 300, y: 820, r: 26 }, { x: 900, y: 1450, r: 30 }, { x: 2450, y: 1450, r: 34 },
    { x: 1700, y: 260, r: 26 }, { x: 1180, y: 380, r: 22 },
  ],
  blocks: [
    { x: 620, y: 820, w: 170, h: 150 }, // base habitat block (dock is to the east)
    { x: 470, y: 600, w: 110, h: 80 }, // oxygen plant
    // solar farm panel rows (north-east)
    { x: 1900, y: 330, w: 360, h: 26 },
    { x: 1900, y: 400, w: 360, h: 26 },
    { x: 1900, y: 470, w: 360, h: 26 },
  ],
  shadows: [
    { x: 1500, y: 560, r: 330 }, // crater shadow: short route to the farm passes through it
    { x: 2190, y: 620, r: 190 }, // ridge shadow over the damaged segment B
    { x: 1960, y: 1270, r: 300 }, // permanently shadowed sample crater (training zone)
    { x: 420, y: 1300, r: 170 },
  ],
  charger: { x: 900, y: 1010, r: 42 },
  sites: {
    base: { id: 'base', x: 705, y: 895, r: 0 },
    dock: { id: 'dock', x: 860, y: 900, r: 70 },
    solarFarm: { id: 'solarFarm', x: 2080, y: 413, r: 0 },
    solarB: { id: 'solarB', x: 2170, y: 545, r: 75 },
    oxygen: { id: 'oxygen', x: 525, y: 640, r: 0 },
    samples: { id: 'samples', x: 1960, y: 1100, r: 0 },
  },
};

export function inShadow(m: WorldMap, x: number, y: number): boolean {
  return m.shadows.some((s) => (x - s.x) ** 2 + (y - s.y) ** 2 < s.r * s.r);
}

export function onCharger(m: WorldMap, x: number, y: number): boolean {
  return (x - m.charger.x) ** 2 + (y - m.charger.y) ** 2 < m.charger.r ** 2;
}
