/**
 * Audio engine behaviour with a fake Web Audio context (no sound card needed): settings, mute,
 * de-duplication, voice limit, continuous-sound lifecycle and failure handling.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_KEY, AudioEngine, DEFAULT_AUDIO, masterGain, MAX_MASTER, MAX_VOICES, readAudioSettings } from './engine';
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
  frequency = new Param(); detune = new Param(); type = 'sine'; buffer: unknown = null; loop = false;
  start() { this.started = true; }
  stop() { this.stopped = true; }
}
class FakeCtx {
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0; sampleRate = 8000; destination = new Node();
  onstatechange: (() => void) | null = null;
  sources: Source[] = [];
  createGain() { const n = Object.assign(new Node(), { gain: new Param() }); return n; }
  createOscillator() { const s = new Source(); this.sources.push(s); return s; }
  createBufferSource() { const s = new Source(); this.sources.push(s); return s; }
  createBiquadFilter() { return Object.assign(new Node(), { type: 'lowpass', frequency: new Param(), Q: new Param() }); }
  createDynamicsCompressor() { return Object.assign(new Node(), { threshold: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }); }
  createBuffer(_c: number, len: number) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  resume() { this.state = 'running'; this.onstatechange?.(); return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

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
    expect(readAudioSettings(kv)).toEqual({ on: false, volume: 100 });
    kv.setItem(AUDIO_KEY, '{broken');
    expect(readAudioSettings(kv)).toEqual(DEFAULT_AUDIO);
  });

  it('volume and mute are saved and restored (and do not touch other keys such as the game save)', () => {
    const { e, kv } = engine();
    kv.setItem('sun-save', 'GAME');
    e.setSettings({ volume: 35 });
    e.setSettings({ on: false });
    const again = new AudioEngine(() => null, kv);
    expect(again.settings).toEqual({ on: false, volume: 35 });
    expect(kv.getItem('sun-save')).toBe('GAME');
  });

  it('master gain: 0 when muted or at 0 %, louder with volume, capped', () => {
    expect(masterGain({ on: false, volume: 100 })).toBe(0);
    expect(masterGain({ on: true, volume: 0 })).toBe(0);
    expect(masterGain({ on: true, volume: 50 })).toBeGreaterThan(0);
    expect(masterGain({ on: true, volume: 50 })).toBeLessThan(masterGain({ on: true, volume: 100 }));
    expect(masterGain({ on: true, volume: 100 })).toBe(MAX_MASTER);
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
    e.loop('drill', 1);
    const voice = ctx.sources.slice();
    e.stopLoop('drill');
    expect(e.activeLoops).toEqual([]);
    vi.advanceTimersByTime(500);
    expect(voice.every((s) => s.stopped)).toBe(true);
    expect(voice.every((s) => s.connected === 0)).toBe(true);
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

  it('every loop definition builds', () => {
    const { e } = engine();
    e.unlock();
    for (const name of Object.keys(LOOPS)) e.loop(name as keyof typeof LOOPS, 1);
    expect(e.activeLoops.sort()).toEqual(Object.keys(LOOPS).sort());
  });
});
