import type { Facilities, FacilityId, UpgradeId, Upgrades } from '../game/types';
import { boulder, crater, dot, face, ink, line, oval, random, surface, type Point } from './pixels';
import { roverShadow, roverSprite } from './roverSprite';

export const OUTPOST_WIDTH = 512;
export const OUTPOST_HEIGHT = 304;

type Structure = FacilityId | 'solar' | 'habitat' | 'battery' | 'dock';
type Hull = readonly [string, string, string];

export interface OutpostState {
  facilities: Facilities;
  sunlight: number;
  radiation?: boolean;
  dust?: boolean;
  solarFault?: boolean;
  oxygenFault?: boolean;
  pumpFault?: boolean;
  powerAlert?: boolean;
  habitatOffline?: boolean;
  battery: number;
  upgrades: Upgrades;
  building?: UpgradeId | null;
  fresh?: UpgradeId | null;
}

const steel: Hull = ['#dcd9d0', '#66768c', '#aaa8ab'];
const basalt: Hull = ['#8d8892', '#50536a', '#71707d'];
const graphite: Hull = ['#67788a', '#313e53', '#586477'];

const anchors: Record<Exclude<Structure, 'solar'>, Point> = {
  oxygen: [206, 166], lab: [303, 153], greenhouse: [142, 190],
  habitat: [257, 208], shelter: [335, 227], battery: [171, 230], dock: [238, 254],
};

// HTML labels and Canvas art share these anchors in the authored 512×304 frame.
export const outpostLabels = {
  solar: [421, 204], oxygen: [194, 114], lab: [298, 100], greenhouse: [119, 130],
  habitat: [266, 149], shelter: [361, 228],
} as const;

const construction: Record<UpgradeId, Point> = {
  solar: [388, 128], oxygen: [222, 165], battery: [184, 230],
};
const solarPositions: readonly Point[] = [[366, 153], [386, 173], [406, 193]];
const solarExtension: readonly Point[] = [[358, 129], [399, 131]];

const pipes: { id: Structure; points: Point[] }[] = [
  { id: 'solar', points: [[388, 183], [361, 196], [320, 175], [288, 191]] },
  { id: 'oxygen', points: [[207, 167], [176, 182], [218, 203], [238, 193]] },
  { id: 'lab', points: [[303, 155], [285, 149], [241, 172], [266, 183]] },
  { id: 'greenhouse', points: [[142, 188], [169, 201], [196, 188], [236, 208]] },
  { id: 'shelter', points: [[332, 226], [298, 210], [274, 222], [252, 211]] },
  { id: 'battery', points: [[171, 230], [190, 239], [234, 217]] },
  { id: 'dock', points: [[238, 254], [211, 240], [244, 224]] },
];

let backdrop: HTMLCanvasElement | undefined;

function rockField(g: CanvasRenderingContext2D) {
  const rng = random(902);
  for (let i = 0; i < 4200; i++) {
    const x = rng() * OUTPOST_WIDTH, y = 119 + rng() * 185;
    const light = rng() > 0.63;
    dot(g, x, y, light ? 'rgba(212,193,188,0.22)' : 'rgba(26,29,47,0.23)', rng() > 0.92 ? 3 : 1);
  }
  for (const [x, y, rx, ry] of [[30, 197, 38, 13], [475, 215, 49, 19], [54, 287, 77, 26], [407, 291, 64, 22], [432, 152, 20, 7], [107, 235, 24, 8], [143, 133, 24, 7], [133, 274, 14, 5]]) {
    crater(g, x, y, rx, ry, x * y);
  }
  for (let i = 0; i < 126; i++) {
    const x = rng() * OUTPOST_WIDTH, y = 122 + rng() * 180;
    if (x > 77 && x < 393 && y > 137 && y < 252) continue;
    const r = 1.5 + rng() ** 3 * (2 + y / 47);
    boulder(g, x, y, r, i * 13 + 41);
  }
}

function terrain() {
  if (backdrop) return backdrop;
  const cv = surface(OUTPOST_WIDTH, OUTPOST_HEIGHT);
  const g = cv.getContext('2d')!;
  dot(g, 0, 0, '#080c17', 512, 304);
  for (const [y, h, color] of [[32, 27, '#0a0f20'], [59, 22, '#0c1325'], [81, 18, '#0e172b'], [99, 30, '#11192d']] as const) {
    dot(g, 0, y, color, 512, h);
  }
  const rng = random(712202);
  const star = ['#253248', '#3a4962', '#586f86', '#8a9cb0', '#ccced2'];
  for (let i = 0; i < 255; i++) {
    const x = Math.floor(rng() * 512), y = Math.floor(rng() * 115), l = Math.floor(rng() ** 2 * star.length);
    dot(g, x, y, star[l]);
    if (l === 4 && i % 9 === 0) {
      dot(g, x - 1, y, star[2], 3);
      dot(g, x, y - 1, star[2], 1, 3);
      dot(g, x, y, star[4]);
    }
  }
  // Pixel clusters across the day side of the Earth, quantized along the terminator.
  const earthX = 176, earthY = 54, radius = 24;
  for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
    const d = (x * x + y * y) / (radius * radius);
    if (d > 1) continue;
    const z = Math.sqrt(1 - d), light = z * 0.59 + x / radius * 0.7 - y / radius * 0.18;
    const terrain = Math.sin(x * 0.36 + y * 0.18) + Math.cos(y * 0.33 - x * 0.07) + Math.sin(x * 0.14 - y * 0.12);
    const cloud = Math.sin(x * 0.30 + y * 0.53 + Math.sin(x * 0.25)) + Math.cos(y * 0.13 - x * 0.35) > 1.38;
    const color = light < -0.06 ? '#121b31' : light < 0.15 ? '#263e5a'
      : d > 0.91 ? '#98cfde' : cloud ? (light > 0.56 ? '#dbdfcf' : '#7da8ba')
      : terrain > 0.96 ? (light > 0.56 ? '#8db09a' : '#4f7a80') : light > 0.59 ? '#5594b9' : '#375e90';
    dot(g, earthX + x, earthY + y, color);
  }

  const sunX = 442, sunY = 94;
  oval(g, sunX, sunY, 35, 18, '#352838');
  oval(g, sunX, sunY, 24, 12, '#624339');
  oval(g, sunX, sunY, 13, 8, '#a97152');
  line(g, [sunX - 31, sunY], [sunX + 31, sunY], '#8e6049');
  oval(g, sunX, sunY, 6, 6, '#ffe7b3');
  oval(g, sunX + 1, sunY - 1, 4, 4, '#fff6d5');

  const skyRidge: Point[] = [[0, 124], [18, 117], [38, 113], [56, 117], [85, 103], [108, 109], [124, 105], [144, 110], [184, 93], [200, 96], [222, 105], [249, 100], [281, 112], [315, 108], [343, 92], [359, 90], [385, 104], [408, 106], [435, 98], [470, 110], [512, 104]];
  const ridge: Point[] = [[0, 138], [42, 130], [76, 134], [108, 123], [143, 126], [176, 115], [211, 124], [256, 119], [296, 124], [328, 112], [358, 121], [392, 124], [419, 117], [458, 126], [486, 121], [512, 129]];
  face(g, [...skyRidge, [512, 155], [0, 155]], '#30364d');
  for (const [p, q, r] of [[4, 5, 6], [8, 9, 10], [14, 15, 16], [18, 19, 20]]) {
    face(g, [skyRidge[p], skyRidge[q], skyRidge[r], [skyRidge[q][0] - 4, 134]], '#504956');
    line(g, skyRidge[p], skyRidge[q], '#7a686b');
  }
  face(g, [[435, 98], [470, 110], [512, 104], [512, 132], [447, 119]], '#66505b');
  face(g, [...ridge, [512, 304], [0, 304]], '#6a687c');
  face(g, [[0, 152], [87, 146], [146, 152], [216, 131], [329, 148], [412, 137], [512, 155], [512, 304], [0, 304]], '#626279');
  face(g, [[0, 216], [77, 206], [137, 222], [201, 213], [279, 225], [365, 216], [434, 234], [512, 226], [512, 304], [0, 304]], '#585a70');
  face(g, [[0, 269], [89, 257], [155, 267], [222, 253], [337, 274], [512, 257], [512, 304], [0, 304]], '#4d5269');
  rockField(g);
  backdrop = cv;
  return cv;
}

/** Extruded hulls sit on a shared oblique grid: x goes right/down and y goes left/down. */
function prism(g: CanvasRenderingContext2D, x: number, y: number, a: number, b: number, h: number, colors: Hull) {
  const [top, front, right] = colors;
  const left: Point = [x - b, y - b * 0.5];
  const back: Point = [x - b + a, y - (a + b) * 0.5];
  const east: Point = [x + a, y - a * 0.5];
  const v = ([px, py]: Point): Point => [px, py - h];
  const origin: Point = [x, y];
  face(g, [v(left), v(origin), origin, left], front);
  face(g, [v(origin), v(east), east, origin], right);
  face(g, [v(left), v(back), v(east), v(origin)], top);
  line(g, v(left), v(origin), '#171f3373');
  line(g, v(origin), v(east), '#fff0ca50');
  line(g, origin, east, '#192136');
  return { left, back, east, origin, roof: v };
}

function shadow(g: CanvasRenderingContext2D, x: number, y: number, a: number, b: number, length: number) {
  const left: Point = [x - b, y - b / 2];
  const rear: Point = [x + a - b, y - (a + b) / 2];
  const near: Point = [x, y];
  for (const [distance, opacity] of [[1.28, 0.17], [1, 0.28], [0.48, 0.39]] as const) {
    const dx = length * distance;
    face(g, [rear, [rear[0] - dx - 4, rear[1] + dx * 0.25], [left[0] - dx - 4, left[1] + dx * 0.24],
      [near[0] - dx, near[1] + dx * 0.25], [x + a * 0.82, y - a * 0.35]], `rgba(17,23,40,${opacity})`);
  }
}

function corridor(g: CanvasRenderingContext2D, points: Point[], color: string) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dy = Math.sign(b[1] - a[1]);
    line(g, [a[0] + 2, a[1] + 3], [b[0] + 2, b[1] + 3], '#302f43', 7);
    line(g, a, b, '#4a5366', 6);
    line(g, [a[0], a[1] - 2], [b[0], b[1] - 2], '#818791', 2);
    line(g, [a[0], a[1] + 1], [b[0], b[1] + 1], color);
    const n = Math.ceil(Math.abs(b[0] - a[0]) / 8);
    for (let j = 1; j < n; j++) {
      const x = a[0] + (b[0] - a[0]) * j / n, y = a[1] + (b[1] - a[1]) * j / n;
      line(g, [x - dy, y - 2], [x + dy, y + 2], '#b4b3ad');
    }
  }
}

function led(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
  dot(g, x - 1, y - 1, '#263041', 5, 4);
  dot(g, x, y, color, 3, 2);
}

function windowRow(g: CanvasRenderingContext2D, x: number, y: number, count: number, color: string, direction: 1 | -1 = 1) {
  for (let i = 0; i < count; i++) {
    const px = x + i * 8, py = y + direction * i * 4;
    face(g, [[px, py - 4], [px + 6, py - 4 + direction * 3], [px + 6, py + 1 + direction * 3], [px, py + 1]], '#354455');
    line(g, [px + 1, py - 2], [px + 4, py - 2 + direction * 2], color, 2);
  }
}

function solarPanel(g: CanvasRenderingContext2D, x: number, y: number, state: OutpostState, fault: boolean) {
  const uv = (u: number, v: number): Point => [x + u * 6 - v * 5, y - u * 3 - v * 5];
  // Tall supports are under the west edge (v=4). The low rail faces the Sun to the east.
  for (const [u, v] of [[1, 3.7], [4, 3.7], [1, 0.25], [4, 0.25]]) {
    const top = uv(u, v);
    const foot: Point = [top[0], y - u * 3 + 7 - v * 1.7];
    line(g, top, foot, v > 1 ? '#5d687d' : '#a3a4a4', 3);
    dot(g, foot[0] - 2, foot[1], '#4b5066', 5, 2);
    dot(g, foot[0] + 1, foot[1] - 2, '#c6b693');
  }
  const lowA = uv(0, 0), lowB = uv(5, 0), highA = uv(0, 4), highB = uv(5, 4);
  face(g, [lowA, lowB, [lowB[0], lowB[1] + 3], [lowA[0], lowA[1] + 3]], '#48546b');
  face(g, [lowA, lowB, highB, highA], '#233149');
  for (let v = 0; v < 4; v++) for (let u = 0; u < 5; u++) {
    const cracked = fault && u >= 2 && v < 3 && (u + v) % 3 !== 1;
    const surfaceColor = cracked ? '#653e51' : state.dust ? '#827181'
      : state.sunlight > 0.55 ? (v === 0 ? '#5581b1' : '#3d6396') : '#345078';
    face(g, [uv(u + 0.09, v + 0.06), uv(u + 0.85, v + 0.06), uv(u + 0.85, v + 0.88), uv(u + 0.09, v + 0.88)], surfaceColor);
    line(g, uv(u + 0.20, v + 0.14), uv(u + 0.63, v + 0.14), cracked ? '#cc817d' : v === 0 ? '#a4c8d5' : '#6888b1');
  }
  line(g, highA, highB, '#7a8498');
  line(g, lowB, highB, '#b5c2c8');
  line(g, lowA, lowB, state.dust ? '#baa28f' : '#f0d7a5');
  dot(g, lowB[0] - 3, lowB[1] + 1, '#f8e5bf', 3);
  if (fault) {
    line(g, uv(2.9, 3.4), uv(3.4, 2.3), '#151c2c', 2);
    line(g, uv(3.4, 2.3), uv(2.7, 1.4), '#151c2c', 2);
    line(g, uv(2.7, 1.4), uv(3.4, 0), '#151c2c', 2);
    dot(g, x + 18, y - 1, '#ff9a87', 2);
  }
  led(g, x + 6, y + 5, fault ? ink.red : state.dust ? '#b69070' : ink.amber);
}

function tank(g: CanvasRenderingContext2D, x: number, y: number, h: number, color: string) {
  oval(g, x - 5, y, 12, 4, '#464b62');
  dot(g, x - 8, y - h, '#637489', 17, h);
  dot(g, x - 2, y - h, '#b8c0c0', 10, h);
  dot(g, x + 3, y - h, '#ece5d2', 3, h);
  oval(g, x, y - h, 8, 4, '#d9dad0');
  oval(g, x + 2, y - h - 1, 5, 2, '#f0e6ce');
  for (const band of [10, h - 5]) {
    oval(g, x, y - h + band, 8, 2, '#425e70');
    dot(g, x - 4, y - h + band - 1, band === 10 ? color : '#7b969f', 11, 2);
  }
  dot(g, x - 2, y - h - 6, '#566a77', 5, 4);
  dot(g, x + 1, y - h - 7, '#c7b78f', 3, 3);
  dot(g, x + 6, y - h + 15, '#faf0d8', 2, 3);
}

function drawOxygen(g: CanvasRenderingContext2D, x: number, y: number, state: OutpostState) {
  const on = state.facilities.oxygen;
  const color = state.oxygenFault ? ink.red : on ? ink.ice : '#56707e';
  prism(g, x + 4, y + 2, 24, 39, 4, graphite);
  tank(g, x + 10, y - 14, 31, color);
  tank(g, x - 9, y - 9, 35, color);
  if (state.upgrades.oxygen) tank(g, x + 22, y - 4, 25, color);
  line(g, [x - 9, y - 6], [x - 8, y], '#92a1ac', 3);
  line(g, [x - 8, y], [x + 6, y - 1], '#99a9bb', 3);
  prism(g, x + 1, y + 4, 12, 14, 10, steel);
  dot(g, x - 7, y - 8, '#283a50', 7, 4);
  dot(g, x - 6, y - 7, color, 4);
  led(g, x - 5, y - 3, color);
}

function habitat(g: CanvasRenderingContext2D, x: number, y: number, state: OutpostState) {
  const living = state.habitatOffline ? '#70434c' : '#eed38d';
  prism(g, x, y + 3, 45, 43, 3, graphite);
  prism(g, x, y, 40, 39, 20, steel);
  prism(g, x - 3, y - 18, 36, 33, 4, ['#efeadb', '#8896aa', '#c0bab9']);
  prism(g, x + 7, y - 27, 17, 17, 5, ['#c2cbcb', '#71879b', '#a0acb0']);
  for (let i = 0; i < 3; i++) {
    const sx = x - 25 + i * 8, sy = y - 30 + i * 4;
    line(g, [sx, sy], [sx + 20, sy - 10], '#a6a6ad');
    line(g, [sx + 1, sy - 1], [sx + 17, sy - 9], '#f6ecd9');
  }
  windowRow(g, x - 32, y - 29, 3, living);
  windowRow(g, x + 10, y - 14, 3, living, -1);
  prism(g, x + 3, y + 8, 13, 13, 11, graphite);
  face(g, [[x - 7, y + 1], [x + 1, y + 5], [x + 1, y - 4], [x - 7, y - 8]], '#232b41');
  line(g, [x - 7, y - 7], [x + 1, y - 3], '#8897a6');
  line(g, [x - 6, y - 4], [x, y - 1], living, 2);
  dot(g, x - 3, y + 1, '#a49886', 2, 2);
  prism(g, x - 3, y + 11, 10, 12, 2, basalt);
  led(g, x + 5, y - 3, state.habitatOffline ? ink.red : ink.mint);
}

function greenhouse(g: CanvasRenderingContext2D, x: number, y: number, state: OutpostState) {
  const on = state.facilities.greenhouse;
  prism(g, x + 1, y + 1, 31, 39, 4, graphite);
  face(g, [[x - 38, y - 21], [x - 36, y - 35], [x - 28, y - 42], [x - 16, y - 42], [x - 5, y - 36], [x, y - 23], [x, y - 2]], on ? '#306b64' : '#354859');
  face(g, [[x - 28, y - 42], [x + 1, y - 57], [x + 13, y - 57], [x + 24, y - 51], [x + 29, y - 38], [x + 29, y - 17], [x, y - 2], [x, y - 23], [x - 5, y - 36], [x - 16, y - 42]], on ? '#448e7a' : '#4d6776');
  face(g, [[x - 16, y - 42], [x + 13, y - 57], [x + 24, y - 51], [x - 5, y - 36]], on ? '#6ca799' : '#628293');
  for (let i = 0; i < 6; i++) {
    const a = x - 33 + i * 6, b = y - 22 + i * 3;
    const stalk = i % 3 === 0 ? 9 : 6;
    dot(g, a, b - stalk, on ? '#a2d985' : '#50666a', 1, stalk);
    dot(g, a - 2, b - stalk + 2, on ? '#79c87c' : '#476168', 2, 2);
    dot(g, a + 1, b - stalk + 4, on ? '#5c9760' : '#394e5a', 2, 2);
    dot(g, a - 2, b, '#203e4a', 5, 2);
    dot(g, x + i * 4, y - 9 - i * 2, on ? '#a6ca6b' : '#2e4956', 2, 3);
  }
  for (let i = 0; i < 4; i++) {
    const dx = i * 9, dy = -i * 4.5;
    const p: Point[] = [[x + dx, y - 4 + dy], [x + dx, y - 23 + dy], [x - 5 + dx, y - 36 + dy], [x - 16 + dx, y - 42 + dy], [x - 28 + dx, y - 42 + dy], [x - 36 + dx, y - 35 + dy]];
    for (let j = 1; j < p.length; j++) line(g, p[j - 1], p[j], on ? '#afc4b3' : '#849eaa');
  }
  line(g, [x - 38, y - 21], [x, y - 2], '#a4afb3', 2);
  line(g, [x + 2, y - 3], [x + 29, y - 17], '#a1bab9', 2);
  line(g, [x + 6, y - 39], [x + 26, y - 49], on ? '#b8d2bb' : '#9bb1bd');
  dot(g, x + 21, y - 35, on ? '#8abb9b' : '#668796', 3);
  led(g, x + 4, y - 6, state.pumpFault ? ink.red : on ? ink.mint : '#566579');
}

function lab(g: CanvasRenderingContext2D, x: number, y: number, on: boolean) {
  prism(g, x, y + 3, 30, 32, 4, graphite);
  prism(g, x, y, 27, 29, 15, steel);
  prism(g, x - 2, y - 14, 24, 24, 4, ['#b5acc1', '#5c6685', '#85869b']);
  windowRow(g, x - 23, y - 21, 2, on ? ink.ice : '#596e8e');
  line(g, [x + 1, y - 26], [x + 4, y - 47], '#aebaca', 2);
  face(g, [[x - 8, y - 48], [x + 2, y - 40], [x + 14, y - 45], [x + 16, y - 54], [x + 4, y - 49]], '#a1acb9');
  line(g, [x - 8, y - 48], [x + 4, y - 49], '#e1ded2');
  line(g, [x + 3, y - 46], [x + 2, y - 53], '#5b728d');
  dot(g, x + 1, y - 54, on ? ink.ice : '#556779', 2, 2);
  led(g, x + 7, y - 12, on ? ink.ice : '#596b83');
}

function shelter(g: CanvasRenderingContext2D, x: number, y: number, state: OutpostState) {
  prism(g, x, y + 2, 29, 34, 14, ['#a19187', '#514e64', '#8e797b']);
  prism(g, x, y - 12, 24, 29, 6, ['#c1b3a1', '#645967', '#a28a8a']);
  for (let i = 0; i < 4; i++) {
    const px = x - 25 + i * 5, py = y - 15 + i * 2.5;
    line(g, [px, py], [px, py + 8], '#625966', 2);
  }
  const door = state.facilities.shelter ? '#bca28b' : '#3a3747';
  face(g, [[x + 5, y - 4], [x + 20, y - 11], [x + 20, y - 23], [x + 5, y - 16]], '#333547');
  face(g, [[x + 7, y - 5], [x + 18, y - 11], [x + 18, y - 20], [x + 7, y - 15]], door);
  if (state.facilities.shelter) line(g, [x + 12, y - 8], [x + 12, y - 17], '#494454');
  for (let i = 0; i < 3; i++) dot(g, x + 19 + i * 2, y - 10 - i, '#cfaa73');
  led(g, x + 10, y - 24, state.radiation ? ink.red : state.facilities.shelter ? ink.amber : '#596879');
}

function battery(g: CanvasRenderingContext2D, x: number, y: number, state: OutpostState) {
  const cells = state.upgrades.battery ? 5 : 3;
  prism(g, x + 2, y + 4, cells * 6 + 4, 31, 4, basalt);
  for (let i = cells - 1; i >= 0; i--) {
    const tx = x + i * 6, ty = y - i * 3;
    prism(g, tx, ty, 5, 26, 10, ['#8e8290', '#786677', '#4d4e62']);
    line(g, [tx - 22, ty - 21], [tx - 3, ty - 12], '#bbb2ad');
    const level = Math.min(1, Math.max(0, state.battery * cells - i));
    dot(g, tx - 4, ty - 8, '#302d40', 3, 6);
    if (level > 0) {
      const h = Math.round(level * 5);
      dot(g, tx - 4, ty - 2 - h, state.powerAlert ? ink.red : ink.amber, 2, h);
    }
  }
}

function dock(g: CanvasRenderingContext2D, x: number, y: number) {
  prism(g, x + 4, y + 7, 55, 42, 2, ['#73798a', '#626579', '#444b61']);
  for (let i = 0; i < 5; i++) {
    const px = x + i * 7, py = y - i * 3.5;
    line(g, [px - 13, py + 4], [px - 9, py + 6], i % 2 ? '#3d4459' : '#d4b27b', 2);
  }
  line(g, [x - 25, y - 17], [x + 22, y - 40], '#a4a3a7', 2);
  roverShadow(g, x + 8, y - 12);
  roverSprite(g, x + 8, y - 12, { angle: -Math.PI / 4 });
  led(g, x + 42, y - 18, ink.ice);
}

function live(id: Structure, state: OutpostState) {
  if (id === 'solar') return !state.dust && state.sunlight > 0.2;
  if (id === 'battery') return state.battery > 0;
  if (id === 'dock' || id === 'habitat') return !state.habitatOffline;
  return state.facilities[id];
}

function constructionMarks(g: CanvasRenderingContext2D, [x, y]: Point, color: string, large: boolean) {
  const w = large ? 18 : 12;
  for (const sign of [-1, 1]) {
    line(g, [x + sign * (w - 6), y + 4], [x + sign * w, y + 1], color);
    line(g, [x + sign * w, y + 1], [x + sign * (w - 4), y - 1], color);
  }
}

export function drawOutpost(g: CanvasRenderingContext2D, state: OutpostState) {
  g.imageSmoothingEnabled = false;
  g.drawImage(terrain(), 0, 0);
  if (state.sunlight < 0.9) dot(g, 0, 0, `rgba(19,24,48,${(0.9 - state.sunlight) * 0.52})`, 512, 304);
  if (state.radiation) dot(g, 0, 0, '#b743511b', 512, 304);
  if (state.dust) dot(g, 0, 118, '#b5906826', 512, 186);

  // Graded gravel working area and long shadows, separate from the actual obstacles and data.
  face(g, [[62, 183], [136, 135], [306, 118], [441, 151], [441, 207], [314, 263], [201, 275], [105, 228]], '#88818d48');
  for (const [id, a, b, h] of [
    ['oxygen', 31, 35, 58], ['lab', 31, 30, 55], ['greenhouse', 33, 40, 72],
    ['habitat', 44, 42, 75], ['shelter', 33, 35, 57], ['battery', 31, 29, 34], ['dock', 53, 43, 15],
  ] as const) shadow(g, ...anchors[id], a, b, h);
  for (const [x, y] of solarPositions) shadow(g, x + 2, y + 7, 30, 20, 49);
  if (state.upgrades.solar) {
    for (const [x, y] of solarExtension) shadow(g, x + 2, y + 7, 30, 20, 49);
  }
  for (const { id, points } of pipes) {
    corridor(g, points, live(id, state) ? (id === 'solar' || id === 'battery' ? '#c49d6a' : '#70a4aa') : '#515b6e');
  }
  for (const [x, y, dir] of [[131, 236, 1], [171, 254, 1], [277, 266, -1], [385, 222, -1], [405, 185, 1]]) {
    for (let i = 0; i < 6; i++) {
      dot(g, x + i * 5, y + i * dir * 2, '#a2a1a3', 3);
      if (i % 2 === 0) dot(g, x + i * 5 + 1, y + i * dir * 2 + 1, '#595f77', 4);
    }
  }
  if (state.upgrades.solar) {
    for (const [x, y] of solarExtension) solarPanel(g, x, y, state, false);
  }
  lab(g, ...anchors.lab, state.facilities.lab);
  drawOxygen(g, ...anchors.oxygen, state);
  solarPositions.forEach(([x, y], i) => solarPanel(g, x, y, state, !!state.solarFault && i === solarPositions.length - 1));
  greenhouse(g, ...anchors.greenhouse, state);
  habitat(g, ...anchors.habitat, state);
  battery(g, ...anchors.battery, state);
  shelter(g, ...anchors.shelter, state);
  dock(g, ...anchors.dock);
  if (state.building) constructionMarks(g, construction[state.building], '#f4ca65', state.building === 'solar');
  if (state.fresh) constructionMarks(g, construction[state.fresh], '#a8efe0', state.fresh === 'solar');
  if (state.powerAlert) {
    led(g, 231, 221, ink.red);
    dot(g, 234, 225, '#953e54', 6, 2);
  }
}

export function drawOutpostLights(g: CanvasRenderingContext2D, state: OutpostState, tick: number, motion: boolean, highlight?: FacilityId | null) {
  g.clearRect(0, 0, OUTPOST_WIDTH, OUTPOST_HEIGHT);
  const phase = motion ? tick : 0;
  for (const { id, points } of pipes) {
    if (!live(id, state)) continue;
    if (id === 'solar' || id === 'battery' || id === 'greenhouse' || id === 'oxygen') {
      const [a, b] = points, n = ((phase + a[0]) % 18) / 18;
      dot(g, a[0] + (b[0] - a[0]) * n, a[1] + (b[1] - a[1]) * n + 1, id === 'solar' || id === 'battery' ? '#efce87' : '#a3e6d2', 2);
    }
  }
  if (state.facilities.lab) {
    dot(g, 304, 100, phase % 8 < 3 ? '#cbf4ed' : '#72baca', 2, 2);
  }
  if (state.oxygenFault) {
    for (let i = 0; i < 4; i++) {
      const s = (i * 3 + phase) % 12;
      dot(g, 194 - s, 143 - s, s > 7 ? '#aec4d46b' : '#b7dde1c7', 3 - (s > 8 ? 1 : 0), 2);
    }
  }
  if (state.solarFault && phase % 7 < 3) {
    const [x, y] = solarPositions[solarPositions.length - 1];
    dot(g, x + 18, y - 5, '#ffd6b9', 2, 2);
    dot(g, x + 20, y - 7, '#ff8281');
  }
  if (state.radiation) {
    const flash = phase % 12 < 5;
    dot(g, 345, 203, flash ? '#ffb0a0' : '#9c425c', 3, 2);
    for (let i = 0; i < 9; i++) {
      const x = (i * 61 + phase * 5) % 512, y = (i * 19 + phase * 2) % 109;
      line(g, [x, y], [x + 5, y + 2], i % 3 ? '#b9817aab' : '#ecb48fbd');
    }
  }
  if (state.dust) {
    for (let i = 0; i < 14; i++) dot(g, (i * 41 + phase * 6) % 512, 118 + i * 11 % 106, '#e7bd9267', 3);
  }
  if (state.powerAlert) dot(g, 232, 221, phase % 10 < 5 ? '#ffdb9b' : '#c84f62', 2);
  if (state.fresh && phase % 10 < 4) {
    const [x, y] = construction[state.fresh];
    dot(g, x, y - 15, '#d7f6db', 2);
    dot(g, x + 4, y - 18, '#f9dfa2');
  }
  if (!state.radiation && phase % 15 < 5) {
    dot(g, 318, 47, '#bbc7d2');
    dot(g, 455, 77, '#bcc9d1');
  }
  if (highlight) {
    const [x, y] = anchors[highlight];
    const a = highlight === 'oxygen' ? 28 : 33;
    const b = highlight === 'oxygen' ? 35 : 43;
    for (const [u, v, dx, dy] of [[x - b, y - b / 2, 1, 1], [x, y + 3, -1, 1], [x + a, y - a / 2, -1, -1]]) {
      line(g, [u, v], [u + dx * 9, v + dx * dy * 4], '#c0f4f4', 2);
      line(g, [u, v], [u - dx * 6, v + dx * dy * 3], '#76d6e7');
    }
  }
}
