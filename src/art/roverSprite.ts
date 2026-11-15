import { face, oval, surface, type Point } from './pixels';

type Vec = readonly [number, number, number];
type Palette = readonly [string, string, string];
type Material = Palette | string;
type Panel = { vertices: readonly Vec[]; material: Material };
type Turn = readonly [number, number];

const steel: Palette = ['#e3ded2', '#a5afbc', '#65738a'];
const plate: Palette = ['#b6bec2', '#718297', '#43566b'];
const gold: Palette = ['#f4ca65', '#c29150', '#865b3d'];
const underbody: Palette = ['#59687a', '#39495c', '#283445'];
const rubber: Palette = ['#536174', '#39475a', '#242f40'];
const treadLight: Palette = ['#667385', '#474f60', '#303c4e'];
const axlePositions = [-9, 0, 9];
const SIZE = 52;
const ORIGIN: Point = [26, 32];
const spriteFrames = new Map<string, HTMLCanvasElement>();
const headings = Array.from({ length: 16 }, (_, i): Turn => [Math.cos(i * Math.PI / 8), Math.sin(i * Math.PI / 8)]);

const headingOf = (angle: number) => ((Math.round(angle * 8 / Math.PI) % 16) + 16) % 16;

function project([c, s]: Turn, [x, y, z]: Vec): Vec {
  const depth = x * s + y * c;
  return [x * c - y * s, depth - z, depth + z];
}

/** Project a light, tool or shadow at the same heading as the sprite. */
export function roverPoint(angle: number, x: number, y: number, z = 0): Point {
  const [sx, sy] = project(headings[headingOf(angle)], [x, y, z]);
  return [sx, sy];
}

function box(out: Panel[], [x, y, z]: Vec, [xx, yy, zz]: Vec, material: Material, lean = 0) {
  const p = (u: number, v: number, h: number): Vec => [u, v, h + u * lean / 24];
  const a = p(x, y, zz), b = p(xx, y, zz), c = p(xx, yy, zz), d = p(x, yy, zz);
  const A = p(x, y, z), B = p(xx, y, z), C = p(xx, yy, z), D = p(x, yy, z);
  for (const vertices of [[a, b, c, d], [d, c, C, D], [c, b, B, C], [b, a, A, B], [a, d, D, A]]) {
    out.push({ vertices, material });
  }
}

const TYRE_SIDES = 12;
const TYRE_RADIUS = 3.9;
const AXLE_HEIGHT = TYRE_RADIUS * Math.cos(Math.PI / TYRE_SIDES);

function wheel(out: Panel[], x: number, y: number, tread: number) {
  const ring = (side: number, radius: number) => Array.from({ length: TYRE_SIDES }, (_, i): Vec => {
    const a = (i + 0.5) * 2 * Math.PI / TYRE_SIDES;
    return [x + radius * Math.cos(a), y + side, AXLE_HEIGHT + radius * Math.sin(a)];
  });
  const rings = [ring(-2.05, 3.25), ring(-1.38, TYRE_RADIUS), ring(1.38, TYRE_RADIUS), ring(2.05, 3.25)];
  // Increasing angle in the x/z plane faces negative y. Both caps and all bevels face outward.
  for (let band = 0; band < rings.length - 1; band++) {
    const a = rings[band], b = rings[band + 1];
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      out.push({ vertices: [a[i], b[i], b[j], a[j]], material: band === 1 && (i + tread) % 2 === 0 ? treadLight : rubber });
    }
  }
  const cap = (vertices: Vec[], side: number, material: Material) => out.push({ vertices: side < 0 ? vertices : vertices.slice().reverse(), material });
  cap(rings[0], -1, '#303b4e');
  cap(rings[3], 1, '#303b4e');
  for (const side of [-1, 1]) {
    cap(ring(2.07 * side, 2.1), side, ['#8d9aab', '#77899b', '#516276']);
    cap(ring(2.10 * side, 1.05), side, '#bec4c4');
  }
}

function tone({ vertices, material }: Panel, [c, s]: Turn) {
  if (typeof material === 'string') return material;
  const [a, b, d] = vertices;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  const light = 0.65 * (x * c - y * s) - 0.34 * (x * s + y * c) + 0.75 * z;
  if (z > 0.65 * Math.hypot(x, y, z)) return material[0];
  return light > 0 ? material[1] : material[2];
}

/** Rasterize cached frames at native size, resolving which surface lies in front at each pixel. */
function paint(g: CanvasRenderingContext2D, turn: Turn, panels: Panel[]) {
  const frame = g.createImageData(SIZE, SIZE);
  const depth = new Float32Array(SIZE * SIZE).fill(-Infinity);
  for (const panel of panels) {
    const points = panel.vertices.map((v): Vec => {
      const [x, y, z] = project(turn, v);
      return [x + ORIGIN[0], y + ORIGIN[1], z];
    });
    const [a, b, c] = points;
    if ((b[0] - a[0]) * (c[1] - a[1]) <= (b[1] - a[1]) * (c[0] - a[0]) + 0.0001) continue;
    const color = Number.parseInt(tone(panel, turn).slice(1), 16);
    const rows = points.map(v => v[1]);
    const min = Math.max(0, Math.ceil(Math.min(...rows) - 0.5));
    const max = Math.min(SIZE, Math.ceil(Math.max(...rows) - 0.5));
    for (let y = min; y < max; y++) {
      const scan = y + 0.5;
      let left = Infinity, right = -Infinity, zLeft = 0, zRight = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] > scan) === (b[1] > scan)) continue;
        const t = (scan - a[1]) / (b[1] - a[1]);
        const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
        if (x < left) { left = x; zLeft = z; }
        if (x > right) { right = x; zRight = z; }
      }
      for (let x = Math.max(0, Math.ceil(left - 0.5)); x < Math.min(SIZE, Math.ceil(right - 0.5)); x++) {
        const z = zLeft + (zRight - zLeft) * (x + 0.5 - left) / (right - left);
        const i = y * SIZE + x;
        if (z <= depth[i]) continue;
        depth[i] = z;
        frame.data[i * 4] = (color >>> 16) & 255;
        frame.data[i * 4 + 1] = (color >>> 8) & 255;
        frame.data[i * 4 + 2] = color & 255;
        frame.data[i * 4 + 3] = 255;
      }
    }
  }
  g.putImageData(frame, 0, 0);
}

function sprite(heading: number, tread: number, lean: number, cargo: boolean) {
  const key = [heading, tread, lean, +cargo].join('/');
  const cached = spriteFrames.get(key);
  if (cached) return cached;
  const cv = surface(SIZE, SIZE);
  const parts: Panel[] = [];
  box(parts, [-11, -4.8, 3.2], [11, 4.8, 6.4], underbody);
  for (const x of axlePositions) {
    box(parts, [x - 0.85, -8, AXLE_HEIGHT - 0.6], [x + 0.85, 8, AXLE_HEIGHT + 0.7], plate);
    for (const y of [-8, 8]) wheel(parts, x, y, tread);
  }
  for (const side of [-1, 1]) {
    box(parts, [-10, side * 5.6 - 0.7, 4.1], [10, side * 5.6 + 0.7, 6.1], plate);
  }
  box(parts, [-11.5, -5.5, 6], [10.8, 5.5, 9.6], steel, lean);
  box(parts, [9.6, -5.5, 5.2], [13.1, 5.5, 7.3], gold, lean);
  for (const y of [-4.6, 2.5]) box(parts, [13, y, 6], [13.4, y + 2.1, 7.4], '#fff0bd', lean);
  for (const y of [-4.6, 3]) box(parts, [-11.7, y, 6.5], [-11.4, y + 1.6, 7.7], '#d67773', lean);
  for (const y of [-3.5, 0.2]) for (const x of [-10, -6, -2]) {
    box(parts, [x, y, 9.55], [x + 3.45, y + 3.1, 9.85], ['#486e8a', '#3e617f', '#34516b'], lean);
    box(parts, [x + 0.25, y + 0.13, 9.84], [x + 2.9, y + 0.72, 9.92], '#719ab3', lean);
  }
  if (cargo) box(parts, [-10, -2.9, 9.8], [-4.3, 2.9, 13.5], gold, lean);
  box(parts, [3, -1.2, 9.5], [5.1, 1.2, 15], plate, lean);
  box(parts, [2.5, -2.7, 14.4], [8.5, 2.7, 17.9], steel, lean);
  box(parts, [8.45, -1.5, 15.2], [9.6, 1.5, 17.6], underbody, lean);
  box(parts, [9.58, -0.72, 15.8], [9.75, 0.72, 16.9], '#9cdee6', lean);
  box(parts, [-8.7, 3.7, 9.3], [-7.55, 4.85, 18.7], plate, lean);
  box(parts, [-9.1, 3.3, 18.5], [-7.25, 5.1, 20], '#b0e9eb', lean);
  paint(cv.getContext('2d')!, headings[heading], parts);
  if (spriteFrames.size >= 96) spriteFrames.delete(spriteFrames.keys().next().value!);
  spriteFrames.set(key, cv);
  return cv;
}

interface Pose { angle: number; tread?: number; lean?: number; cargo?: boolean; scale?: number }

/** Only the sprite is projected. The rover keeps its original world position and hitbox. */
export function roverSprite(g: CanvasRenderingContext2D, x: number, y: number, pose: Pose) {
  const { angle, tread = 0, lean = 0, cargo = false, scale = 1 } = pose;
  const cv = sprite(headingOf(angle), tread % 2, lean, cargo);
  g.imageSmoothingEnabled = false;
  g.drawImage(cv, Math.round(x - ORIGIN[0] * scale), Math.round(y - ORIGIN[1] * scale), SIZE * scale, SIZE * scale);
}

export function roverShadow(g: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  const hull: Point[] = [[-12, -6], [-8, -10], [8, -10], [13, -6], [13, 6], [8, 10], [-8, 10], [-12, 6]];
  const shadow = (dx: number, dy: number) => hull.map(([u, v]): Point => {
    const [sx, sy] = roverPoint(angle, u, v);
    return [x + sx + dx, y + sy + dy];
  });
  face(g, shadow(-8, 3), '#151b2c60');
  face(g, shadow(-2, 1), '#12182988');
  for (const u of axlePositions) for (const v of [-8, 8]) {
    const [sx, sy] = roverPoint(angle, u, v);
    oval(g, x + sx, y + sy, 2.3, 1.5, '#111827ba');
  }
}
