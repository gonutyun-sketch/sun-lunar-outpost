/** Top-down navigation and interaction use world coordinates. Only the scene is pixel-rasterized. */
import { dot, face, ink, line, type Point } from '../art/pixels';
import { roverShadow, roverSprite } from '../art/roverSprite';
import { roverStructures, roverTerrain, WORLD_PIXEL } from '../art/roverTerrain';
import { batteryLevel, FX_LIMITS, type Vis } from './fx';
import { dist, type Rover } from './sim';
import type { WorldMap } from './world';

export interface Marker {
  x: number;
  y: number;
  r: number;
  state: 'goal' | 'near' | 'done';
  note?: string;
}

export interface FrameInfo {
  t: number;
  targets: Marker[];
  solarRepaired: boolean;
  oxygenRepaired: boolean;
  leak: Point | null;
  cargo: boolean;
  samples: { x: number; y: number; done: boolean }[];
  drill: number;
  inShadow: boolean;
  deep?: boolean;
  shake: number;
  vis: Vis;
  motion: boolean;
  zoom: number;
  labels: { shadow: string; deep: string; dock: string; charger: string; solarB: string; base: string; oxygen: string; samples: string; depot: string };
}

export function mapDistance(a: Marker, r: Rover) {
  return Math.round(dist(a, r) / 10);
}

const cell = (n: number) => Math.round(n / WORLD_PIXEL) * WORLD_PIXEL;

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, zoom: number, color = '#e4e8ed') {
  const size = 12 / zoom;
  g.font = `600 ${size}px Inter, "Noto Sans KR", "Malgun Gothic", sans-serif`;
  const width = g.measureText(text).width + 12 / zoom;
  g.fillStyle = '#101726e8';
  g.fillRect(x - width / 2, y - size / 1.25, width, size * 1.6);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + 0.5);
}

function drawTracks(g: CanvasRenderingContext2D, v: Vis, t: number, left: number, top: number, right: number, bottom: number) {
  const colors = ['#30324670', '#30324653', '#30324639', '#30324620'];
  for (const p of v.tracks) {
    if (p.x < left - 24 || p.x > right + 24 || p.y < top - 24 || p.y > bottom + 24) continue;
    const tone = colors[Math.min(3, Math.max(0, Math.floor((t - p.t) * 4 / FX_LIMITS.trackLife)))];
    for (const side of [-1, 1]) {
      const ox = -Math.sin(p.a) * 16 * side, oy = Math.cos(p.a) * 16 * side;
      dot(g, cell(p.x + ox), cell(p.y + oy), tone, 5, 3);
    }
  }
}

function drawVehicle(g: CanvasRenderingContext2D, r: Rover, f: FrameInfo) {
  const level = batteryLevel(r.battery);
  const x = cell(r.x), y = cell(r.y);
  const c = Math.cos(r.angle), s = Math.sin(r.angle);
  if (f.inShadow) {
    // Two native-pixel terraces keep the heading legible in the deep-shadow zone.
    const beam = (u: number, v: number): Point => [x / 2 + u * c - v * s, y / 2 + u * s + v * c];
    g.save();
    g.scale(WORLD_PIXEL, WORLD_PIXEL);
    face(g, [beam(8, -4), beam(73, -32), beam(84, -12), beam(84, 12), beam(73, 32), beam(8, 4)], '#d7d3b224');
    face(g, [beam(8, -3), beam(44, -19), beam(63, -7), beam(63, 7), beam(44, 19), beam(8, 3)], '#e9dfb13c');
    g.restore();
  }
  g.save();
  g.scale(WORLD_PIXEL, WORLD_PIXEL);
  roverShadow(g, x / 2, y / 2);
  roverSprite(g, x / 2, y / 2, {
    angle: r.angle,
    tread: f.motion ? Math.floor(f.vis.odo / 6) : 0,
    lean: f.motion && Math.abs(f.vis.accel) > 185 ? Math.sign(-f.vis.accel) : 0,
    cargo: f.cargo,
  });
  g.restore();
  const status = level === 0 ? ink.mint : level === 1 ? ink.amber : ink.red;
  const blink = f.motion && level > 0 && Math.floor(f.t * (level === 2 ? 5 : 3)) % 2 === 0;
  dot(g, cell(x - c * 7 - s * 7), cell(y - s * 7 + c * 7 - 14), blink ? '#80515b' : status, 4, 3);
  if (f.motion && f.vis.accel < -90 && f.vis.speed > 12) dot(g, cell(x - c * 21), cell(y - s * 21 - 8), '#fb8175', 5, 3);

  if (f.drill > 0) {
    const dx = cell(x + c * 19), dy = cell(y + s * 19);
    const stroke = f.motion ? Math.floor(f.t * 14) % 3 * 2 : 2;
    dot(g, dx - 4, dy - 15, '#303b4f', 9, 16);
    dot(g, dx - 2, dy - 15 + stroke, '#c5bdb7', 4, 15 - stroke);
    dot(g, dx - 4, dy - 16, ink.ice, 8, 4);
    dot(g, dx - 2, dy, ink.amber, 5, 3);
    dot(g, x - 22, y + 20, '#101827', 44, 8);
    dot(g, x - 20, y + 22, '#465976', 40, 4);
    dot(g, x - 20, y + 22, ink.ice, Math.round(40 * f.drill), 4);
  } else {
    const n = Math.max(0, Math.min(10, Math.ceil(r.battery / 10)));
    for (let k = 0; k < 10; k++) dot(g, x - 24 + k * 5, y + 22, k < n ? status : '#222c40', 4, 3);
  }
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, width: number) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.arc(x, y, radius, 0, Math.PI * 2);
  g.stroke();
}

function drawTarget(g: CanvasRenderingContext2D, mk: Marker, f: FrameInfo) {
  const color = mk.state === 'near' ? ink.mint : mk.state === 'done' ? '#b6bcc8' : ink.amber;
  const x = cell(mk.x), y = cell(mk.y);
  const near = mk.state === 'near';
  const done = mk.state === 'done';
  g.setLineDash(done ? [3, 10] : near ? [18, 5] : [5, 10]);
  g.lineDashOffset = !near && !done && f.motion ? -Math.floor(f.t * 14) : 0;
  ring(g, x, y, mk.r, '#202438db', 5);
  ring(g, x, y, mk.r, color, 2.5);
  g.setLineDash([]);
  g.lineDashOffset = 0;
  if (done) return;
  const ay = cell(y - mk.r - 10 - (f.motion ? Math.floor(f.t * 5) % 3 * 2 : 0));
  dot(g, x - 9, ay - 10, '#182134', 18, 4);
  dot(g, x - 7, ay - 8, color, 14, 3);
  dot(g, x - 5, ay - 5, color, 10, 3);
  dot(g, x - 3, ay - 2, color, 6, 3);
  dot(g, x - 1, ay + 1, color, 2, 3);
}

function drawSample(g: CanvasRenderingContext2D, sample: FrameInfo['samples'][number], t: number) {
  const x = cell(sample.x), y = cell(sample.y), color = sample.done ? ink.mint : ink.amber;
  g.save();
  g.scale(WORLD_PIXEL, WORLD_PIXEL);
  const u = x / 2, v = y / 2;
  face(g, [[u - 7, v + 2], [u - 4, v - 4], [u + 4, v - 4], [u + 8, v + 2], [u + 4, v + 6], [u - 4, v + 6]], '#313b53');
  line(g, [u - 4, v + 1], [u + 4, v + 1], color);
  line(g, [u, v], [u, v - 15], '#ccd1d3', 2);
  dot(g, u + 1, v - 15, '#202a3e', 9, 7);
  dot(g, u + 2, v - 14, color, 7, 5);
  if (sample.done) {
    line(g, [u + 3, v - 12], [u + 4, v - 11], '#284745');
    line(g, [u + 4, v - 11], [u + 7, v - 14], '#284745');
  } else dot(g, u + 6, v - 14, Math.floor(t * 3) % 2 ? '#f4ca65' : '#fff2cb', 2, 2);
  g.restore();
}

function drawParticles(g: CanvasRenderingContext2D, f: FrameInfo, left: number, top: number, right: number, bottom: number) {
  if (!f.motion) return;
  const tones = {
    dust: ['#bdb0a62e', '#cdbca05e', '#dfc8a88f'],
    gas: ['#a1c1d72c', '#b0d1df55', '#c2e3e388'],
    spark: ['#cc8d4f55', '#f9ce7aa2', '#ffebc6'],
    sparkle: ['#69ccb95e', '#abdcc6a2', '#d6f4d7'],
  };
  for (const p of f.vis.particles) {
    if (p.x < left - 20 || p.y < top - 20 || p.x > right + 20 || p.y > bottom + 20) continue;
    const x = cell(p.x), y = cell(p.y);
    const alpha = Math.max(0, Math.min(2, Math.floor(p.life * 3)));
    const color = tones[p.kind][alpha];
    const size = Math.round(p.size) + (p.kind === 'gas' ? 5 - alpha * 2 : 0);
    dot(g, x, y, color, size, size);
    if (p.kind === 'gas') dot(g, x + size, y - 2, tones.gas[Math.max(0, alpha - 1)], 3, 4);
  }
}

function drawBursts(g: CanvasRenderingContext2D, f: FrameInfo) {
  for (const b of f.vis.bursts) {
    const age = f.t - b.t0;
    if (age < 0 || age > 1.6) continue;
    const color = b.kind === 'ok' || b.kind === 'big' ? ink.mint : b.kind === 'warn' ? ink.red : b.kind === 'ping' ? ink.amber : ink.ice;
    const lift = f.motion ? Math.floor(age * 14) * 2 : 4;
    const spread = b.kind === 'big' ? 32 : 18;
    const extent = spread + lift;
    const alpha = f.motion ? 1 - age / 1.6 : 1;
    g.save();
    g.globalAlpha = alpha;
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
      dot(g, cell(b.x) + dx * extent - (dx < 0 ? 0 : 9), cell(b.y) + dy * extent, color, 9, 2);
      dot(g, cell(b.x) + dx * extent - 1, cell(b.y) + dy * extent - (dy < 0 ? 0 : 6), color, 2, 6);
    }
    if (b.text) label(g, b.text, b.x, b.y - 36 - lift, f.zoom, color);
    g.restore();
  }
}

type View = { left: number; top: number; right: number; bottom: number };

/** Blit only the pixels inside the camera. The scene uses one raster pixel per two world units. */
function copy(g: CanvasRenderingContext2D, c: HTMLCanvasElement, v: View, x = 0, y = 0, row = 0, height = c.height) {
  const px = WORLD_PIXEL;
  const left = Math.max(0, Math.floor(v.left / px - x));
  const top = Math.max(0, Math.floor(v.top / px - y));
  const right = Math.min(c.width, Math.ceil(v.right / px - x));
  const bottom = Math.min(height, Math.ceil(v.bottom / px - y));
  const w = right - left, h = bottom - top;
  if (w <= 0 || h <= 0) return;
  g.drawImage(c, left, row + top, w, h, (x + left) * px, (y + top) * px, w * px, h * px);
}

function machinery(g: CanvasRenderingContext2D, m: WorldMap, f: FrameInfo, visible: (x: number, y: number, r?: number) => boolean) {
  const sr = m.blocks[4], sol = m.sites.solarB;
  if (visible(sol.x, sol.y, 200)) {
    const lampX = sr.x + sr.w - 12, lampY = sr.y + sr.h + 6;
    const age = f.vis.solarFixedAt === null ? Infinity : f.t - f.vis.solarFixedAt;
    const tick = f.motion ? Math.floor(f.t * 6) : 0;
    dot(g, lampX - 2, lampY - 2, '#202b3b', 12, 8);
    dot(g, lampX, lampY, f.solarRepaired ? ink.mint : tick % 4 < 2 ? ink.red : '#854758', 8, 4);
    if (f.motion && !f.solarRepaired && tick % 9 < 3) {
      const x = lampX - 30 + tick % 9 * 4, y = lampY - 38;
      dot(g, x, y, '#ffc886', 4, 5);
      dot(g, x + 4, y - 4, '#ffeabb', 3, 4);
    }
    if (f.motion && age > 0 && age < 2.4) {
      for (let i = 0; i < 3; i++) if (age > i * 0.3) {
        const x = sr.x + sr.w - 84 + i * 30;
        dot(g, x, sr.y - 5, '#f8da8d', 16, 4);
        dot(g, x + 5, sr.y + 3, '#abd6e5', 15, 3);
      }
    }
  }
  const o = m.sites.oxygen;
  if (f.oxygenRepaired && visible(o.x, o.y, 180)) {
    const tick = f.motion ? f.t * 0.72 : 0.34;
    for (const v of [m.sites.valveA, m.sites.valveB, m.sites.valveC]) {
      for (const offset of [0.35, 0.7]) {
        const part = 0.26 + ((tick + offset) % 1) * 0.67;
        dot(g, cell(o.x + (v.x - o.x) * part), cell(o.y + (v.y - o.y) * part), '#9deed7', 5, 3);
      }
    }
  }
  if (f.leak && visible(...f.leak, 38)) {
    const [x, y] = f.leak;
    dot(g, x - 2, y - 12, '#782b42', 6, 6);
    dot(g, x, y - 12, ink.red, 4, 4);
    const phase = f.motion ? Math.floor(f.t * 8) % 3 : 0;
    for (let i = 0; i < 3; i++) dot(g, x + (i + phase) * 4, y - 15 - (i + phase) * 3, '#bfd7e7a8', 6, 4);
  }
}

function arrow(g: CanvasRenderingContext2D, vw: number, vh: number, v: View, f: FrameInfo, r: Rover) {
  let target: Marker | undefined;
  let min = Infinity;
  for (const k of f.targets) {
    if (k.state === 'done') continue;
    const d = (k.x - r.x) ** 2 + (k.y - r.y) ** 2;
    if (d < min) { target = k; min = d; }
  }
  if (!target) return;
  const px = (target.x - v.left) * f.zoom, py = (target.y - v.top) * f.zoom;
  if (px >= 18 && py >= 18 && px <= vw - 18 && py <= vh - 18) return;
  const cx = vw / 2, cy = vh / 2;
  const dx = px - cx, dy = py - cy;
  const ratio = Math.min(Math.max(10, cx - 35) / Math.abs(dx), Math.max(10, cy - 33) / Math.abs(dy));
  const x = cx + dx * ratio, y = cy + dy * ratio;
  const angle = Math.atan2(dy, dx);
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = '#272936';
  g.fillRect(-12, -9, 22, 18);
  g.fillStyle = ink.amber;
  g.fillRect(-10, -2, 6, 4);
  for (let i = 0; i < 4; i++) g.fillRect(-4 + i * 3, -7 + i * 2, 3, 14 - i * 4 + (i === 3 ? 2 : 0));
  g.restore();
  label(g, `${mapDistance(target, r)} m`, x - Math.cos(angle) * 29, y - Math.sin(angle) * 26, 1, ink.amber);
}

export function drawFrame(g: CanvasRenderingContext2D, width: number, height: number, m: WorldMap, r: Rover, f: FrameInfo) {
  const zoom = f.zoom;
  const sx = f.shake ? Math.round((Math.random() - 0.5) * f.shake) : 0;
  const sy = f.shake ? Math.round((Math.random() - 0.5) * f.shake) : 0;
  const left = cell(f.vis.cam.x + sx), top = cell(f.vis.cam.y + sy);
  const view = { left, top, right: left + width / zoom, bottom: top + height / zoom };
  const visible = (x: number, y: number, rad = 80) => x + rad >= left && x - rad <= view.right && y + rad >= top && y - rad <= view.bottom;
  g.save();
  g.fillStyle = ink.space;
  g.fillRect(0, 0, width, height);
  g.imageSmoothingEnabled = false;
  g.scale(zoom, zoom);
  g.translate(-left, -top);
  copy(g, roverTerrain(m), view);
  if (f.motion) drawTracks(g, f.vis, f.t, left, top, view.right, view.bottom);
  const structures = roverStructures(m);
  copy(g, structures.base, view);
  for (const [sprite, healthy] of [[structures.solar, f.solarRepaired], [structures.oxygen, f.oxygenRepaired]] as const) {
    copy(g, sprite.canvas, view, sprite.x, sprite.y, healthy ? sprite.height : 0, sprite.height);
  }
  machinery(g, m, f, visible);
  for (const sample of f.samples) if (visible(sample.x, sample.y, 45)) drawSample(g, sample, f.motion ? f.t : 0);
  for (const target of f.targets) if (visible(target.x, target.y, target.r + 40)) drawTarget(g, target, f);
  drawParticles(g, f, left, top, view.right, view.bottom);
  drawVehicle(g, r, f);

  for (const zone of m.shadows) {
    const y = zone.deep || zone.y - zone.r < 200 ? zone.y + zone.r - 24 : zone.y - zone.r + 24;
    if (visible(zone.x, y)) label(g, zone.deep ? f.labels.deep : f.labels.shadow, zone.x, y, zoom, '#bbd4f3');
  }
  const { base, dock, depot, solarB, oxygen, samples } = m.sites;
  const { charger: ch } = m;
  const signs: [string, number, number, string?][] = [
    [f.labels.base, base.x, m.blocks[0].y - 42], [f.labels.dock, dock.x, dock.y - 78, ink.ice],
    [f.labels.charger, ch.x, ch.y + ch.r + 17, ink.amber], [f.labels.depot, depot.x, m.blocks[1].y - 28, ink.amber],
    [f.labels.solarB, solarB.x, solarB.y + 50, f.solarRepaired ? ink.mint : '#ffb1ad'],
    [f.labels.oxygen, oxygen.x, oxygen.y + 59, f.oxygenRepaired ? ink.mint : '#ffb1ad'],
  ];
  if (f.samples.length) signs.push([f.labels.samples, samples.x, samples.y, '#d0d0d9']);
  for (const [text, x, y, color] of signs) if (visible(x, y)) label(g, text, x, y, zoom, color);
  for (const k of f.targets) if (k.note && visible(k.x, k.y)) label(g, k.note, k.x, k.y + k.r + 16, zoom);
  drawBursts(g, f);
  g.restore();

  const level = batteryLevel(r.battery);
  if (f.deep || level > 0) {
    const tone = level > 0 ? (level === 2 ? '#ce4d6c85' : '#ce73696b') : '#5885bd80';
    const w = f.motion && Math.floor(f.t * 3) % 2 ? 6 : 4;
    g.fillStyle = tone;
    g.fillRect(0, 0, width, w);
    g.fillRect(0, height - w, width, w);
    g.fillRect(0, w, w, height - w * 2);
    g.fillRect(width - w, w, w, height - w * 2);
  }
  arrow(g, width, height, view, f, r);
}
