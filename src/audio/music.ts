/**
 * Background music — a calm, generative "space" piece composed in code (no recordings, no samples).
 * Slow major-7/9 pad chords in D (lydian colour), a soft low drone, and sparse bell notes that echo
 * like distant stars. Everything is scheduled a few seconds ahead on the AudioContext clock, so it
 * keeps time even when the game loop is busy; nothing runs while the context is suspended.
 */

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Four chords, ~11 s each (pad notes in MIDI, bass root an octave or two below). */
export const PROGRESSION: { bass: number; pad: number[] }[] = [
  { bass: 38, pad: [57, 61, 64, 66] }, // Dmaj9
  { bass: 35, pad: [57, 62, 66, 69] }, // Bm9 (no 3rd doubling)
  { bass: 31, pad: [54, 59, 61, 66] }, // Gmaj7(#11)
  { bass: 33, pad: [55, 59, 62, 64] }, // A sus (A7sus9 colour)
];
/** D major pentatonic, high register, for the bells. */
const BELLS = [74, 76, 78, 81, 83, 86, 88, 90];
export const CHORD_SECONDS = 11;
const LOOKAHEAD = 4;
const START_LEAD = 0.12;
const FADE_IN = 2.5;
const FADE_OUT = 0.18;
const impulses = new WeakMap<AudioContext, AudioBuffer>();

export interface MusicHandle { stop(): void; readonly chords: number }

function impulse(ctx: AudioContext) {
  const cached = impulses.get(ctx);
  if (cached) return cached;
  const len = Math.floor(ctx.sampleRate * 4.5);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let seed = 777 + ch * 131;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = ((seed / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
  }
  impulses.set(ctx, buf);
  return buf;
}

/**
 * Start the music into `out` (a gain node the engine owns). Returns a handle; stop() fades the
 * scheduler out — notes already scheduled ring out naturally through the output fade.
 */
export function startMusic(ctx: AudioContext, out: AudioNode, random: () => number = Math.random): MusicHandle {
  const nodes: AudioNode[] = [];
  const voices = new Map<OscillatorNode, { gain: GainNode; end: number }>();
  const keep = <T extends AudioNode>(n: T) => { nodes.push(n); return n; };
  const dispose = (o: OscillatorNode) => {
    const v = voices.get(o);
    if (!v) return;
    voices.delete(o);
    o.onended = null;
    try { v.gain.disconnect(); o.disconnect(); } catch { /* already disconnected */ }
  };
  // shared space: lowpassed bus → dry + long reverb + slow echo for the bells
  // own fade stage, so a stopped instance goes quiet even though notes were scheduled ahead
  const inst = keep(ctx.createGain());
  const started = ctx.currentTime;
  inst.gain.setValueAtTime(0.0001, started);
  inst.gain.linearRampToValueAtTime(1, started + FADE_IN);
  inst.connect(out);
  const bus = keep(ctx.createGain()); bus.gain.value = 1;
  const tone = keep(ctx.createBiquadFilter()); tone.type = 'lowpass'; tone.frequency.value = 2400;
  bus.connect(tone); tone.connect(inst);
  try {
    const conv = keep(ctx.createConvolver()); conv.buffer = impulse(ctx);
    const wet = keep(ctx.createGain()); wet.gain.value = 0.55;
    tone.connect(conv); conv.connect(wet); wet.connect(inst);
  } catch { /* reverb optional */ }
  const bellBus = keep(ctx.createGain()); bellBus.gain.value = 1;
  bellBus.connect(bus);
  try {
    const delay = keep(ctx.createDelay(2)); delay.delayTime.value = 0.62;
    const fb = keep(ctx.createGain()); fb.gain.value = 0.38;
    bellBus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(bus);
  } catch { /* echo optional */ }

  const voice = (type: OscillatorType, f: number, t0: number, attack: number, hold: number, release: number, gain: number, dest: AudioNode, detune = 0) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
    o.connect(g); g.connect(dest);
    const end = t0 + attack + hold + release + 0.05;
    voices.set(o, { gain: g, end });
    o.onended = () => dispose(o);
    o.start(t0);
    o.stop(end);
  };

  let chords = 0;
  let next = ctx.currentTime + 0.2;
  const scheduleChord = (t: number, c: { bass: number; pad: number[] }) => {
    // pads: two slightly detuned voices per note, long swell, overlapping the next chord
    for (const m of c.pad) {
      voice('sine', mtof(m), t, 3.2, CHORD_SECONDS - 3.2, 4, 0.032, bus, -5);
      voice('triangle', mtof(m), t, 3.6, CHORD_SECONDS - 3.6, 4, 0.016, bus, 6);
    }
    voice('sine', mtof(c.bass), t, 4, CHORD_SECONDS - 4, 4, 0.05, bus);
    voice('sine', mtof(c.bass + 12), t, 5, CHORD_SECONDS - 5, 4, 0.012, bus);
    // 2–4 sparse bells somewhere in the chord
    const bells = 2 + Math.floor(random() * 3);
    for (let i = 0; i < bells; i++) {
      const m = BELLS[Math.floor(random() * BELLS.length)];
      const bt = t + 1 + random() * (CHORD_SECONDS - 2.5);
      voice('sine', mtof(m), bt, 0.006, 0.05, 2.6, 0.022, bellBus);
      voice('sine', mtof(m) * 2.01, bt, 0.004, 0.02, 1.1, 0.006, bellBus);
    }
    chords++;
  };

  const tick = () => {
    if (ctx.state !== 'running') return; // suspended (hidden tab): the clock is frozen, so is the music
    const now = ctx.currentTime;
    // A late timer must not start expired envelopes or stack several chords on one sample.
    if (next < now + START_LEAD) next = now + START_LEAD;
    while (next < now + LOOKAHEAD) {
      scheduleChord(next, PROGRESSION[chords % PROGRESSION.length]);
      next += CHORD_SECONDS;
    }
  };
  tick();
  const timer = setInterval(tick, 1000);
  let stopped = false;
  return {
    get chords() { return chords; },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      const now = ctx.currentTime;
      const end = now + FADE_OUT;
      try {
        const fade = Math.min(1, Math.max(0, (now - started) / FADE_IN));
        inst.gain.cancelScheduledValues(now);
        inst.gain.setValueAtTime(0.0001 + 0.9999 * fade, now);
        inst.gain.linearRampToValueAtTime(0, end);
      } catch { /* ignore */ }
      for (const [source, v] of voices) {
        try { source.stop(Math.min(v.end, end)); } catch { /* already ended */ }
      }
      setTimeout(() => {
        for (const source of voices.keys()) dispose(source);
        for (const n of nodes) { try { n.disconnect(); } catch { /* ignore */ } }
      }, 240);
    },
  };
}
