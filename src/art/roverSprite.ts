import { dot, face, ink, line, oval, surface, type Point } from './pixels';

type Vec = readonly [number, number, number];
type Palette = readonly [string, string, string];
type Project = (v: Vec) => Point;
type Panel = { vertices: Vec[]; color: string; darkColor?: string; detail?: (g: CanvasRenderingContext2D, project: Project) => void };

const steel: Palette = ['#e3ded2', '#a5afbc', '#5d6b80'];
const plate: Palette = ['#b6bec2', '#718297', '#3c4d62'];
const gold: Palette = ['#f4ca65', '#bf8d4d', '#7c543a'];
const dark: Palette = ['#49566c', '#2e3b4e', '#161f30'];
const wheels = [-9, 0, 9];
const SIZE = 44;
const spriteFrames = new Map<string, HTMLCanvasElement>();

function box(panels: Panel[], from: Vec, to: Vec, palette: Palette, detail?: Panel['detail']) {
  const [x, y, z] = from, [xx, yy, zz] = to;
  const a: Vec = [x, y, zz], b: Vec = [xx, y, zz], c: Vec = [xx, yy, zz], d: Vec = [x, yy, zz];
  const A: Vec = [x, y, z], B: Vec = [xx, y, z], C: Vec = [xx, yy, z], D: Vec = [x, yy, z];
  panels.push(
    { vertices: [a, b, c, d], color: palette[0], detail },
    { vertices: [d, c, C, D], color: palette[1], darkColor: palette[2] },
    { vertices: [c, b, B, C], color: palette[1], darkColor: palette[2] },
    { vertices: [b, a, A, B], color: palette[1], darkColor: palette[2] },
    { vertices: [a, d, D, A], color: palette[1], darkColor: palette[2] },
  );
}

function sprite(heading: number, tread: number, lean: number, cargo: boolean) {
  const key = [heading, tread, lean, +cargo].join('/');
  const cached = spriteFrames.get(key);
  if (cached) return cached;
  const cv = surface(SIZE, SIZE);
  const g = cv.getContext('2d')!;
  const angle = heading * Math.PI / 8;
  const c = Math.cos(angle), s = Math.sin(angle);
  const depth = ([x, y, z]: Vec) => x * s + y * c + z * 0.9;
  const project: Project = ([x, y, z]) => [SIZE / 2 + x * c - y * s, 27 + (x * s + y * c) * 0.9 - z];
  const drawPanels = (panels: Panel[]) => {
    const visible = panels.map((p) => {
      const a = p.vertices.map(project);
      const [u, v, w] = a;
      return { p, a, area: (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]), depth: p.vertices.reduce((n, vtx) => n + depth(vtx), 0) / p.vertices.length };
    }).filter((p) => p.area > 0.01);
    visible.sort((a, b) => a.depth - b.depth);
    for (const { p, a } of visible) {
      const lit = a[0][1] - a[1][1] + (a[0][0] - a[1][0]) * 0.18 > 0;
      face(g, a, lit ? p.color : p.darkColor ?? p.color);
      p.detail?.(g, project);
    }
  };
  const drawWheel = (x: number, y: number) => {
    const panels: Panel[] = [];
    const low: Vec[] = [], high: Vec[] = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (i + 0.5) / 4;
      const xx = x + Math.cos(a) * 3.8, z = 3.7 + Math.sin(a) * 3.8;
      low.push([xx, y - 1.8, z]); high.push([xx, y + 1.8, z]);
    }
    const hub = (side: number) => (_g: CanvasRenderingContext2D, p: Project) => {
      const [a, b] = p([x, side, 3.7]);
      dot(g, a - 1, b - 1, '#6d8092', 3, 3);
      dot(g, a, b - 1, '#c2c3bb');
      dot(g, a + 1, b + 1, '#313c50');
    };
    panels.push({ vertices: high, color: '#283344', detail: hub(y + 1.8) });
    panels.push({ vertices: low.slice().reverse(), color: '#242d3c', detail: hub(y - 1.8) });
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const tone = i < 4 ? '#222a3b' : (i + tread) % 2 ? '#536071' : '#334152';
      panels.push({ vertices: [low[i], low[j], high[j], high[i]], color: tone, detail: (ctx, project) => {
        if (i > 2 || (i + tread) % 2 === 0) return;
        const midpoint = (a: Vec, b: Vec): Vec => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        line(ctx, project(midpoint(low[i], low[j])), project(midpoint(high[i], high[j])), '#77838b');
      } });
    }
    drawPanels(panels);
  };
  const farSide = c >= 0 ? -1 : 1;
  for (const x of wheels) drawWheel(x, farSide * 8);
  const chassis: Panel[] = [];
  box(chassis, [-11, -5, 3], [11, 5, 6], dark);
  box(chassis, [-12, -5, 6 + lean], [10, 5, 9 + lean], steel, (ctx, p) => {
    for (const y of [-4, 2]) {
      for (let x = -10; x <= 1; x += 4) {
        face(ctx, [p([x, y, 9 + lean]), p([x + 3, y, 9 + lean]), p([x + 3, y + 2, 9 + lean]), p([x, y + 2, 9 + lean])], '#345774');
        line(ctx, p([x, y, 9 + lean]), p([x + 2, y, 9 + lean]), '#6fa1b7');
      }
    }
    line(ctx, p([-11, 0, 9 + lean]), p([2, 0, 9 + lean]), '#233d56');
  });
  box(chassis, [8, -5, 5], [13, 5, 7], gold);
  for (const side of [-1, 1]) {
    box(chassis, [-10, side * 6 - 0.8, 4], [10, side * 6 + 0.8, 5], plate);
  }
  drawPanels(chassis);
  for (const x of wheels) drawWheel(x, -farSide * 8);
  const equipment: Panel[] = [];
  if (cargo) box(equipment, [-10, -3, 9 + lean], [-4, 3, 13 + lean], gold);
  box(equipment, [3, -2, 9 + lean], [6, 2, 15 + lean], plate);
  box(equipment, [3, -3, 15 + lean], [9, 2, 18 + lean], steel);
  box(equipment, [8, -2, 15 + lean], [10, 1, 17 + lean], dark);
  drawPanels(equipment);
  if (s >= -0.38) {
    const [lensX, lensY] = project([9.6, 0, 16 + lean]);
    dot(g, lensX - 1, lensY - 1, '#17283a', 3, 3);
    dot(g, lensX, lensY, ink.ice);
  }
  for (const side of [-1, 1]) {
    const [ledX, ledY] = project([11, side * 4, 7]);
    dot(g, ledX, ledY, '#fff1be', 2);
    if (s < 0.33) {
      const [rx, ry] = project([-11, side * 4, 6 + lean]);
      dot(g, rx, ry, '#eb857a', 2);
    }
  }
  const [antennaX, antennaY] = project([-8, 4, 9 + lean]);
  line(g, [antennaX, antennaY], [antennaX - 2, antennaY - 7], '#a3aebe');
  dot(g, antennaX - 2, antennaY - 8, ink.ice);
  if (spriteFrames.size >= 96) spriteFrames.delete(spriteFrames.keys().next().value!);
  spriteFrames.set(key, cv);
  return cv;
}

interface Pose {
  angle: number;
  tread?: number;
  lean?: number;
  cargo?: boolean;
  scale?: number;
}

/** The projected model is cached as raster frames. Its origin stays on the wheel contacts. */
export function roverSprite(g: CanvasRenderingContext2D, x: number, y: number, pose: Pose) {
  const { angle, tread = 0, lean = 0, cargo = false, scale = 1 } = pose;
  const heading = ((Math.round(angle * 8 / Math.PI) % 16) + 16) % 16;
  const cv = sprite(heading, tread % 2, lean, cargo);
  g.imageSmoothingEnabled = false;
  g.drawImage(cv, Math.round(x - SIZE / 2 * scale), Math.round(y - 27 * scale), SIZE * scale, SIZE * scale);
}

export function roverShadow(g: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  oval(g, x - 8 * scale, y + 4 * scale, 17 * scale, 8 * scale, 'rgba(15,18,29,0.48)');
  oval(g, x, y + 1 * scale, 11 * scale, 5 * scale, 'rgba(12,15,25,0.58)');
}
