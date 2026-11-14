/**
 * Canvas 2D renderer for the exploration map (no external assets).
 * The static terrain is drawn once to an offscreen canvas; moving parts are drawn every frame.
 */
import { ROVER, type Rover } from './sim';
import type { WorldMap } from './world';

export interface Particle { x: number; y: number; vx: number; vy: number; life: number }

export interface FrameInfo {
  t: number; // seconds since start
  target: { x: number; y: number; r: number } | null;
  targetNear: boolean;
  solarRepaired: boolean;
  inShadow: boolean;
  shake: number;
  particles: Particle[];
  labels: { shadow: string; dock: string; charger: string; solarB: string; base: string; oxygen: string; samples: string };
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

/** Static ground: regolith tone, speckles, small craterlets, crater bowls, rocks (with low-Sun shadows). */
function terrain(m: WorldMap): HTMLCanvasElement {
  const key = `${m.w}x${m.h}`;
  if (terrainCache?.key === key) return terrainCache.canvas;
  const c = document.createElement('canvas');
  c.width = m.w;
  c.height = m.h;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, m.w, m.h);
  bg.addColorStop(0, '#6d7079');
  bg.addColorStop(1, '#565962');
  g.fillStyle = bg;
  g.fillRect(0, 0, m.w, m.h);
  const rand = rng(42);
  // speckles
  for (let i = 0; i < 9000; i++) {
    const x = rand() * m.w, y = rand() * m.h, s = rand() * 2 + 0.4;
    g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    g.fillRect(x, y, s, s);
  }
  // small craterlets (decor only)
  for (let i = 0; i < 70; i++) {
    const x = rand() * m.w, y = rand() * m.h, r = 6 + rand() * 18;
    g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fill();
    g.beginPath(); g.ellipse(x + r * 0.25, y + r * 0.2, r * 0.8, r * 0.6, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fill();
  }
  // impassable craters: bowl + bright rim on the sunlit (west) side, long shadow to the east
  for (const k of m.craters) {
    const sh = g.createLinearGradient(k.x, k.y, k.x + k.r * 2.2, k.y);
    sh.addColorStop(0, 'rgba(0,0,0,0.35)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.beginPath(); g.ellipse(k.x + k.r * 0.9, k.y + k.r * 0.1, k.r * 1.5, k.r * 0.95, 0, 0, Math.PI * 2); g.fill();
    const bowl = g.createRadialGradient(k.x + k.r * 0.3, k.y, k.r * 0.1, k.x, k.y, k.r);
    bowl.addColorStop(0, '#2b2d33');
    bowl.addColorStop(0.75, '#3b3e46');
    bowl.addColorStop(1, '#4a4d55');
    g.fillStyle = bowl;
    g.beginPath(); g.arc(k.x, k.y, k.r, 0, Math.PI * 2); g.fill();
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(220,222,228,0.35)';
    g.beginPath(); g.arc(k.x, k.y, k.r - 3, Math.PI * 0.55, Math.PI * 1.45); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.arc(k.x, k.y, k.r - 3, -Math.PI * 0.45, Math.PI * 0.45); g.stroke();
  }
  // rocks
  for (const r of m.rocks) {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(r.x + r.r * 0.9, r.y + r.r * 0.25, r.r * 1.4, r.r * 0.7, 0, 0, Math.PI * 2); g.fill();
    const rg = g.createRadialGradient(r.x - r.r * 0.4, r.y - r.r * 0.4, 1, r.x, r.y, r.r);
    rg.addColorStop(0, '#a9acb4');
    rg.addColorStop(1, '#5f626b');
    g.fillStyle = rg;
    g.beginPath();
    const pts = 9;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = r.r * (0.85 + ((i * 37 + r.x) % 7) / 40);
      const px = r.x + Math.cos(a) * rr, py = r.y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.fill();
  }
  terrainCache = { key, canvas: c };
  return c;
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#cfe3ff') {
  g.font = '600 13px Inter, "Noto Sans KR", sans-serif';
  const w = g.measureText(text).width + 14;
  g.fillStyle = 'rgba(8,13,25,0.72)';
  g.fillRect(x - w / 2, y - 11, w, 22);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + 1);
}

export function drawFrame(g: CanvasRenderingContext2D, vw: number, vh: number, m: WorldMap, r: Rover, f: FrameInfo) {
  // camera follows the rover, clamped to the map
  const camX = Math.max(0, Math.min(m.w - vw, r.x - vw / 2)) + (f.shake ? (Math.random() - 0.5) * f.shake : 0);
  const camY = Math.max(0, Math.min(m.h - vh, r.y - vh / 2)) + (f.shake ? (Math.random() - 0.5) * f.shake : 0);
  g.save();
  g.clearRect(0, 0, vw, vh);
  g.translate(-camX, -camY);
  g.drawImage(terrain(m), 0, 0);

  // shadow zones (training scenario): soft dark pools with dashed boundary
  for (const s of m.shadows) {
    const sg = g.createRadialGradient(s.x, s.y, s.r * 0.55, s.x, s.y, s.r);
    sg.addColorStop(0, 'rgba(4,7,16,0.62)');
    sg.addColorStop(1, 'rgba(4,7,16,0.38)');
    g.fillStyle = sg;
    g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
    g.setLineDash([10, 8]);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(120,150,210,0.45)';
    g.stroke();
    g.setLineDash([]);
    label(g, f.labels.shadow, s.x, s.y - s.r + 22, '#9fb6e0');
  }

  // charging pad
  const pulse = 0.5 + 0.5 * Math.sin(f.t * 3);
  g.fillStyle = 'rgba(244,202,101,0.12)';
  g.beginPath(); g.arc(m.charger.x, m.charger.y, m.charger.r, 0, Math.PI * 2); g.fill();
  g.lineWidth = 3;
  g.strokeStyle = `rgba(244,202,101,${0.5 + pulse * 0.4})`;
  g.stroke();
  g.fillStyle = '#F4CA65';
  g.beginPath(); g.moveTo(m.charger.x + 4, m.charger.y - 16); g.lineTo(m.charger.x - 8, m.charger.y + 2); g.lineTo(m.charger.x, m.charger.y + 2); g.lineTo(m.charger.x - 4, m.charger.y + 16); g.lineTo(m.charger.x + 8, m.charger.y - 2); g.lineTo(m.charger.x, m.charger.y - 2); g.closePath(); g.fill();
  label(g, f.labels.charger, m.charger.x, m.charger.y + m.charger.r + 16, '#F4CA65');

  // base habitat (block 0) with domes and lights
  const b = m.blocks[0];
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(b.x + 12, b.y + 12, b.w, b.h);
  g.fillStyle = '#c9d0da'; g.fillRect(b.x, b.y, b.w, b.h);
  for (const [dx, dy, rr] of [[45, 45, 38], [125, 45, 30], [85, 110, 34]] as const) {
    const dg = g.createRadialGradient(b.x + dx - 10, b.y + dy - 10, 2, b.x + dx, b.y + dy, rr);
    dg.addColorStop(0, '#f4f6f9'); dg.addColorStop(1, '#9aa4b2');
    g.fillStyle = dg; g.beginPath(); g.arc(b.x + dx, b.y + dy, rr, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 4; i++) {
    g.fillStyle = `rgba(244,202,101,${0.6 + 0.4 * Math.sin(f.t * 2 + i)})`;
    g.fillRect(b.x + 20 + i * 38, b.y + b.h - 10, 10, 5);
  }
  label(g, f.labels.base, b.x + b.w / 2, b.y - 16);

  // dock pad
  const d = m.sites.dock;
  g.setLineDash([6, 6]); g.lineWidth = 2; g.strokeStyle = 'rgba(86,199,242,0.6)';
  g.beginPath(); g.arc(d.x, d.y, d.r - 10, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  label(g, f.labels.dock, d.x, d.y - d.r - 6, '#56C7F2');

  // oxygen plant (block 1) with tanks
  const o = m.blocks[1];
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(o.x + 10, o.y + 10, o.w, o.h);
  g.fillStyle = '#b8c0cc'; g.fillRect(o.x, o.y, o.w, o.h);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = '#e3e8ef'; g.beginPath(); g.arc(o.x + 22 + i * 33, o.y + 40, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(86,199,242,${0.5 + 0.5 * Math.sin(f.t * 2.5 + i)})`; g.fillRect(o.x + 17 + i * 33, o.y + 38, 10, 4);
  }
  label(g, f.labels.oxygen, o.x + o.w / 2, o.y - 14);

  // solar farm rows (blocks 2..4); segment B (south-east end of last row) may be broken
  for (let i = 2; i < m.blocks.length; i++) {
    const p = m.blocks[i];
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(p.x + 8, p.y + 10, p.w, p.h);
    const n = Math.floor(p.w / 30);
    for (let k = 0; k < n; k++) {
      const broken = !f.solarRepaired && i === m.blocks.length - 1 && k >= n - 3;
      g.fillStyle = broken ? '#3a2a2e' : '#1c4f7a';
      g.fillRect(p.x + k * 30 + 1, p.y, 28, p.h);
      g.fillStyle = broken ? `rgba(255,107,122,${0.35 + 0.35 * Math.sin(f.t * 8)})` : 'rgba(244,202,101,0.18)';
      g.fillRect(p.x + k * 30 + 1, p.y, 28, p.h);
    }
  }
  label(g, f.labels.solarB, m.sites.solarB.x, m.sites.solarB.y + 46, f.solarRepaired ? '#6CE0B2' : '#ff8fa0');

  // sample site marker (future mission, scenery)
  label(g, f.labels.samples, m.sites.samples.x, m.sites.samples.y, '#8ea3bd');

  // objective marker
  if (f.target) {
    const tr = f.target.r * (0.9 + 0.1 * Math.sin(f.t * 4));
    g.lineWidth = f.targetNear ? 5 : 3;
    g.strokeStyle = f.targetNear ? '#6CE0B2' : '#F4CA65';
    g.beginPath(); g.arc(f.target.x, f.target.y, tr, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(f.target.x, f.target.y - tr - 18); g.lineTo(f.target.x - 8, f.target.y - tr - 32); g.lineTo(f.target.x + 8, f.target.y - tr - 32); g.closePath();
    g.fillStyle = g.strokeStyle; g.fill();
  }

  // dust particles
  for (const p of f.particles) {
    g.fillStyle = `rgba(200,200,205,${Math.max(0, p.life) * 0.5})`;
    g.beginPath(); g.arc(p.x, p.y, 3 + (1 - p.life) * 5, 0, Math.PI * 2); g.fill();
  }

  // rover
  g.save();
  g.translate(r.x, r.y);
  g.rotate(r.angle);
  if (f.inShadow) {
    const cone = g.createRadialGradient(20, 0, 4, 90, 0, 120);
    cone.addColorStop(0, 'rgba(255,246,216,0.45)');
    cone.addColorStop(1, 'rgba(255,246,216,0)');
    g.fillStyle = cone;
    g.beginPath(); g.moveTo(18, -8); g.lineTo(170, -70); g.lineTo(170, 70); g.lineTo(18, 8); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-20, -14, 44, 34);
  g.fillStyle = '#2b2f37';
  for (const [wx, wy] of [[-14, -17], [8, -17], [-14, 13], [8, 13]]) g.fillRect(wx, wy, 12, 6);
  g.fillStyle = '#e3e8ef'; g.fillRect(-18, -13, 38, 26);
  g.fillStyle = '#1c4f7a'; g.fillRect(-14, -10, 20, 20); // solar deck
  g.fillStyle = '#F4CA65'; g.fillRect(16, -8, 5, 5); g.fillRect(16, 3, 5, 5); // headlights
  g.fillStyle = r.battery > 25 ? '#6CE0B2' : '#ff6b7a'; g.beginPath(); g.arc(-12, 0, 2.5, 0, Math.PI * 2); g.fill();
  g.restore();
  // battery ring under the rover
  g.lineWidth = 3;
  g.strokeStyle = r.battery > 25 ? 'rgba(108,224,178,0.8)' : 'rgba(255,107,122,0.9)';
  g.beginPath(); g.arc(r.x, r.y, ROVER.radius + 8, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * r.battery) / 100); g.stroke();
  g.restore();

  // off-screen objective arrow
  if (f.target) {
    const sx = f.target.x - camX, sy = f.target.y - camY;
    if (sx < 0 || sy < 0 || sx > vw || sy > vh) {
      const ang = Math.atan2(sy - vh / 2, sx - vw / 2);
      const ax = vw / 2 + Math.cos(ang) * (vw / 2 - 36), ay = vh / 2 + Math.sin(ang) * (vh / 2 - 36);
      g.save(); g.translate(ax, ay); g.rotate(ang);
      g.fillStyle = '#F4CA65';
      g.beginPath(); g.moveTo(18, 0); g.lineTo(-10, -12); g.lineTo(-4, 0); g.lineTo(-10, 12); g.closePath(); g.fill();
      g.restore();
      const dm = Math.round(Math.hypot(f.target.x - r.x, f.target.y - r.y) / 10);
      g.font = '700 12px Inter, sans-serif'; g.fillStyle = '#F4CA65'; g.textAlign = 'center';
      g.fillText(`${dm} m`, ax - Math.cos(ang) * 30, ay - Math.sin(ang) * 30 + 4);
    }
  }
}
