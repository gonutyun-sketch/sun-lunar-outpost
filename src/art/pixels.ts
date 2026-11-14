export type Point = readonly [number, number];

export const ink = {
  space: '#080c16',
  edge: '#131c2a',
  slate: '#364358',
  metal: '#77879a',
  white: '#e1ded2',
  amber: '#f4ca65',
  ice: '#73d4ed',
  mint: '#73dfb3',
  red: '#ff7076',
};

export function surface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function dot(g: CanvasRenderingContext2D, x: number, y: number, color: string, w = 1, h = 1) {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Scan-convert a face onto whole pixels. Canvas path antialiasing is deliberately bypassed. */
export function face(g: CanvasRenderingContext2D, points: readonly Point[], color: string) {
  const rows = points.map(([, y]) => y);
  const start = Math.floor(Math.min(...rows));
  const end = Math.ceil(Math.max(...rows));
  const sides: [Point, Point][] = points.map((p, i) => [p, points[(i + 1) % points.length]]);
  const span: number[] = [];
  g.fillStyle = color;
  for (let y = start; y < end; y++) {
    const scan = y + 0.5;
    span.length = 0;
    for (const [[ax, ay], [bx, by]] of sides) {
      if ((ay > scan) === (by > scan)) continue;
      span.push(ax + (bx - ax) * (scan - ay) / (by - ay));
    }
    span.sort((a, b) => a - b);
    for (let i = 0; i + 1 < span.length; i += 2) {
      const left = Math.ceil(span[i] - 0.5);
      const right = Math.ceil(span[i + 1] - 0.5);
      if (right > left) g.fillRect(left, y, right - left, 1);
    }
  }
}

export function line(g: CanvasRenderingContext2D, a: Point, b: Point, color: string, width = 1) {
  let x = Math.round(a[0]), y = Math.round(a[1]);
  const x1 = Math.round(b[0]), y1 = Math.round(b[1]);
  const dx = Math.abs(x1 - x), dy = -Math.abs(y1 - y);
  const sx = x < x1 ? 1 : -1, sy = y < y1 ? 1 : -1;
  let error = dx + dy;
  const offset = Math.floor(width / 2);
  g.fillStyle = color;
  for (;;) {
    g.fillRect(x - offset, y - offset, width, width);
    if (x === x1 && y === y1) break;
    const step = 2 * error;
    if (step >= dy) { error += dy; x += sx; }
    if (step <= dx) { error += dx; y += sy; }
  }
}

export function oval(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  g.fillStyle = color;
  for (let row = Math.ceil(y - ry); row <= Math.floor(y + ry); row++) {
    const wide = rx * Math.sqrt(Math.max(0, 1 - ((row - y) / ry) ** 2));
    const left = Math.ceil(x - wide);
    g.fillRect(left, row, Math.floor(x + wide) - left + 1, 1);
  }
}

/** Sunlight from the right strikes the outer right rim and the opposite inner wall. */
export function crater(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, seed: number) {
  const rng = random(seed);
  const colors = ['#24263a', '#303449', '#41485d', '#555a6e', '#706e7c', '#938d96', '#b3a7a4'];
  const minX = Math.floor(x - rx * 1.25), maxX = Math.ceil(x + rx * 1.22);
  const minY = Math.floor(y - ry * 1.19), maxY = Math.ceil(y + ry * 1.28);
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const dx = (px - x) / rx, dy = (py - y) / ry;
      const d = Math.hypot(dx, dy);
      const variation = (rng() - 0.5) * 0.065 + Math.sin(dx * 18 + dy * 9) * 0.02;
      const radius = d + variation;
      const lit = (dx - dy * 0.26) / (d || 1);
      if (radius <= 0.73) {
        const basin = lit < -0.18 && radius > 0.43 ? 1 : 0;
        dot(g, px, py, colors[basin + (rng() > 0.978 ? 1 : 0)]);
      } else if (radius <= 1) {
        const shelf = radius > 0.91 ? 2 : radius > 0.82 ? 1 : 0;
        dot(g, px, py, colors[lit < -0.3 ? 3 + shelf : lit > 0.24 ? shelf : 2 + (shelf === 2 ? 1 : 0)]);
      } else if (radius < 1.11) {
        if (rng() > (radius - 1) * 6) dot(g, px, py, colors[lit > 0.28 ? (radius < 1.055 ? 6 : 5) : lit < -0.4 ? 2 : 4]);
      } else if (radius < 1.22 && rng() > 0.94) {
        dot(g, px, py, colors[lit > 0 ? 5 : 2]);
      }
    }
  }
}

export function boulder(g: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number) {
  const rng = random(seed);
  const edge: Point[] = Array.from({ length: 8 }, (_, i) => {
    const angle = (i + 0.2) * Math.PI / 4;
    const size = r * (0.88 + rng() * 0.12);
    return [x + Math.cos(angle) * size, y + Math.sin(angle) * size];
  });
  oval(g, x - r * 1.2, y + r * 0.43, r * 1.78, r * 0.57, '#171c321f');
  oval(g, x - r * 0.72, y + r * 0.40, r * 1.36, r * 0.56, '#14192957');
  oval(g, x - r * 0.26, y + r * 0.33, r * 0.98, r * 0.48, '#1317284d');
  face(g, edge, '#393b4c');
  const crown: Point[] = [[x - r * 0.28, y - r * 0.7], [x + r * 0.46, y - r * 0.4], [x + r * 0.23, y + r * 0.18], [x - r * 0.53, y + r * 0.25]];
  face(g, [edge[3], edge[4], edge[5], crown[0], crown[3]], '#55586f');
  face(g, [edge[5], edge[6], edge[7], crown[1], crown[0]], '#968f98');
  face(g, [edge[0], edge[1], edge[2], crown[2], crown[1], edge[7]], '#817e8b');
  face(g, crown, '#b2aaa8');
  line(g, crown[1], crown[2], '#decdc0');
  line(g, [x - r * 0.54, y + r * 0.23], [x - r * 0.1, y + r * 0.61], '#696a7d');
  if (r > 6) {
    dot(g, x - r * 0.25, y - r * 0.3, '#96909a', 2);
    dot(g, x - r * 0.04, y - r * 0.27, '#d6c3b3');
    dot(g, x + r * 0.35, y + r * 0.37, '#a19aa0');
    line(g, [x - r * 0.46, y - r * 0.07], [x - r * 0.16, y + r * 0.12], '#98929d');
  }
}
