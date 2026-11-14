/**
 * Canvas 2D renderer for the exploration map (no external assets).
 * The static terrain is drawn once to an offscreen canvas (only the visible part is copied each frame);
 * moving parts are drawn every frame. Drawing never changes gameplay: positions, sizes and collision
 * shapes come from world.ts / sim.ts unchanged.
 */
import { batteryLevel, type Vis } from './fx';
import { ROVER, type Rover } from './sim';
import type { WorldMap } from './world';

export type { Particle } from './fx';

export interface Marker {
  x: number;
  y: number;
  r: number;
  /** goal = still to do (yellow), near = in reach (green), done = checked/finished (grey) */
  state: 'goal' | 'near' | 'done';
  note?: string;
}

export interface FrameInfo {
  t: number; // seconds (visual clock)
  targets: Marker[];
  solarRepaired: boolean;
  oxygenRepaired: boolean;
  /** Visible gas leak (the faulty valve) — a clue for the scan step. */
  leak: { x: number; y: number } | null;
  cargo: boolean;
  /** Science sample sites (Mission 3). */
  samples: { x: number; y: number; done: boolean }[];
  /** Drill progress at the rover (0..1), when sampling. */
  drill: number;
  inShadow: boolean;
  deep?: boolean;
  shake: number;
  /** Visual state: particles, tracks, camera, bursts (see fx.ts). */
  vis: Vis;
  /** Animations allowed (effects on and no reduced-motion preference). */
  motion: boolean;
  /** World→screen zoom (1 = 1:1). Smaller screens zoom out; world coordinates never change. */
  zoom?: number;
  labels: { shadow: string; deep: string; dock: string; charger: string; solarB: string; base: string; oxygen: string; samples: string; depot: string };
}

let terrainCache: { key: string; canvas: HTMLCanvasElement } | null = null;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Irregular rock outline (seeded, so each rock keeps its shape). */
function rockPath(g: CanvasRenderingContext2D, x: number, y: number, r: number, rand: () => number) {
  const pts = 7 + Math.floor(rand() * 4);
  const rot = rand() * Math.PI;
  g.beginPath();
  for (let i = 0; i < pts; i++) {
    const a = rot + (i / pts) * Math.PI * 2;
    const rr = r * (0.78 + rand() * 0.3);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * (0.82 + rand() * 0.12);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

/**
 * Static ground. The Sun is low in the west (south-pole lighting), so lit faces point west and
 * shadows fall long to the east: crater interiors are dark on the west wall and lit on the east wall.
 */
function terrain(m: WorldMap): HTMLCanvasElement {
  const key = `${m.w}x${m.h}`;
  if (terrainCache?.key === key) return terrainCache.canvas;
  const c = document.createElement('canvas');
  c.width = m.w;
  c.height = m.h;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, m.w, m.h);
  bg.addColorStop(0, '#70737c');
  bg.addColorStop(1, '#55585f');
  g.fillStyle = bg;
  g.fillRect(0, 0, m.w, m.h);
  const rand = rng(42);
  // large-scale albedo variation (mare-like darker patches, brighter highland dust)
  for (let i = 0; i < 70; i++) {
    const x = rand() * m.w, y = rand() * m.h, r = 60 + rand() * 220;
    const lg = g.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() > 0.5;
    lg.addColorStop(0, light ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine regolith grain
  for (let i = 0; i < 12000; i++) {
    const x = rand() * m.w, y = rand() * m.h, s = rand() * 1.8 + 0.4;
    g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.09)';
    g.fillRect(x, y, s, s);
  }
  // small craterlets (decor only, not obstacles): dark west inner wall, lit east wall, bright west rim
  for (let i = 0; i < 110; i++) {
    const x = rand() * m.w, y = rand() * m.h, r = 5 + rand() * rand() * 26;
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath(); g.ellipse(x + r * 0.3, y, r * 0.7, r * 0.62, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(235,236,240,0.16)'; g.lineWidth = Math.max(1, r * 0.15);
    g.beginPath(); g.ellipse(x, y, r, r * 0.85, 0, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
  }
  // pebbles (decor only, tiny so they never look like obstacles)
  for (let i = 0; i < 320; i++) {
    const x = rand() * m.w, y = rand() * m.h, r = 1.4 + rand() * 2.6;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.ellipse(x + r * 0.9, y + r * 0.2, r * 1.3, r * 0.6, 0, 0, Math.PI * 2); g.fill();
    rockPath(g, x, y, r, rand);
    g.fillStyle = rand() > 0.5 ? '#8f939b' : '#7b7f88'; g.fill();
  }
  // impassable craters: ejecta, outer shadow to the east, bowl, inner wall lighting, raised rim
  for (const k of m.craters) {
    for (let i = 0; i < 160; i++) {
      const a = rand() * Math.PI * 2, d = k.r * (1.08 + rand() * rand() * 0.9);
      g.fillStyle = `rgba(225,226,232,${0.04 + rand() * 0.08})`;
      g.fillRect(k.x + Math.cos(a) * d, k.y + Math.sin(a) * d, 2 + rand() * 3, 2 + rand() * 3);
    }
    const sh = g.createLinearGradient(k.x, k.y, k.x + k.r * 2.2, k.y);
    sh.addColorStop(0, 'rgba(0,0,0,0.38)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.beginPath(); g.ellipse(k.x + k.r * 0.9, k.y + k.r * 0.1, k.r * 1.5, k.r * 0.95, 0, 0, Math.PI * 2); g.fill();
    const bowl = g.createRadialGradient(k.x + k.r * 0.35, k.y, k.r * 0.1, k.x, k.y, k.r);
    bowl.addColorStop(0, '#3c3f47');
    bowl.addColorStop(0.7, '#33363d');
    bowl.addColorStop(1, '#4b4e57');
    g.fillStyle = bowl;
    g.beginPath(); g.arc(k.x, k.y, k.r, 0, Math.PI * 2); g.fill();
    // west inner wall in shadow, east inner wall lit by the low Sun
    g.save();
    g.beginPath(); g.arc(k.x, k.y, k.r - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(8,10,16,0.55)';
    g.beginPath(); g.ellipse(k.x - k.r * 0.45, k.y, k.r * 0.75, k.r * 1.05, 0, 0, Math.PI * 2); g.fill();
    const lit = g.createRadialGradient(k.x + k.r * 0.9, k.y, 0, k.x + k.r * 0.9, k.y, k.r * 0.8);
    lit.addColorStop(0, 'rgba(230,232,238,0.28)');
    lit.addColorStop(1, 'rgba(230,232,238,0)');
    g.fillStyle = lit;
    g.fillRect(k.x - k.r, k.y - k.r, k.r * 2, k.r * 2);
    g.restore();
    // raised rim: bright on the sunward (west) outer slope, dark to the east
    g.lineWidth = 9;
    g.strokeStyle = 'rgba(228,230,236,0.42)';
    g.beginPath(); g.arc(k.x, k.y, k.r + 2, Math.PI * 0.55, Math.PI * 1.45); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.arc(k.x, k.y, k.r + 2, -Math.PI * 0.45, Math.PI * 0.45); g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.arc(k.x, k.y, k.r + 6, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
  }
  // rocks (obstacles): long east shadow, irregular faceted shape, lit west face, dark east face
  for (const r of m.rocks) {
    const shape = rng(Math.round(r.x * 7 + r.y * 13));
    g.fillStyle = 'rgba(0,0,0,0.34)';
    g.beginPath(); g.ellipse(r.x + r.r * 1.0, r.y + r.r * 0.25, r.r * 1.55, r.r * 0.72, 0, 0, Math.PI * 2); g.fill();
    rockPath(g, r.x, r.y, r.r, shape);
    const rg = g.createLinearGradient(r.x - r.r, r.y - r.r * 0.3, r.x + r.r, r.y + r.r * 0.3);
    rg.addColorStop(0, '#b3b6bd');
    rg.addColorStop(0.45, '#878a93');
    rg.addColorStop(1, '#4d5058');
    g.fillStyle = rg;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; g.stroke();
    // facet line and sunlit edge
    g.strokeStyle = 'rgba(40,42,48,0.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(r.x - r.r * 0.1, r.y - r.r * 0.7); g.lineTo(r.x + r.r * 0.15, r.y + r.r * 0.1); g.lineTo(r.x - r.r * 0.05, r.y + r.r * 0.7); g.stroke();
    g.strokeStyle = 'rgba(240,241,245,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(r.x, r.y, r.r * 0.8, Math.PI * 0.75, Math.PI * 1.3); g.stroke();
    // a few small boulders around big rocks
    for (let i = 0; i < 3; i++) {
      const a = shape() * Math.PI * 2, d = r.r * (1.35 + shape() * 0.5), rr = 2.5 + shape() * 3;
      rockPath(g, r.x + Math.cos(a) * d, r.y + Math.sin(a) * d, rr, shape);
      g.fillStyle = '#7d8189'; g.fill();
    }
  }
  terrainCache = { key, canvas: c };
  return c;
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#cfe3ff') {
  g.font = '600 13px Inter, "Noto Sans KR", sans-serif';
  const w = g.measureText(text).width + 14;
  g.fillStyle = 'rgba(8,13,25,0.74)';
  rrect(g, x - w / 2, y - 11, w, 22, 5);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + 1);
}

function drawTracks(g: CanvasRenderingContext2D, v: Vis, t: number) {
  const pts = v.tracks;
  if (pts.length < 2) return;
  // four age buckets → four strokes per wheel side (cheap on mobile)
  for (let b = 0; b < 4; b++) {
    g.beginPath();
    let any = false;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], q = pts[i - 1];
      if (p.gap) continue;
      const age = (t - p.t) / 45;
      if (Math.min(3, Math.floor(age * 4)) !== b) continue;
      for (const side of [-1, 1]) {
        const ox = -Math.sin(p.a) * 15 * side, oy = Math.cos(p.a) * 15 * side;
        const oqx = -Math.sin(q.a) * 15 * side, oqy = Math.cos(q.a) * 15 * side;
        g.moveTo(q.x + oqx, q.y + oqy);
        g.lineTo(p.x + ox, p.y + oy);
      }
      any = true;
    }
    if (!any) continue;
    g.strokeStyle = `rgba(30,32,38,${0.32 - b * 0.07})`;
    g.lineWidth = 5;
    g.stroke();
  }
}

function drawRover(g: CanvasRenderingContext2D, r: Rover, f: FrameInfo) {
  const v = f.vis;
  const level = batteryLevel(r.battery);
  const drilling = f.drill > 0;
  const jig = drilling && f.motion ? (Math.random() - 0.5) * 2 : 0; // drill vibration
  // ground shadow (falls east, away from the low western Sun)
  g.save();
  g.translate(r.x + 8, r.y + 5);
  g.rotate(r.angle);
  g.fillStyle = 'rgba(0,0,0,0.34)';
  rrect(g, -25, -21, 50, 42, 9); g.fill();
  g.restore();

  g.save();
  g.translate(r.x + jig, r.y + jig * 0.6);
  g.rotate(r.angle);
  // headlights: a soft glow always, a long beam in shadow
  if (f.inShadow) {
    const cone = g.createRadialGradient(20, 0, 4, 100, 0, 150);
    cone.addColorStop(0, 'rgba(255,246,216,0.5)');
    cone.addColorStop(1, 'rgba(255,246,216,0)');
    g.fillStyle = cone;
    g.beginPath(); g.moveTo(20, -9); g.lineTo(190, -78); g.lineTo(190, 78); g.lineTo(20, 9); g.closePath(); g.fill();
  }
  // six wheels with moving treads (rocker-bogie style)
  const phase = (v.odo * 0.35) % 4;
  for (const wx of [-15, 0, 15]) {
    for (const side of [-1, 1]) {
      const wy = side * 17;
      g.fillStyle = '#1b1e25';
      rrect(g, wx - 5.5, wy - 4.5, 11, 9, 2.5); g.fill();
      g.fillStyle = '#545a66';
      for (let k = 0; k < 3; k++) g.fillRect(wx - 5.5 + ((k * 4 + phase) % 10), wy - 4.5, 1.4, 9);
    }
  }
  g.strokeStyle = '#8d97a6'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-15, -13); g.lineTo(0, -10); g.lineTo(15, -13); g.moveTo(-15, 13); g.lineTo(0, 10); g.lineTo(15, 13); g.stroke();
  // body leans back when accelerating, forward when braking (visual only)
  const lean = f.motion ? Math.max(-2.4, Math.min(2.4, -v.accel / 260)) : 0;
  g.translate(lean, 0);
  g.fillStyle = '#dde3ea';
  rrect(g, -20, -13, 40, 26, 5); g.fill();
  g.strokeStyle = 'rgba(20,24,32,0.5)'; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = '#b5bfcc'; g.fillRect(-20, 9, 40, 4);
  // solar deck with cell grid and a moving glint
  g.fillStyle = '#163b5c';
  rrect(g, -17, -10, 23, 20, 2); g.fill();
  g.strokeStyle = 'rgba(120,180,230,0.35)'; g.lineWidth = 0.8;
  g.beginPath();
  for (let x = -11.5; x < 6; x += 5.75) { g.moveTo(x, -10); g.lineTo(x, 10); }
  g.moveTo(-17, 0); g.lineTo(6, 0);
  g.stroke();
  const gl = -17 + ((f.t * 14) % 40);
  if (gl < 6) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(gl, -10, 2.5, 20); }
  if (f.cargo) {
    g.fillStyle = '#d8b55a'; g.fillRect(-14, -7, 14, 14);
    g.strokeStyle = '#3a2e0a'; g.lineWidth = 1.4; g.strokeRect(-14, -7, 14, 14);
    g.beginPath(); g.moveTo(-14, 0); g.lineTo(0, 0); g.stroke();
  }
  // antenna dish and camera mast
  g.fillStyle = '#c9d0da'; g.beginPath(); g.arc(-15, 9, 3.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4e5663'; g.beginPath(); g.arc(12, 0, 5.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#56C7F2'; g.fillRect(15, -2, 3, 4);
  // headlights and brake lights
  g.fillStyle = '#fff3c4'; g.fillRect(19, -10, 3, 5); g.fillRect(19, 5, 3, 5);
  const braking = v.accel < -80 && v.speed > 12;
  g.fillStyle = braking ? '#ff4d5e' : 'rgba(150,40,50,0.8)';
  g.fillRect(-21.5, -10, 2.5, 5); g.fillRect(-21.5, 5, 2.5, 5);
  if (braking) {
    g.fillStyle = 'rgba(255,77,94,0.25)';
    g.beginPath(); g.arc(-22, -7.5, 6, 0, Math.PI * 2); g.arc(-22, 7.5, 6, 0, Math.PI * 2); g.fill();
  }
  // status light: green ok, amber low (blinks), red critical (fast blink)
  const blink = level === 0 || !f.motion ? 1 : (Math.sin(f.t * (level === 2 ? 16 : 7)) > 0 ? 1 : 0.25);
  g.fillStyle = level === 0 ? '#6CE0B2' : level === 1 ? `rgba(244,202,101,${blink})` : `rgba(255,90,105,${blink})`;
  g.beginPath(); g.arc(8, -9, 2.4, 0, Math.PI * 2); g.fill();
  g.restore();
}

function drawSolar(g: CanvasRenderingContext2D, m: WorldMap, f: FrameInfo) {
  const fixedAge = f.vis.solarFixedAt === null ? Infinity : f.t - f.vis.solarFixedAt;
  for (let i = 2; i <= 4; i++) {
    const p = m.blocks[i];
    g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(p.x + 9, p.y + 11, p.w, p.h);
    // mounting posts
    g.fillStyle = '#7c8593';
    for (let x = p.x + 14; x < p.x + p.w; x += 60) g.fillRect(x, p.y + p.h - 2, 4, 6);
    const n = Math.floor(p.w / 30);
    const glintX = ((f.t * 140) % (p.w + 300)) - 150;
    for (let k = 0; k < n; k++) {
      const x = p.x + k * 30 + 1;
      const broken = !f.solarRepaired && i === 4 && k >= n - 3;
      g.fillStyle = '#0d1520'; g.fillRect(x, p.y, 28, p.h);
      if (broken) {
        g.fillStyle = '#2c1f26'; g.fillRect(x + 1.5, p.y + 1.5, 25, p.h - 3);
        g.strokeStyle = 'rgba(255,140,150,0.55)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + 4, p.y + 3); g.lineTo(x + 13, p.y + 13); g.lineTo(x + 9, p.y + 23); g.moveTo(x + 13, p.y + 13); g.lineTo(x + 24, p.y + 8); g.stroke();
        g.fillStyle = `rgba(255,107,122,${0.25 + 0.3 * Math.max(0, Math.sin(f.t * 8 + k))})`;
        g.fillRect(x + 1.5, p.y + 1.5, 25, p.h - 3);
        // occasional electrical spark
        if (f.motion && Math.sin(f.t * 3.1 + k * 2) > 0.93) {
          g.strokeStyle = '#ffe9a8'; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(x + 14, p.y - 2); g.lineTo(x + 18, p.y - 9); g.lineTo(x + 15, p.y - 8); g.lineTo(x + 20, p.y - 15); g.stroke();
        }
      } else {
        g.fillStyle = '#1d5383'; g.fillRect(x + 1.5, p.y + 1.5, 25, p.h - 3);
        g.strokeStyle = 'rgba(140,195,240,0.35)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(x + 10, p.y + 1.5); g.lineTo(x + 10, p.y + p.h - 1.5); g.moveTo(x + 18.5, p.y + 1.5); g.lineTo(x + 18.5, p.y + p.h - 1.5); g.moveTo(x + 1.5, p.y + p.h / 2); g.lineTo(x + 26.5, p.y + p.h / 2); g.stroke();
        // sunlight on the panels + a slow glint sweep
        g.fillStyle = 'rgba(244,202,101,0.14)'; g.fillRect(x + 1.5, p.y + 1.5, 25, p.h - 3);
        if (f.motion && Math.abs(x - (p.x + glintX)) < 30) {
          g.fillStyle = `rgba(255,255,255,${0.16 * (1 - Math.abs(x - (p.x + glintX)) / 30)})`;
          g.fillRect(x + 1.5, p.y + 1.5, 25, p.h - 3);
        }
        // repair: the fixed panels light up one after another, then settle
        if (i === 4 && k >= n - 3 && fixedAge < 3) {
          const on = fixedAge > (k - (n - 3)) * 0.35;
          if (on) { g.fillStyle = `rgba(255,236,160,${0.65 * Math.max(0, 1 - fixedAge / 3)})`; g.fillRect(x - 2, p.y - 2, 32, p.h + 4); }
        }
      }
    }
    // row status lamp
    const bad = !f.solarRepaired && i === 4;
    g.fillStyle = bad ? `rgba(255,90,105,${Math.sin(f.t * 6) > 0 ? 1 : 0.3})` : '#6CE0B2';
    g.beginPath(); g.arc(p.x - 8, p.y + p.h / 2, 4, 0, Math.PI * 2); g.fill();
    if (!bad) { g.fillStyle = 'rgba(108,224,178,0.25)'; g.beginPath(); g.arc(p.x - 8, p.y + p.h / 2, 8, 0, Math.PI * 2); g.fill(); }
  }
  if (fixedAge < 2.2) ring(g, m.sites.solarB.x, m.sites.solarB.y, 30 + fixedAge * 110, `rgba(255,226,140,${0.6 * (1 - fixedAge / 2.2)})`, 4);
}

function drawOxygenPlant(g: CanvasRenderingContext2D, m: WorldMap, f: FrameInfo) {
  const o = m.blocks[5];
  if (!o) return;
  const fixedAge = f.vis.oxygenFixedAt === null ? Infinity : f.t - f.vis.oxygenFixedAt;
  const valves = [m.sites.valveA, m.sites.valveB, m.sites.valveC];
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  // pipes (with flowing O₂ once the plant works)
  for (const v of valves) {
    g.strokeStyle = '#6f7885'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(v.x, v.y); g.stroke();
    g.strokeStyle = '#a7b0bd'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(v.x, v.y); g.stroke();
    if (f.oxygenRepaired) {
      g.strokeStyle = 'rgba(86,199,242,0.85)'; g.lineWidth = 3; g.setLineDash([6, 10]);
      g.lineDashOffset = f.motion ? -f.t * 40 : 0;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(v.x, v.y); g.stroke();
      g.setLineDash([]); g.lineDashOffset = 0;
    }
  }
  // pad + tanks (white cylinders with cyan bands, seen from above) + compressor
  g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(o.x + 10, o.y + 10, o.w, o.h);
  g.fillStyle = '#8b939f'; rrect(g, o.x, o.y, o.w, o.h, 6); g.fill();
  g.strokeStyle = 'rgba(86,199,242,0.45)'; g.lineWidth = 2; g.stroke();
  for (let i = 0; i < 3; i++) {
    const tx = o.x + 28 + i * 40, ty = o.y + 38;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(tx + 4, ty + 3, 17, 0, Math.PI * 2); g.fill();
    const tg = g.createRadialGradient(tx - 6, ty - 6, 2, tx, ty, 17);
    tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, '#b9c3cf');
    g.fillStyle = tg; g.beginPath(); g.arc(tx, ty, 17, 0, Math.PI * 2); g.fill();
    g.strokeStyle = f.oxygenRepaired ? '#56C7F2' : '#7d8794'; g.lineWidth = 3.5;
    g.beginPath(); g.arc(tx, ty, 11, 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = '#5b6472'; rrect(g, o.x + 18, o.y + 66, o.w - 36, 22, 4); g.fill();
  for (let i = 0; i < 4; i++) {
    g.fillStyle = f.oxygenRepaired
      ? `rgba(86,199,242,${f.motion ? 0.55 + 0.45 * Math.sin(f.t * 2.5 + i) : 0.9})`
      : `rgba(255,90,105,${f.motion ? (Math.sin(f.t * 6 + i) > 0 ? 1 : 0.25) : 0.9})`;
    g.beginPath(); g.arc(o.x + 32 + i * 28, o.y + 77, 4, 0, Math.PI * 2); g.fill();
  }
  // valves: housing + hand wheel
  for (const v of valves) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(v.x + 4, v.y + 3, 17, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5f646e'; g.beginPath(); g.arc(v.x, v.y, 17, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#F4CA65'; g.lineWidth = 3;
    g.beginPath(); g.arc(v.x, v.y, 10, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(v.x - 10, v.y); g.lineTo(v.x + 10, v.y); g.moveTo(v.x, v.y - 10); g.lineTo(v.x, v.y + 10); g.stroke();
  }
  if (fixedAge < 2.4) {
    for (let k = 0; k < 2; k++) {
      const a = fixedAge - k * 0.4;
      if (a > 0) ring(g, cx, cy, 40 + a * 120, `rgba(86,199,242,${0.65 * Math.max(0, 1 - a / 2)})`, 4);
    }
  }
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, w: number) {
  g.strokeStyle = color; g.lineWidth = w;
  g.beginPath(); g.arc(x, y, Math.max(0, r), 0, Math.PI * 2); g.stroke();
}

function drawParticles(g: CanvasRenderingContext2D, f: FrameInfo, x0: number, y0: number, x1: number, y1: number) {
  for (const p of f.vis.particles) {
    if (p.x < x0 - 40 || p.y < y0 - 40 || p.x > x1 + 40 || p.y > y1 + 40) continue;
    const a = Math.max(0, p.life);
    if (p.kind === 'dust') {
      g.fillStyle = `rgba(196,194,188,${a * 0.5})`;
      g.beginPath(); g.arc(p.x, p.y, p.size + (1 - a) * 6, 0, Math.PI * 2); g.fill();
    } else if (p.kind === 'gas') {
      g.fillStyle = `rgba(214,236,255,${a * 0.38})`;
      g.beginPath(); g.arc(p.x, p.y, p.size + (1 - a) * 14, 0, Math.PI * 2); g.fill();
    } else if (p.kind === 'spark') {
      g.strokeStyle = `rgba(255,226,140,${a})`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); g.stroke();
    } else {
      g.fillStyle = `rgba(160,255,214,${a})`;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
}

function drawBursts(g: CanvasRenderingContext2D, f: FrameInfo) {
  for (const b of f.vis.bursts) {
    const age = f.t - b.t0;
    if (age < 0 || age > 1.6) continue;
    const k = f.motion ? age / 1.6 : 0.4;
    const col = b.kind === 'ok' || b.kind === 'big' ? '108,224,178' : b.kind === 'warn' ? '255,107,122' : b.kind === 'ping' ? '244,202,101' : '120,190,255';
    const alpha = 1 - age / 1.6;
    const r0 = b.kind === 'big' ? 30 : b.kind === 'ping' ? 40 : 18;
    const r1 = b.kind === 'big' ? 220 : b.kind === 'ping' ? 90 : 80;
    ring(g, b.x, b.y, r0 + (r1 - r0) * k, `rgba(${col},${0.8 * alpha})`, b.kind === 'big' ? 6 : 4);
    if (b.kind === 'big') ring(g, b.x, b.y, r0 + (r1 - r0) * Math.max(0, k - 0.2), `rgba(${col},${0.5 * alpha})`, 3);
    if (b.text) {
      g.font = `800 ${b.kind === 'big' ? 22 : 16}px Inter, "Noto Sans KR", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const y = b.y - 40 - (f.motion ? age * 30 : 10);
      g.lineWidth = 4; g.strokeStyle = `rgba(8,13,25,${0.8 * alpha})`; g.strokeText(b.text, b.x, y);
      g.fillStyle = `rgba(${col},${alpha})`; g.fillText(b.text, b.x, y);
    }
  }
}

export function drawFrame(g: CanvasRenderingContext2D, vw: number, vh: number, m: WorldMap, r: Rover, f: FrameInfo) {
  // camera: smooth look-ahead camera from fx.updateCamera (world units), plus a small bump shake
  const zoom = f.zoom ?? 1;
  const ww = vw / zoom, wh = vh / zoom;
  const sx = f.shake ? (Math.random() - 0.5) * f.shake : 0, sy = f.shake ? (Math.random() - 0.5) * f.shake : 0;
  const camX = f.vis.cam.x + sx, camY = f.vis.cam.y + sy;
  g.save();
  g.clearRect(0, 0, vw, vh);
  g.scale(zoom, zoom);
  g.translate(-camX, -camY);
  // copy only the visible part of the cached terrain
  const tx = Math.max(0, Math.floor(camX)), ty = Math.max(0, Math.floor(camY));
  const tw = Math.min(m.w - tx, Math.ceil(ww) + 2), th = Math.min(m.h - ty, Math.ceil(wh) + 2);
  if (tw > 0 && th > 0) g.drawImage(terrain(m), tx, ty, tw, th, tx, ty, tw, th);
  const x0 = camX, y0 = camY, x1 = camX + ww, y1 = camY + wh;
  const visible = (x: number, y: number, rad: number) => x + rad > x0 && x - rad < x1 && y + rad > y0 && y - rad < y1;

  drawTracks(g, f.vis, f.t);

  // shadow zones (training scenario): dark pools; the permanently shadowed zone is colder and misty
  for (const s of m.shadows) {
    if (!visible(s.x, s.y, s.r + 30)) continue;
    const sg = g.createRadialGradient(s.x, s.y, s.r * 0.5, s.x, s.y, s.r);
    sg.addColorStop(0, s.deep ? 'rgba(1,3,12,0.72)' : 'rgba(4,7,16,0.62)');
    sg.addColorStop(1, s.deep ? 'rgba(12,26,64,0.5)' : 'rgba(4,7,16,0.38)');
    g.fillStyle = sg;
    g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
    g.setLineDash([10, 8]);
    g.lineWidth = 2;
    g.strokeStyle = s.deep ? 'rgba(140,190,255,0.75)' : 'rgba(120,150,210,0.45)';
    g.stroke();
    g.setLineDash([]);
    if (s.deep) {
      // cold blue rim glow, drifting mist and frost sparkles
      g.strokeStyle = 'rgba(110,170,255,0.18)'; g.lineWidth = 14;
      g.beginPath(); g.arc(s.x, s.y, s.r - 8, 0, Math.PI * 2); g.stroke();
      for (let k = 0; k < 3; k++) {
        const mx = s.x + Math.cos(f.t * 0.15 + k * 2.1) * s.r * 0.45, my = s.y + Math.sin(f.t * 0.12 + k * 1.7) * s.r * 0.35;
        const mg = g.createRadialGradient(mx, my, 0, mx, my, s.r * 0.45);
        mg.addColorStop(0, 'rgba(150,190,255,0.10)'); mg.addColorStop(1, 'rgba(150,190,255,0)');
        g.fillStyle = mg; g.fillRect(mx - s.r * 0.45, my - s.r * 0.45, s.r * 0.9, s.r * 0.9);
      }
      for (let k = 0; k < 50; k++) {
        const a = k * 2.399, rr = s.r * 0.95 * Math.sqrt((k * 0.618) % 1);
        g.fillStyle = `rgba(200,228,255,${f.motion ? 0.25 + 0.3 * Math.sin(f.t * 2 + k) : 0.4})`;
        g.fillRect(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr, 2, 2);
      }
      label(g, f.labels.deep, s.x, s.y + s.r - 18, '#bfe0ff');
    } else {
      // label at the top of the zone, or at the bottom when the top would cover the oxygen plant label
      const ly = s.y - s.r + 22 < 200 ? s.y + s.r - 22 : s.y - s.r + 22;
      label(g, f.labels.shadow, s.x, ly, '#9fb6e0');
    }
  }

  // charging pad: hexagonal pad with chasing lights
  const ch = m.charger;
  const pulse = f.motion ? 0.5 + 0.5 * Math.sin(f.t * 3) : 0.7;
  g.fillStyle = 'rgba(244,202,101,0.12)';
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const px = ch.x + Math.cos(a) * ch.r, py = ch.y + Math.sin(a) * ch.r; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
  g.closePath(); g.fill();
  g.lineWidth = 3; g.strokeStyle = `rgba(244,202,101,${0.5 + pulse * 0.4})`; g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, on = f.motion ? Math.floor(f.t * 6) % 6 === i : true;
    g.fillStyle = on ? '#ffe39a' : 'rgba(244,202,101,0.35)';
    g.beginPath(); g.arc(ch.x + Math.cos(a) * (ch.r - 6), ch.y + Math.sin(a) * (ch.r - 6), 3, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#F4CA65';
  g.beginPath(); g.moveTo(ch.x + 4, ch.y - 16); g.lineTo(ch.x - 8, ch.y + 2); g.lineTo(ch.x, ch.y + 2); g.lineTo(ch.x - 4, ch.y + 16); g.lineTo(ch.x + 8, ch.y - 2); g.lineTo(ch.x, ch.y - 2); g.closePath(); g.fill();
  label(g, f.labels.charger, ch.x, ch.y + ch.r + 16, '#F4CA65');

  // base habitat (block 0) with domes and lights
  const b = m.blocks[0];
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(b.x + 12, b.y + 12, b.w, b.h);
  g.fillStyle = '#c3cad4'; rrect(g, b.x, b.y, b.w, b.h, 8); g.fill();
  for (const [dx, dy, rr] of [[45, 45, 38], [125, 45, 30], [85, 110, 34]] as const) {
    const dg = g.createRadialGradient(b.x + dx - 10, b.y + dy - 10, 2, b.x + dx, b.y + dy, rr);
    dg.addColorStop(0, '#f4f6f9'); dg.addColorStop(1, '#9aa4b2');
    g.fillStyle = dg; g.beginPath(); g.arc(b.x + dx, b.y + dy, rr, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(244,202,101,${f.motion ? 0.6 + 0.4 * Math.sin(f.t * 2 + i) : 0.9})`;
    g.fillRect(b.x + 20 + i * 38, b.y + b.h - 10, 10, 5);
  }
  label(g, f.labels.base, b.x + b.w / 2, b.y - 16);

  // dock pad
  const d = m.sites.dock;
  g.setLineDash([6, 6]); g.lineWidth = 2; g.strokeStyle = 'rgba(86,199,242,0.6)';
  g.beginPath(); g.arc(d.x, d.y, d.r - 10, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  label(g, f.labels.dock, d.x, d.y - d.r - 6, '#56C7F2');

  // supply depot (block 1): crates
  const dp = m.blocks[1];
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(dp.x + 10, dp.y + 10, dp.w, dp.h);
  g.fillStyle = '#8d97a6'; rrect(g, dp.x, dp.y, dp.w, dp.h, 5); g.fill();
  for (let i = 0; i < 6; i++) {
    const cx = dp.x + 8 + (i % 3) * 34, cy = dp.y + 8 + Math.floor(i / 3) * 36;
    g.fillStyle = i % 2 ? '#c9a24a' : '#d8b55a'; g.fillRect(cx, cy, 28, 28);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(cx, cy, 28, 28);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 28, cy + 28); g.stroke();
  }
  label(g, f.labels.depot, dp.x + dp.w / 2, dp.y - 14, '#F4CA65');

  drawOxygenPlant(g, m, f);
  const o = m.blocks[5];
  if (o) label(g, f.labels.oxygen, o.x + o.w / 2, o.y - 14, f.oxygenRepaired ? '#6CE0B2' : '#ff8fa0');

  drawSolar(g, m, f);
  label(g, f.labels.solarB, m.sites.solarB.x, m.sites.solarB.y + 46, f.solarRepaired ? '#6CE0B2' : '#ff8fa0');

  // science sample beacons (Mission 3): flag + ground marker; collected = green with a check
  if (f.samples.length) label(g, f.labels.samples, m.sites.samples.x, m.sites.samples.y, '#8ea3bd');
  for (const s of f.samples) {
    g.fillStyle = s.done ? 'rgba(108,224,178,0.25)' : 'rgba(244,202,101,0.2)';
    g.beginPath(); g.ellipse(s.x, s.y, 16, 8, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c9d0da'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x, s.y - 36); g.stroke();
    g.fillStyle = s.done ? '#6CE0B2' : `rgba(244,202,101,${f.motion ? 0.6 + 0.4 * Math.sin(f.t * 4) : 1})`;
    const wave = f.motion && !s.done ? Math.sin(f.t * 5) * 2 : 0;
    g.beginPath(); g.moveTo(s.x, s.y - 36); g.lineTo(s.x + 20, s.y - 30 + wave); g.lineTo(s.x, s.y - 23); g.closePath(); g.fill();
    if (s.done) {
      g.strokeStyle = '#0b2a1f'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(s.x + 3, s.y - 30); g.lineTo(s.x + 7, s.y - 26); g.lineTo(s.x + 14, s.y - 33); g.stroke();
    }
  }

  // objective markers
  for (const mk of f.targets) {
    const bob = f.motion ? Math.sin(f.t * 4) : 0;
    const tr = mk.r * (mk.state === 'done' ? 1 : 0.92 + 0.06 * bob);
    if (mk.state === 'near') {
      g.fillStyle = 'rgba(108,224,178,0.16)';
      g.beginPath(); g.arc(mk.x, mk.y, tr, 0, Math.PI * 2); g.fill();
    }
    g.lineWidth = mk.state === 'near' ? 5 : 3;
    g.strokeStyle = mk.state === 'near' ? '#6CE0B2' : mk.state === 'done' ? 'rgba(160,170,185,0.7)' : '#F4CA65';
    if (mk.state === 'done') g.setLineDash([6, 6]);
    g.beginPath(); g.arc(mk.x, mk.y, tr, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    if (mk.state === 'goal') {
      // rotating outer dashes make goals easy to spot on busy ground
      g.setLineDash([4, 14]); g.lineDashOffset = f.motion ? -f.t * 30 : 0; g.lineWidth = 2;
      g.beginPath(); g.arc(mk.x, mk.y, tr + 10, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]); g.lineDashOffset = 0;
    }
    if (mk.state !== 'done') {
      const ay = mk.y - tr - 18 - bob * 4;
      g.beginPath(); g.moveTo(mk.x, ay); g.lineTo(mk.x - 9, ay - 15); g.lineTo(mk.x + 9, ay - 15); g.closePath();
      g.fillStyle = g.strokeStyle as string; g.fill();
      g.strokeStyle = 'rgba(8,13,25,0.7)'; g.lineWidth = 1.5; g.stroke();
    }
    if (mk.note) label(g, mk.note, mk.x, mk.y + mk.r + 16, mk.state === 'done' ? '#8ea3bd' : '#F4CA65');
  }

  // gas leak clue (Mission 2): a soft hiss ring around the faulty valve, under the gas particles
  if (f.leak && f.motion) ring(g, f.leak.x, f.leak.y, 22 + ((f.t * 30) % 20), `rgba(214,236,255,${0.35 - ((f.t * 30) % 20) / 60})`, 2);
  else if (f.leak) ring(g, f.leak.x, f.leak.y, 26, 'rgba(214,236,255,0.35)', 2);

  drawParticles(g, f, x0, y0, x1, y1);
  drawRover(g, r, f);

  // drill progress ring (sampling)
  if (f.drill > 0) {
    g.lineWidth = 6; g.strokeStyle = 'rgba(86,199,242,0.25)';
    g.beginPath(); g.arc(r.x, r.y, ROVER.radius + 18, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#56C7F2';
    g.beginPath(); g.arc(r.x, r.y, ROVER.radius + 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f.drill); g.stroke();
  }
  // battery ring under the rover
  const lvl = batteryLevel(r.battery);
  g.lineWidth = 3;
  g.strokeStyle = lvl === 0 ? 'rgba(108,224,178,0.8)' : lvl === 1 ? 'rgba(244,202,101,0.9)' : 'rgba(255,107,122,0.95)';
  g.beginPath(); g.arc(r.x, r.y, ROVER.radius + 8, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * r.battery) / 100); g.stroke();

  drawBursts(g, f);
  g.restore();

  // screen-space feedback: cold tint in the deep shadow, red pulse when the battery is low
  if (f.deep || lvl > 0) {
    const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    const pulseA = f.motion ? 0.6 + 0.4 * Math.sin(f.t * (lvl === 2 ? 9 : 5)) : 1;
    const col = lvl > 0 ? `rgba(255,60,80,${(lvl === 2 ? 0.34 : 0.16) * pulseA})` : 'rgba(40,90,200,0.22)';
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, col);
    g.fillStyle = vg;
    g.fillRect(0, 0, vw, vh);
  }

  // off-screen objective arrow (nearest unfinished marker) with distance
  const goals = f.targets.filter((mk) => mk.state !== 'done');
  const target = goals.sort((a, c) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(c.x - r.x, c.y - r.y))[0];
  if (target) {
    const px = (target.x - camX) * zoom, py = (target.y - camY) * zoom;
    if (px < 0 || py < 0 || px > vw || py > vh) {
      const ang = Math.atan2(py - vh / 2, px - vw / 2);
      const inset = 40 + (f.motion ? Math.sin(f.t * 5) * 4 : 0);
      const ax = vw / 2 + Math.cos(ang) * (vw / 2 - inset), ay = vh / 2 + Math.sin(ang) * (vh / 2 - inset);
      g.save(); g.translate(ax, ay); g.rotate(ang);
      g.fillStyle = '#F4CA65'; g.strokeStyle = 'rgba(8,13,25,0.8)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(20, 0); g.lineTo(-10, -13); g.lineTo(-4, 0); g.lineTo(-10, 13); g.closePath(); g.fill(); g.stroke();
      g.restore();
      const dm = Math.round(Math.hypot(target.x - r.x, target.y - r.y) / 10);
      g.font = '700 12px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 3; g.strokeStyle = 'rgba(8,13,25,0.85)';
      g.strokeText(`${dm} m`, ax - Math.cos(ang) * 32, ay - Math.sin(ang) * 32);
      g.fillStyle = '#F4CA65';
      g.fillText(`${dm} m`, ax - Math.cos(ang) * 32, ay - Math.sin(ang) * 32);
    }
  }
}
