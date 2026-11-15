import { face, line, type Point } from './pixels';

/** Ground coordinates of a solar rack. Height always lifts an object vertically on the sprite. */
export interface SolarModule {
  origin: Point;
  along: Point;
  rear: Point;
  lower: number;
  upper: number;
  cells: readonly [number, number];
}

function project(m: SolarModule, u: number, v: number, height: number): Point {
  return [m.origin[0] + u * m.along[0] + v * m.rear[0], m.origin[1] + u * m.along[1] + v * m.rear[1] - height];
}

const elevation = (m: SolarModule, v: number) => m.lower + (m.upper - m.lower) * v;
const corners = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
const rackPositions = [0.17, 0.83];
const frontMount = 0.075;
const rearMount = 0.86;
const frameDepth = 1.6;

export function solarModuleShadow(g: CanvasRenderingContext2D, m: SolarModule) {
  const groundShadow = (u: number, v: number, amount: number): Point => {
    const [x, y] = project(m, u, v, 0);
    const h = elevation(m, v);
    return [x - h * 2.4 * amount, y + h * 0.56 * amount];
  };
  // The low sun is at screen right. The raised side casts farther from its ground contacts.
  face(g, corners.map(([u, v]) => groundShadow(u, v, 1.12)), '#1a233b3c');
  face(g, corners.map(([u, v]) => groundShadow(u, v, 1)), '#131c3461');
  for (const u of rackPositions) {
    for (const v of [frontMount, rearMount]) line(g, project(m, u, v, 0), groundShadow(u, v, 1), '#25314d72');
  }
}

export function solarModule(g: CanvasRenderingContext2D, m: SolarModule, { broken = false, dust = false, lit = true } = {}) {
  const top = (u: number, v: number): Point => project(m, u, v, elevation(m, v));
  const underside = (u: number, v: number): Point => project(m, u, v, elevation(m, v) - frameDepth);
  for (const u of rackPositions) {
    const front = project(m, u, frontMount, 0), rear = project(m, u, rearMount, 0);
    line(g, rear, front, '#48546a', 2);
    line(g, rear, underside(u, rearMount), '#718297', 2);
    line(g, rear, underside(u, frontMount), '#586b80');
    line(g, front, underside(u, frontMount), '#a4aeae', 2);
    for (const [x, y] of [rear, front]) {
      face(g, [[x - 3, y], [x + 1, y - 1], [x + 3, y], [x + 2, y + 2], [x - 2, y + 2]], '#3e4a5d');
      line(g, [x - 2, y], [x + 1, y - 1], '#a99a84');
    }
  }

  face(g, [top(0, 0), top(1, 0), underside(1, 0), underside(0, 0)], '#526176');
  face(g, [top(1, 0), top(1, 1), underside(1, 1), underside(1, 0)], '#83929f');
  face(g, corners.map(([u, v]) => top(u, v)), '#25354e');
  const [cols, rows] = m.cells;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = (i + 0.14) / cols, b = (i + 0.84) / cols;
    const c = (j + 0.10) / rows, d = (j + 0.86) / rows;
    const crack = broken && i >= cols / 3 && j < rows - 1;
    const color = crack ? '#694a59' : dust ? '#796d81' : lit && j === 0 ? '#5082aa' : '#3b5d8a';
    face(g, [top(a, c), top(b, c), top(b, d), top(a, d)], color);
    line(g, top(a, c + 0.06 / rows), top(b - 0.10 / cols, c + 0.06 / rows), crack ? '#a7757d' : '#7398b3');
  }
  line(g, top(0, 1), top(1, 1), '#718498');
  line(g, top(0, 0), top(0, 1), '#697c8e');
  line(g, top(1, 0), top(1, 1), '#9eaeb6');
  line(g, top(0, 0), top(1, 0), dust ? '#b0a092' : '#e4c99c');
  if (broken) {
    const fracture = [top(0.53, 0.82), top(0.66, 0.55), top(0.61, 0.37), top(0.78, 0.12)];
    for (let i = 1; i < fracture.length; i++) line(g, fracture[i - 1], fracture[i], '#1c2133');
  }
}
