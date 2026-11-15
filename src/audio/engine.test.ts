/**
 * Audio engine behaviour with a fake Web Audio context (no sound card needed): settings, mute,
 * de-duplication, voice limit, continuous-sound lifecycle and failure handling.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_KEY, AudioEngine, DEFAULT_AUDIO, masterGain, MAX_MASTER, MAX_VOICES, musicGain, readAudioSettings, type AudioSettings } from './engine';
import { CHORD_SECONDS, startMusic } from './music';
import { LOOPS, SFX } from './sfx';

class Param {
  value = 0; calls = 0;
  setValueAtTime(v: number) { this.value = v; this.calls++; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; this.calls++; return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; this.calls++; return this; }
  setTargetAtTime(v: number) { this.value = v; this.calls++; return this; }
  cancelScheduledValues() { return this; }
}
class Node {
  static created = 0; static live = new Set<Node>();
  connected = 0;
  constructor() { Node.created++; Node.live.add(this); }
  connect(n?: unknown) { this.connected++; return n; }
  disconnect() { this.connected = 0; Node.live.delete(this); }
}
class Source extends Node {
  started = false; stopped = false; onended: (() => void) | null = null;
  startAt = 0; stopAt = 0;
  frequency = new Param(); detune = new Param(); type = 'sine'; buffer: unknown = null; loop = false;
  start(when = 0) { this.started = true; this.startAt = when; }
  stop(when = 0) { this.stopped = true; this.stopAt = when; }
}
class FakeCtx {
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0; sampleRate = 8000; destination = new Node();
  onstatechange: (() => void) | null = null;
  sources: Source[] = [];
  limiter: (Node & { curve: Float32Array | null }) | null = null;
  createGain() { const n = Object.assign(new Node(), { gain: new Param() }); return n; }
  createOscillator() { const s = new Source(); this.sources.push(s); return s; }
  createBufferSource() { const s = new Source(); this.sources.push(s); return s; }
  createBiquadFilter() { return Object.assign(new Node(), { type: 'lowpass', frequency: new Param(), Q: new Param() }); }
  createConvolver() { return Object.assign(new Node(), { buffer: null as unknown }); }
  createDelay() { return Object.assign(new Node(), { delayTime: new Param() }); }
  createWaveShaper() { return (this.limiter = Object.assign(new Node(), { curve: null })); }
  createDynamicsCompressor() { return Object.assign(new Node(), { threshold: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }); }
  createBuffer(_c: number, len: number) { const d = new Float32Array(Math.min(len, 64)); return { getChannelData: () => d }; }
  resume() { this.state = 'running'; this.onstatechange?.(); return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

const S = (o: Partial<AudioSettings>): AudioSettings => ({ ...DEFAULT_AUDIO, ...o });

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}
function engine(kv = memory(), ctx: FakeCtx | null = new FakeCtx()) {
  const e = new AudioEngine(() => ctx as unknown as AudioContext, kv);
  return { e, kv, ctx: ctx! };
}

beforeEach(() => {
  vi.stubGlobal('document', { hidden: false });
  vi.useFakeTimers();
  let now = 0;
  vi.stubGlobal('performance', { now: () => (now += 1000) }); // every call is 1 s later (no cooldown hits)
});

describe('settings', () => {
  it('defaults are on at a moderate volume; values are validated and clamped', () => {
    expect(readAudioSettings(null)).toEqual(DEFAULT_AUDIO);
    expect(DEFAULT_AUDIO.volume).toBeLessThanOrEqual(70);
    const kv = memory();
    kv.setItem(AUDIO_KEY, JSON.stringify({ on: false, volume: 250 }));
    expect(readAudioSettings(kv)).toEqual({ ...DEFAULT_AUDIO, on: false, volume: 100 });
    kv.setItem(AUDIO_KEY, '{broken');
    expect(readAudioSettings(kv)).toEqual(DEFAULT_AUDIO);
  });

  it('volume and mute are saved and restored (and do not touch other keys such as the game save)', () => {
    const { e, kv } = engine();
    kv.setItem('sun-save', 'GAME');
    e.setSettings({ volume: 35 });
    e.setSettings({ on: false });
    const again = new AudioEngine(() => null, kv);
    expect(again.settings).toEqual({ ...DEFAULT_AUDIO, on: false, volume: 35 });
    expect(kv.getItem('sun-save')).toBe('GAME');
  });

  it('master gain: 0 when muted or at 0 %, louder with volume, capped', () => {
    expect(masterGain(S({ on: false, volume: 100 }))).toBe(0);
    expect(masterGain(S({ on: true, volume: 0 }))).toBe(0);
    expect(masterGain(S({ on: true, volume: 50 }))).toBeGreaterThan(0);
    expect(masterGain(S({ on: true, volume: 50 }))).toBeLessThan(masterGain(S({ on: true, volume: 100 })));
    expect(masterGain(S({ on: true, volume: 100 }))).toBe(MAX_MASTER);
  });
});

describe('playback rules', () => {
  it('nothing plays before the first user gesture (autoplay policy), then effects play', () => {
    const { e } = engine();
    expect(e.play('click')).toBe(false);
    e.unlock();
    expect(e.play('click')).toBe(true);
  });

  it('muted or 0 % volume blocks every effect and continuous sound', () => {
    const { e } = engine();
    e.unlock();
    e.setSettings({ on: false });
    expect(Object.keys(SFX).some((n) => e.play(n as keyof typeof SFX))).toBe(false);
    e.loop('motor', 1);
    expect(e.activeLoops).toEqual([]);
    e.setSettings({ on: true, volume: 0 });
    expect(e.play('confirm')).toBe(false);
  });

  it('the same effect fired twice in a row (re-render, double event) plays once', () => {
    const { e } = engine();
    e.unlock();
    vi.stubGlobal('performance', { now: () => 5000 }); // same instant
    expect(e.play('alertCritical')).toBe(true);
    expect(e.play('alertCritical')).toBe(false);
    expect(e.play('powerOn')).toBe(true); // a different sound is not blocked
  });

  it('at most MAX_VOICES ordinary effects overlap; important ones (alerts, success) still get through', () => {
    const { e } = engine();
    e.unlock();
    const names = ['click', 'select', 'confirm', 'cancel', 'tile', 'connect', 'valve', 'scanOk', 'detect'] as const;
    const played = names.map((n) => e.play(n)).filter(Boolean).length;
    expect(played).toBe(MAX_VOICES);
    expect(e.play('alertCritical')).toBe(true);
    expect(e.play('alertCaution')).toBe(true);
    expect(e.play('victory')).toBe(false);
  });

  it('the output limiter preserves ordinary levels and caps peaks below full scale', () => {
    const { e, ctx } = engine();
    e.unlock();
    const curve = ctx.limiter!.curve!;
    const center = (curve.length - 1) / 2;
    expect(curve[center]).toBe(0);
    expect(curve[center + 128]).toBeCloseTo(0.5, 5);
    expect(curve[center - 128]).toBeCloseTo(-0.5, 5);
    expect(Math.max(...curve.map(Math.abs))).toBeLessThan(0.97);
  });

  it('every effect builds without errors and stops its own nodes', () => {
    const { e, ctx } = engine();
    e.unlock();
    for (const name of Object.keys(SFX)) {
      ctx.currentTime += 5; // previous voices have ended
      expect(e.play(name as keyof typeof SFX), name).toBe(true);
    }
    expect(ctx.sources.length).toBeGreaterThan(Object.keys(SFX).length);
    expect(ctx.sources.every((s) => s.started && s.stopped)).toBe(true);
  });

  it('no AudioContext (old browser) or a failing one: every call is a silent no-op', () => {
    const none = new AudioEngine(() => null, memory());
    none.unlock();
    expect(none.play('click')).toBe(false);
    expect(() => none.loop('motor', 1)).not.toThrow();
    const broken = new AudioEngine(() => { throw new Error('blocked'); }, memory());
    expect(() => broken.unlock()).not.toThrow();
    expect(broken.play('confirm')).toBe(false);
  });
});

describe('continuous sounds (motor, drill, ambience)', () => {
  it('one voice per loop: thousands of frame updates never create new nodes', () => {
    const { e, ctx } = engine();
    e.unlock();
    e.loop('motor', 0.5, 1);
    const n = ctx.sources.length;
    for (let i = 0; i < 2000; i++) e.loop('motor', (i % 10) / 10, 0.8 + (i % 5) / 10);
    expect(ctx.sources.length).toBe(n);
    expect(e.activeLoops).toEqual(['motor']);
  });

  it('level 0 is silent but stopLoop releases every node (screen closed, mission ended)', () => {
    const { e, ctx } = engine();
    e.unlock();
    const from = ctx.sources.length; // music sources started on unlock are not part of the drill
    e.loop('drill', 1);
    const voice = ctx.sources.slice(from);
    e.stopLoop('drill');
    expect(e.activeLoops).toEqual([]);
    vi.advanceTimersByTime(500);
    expect(voice.every((s) => s.stopped)).toBe(true);
    expect(voice.every((s) => s.connected === 0)).toBe(true);
  });

  it('a released drill fades out and retires even when the mission stays open', () => {
    const { e, ctx } = engine();
    e.setSettings({ music: false });
    e.unlock();
    e.loop('drill', 1);
    const voice = [...ctx.sources];
    e.loop('drill', 0);
    vi.advanceTimersByTime(100);
    e.loop('drill', 1);
    expect(ctx.sources).toEqual(voice);
    vi.advanceTimersByTime(300);
    expect(e.activeLoops).toEqual(['drill']);
    e.loop('drill', 0);
    vi.advanceTimersByTime(700);
    expect(e.activeLoops).toEqual([]);
    expect(voice.every(s => s.stopped && s.connected === 0)).toBe(true);
  });

  it('does not queue new motor frequency automation at a steady speed', () => {
    const { e, ctx } = engine();
    e.setSettings({ music: false });
    e.unlock();
    e.loop('motor', 0.8, 1.1);
    for (let i = 0; i < 100; i++) {
      ctx.currentTime += 0.1;
      e.loop('motor', 0.8, 1.1);
    }
    expect(ctx.sources.slice(0, 3).map(s => s.frequency.calls)).toEqual([1, 1, 1]);
    e.loop('motor', 0.8, 1.21);
    expect(ctx.sources.slice(0, 3).map(s => s.frequency.calls)).toEqual([2, 2, 2]);
  });

  it('muting stops the loops; unmuting brings back the ones still wanted; stopped ones stay stopped', () => {
    const { e } = engine();
    e.unlock();
    e.loop('baseHum', 1);
    e.loop('motor', 0.6);
    e.stopLoop('motor');
    e.setSettings({ on: false });
    expect(e.activeLoops).toEqual([]);
    e.setSettings({ on: true });
    expect(e.activeLoops).toEqual(['baseHum']);
    e.stopAllLoops();
    expect(e.activeLoops).toEqual([]);
  });

  it('a loop requested before the first gesture starts once audio is unlocked', () => {
    const { e, ctx } = engine();
    e.loop('baseHum', 1);
    expect(e.activeLoops).toEqual([]);
    ctx.state = 'suspended';
    e.unlock();
    void ctx.resume(); // the browser resumes after the gesture
    expect(e.activeLoops).toEqual(['baseHum']);
  });

  it('hidden tab suspends the context; visible again resumes it', () => {
    const { e, ctx } = engine();
    e.unlock();
    e.setHidden(true);
    expect(ctx.state).toBe('suspended');
    expect(e.play('click')).toBe(false); // nothing is queued while hidden
    e.setHidden(false);
    expect(ctx.state).toBe('running');
  });

  it('keeps the same music graph when a hidden tab returns', () => {
    const { e, ctx } = engine();
    e.unlock();
    const n = ctx.sources.length;
    e.setHidden(true);
    e.setSettings({ volume: 45 });
    expect(e.musicPlaying).toBe(true);
    e.setHidden(false);
    expect(ctx.state).toBe('running');
    expect(ctx.sources.length).toBe(n);
  });

  it('resumes if the page becomes visible before suspend finishes', async () => {
    const { e, ctx } = engine();
    e.unlock();
    let finish!: () => void;
    ctx.suspend = () => new Promise<void>(resolve => {
      finish = () => { ctx.state = 'suspended'; resolve(); };
    });
    e.setHidden(true);
    e.setHidden(false);
    finish();
    await Promise.resolve();
    expect(ctx.state).toBe('running');
  });

  it('every loop definition builds', () => {
    const { e } = engine();
    e.unlock();
    for (const name of Object.keys(LOOPS)) e.loop(name as keyof typeof LOOPS, 1);
    expect(e.activeLoops.sort()).toEqual(Object.keys(LOOPS).sort());
  });
});

describe('background music', () => {
  it('starts after the first gesture, one instance only, quieter than the effects by default', () => {
    const { e, ctx } = engine();
    expect(e.musicPlaying).toBe(false);
    e.unlock();
    expect(e.musicPlaying).toBe(true);
    const n = ctx.sources.length;
    expect(n).toBeGreaterThan(0); // first chord scheduled
    e.unlock(); e.setSettings({ volume: 70 });
    expect(ctx.sources.length).toBe(n); // no second copy
    expect(musicGain(DEFAULT_AUDIO)).toBeLessThan(masterGain(DEFAULT_AUDIO));
  });

  it('keeps scheduling chords as time passes, but not while the context is suspended', () => {
    const { e, ctx } = engine();
    e.unlock();
    const before = ctx.sources.length;
    ctx.currentTime += CHORD_SECONDS * 2;
    vi.advanceTimersByTime(1000);
    expect(ctx.sources.length).toBeGreaterThan(before);
    ctx.state = 'suspended';
    const frozen = ctx.sources.length;
    ctx.currentTime += CHORD_SECONDS * 3;
    vi.advanceTimersByTime(3000);
    expect(ctx.sources.length).toBe(frozen);
  });

  it('recovers from a late music timer without creating voices in the past', () => {
    const ctx = new FakeCtx();
    const music = startMusic(ctx as unknown as AudioContext, ctx.destination as unknown as AudioNode, () => 0);
    const initial = ctx.sources.length;
    ctx.currentTime = CHORD_SECONDS * 3;
    vi.advanceTimersByTime(1000);
    expect(music.chords).toBe(2);
    expect(ctx.sources.slice(initial).every(s => s.startAt > ctx.currentTime)).toBe(true);
    music.stop();
    vi.advanceTimersByTime(300);
    expect(ctx.sources.every(s => s.stopped && s.connected === 0)).toBe(true);
  });

  it('music off, music volume 0 or all sound off stops it; turning it back on restarts it', () => {
    const { e, kv } = engine();
    e.unlock();
    e.setSettings({ music: false });
    expect(e.musicPlaying).toBe(false);
    e.setSettings({ music: true });
    expect(e.musicPlaying).toBe(true);
    e.setSettings({ musicVolume: 0 });
    expect(e.musicPlaying).toBe(false);
    e.setSettings({ musicVolume: 40, on: false });
    expect(e.musicPlaying).toBe(false);
    e.setSettings({ on: true });
    expect(e.musicPlaying).toBe(true);
    expect(JSON.parse(kv.getItem(AUDIO_KEY)!)).toMatchObject({ music: true, musicVolume: 40 });
  });

  it('music settings are saved separately from the effects and validated on load', () => {
    const kv = memory();
    kv.setItem(AUDIO_KEY, JSON.stringify({ on: true, volume: 50, music: false, musicVolume: -20 }));
    expect(readAudioSettings(kv)).toEqual({ on: true, volume: 50, music: false, musicVolume: 0 });
    kv.setItem(AUDIO_KEY, JSON.stringify({ on: true, volume: 50 })); // saved by the previous version
    expect(readAudioSettings(kv)).toMatchObject({ music: true, musicVolume: DEFAULT_AUDIO.musicVolume });
  });
});
