/**
 * Top-down exploration map (FICTIONAL training terrain).
 * Sunlit and shadowed zones here are an educational scenario — they are NOT per-tile NASA measurements.
 * (The NASA LOLA value 0.88444 is the long-term average for the base site only.)
 * Units: world pixels. The view scrolls with the rover.
 */

export interface Circle { x: number; y: number; r: number }
/** Shadow zone; `deep` = permanently shadowed training zone (very cold → heaters drain faster). */
export interface Shadow extends Circle { deep?: boolean }
export interface Rect { x: number; y: number; w: number; h: number }

export interface Site {
  id: 'base' | 'dock' | 'solarB' | 'oxygen' | 'samples' | 'solarFarm' | 'depot' | 'valveA' | 'valveB' | 'valveC' | 'sample1' | 'sample2' | 'sample3';
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
  shadows: Shadow[];
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
    // ridge north of the base: blocks the direct way to the remote O₂ plant
    { x: 200, y: 470, r: 36 }, { x: 270, y: 470, r: 36 }, { x: 340, y: 470, r: 36 }, { x: 410, y: 470, r: 36 },
    { x: 480, y: 470, r: 36 }, { x: 550, y: 470, r: 36 }, { x: 620, y: 470, r: 36 },
    // scattered
    // (720,320) kept clear of the ridge end so the east detour has no trap pocket
    { x: 720, y: 320, r: 30 }, { x: 980, y: 300, r: 26 }, { x: 2300, y: 250, r: 28 },
    { x: 300, y: 820, r: 26 }, { x: 900, y: 1450, r: 30 }, { x: 2450, y: 1450, r: 34 },
    { x: 1700, y: 260, r: 26 }, { x: 1180, y: 380, r: 22 },
  ],
  blocks: [
    { x: 620, y: 820, w: 170, h: 150 }, // base habitat block (dock is to the east)
    { x: 470, y: 600, w: 110, h: 80 }, // supply depot (spare parts)
    // solar farm panel rows (north-east)
    { x: 1900, y: 330, w: 360, h: 26 },
    { x: 1900, y: 400, w: 360, h: 26 },
    { x: 1900, y: 470, w: 360, h: 26 },
    { x: 120, y: 160, w: 150, h: 100 }, // remote oxygen plant (north-west)
  ],
  shadows: [
    { x: 1500, y: 560, r: 405 }, // crater shadow: short route to the farm passes through it
    { x: 2190, y: 620, r: 235 }, // ridge shadow over the damaged segment B
    { x: 1960, y: 1270, r: 360 }, // sample crater: outer shadow
    { x: 1960, y: 1360, r: 290, deep: true }, // permanently shadowed training area with heater load
    { x: 1190, y: 1400, r: 290 }, // small-crater shadow around sample 3
    { x: 420, y: 1300, r: 205 },
    { x: 120, y: 380, r: 290 }, // north-west shadow: the west gap and O₂ plant
  ],
  charger: { x: 900, y: 1010, r: 42 },
  sites: {
    base: { id: 'base', x: 705, y: 895, r: 0 },
    dock: { id: 'dock', x: 860, y: 900, r: 70 },
    solarFarm: { id: 'solarFarm', x: 2080, y: 413, r: 0 },
    solarB: { id: 'solarB', x: 2170, y: 545, r: 75 },
    oxygen: { id: 'oxygen', x: 195, y: 210, r: 0 },
    depot: { id: 'depot', x: 525, y: 722, r: 62 },
    valveA: { id: 'valveA', x: 110, y: 318, r: 52 },
    valveB: { id: 'valveB', x: 330, y: 215, r: 52 },
    valveC: { id: 'valveC', x: 195, y: 100, r: 52 },
    samples: { id: 'samples', x: 1960, y: 1010, r: 0 },
    sample1: { id: 'sample1', x: 2150, y: 1470, r: 55 }, // deep in the permanently shadowed zone
    sample2: { id: 'sample2', x: 2440, y: 1180, r: 55 }, // sunny but far east
    sample3: { id: 'sample3', x: 1230, y: 1470, r: 55 }, // moderate shadow near the small crater
  },
};

export function inShadow(m: WorldMap, x: number, y: number): boolean {
  return shadowLevel(m, x, y) > 0;
}

/** 0 = sunlit, 1 = shadow, 2 = permanently shadowed (deep) training zone. */
export function shadowLevel(m: WorldMap, x: number, y: number): 0 | 1 | 2 {
  let lvl: 0 | 1 = 0;
  for (const s of m.shadows) {
    const dx = x - s.x;
    const dy = y - s.y;
    if (dx * dx + dy * dy >= s.r * s.r) continue;
    if (s.deep) return 2;
    lvl = 1;
  }
  return lvl;
}

export function onCharger(m: WorldMap, x: number, y: number): boolean {
  return (x - m.charger.x) ** 2 + (y - m.charger.y) ** 2 < m.charger.r ** 2;
}
