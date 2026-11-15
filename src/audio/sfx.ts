/**
 * Sound recipes — every effect is synthesised from oscillators and filtered noise with short envelopes.
 * Style: quiet lunar sci-fi + soft retro pixel game. No samples, no external files, no voices.
 * Rover sounds represent what the rover's own sensors and motors feel (structure-borne vibration),
 * because sound does not travel through the vacuum on the Moon.
 */
export interface Build { ctx: AudioContext; out: AudioNode; t: number; noise: () => AudioBuffer }

type Wave = OscillatorType;
interface ToneSpec { type?: Wave; f: number; f2?: number; at?: number; dur: number; gain: number; attack?: number; lp?: number; detune?: number }
interface NoiseSpec { at?: number; dur: number; gain: number; filter?: BiquadFilterType; freq: number; freq2?: number; q?: number }

/** Simple voice: oscillator → (lowpass) → envelope → out. Returns its end time. */
function tone(b: Build, s: ToneSpec): number {
  const { ctx, out } = b;
  const t0 = b.t + (s.at ?? 0), t1 = t0 + s.dur, a = Math.min(s.attack ?? 0.006, s.dur / 3);
  const o = ctx.createOscillator();
  o.type = s.type ?? 'triangle';
  o.frequency.setValueAtTime(s.f, t0);
  if (s.f2) o.frequency.exponentialRampToValueAtTime(s.f2, t1);
  if (s.detune) o.detune.value = s.detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(s.gain, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  let head: AudioNode = o;
  if (s.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = s.lp; o.connect(f); head = f; }
  head.connect(g); g.connect(out);
  o.start(t0); o.stop(t1 + 0.02);
  o.onended = () => { try { g.disconnect(); head.disconnect(); o.disconnect(); } catch { /* ignore */ } };
  return t1;
}

/** Filtered noise burst (mechanical ticks, hiss, thuds). */
function hiss(b: Build, s: NoiseSpec): number {
  const { ctx, out } = b;
  const t0 = b.t + (s.at ?? 0), t1 = t0 + s.dur;
  const src = ctx.createBufferSource();
  src.buffer = b.noise();
  const f = ctx.createBiquadFilter();
  f.type = s.filter ?? 'bandpass';
  f.frequency.setValueAtTime(s.freq, t0);
  if (s.freq2) f.frequency.exponentialRampToValueAtTime(s.freq2, t1);
  f.Q.value = s.q ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(s.gain, t0 + Math.min(0.004, s.dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t0, Math.random() * 0.5); src.stop(t1 + 0.02);
  src.onended = () => { try { g.disconnect(); f.disconnect(); src.disconnect(); } catch { /* ignore */ } };
  return t1;
}

const notes = (b: Build, fs: number[], step: number, o: Omit<ToneSpec, 'f'>) =>
  Math.max(...fs.map((f, i) => tone(b, { ...o, f, at: (o.at ?? 0) + i * step })));
/** ±3 % pitch variation so repeated clicks do not sound mechanical. */
const vary = (f: number) => f * (0.97 + Math.random() * 0.06);

interface Spec { build: (b: Build) => number; cooldown: number; priority?: boolean }
const fx = (cooldown: number, build: (b: Build) => number, priority = false): Spec => ({ build, cooldown, priority });

export const SFX = {
  // ---------- UI ----------
  click: fx(45, (b) => Math.max(tone(b, { type: 'square', f: vary(1050), f2: 820, dur: 0.065, gain: 0.05, lp: 3200 }), hiss(b, { dur: 0.02, gain: 0.03, filter: 'highpass', freq: 3000 }))),
  select: fx(60, (b) => notes(b, [vary(587), vary(880)], 0.055, { type: 'triangle', dur: 0.08, gain: 0.09 })),
  confirm: fx(80, (b) => notes(b, [660, 990], 0.065, { type: 'square', dur: 0.09, gain: 0.05, lp: 2600 })),
  cancel: fx(80, (b) => tone(b, { type: 'triangle', f: 440, f2: 260, dur: 0.13, gain: 0.08 })),
  denied: fx(250, (b) => notes(b, [196, 165], 0.09, { type: 'square', dur: 0.07, gain: 0.05, lp: 900 })),
  // ---------- base ----------
  powerOn: fx(80, (b) => Math.max(hiss(b, { dur: 0.025, gain: 0.05, filter: 'highpass', freq: 2500 }), tone(b, { type: 'sawtooth', f: 220, f2: 660, at: 0.02, dur: 0.18, gain: 0.05, lp: 1800 }), tone(b, { type: 'sine', f: 1320, at: 0.17, dur: 0.06, gain: 0.04 }))),
  powerOff: fx(80, (b) => Math.max(hiss(b, { dur: 0.025, gain: 0.05, filter: 'highpass', freq: 2200 }), tone(b, { type: 'sawtooth', f: 560, f2: 150, at: 0.02, dur: 0.2, gain: 0.05, lp: 1200 }))),
  upgrade: fx(120, (b) => Math.max(hiss(b, { dur: 0.03, gain: 0.07, freq: 900, q: 3 }), hiss(b, { at: 0.08, dur: 0.03, gain: 0.06, freq: 1300, q: 3 }), notes(b, [392, 523, 659], 0.06, { at: 0.14, type: 'triangle', dur: 0.1, gain: 0.07 }))),
  upgradeDone: fx(200, (b) => Math.max(notes(b, [523, 659, 784, 1047], 0.07, { type: 'triangle', dur: 0.14, gain: 0.07 }), tone(b, { type: 'sine', f: 2093, at: 0.3, dur: 0.25, gain: 0.025 }))),
  advance: fx(200, (b) => Math.max(hiss(b, { dur: 0.22, gain: 0.04, freq: 700, freq2: 2600, q: 2 }), notes(b, [vary(1100), vary(1400), vary(1250), vary(1600)], 0.045, { type: 'square', dur: 0.03, gain: 0.025, lp: 4000 }))),
  shiftDone: fx(200, (b) => notes(b, [587, 880], 0.08, { type: 'triangle', dur: 0.14, gain: 0.08 })),
  research: fx(400, (b) => Math.max(notes(b, [523, 659, 784, 1047, 1319], 0.065, { type: 'triangle', dur: 0.16, gain: 0.07 }), tone(b, { type: 'sine', f: 2637, at: 0.34, dur: 0.35, gain: 0.02 })), true),
  // ---------- alerts ----------
  alertCaution: fx(900, (b) => notes(b, [880, 880], 0.16, { type: 'sine', dur: 0.1, gain: 0.08 }), true),
  alertCritical: fx(1200, (b) => notes(b, [740, 554, 740], 0.17, { type: 'square', dur: 0.12, gain: 0.05, lp: 1600 }), true),
  failure: fx(800, (b) => Math.max(tone(b, { type: 'triangle', f: 440, f2: 110, dur: 0.6, gain: 0.09, lp: 1400 }), tone(b, { type: 'sine', f: 220, f2: 82, at: 0.1, dur: 0.55, gain: 0.05 })), true),
  victory: fx(800, (b) => Math.max(notes(b, [523, 659, 784, 1047], 0.09, { type: 'triangle', dur: 0.18, gain: 0.08 }), notes(b, [784, 1047, 1319], 0, { at: 0.4, type: 'sine', dur: 0.55, gain: 0.035 })), true),
  // ---------- tutorial ----------
  guide: fx(400, (b) => Math.max(tone(b, { type: 'sine', f: 1180, f2: 1480, dur: 0.06, gain: 0.04 }), tone(b, { type: 'sine', f: 1760, at: 0.07, dur: 0.05, gain: 0.03 }))),
  tutorialStep: fx(300, (b) => notes(b, [660, 880, 1175], 0.06, { type: 'triangle', dur: 0.1, gain: 0.07 })),
  tutorialDone: fx(800, (b) => Math.max(notes(b, [523, 659, 784, 1047, 1319], 0.07, { type: 'triangle', dur: 0.14, gain: 0.07 }), notes(b, [1047, 1319, 1568], 0, { at: 0.38, type: 'sine', dur: 0.45, gain: 0.03 })), true),
  // ---------- rover ----------
  launch: fx(500, (b) => Math.max(tone(b, { type: 'sawtooth', f: 70, f2: 180, dur: 0.45, gain: 0.05, lp: 420 }), notes(b, [880, 1175], 0.07, { at: 0.35, type: 'sine', dur: 0.07, gain: 0.04 }))),
  detect: fx(350, (b) => notes(b, [1568, 2093], 0.07, { type: 'sine', dur: 0.06, gain: 0.04 })),
  interact: fx(120, (b) => Math.max(hiss(b, { dur: 0.05, gain: 0.07, filter: 'lowpass', freq: 700 }), tone(b, { type: 'square', f: 330, at: 0.02, dur: 0.05, gain: 0.03, lp: 1200 }))),
  pickup: fx(200, (b) => Math.max(hiss(b, { dur: 0.06, gain: 0.07, filter: 'lowpass', freq: 600 }), hiss(b, { at: 0.12, dur: 0.05, gain: 0.06, filter: 'lowpass', freq: 500 }), notes(b, [523, 784], 0.07, { at: 0.2, type: 'triangle', dur: 0.1, gain: 0.07 }))),
  scanOk: fx(200, (b) => notes(b, [740, 740], 0.11, { type: 'sine', dur: 0.06, gain: 0.05 })),
  leak: fx(400, (b) => Math.max(hiss(b, { dur: 0.4, gain: 0.05, filter: 'highpass', freq: 3200, freq2: 4200 }), notes(b, [523, 415], 0.12, { type: 'square', dur: 0.1, gain: 0.04, lp: 1500 }))),
  tile: fx(35, (b) => Math.max(tone(b, { type: 'square', f: vary(1500), dur: 0.025, gain: 0.03, lp: 3500 }), hiss(b, { dur: 0.02, gain: 0.04, filter: 'highpass', freq: 2500 }))),
  connect: fx(60, (b) => tone(b, { type: 'triangle', f: 880, f2: 1320, dur: 0.08, gain: 0.06 })),
  solved: fx(500, (b) => Math.max(notes(b, [784, 988, 1175, 1568], 0.07, { type: 'triangle', dur: 0.14, gain: 0.07 }), tone(b, { type: 'sine', f: 196, f2: 392, dur: 0.5, gain: 0.04 })), true),
  repaired: fx(500, (b) => Math.max(tone(b, { type: 'sawtooth', f: 110, f2: 440, dur: 0.35, gain: 0.04, lp: 900 }), notes(b, [659, 988], 0.09, { at: 0.3, type: 'sine', dur: 0.12, gain: 0.05 }))),
  valve: fx(110, (b) => tone(b, { type: 'sine', f: vary(880), dur: 0.03, gain: 0.025 })),
  vent: fx(500, (b) => hiss(b, { dur: 0.3, gain: 0.07, freq: 1400, freq2: 600, q: 1.5 })),
  drillStart: fx(300, (b) => tone(b, { type: 'square', f: 90, f2: 160, dur: 0.12, gain: 0.03, lp: 700 })),
  sample: fx(250, (b) => Math.max(notes(b, [880, 1175], 0.06, { type: 'triangle', dur: 0.1, gain: 0.07 }), tone(b, { type: 'sine', f: 2349, at: 0.12, dur: 0.18, gain: 0.025 }))),
  allSamples: fx(600, (b) => notes(b, [659, 880, 1047, 1319, 1760], 0.06, { type: 'triangle', dur: 0.14, gain: 0.07 }), true),
  dock: fx(400, (b) => Math.max(hiss(b, { dur: 0.08, gain: 0.08, filter: 'lowpass', freq: 320 }), tone(b, { type: 'sine', f: 70, dur: 0.12, gain: 0.08 }), notes(b, [587, 880], 0.08, { at: 0.12, type: 'triangle', dur: 0.12, gain: 0.07 }))),
  missionComplete: fx(800, (b) => Math.max(notes(b, [523, 659, 784, 1047], 0.08, { type: 'triangle', dur: 0.16, gain: 0.08 }), tone(b, { type: 'sine', f: 1568, at: 0.32, dur: 0.4, gain: 0.03 })), true),
  shadowIn: fx(600, (b) => Math.max(tone(b, { type: 'sine', f: 330, f2: 196, dur: 0.45, gain: 0.05, lp: 900 }), tone(b, { type: 'triangle', f: 98, dur: 0.45, gain: 0.03 }))),
  shadowOut: fx(600, (b) => tone(b, { type: 'sine', f: 247, f2: 392, dur: 0.32, gain: 0.04 })),
  bump: fx(300, (b) => Math.max(hiss(b, { dur: 0.07, gain: 0.08, filter: 'lowpass', freq: 260 }), tone(b, { type: 'sine', f: 85, f2: 55, dur: 0.1, gain: 0.07 }))),
} satisfies Record<string, Spec>;
export type SfxName = keyof typeof SFX;

// ---------- continuous sounds ----------
interface LoopBuilt { nodes: AudioNode[]; sources: AudioScheduledSourceNode[]; out: GainNode; pitch: AudioParam[]; base: number[] }
interface LoopSpec { build: (b: Build) => LoopBuilt; gain: number; fadeIn: number; fadeOut: number }

function osc(ctx: AudioContext, type: Wave, f: number) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
function noiseLoop(b: Build, type: BiquadFilterType, freq: number, q = 1) {
  const src = b.ctx.createBufferSource(); src.buffer = b.noise(); src.loop = true;
  const f = b.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  src.connect(f);
  return { src, f };
}

export const LOOPS = {
  /** Small electric drive motor: low hum + gear whine, slight tremolo; pitch follows speed. */
  motor: {
    gain: 0.09, fadeIn: 0.08, fadeOut: 0.12,
    build: (b: Build): LoopBuilt => {
      const { ctx } = b;
      const out = ctx.createGain(); out.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      const o1 = osc(ctx, 'sawtooth', 58), o2 = osc(ctx, 'square', 116), whine = osc(ctx, 'sine', 740);
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      const gw = ctx.createGain(); gw.gain.value = 0.05;
      const trem = osc(ctx, 'sine', 14), tg = ctx.createGain(); tg.gain.value = 0.18;
      const body = ctx.createGain(); body.gain.value = 0.8;
      trem.connect(tg); tg.connect(body.gain);
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(body); whine.connect(gw); gw.connect(body);
      const { src, f } = noiseLoop(b, 'bandpass', 1800, 2); const gn = ctx.createGain(); gn.gain.value = 0.12; f.connect(gn); gn.connect(body);
      body.connect(out); out.connect(b.out);
      const sources = [o1, o2, whine, trem, src];
      sources.forEach((s) => s.start(b.t));
      return { nodes: [out, lp, o1, o2, whine, g2, gw, trem, tg, body, src, f, gn], sources, out, pitch: [o1.frequency, o2.frequency, whine.frequency], base: [58, 116, 740] };
    },
  },
  /** Sample drill: geared buzz with fast pulsing + grit noise. */
  drill: {
    gain: 0.07, fadeIn: 0.05, fadeOut: 0.06,
    build: (b: Build): LoopBuilt => {
      const { ctx } = b;
      const out = ctx.createGain(); out.gain.value = 0;
      const o = osc(ctx, 'square', 150), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const am = osc(ctx, 'square', 22), ag = ctx.createGain(); ag.gain.value = 0.3;
      const body = ctx.createGain(); body.gain.value = 0.7;
      am.connect(ag); ag.connect(body.gain);
      o.connect(lp); lp.connect(body);
      const { src, f } = noiseLoop(b, 'bandpass', 2600, 1.2); const gn = ctx.createGain(); gn.gain.value = 0.35; f.connect(gn); gn.connect(body);
      body.connect(out); out.connect(b.out);
      const sources = [o, am, src];
      sources.forEach((s) => s.start(b.t));
      return { nodes: [out, o, lp, am, ag, body, src, f, gn], sources, out, pitch: [o.frequency], base: [150] };
    },
  },
  /** Base interior: very quiet life-support hum (P1 ambience). */
  baseHum: {
    gain: 0.035, fadeIn: 1.2, fadeOut: 0.4,
    build: (b: Build): LoopBuilt => {
      const { ctx } = b;
      const out = ctx.createGain(); out.gain.value = 0;
      const o1 = osc(ctx, 'sine', 60), o2 = osc(ctx, 'triangle', 120), g2 = ctx.createGain(); g2.gain.value = 0.25;
      const { src, f } = noiseLoop(b, 'lowpass', 380); const gn = ctx.createGain(); gn.gain.value = 0.3; f.connect(gn); gn.connect(out);
      const sway = osc(ctx, 'sine', 0.13), sg = ctx.createGain(); sg.gain.value = 0.15; sway.connect(sg); sg.connect(out.gain);
      o1.connect(out); o2.connect(g2); g2.connect(out); out.connect(b.out);
      const sources = [o1, o2, src, sway];
      sources.forEach((s) => s.start(b.t));
      return { nodes: [out, o1, o2, g2, src, f, gn, sway, sg], sources, out, pitch: [], base: [] };
    },
  },
  /** Rover cabin electronics: faint steady tone (P1 ambience). */
  cabin: {
    gain: 0.02, fadeIn: 0.8, fadeOut: 0.3,
    build: (b: Build): LoopBuilt => {
      const { ctx } = b;
      const out = ctx.createGain(); out.gain.value = 0;
      const o = osc(ctx, 'sine', 92), h = osc(ctx, 'sine', 2760), gh = ctx.createGain(); gh.gain.value = 0.04;
      o.connect(out); h.connect(gh); gh.connect(out); out.connect(b.out);
      const sources = [o, h];
      sources.forEach((s) => s.start(b.t));
      return { nodes: [out, o, h, gh], sources, out, pitch: [], base: [] };
    },
  },
} satisfies Record<string, LoopSpec>;
export type LoopName = keyof typeof LOOPS;
