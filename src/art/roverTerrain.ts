import { shadowLevel, type Rect, type WorldMap } from '../rover/world';
import { boulder, crater, dot, face, ink, line, oval, random, surface, type Point } from './pixels';
import { solarModule, solarModuleShadow, type SolarModule } from './solarModule';

export const WORLD_PIXEL = 2;
const terrainCache = new WeakMap<WorldMap, HTMLCanvasElement>();
interface Variants {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  height: number;
}
const structuresCache = new WeakMap<WorldMap, { base: HTMLCanvasElement; solar: Variants; oxygen: Variants }>();
const gray = ['#555a6d', '#595d70', '#5e6174', '#63677a', '#676a7c', '#6d6e80', '#737282', '#797786'];

const p = (n: number) => n / WORLD_PIXEL;

function ground(g: CanvasRenderingContext2D, m: WorldMap) {
  const rng = random(814);
  const width = Math.ceil(p(m.w)), height = Math.ceil(p(m.h));
  dot(g, 0, 0, gray[2], width, height);
  // A two-scale albedo pattern with no parallax. The highlights are clusters of native pixels.
  for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) {
    const value = Math.sin(x * 0.007 + y * 0.019) + Math.cos(x * 0.016 - y * 0.010) + 0.4 * Math.sin(x * 0.06 + y * 0.041);
    const shade = Math.max(0, Math.min(gray.length - 1, Math.round(3.8 + value * 1.05 + (rng() - 0.5) * 1.6)));
    dot(g, x, y, gray[shade], 4, 4);
    if (rng() > 0.81) dot(g, x + Math.floor(rng() * 4), y, rng() > 0.41 ? '#8d8991' : '#494e63', rng() > 0.86 ? 2 : 1);
  }
  for (let i = 0; i < 180; i++) {
    const x = rng() * width, y = rng() * height;
    crater(g, x, y, 2 + rng() ** 2 * 14, 2 + rng() ** 2 * 9, i + 110);
  }
  for (let i = 0; i < 950; i++) {
    const x = rng() * width, y = rng() * height;
    const shade = rng() > 0.46;
    dot(g, x, y, shade ? '#96929a' : '#50546a', rng() > 0.91 ? 3 : 1, 1);
    if (i % 4 === 0) dot(g, x + 1, y + 1, '#4e5065', 2, 1);
  }
  for (const c of m.craters) crater(g, p(c.x), p(c.y), p(c.r), p(c.r), c.x + c.y);
  for (const r of m.rocks) {
    boulder(g, p(r.x), p(r.y), p(r.r), r.x * 13 + r.y);
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2, d = p(r.r) * (1.4 + rng() * 0.53);
      boulder(g, p(r.x) + Math.cos(a) * d, p(r.y) + Math.sin(a) * d, 1.7 + rng() * 3, i + r.x);
    }
  }
}

function shadows(g: CanvasRenderingContext2D, m: WorldMap) {
  const { width, height } = g.canvas;
  const mask = new Uint8Array(width * height);
  const fill = ['', '#20284078', '#121f3dbb'];
  const rim = ['', '#b0c4dae0', '#96cbf7f0'];
  // Sample the same predicate as the rover at each native pixel centre. An overlap has one
  // tint and a border only where the drain level actually changes.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let run = 0, last = 0;
    for (let x = 0; x <= width; x++) {
      const level = x === width ? 0 : shadowLevel(m, (x + 0.5) * WORLD_PIXEL, (y + 0.5) * WORLD_PIXEL);
      if (x < width) mask[row + x] = level;
      if (level === last) continue;
      if (last > 0) dot(g, run, y, fill[last], x - run);
      run = x;
      last = level;
    }
  }
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x, level = mask[i];
    if (!level) continue;
    const edge = mask[i - 1] < level || mask[i + 1] < level || mask[i - width] < level || mask[i + width] < level;
    if (edge && ((x + 2 * y) % 17 < (level === 2 ? 13 : 9))) {
      dot(g, x, y, rim[level]);
    } else if (level === 2 && (x * 29 + y * 71 + x * y) % 1109 === 0) {
      dot(g, x, y, '#9dcae990');
    }
  }
}

function block(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lift: number, colors: readonly [string, string, string]) {
  const roof = y - lift, offset = Math.ceil(lift * 0.36);
  face(g, [[x, y + 3], [x + w, y + h - 4], [x + 1, y + h + 8], [x - lift * 3.2, y + h + 10], [x - lift * 3.2, y + lift * 0.74]], '#22283e48');
  face(g, [[x, y], [x + w, y + h - 5], [x, y + h + 5], [x - lift * 1.65, y + h + 5], [x - lift * 1.65, y + 4]], '#171e32a0');
  face(g, [[x, roof + 4], [x + 4, roof], [x + w - 4 - offset, roof], [x + w - offset, roof + 4], [x + w - offset, y + h - lift - 4], [x + w - offset - 4, y + h - lift], [x + 4, y + h - lift], [x, y + h - lift - 4]], colors[0]);
  face(g, [[x + w - offset, roof + 4], [x + w, y + 4], [x + w, y + h - 5], [x + w - 4, y + h], [x + w - offset - 4, y + h - lift], [x + w - offset, y + h - lift - 4]], colors[2]);
  face(g, [[x, y + h - lift - 4], [x + 4, y + h - lift], [x + w - offset - 4, y + h - lift], [x + w - 4, y + h], [x + 4, y + h], [x, y + h - 4]], colors[1]);
  line(g, [x + 4, roof], [x + w - 4 - offset, roof], '#e0d5bc');
  line(g, [x + w - 1, y + 6], [x + w - 1, y + h - 5], '#d1c4ae79');
  line(g, [x + 4, y + h - lift], [x + w - offset - 4, y + h - lift], '#283045');
}

function habitat(g: CanvasRenderingContext2D, r: Rect) {
  const x = p(r.x), y = p(r.y), w = p(r.w), h = p(r.h);
  const tint = ['#dad7cd', '#8b97aa', '#adaeb3'] as const;
  block(g, x, y, w, h, 12, ['#8895a2', '#68758a', '#46526b']);
  block(g, x + 4, y + 2, w - 8, h * 0.56, 12, tint);
  block(g, x + 8, y + h * 0.43, w - 26, h * 0.54, 12, tint);
  block(g, x + 32, y + 13, 25, 19, 9, ['#bdc4c5', '#8693a4', '#5b6d84']);
  for (const level of [y + h * 0.47, y + h - 9]) {
    for (let px = x + 11; px < x + w - 27; px += 9) {
      dot(g, px, level + 1, '#38475c', 7, 4);
      dot(g, px + 1, level + 2, '#f1ca80', 5, 2);
    }
  }
  for (let i = 0; i < 3; i++) {
    dot(g, x + 10, y + 17 + i * 3, '#909baa', 12);
    dot(g, x + w - 24, y + 12 + i * 3, '#eee1ca', 5);
  }
  line(g, [x + 12, y + 6], [x + 24, y + 6], '#8f9baa', 2);
  line(g, [x + 28, y + 9], [x + 28, y - 9], '#576a7c', 2);
  dot(g, x + 27, y - 10, ink.ice, 3, 2);
  block(g, x + w - 21, y + h - 28, 19, 21, 5, ['#8b99a9', '#65758a', '#3e4d61']);
  dot(g, x + w - 15, y + h - 13, '#28364c', 7, 6);
  dot(g, x + w - 16, y + h - 14, ink.amber, 8);
}

function depot(g: CanvasRenderingContext2D, r: Rect) {
  const x = p(r.x), y = p(r.y), w = p(r.w), h = p(r.h);
  block(g, x, y, w, h, 4, ['#8993a4', '#646c80', '#4b546a']);
  for (let i = 0; i < 6; i++) {
    const cx = x + 4 + (i % 3) * 16, cy = y + 2 + Math.floor(i / 3) * 17;
    block(g, cx, cy, 13, 16, 6, ['#c6aa72', '#9c7850', '#5c5155']);
    dot(g, cx + 4, cy + 2, '#675e5d', 2, 7);
    dot(g, cx + 8, cy + 2, '#675e5d', 2, 7);
  }
}

function solar(g: CanvasRenderingContext2D, r: Rect, broken: boolean) {
  const x = p(r.x), y = p(r.y), w = p(r.w), h = p(r.h);
  const count = Math.max(1, Math.floor(w / 20));
  const stride = w / count;
  const racks = Array.from({ length: count }, (_, i): SolarModule => ({
    origin: [x + i * stride + 3, y + h - 1],
    along: [stride - 4, 0],
    rear: [-3, 2 - h],
    lower: 3.6,
    upper: 7.5,
    cells: [3, 2],
  }));
  for (const rack of racks) solarModuleShadow(g, rack);
  line(g, [x + 3, y + h - 1], [x + w - 4, y + h - 1], '#444b60');
  racks.forEach((rack, i) => solarModule(g, rack, { broken: broken && i >= count - 2 }));
}

function plant(g: CanvasRenderingContext2D, m: WorldMap, healthy: boolean) {
  const r = m.blocks[5], x = p(r.x), y = p(r.y), w = p(r.w), h = p(r.h);
  const cx = x + w / 2, cy = y + h / 2;
  const color = healthy ? '#6dcbd1' : '#807686';
  const valves = [m.sites.valveA, m.sites.valveB, m.sites.valveC];
  for (const v of valves) {
    const vx = p(v.x), vy = p(v.y);
    line(g, [cx + 2, cy + 3], [vx + 2, vy + 3], '#303445', 5);
    line(g, [cx, cy], [vx, vy], '#646e82', 5);
    line(g, [cx, cy - 1], [vx, vy - 1], '#acb7bf', 2);
    line(g, [cx, cy], [vx, vy], color);
  }
  for (const v of valves) {
    const vx = p(v.x), vy = p(v.y);
    block(g, vx - 7, vy - 6, 14, 13, 3, ['#9ca1a4', '#677488', '#4c5670']);
    dot(g, vx - 3, vy - 5, '#627386', 6, 9);
    oval(g, vx, vy - 5, 5, 4, '#b09a7b');
    oval(g, vx, vy - 5, 4, 3, '#4f414a');
    line(g, [vx - 3, vy - 5], [vx + 3, vy - 5], ink.amber);
    dot(g, vx, vy - 7, ink.amber, 1, 5);
  }
  block(g, x, y, w, h, 7, ['#8692a2', '#657389', '#444f67']);
  for (let i = 0; i < 3; i++) {
    const tx = x + 16 + i * 21, ty = y + 25 - (i % 2) * 7;
    oval(g, tx - 4, ty + 4, 12, 6, '#494e63');
    dot(g, tx - 8, ty - 14, '#8499ab', 17, 16);
    dot(g, tx - 2, ty - 14, '#d0d7d0', 10, 16);
    dot(g, tx + 3, ty - 11, '#e9e3d3', 3, 11);
    oval(g, tx, ty - 14, 8, 5, '#edebde');
    dot(g, tx - 6, ty - 3, color, 13, 2);
  }
  block(g, x + 11, y + h - 17, w - 19, 13, 6, ['#648499', '#49697b', '#40506a']);
  for (let i = 0; i < 4; i++) dot(g, x + 17 + i * 11, y + h - 11, healthy ? ink.ice : ink.red, 3, 2);
}

function pads(g: CanvasRenderingContext2D, m: WorldMap) {
  for (const [s, color] of [[m.sites.dock, '#799bba'], [m.charger, '#cba969']] as const) {
    const x = p(s.x), y = p(s.y), r = p(s.r) * 0.92;
    const shape: Point[] = [[x - r * 0.62, y - r], [x + r * 0.62, y - r], [x + r, y - r * 0.6], [x + r, y + r * 0.6], [x + r * 0.62, y + r], [x - r * 0.62, y + r], [x - r, y + r * 0.6], [x - r, y - r * 0.6]];
    face(g, shape.map(([u, v]) => [u - 5, v + 3]), '#363d53');
    face(g, shape.map(([u, v]) => [u, v + 2]), '#3d4960');
    face(g, shape, '#60677b');
    for (let i = 0; i < 8; i++) {
      line(g, shape[i], shape[(i + 1) % 8], color);
      const [sx, sy] = shape[i];
      dot(g, sx - 1, sy, color, 3, 2);
    }
    if (s === m.charger) {
      face(g, [[x + 2, y - 9], [x - 5, y + 2], [x, y + 2], [x - 2, y + 9], [x + 5, y - 2], [x + 1, y - 2]], ink.amber);
    } else {
      line(g, [x - 9, y - 10], [x - 9, y + 10], '#a9b9c6', 2);
      line(g, [x + 9, y - 10], [x + 9, y + 10], '#a9b9c6', 2);
      dot(g, x - 9, y - 1, '#a9b9c6', 19, 2);
      for (const dy of [-13, 12]) for (let i = 0; i < 8; i++) dot(g, x - 20 + i * 5, y + dy, '#494f67', 3);
    }
  }
}

export function roverTerrain(m: WorldMap) {
  const cache = terrainCache.get(m);
  if (cache) return cache;
  const cv = surface(Math.ceil(p(m.w)), Math.ceil(p(m.h)));
  const g = cv.getContext('2d', { alpha: false })!;
  ground(g, m);
  shadows(g, m);
  terrainCache.set(m, cv);
  return cv;
}

// Healthy structures are cached in one transparent map layer. Each damaged structure has a small
// alternate sprite which replaces its healthy counterpart without allocating another map.
export function roverStructures(m: WorldMap) {
  const cache = structuresCache.get(m);
  if (cache) return cache;
  const base = surface(Math.ceil(p(m.w)), Math.ceil(p(m.h)));
  const g = base.getContext('2d')!;
  pads(g, m);
  habitat(g, m.blocks[0]);
  depot(g, m.blocks[1]);
  solar(g, m.blocks[2], false);
  solar(g, m.blocks[3], false);
  const sb = m.blocks[4];
  const solarVariants = { canvas: surface(Math.ceil(p(sb.w)) + 33, 68), x: p(sb.x) - 23, y: p(sb.y) - 9, height: 34 };
  const valves = [m.sites.valveA, m.sites.valveB, m.sites.valveC];
  const plantBlock = m.blocks[5];
  const px = Math.min(p(plantBlock.x) - 26, ...valves.map(v => p(v.x) - 21));
  const py = Math.min(p(plantBlock.y), ...valves.map(v => p(v.y))) - 18;
  const pw = Math.ceil(Math.max(p(plantBlock.x + plantBlock.w), ...valves.map(v => p(v.x))) - px + 24);
  const ph = Math.ceil(Math.max(p(plantBlock.y + plantBlock.h), ...valves.map(v => p(v.y))) - py + 16);
  const oxygenVariants = { canvas: surface(pw, ph * 2), x: px, y: py, height: ph };
  const s = solarVariants.canvas.getContext('2d')!, o = oxygenVariants.canvas.getContext('2d')!;
  s.translate(-solarVariants.x, -solarVariants.y);
  solar(s, m.blocks[4], true);
  s.translate(0, solarVariants.height);
  solar(s, m.blocks[4], false);
  o.translate(-px, -py);
  plant(o, m, false);
  o.translate(0, ph);
  plant(o, m, true);
  const result = { base, solar: solarVariants, oxygen: oxygenVariants };
  structuresCache.set(m, result);
  return result;
}
