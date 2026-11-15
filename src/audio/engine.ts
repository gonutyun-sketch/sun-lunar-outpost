/**
 * Game audio (Web Audio API). One manager for the whole game:
 * - every sound is synthesised in code (oscillators + filtered noise, see ./sfx.ts) — no audio files;
 * - one-shot effects are fire-and-forget with a per-sound cooldown and a voice limit;
 * - continuous sounds (rover motor, drill, ambience) are single managed loops whose level is ramped;
 * - nothing plays until the player's first click / tap / key press (browser autoplay rules);
 * - a missing or blocked AudioContext never breaks the game: every call becomes a no-op.
 * Sound in the game is a fictional feedback layer (rover sensors, machinery), not a recording of the Moon.
 */
import { startMusic, type MusicHandle } from './music';
import { LOOPS, SFX, type LoopName, type SfxName } from './sfx';

/** `on` = all sound; `volume` = effects; `music` / `musicVolume` = background music. */
export interface AudioSettings { on: boolean; volume: number; music: boolean; musicVolume: number }
export const AUDIO_KEY = 'sun-audio';
export const DEFAULT_AUDIO: AudioSettings = { on: true, volume: 60, music: true, musicVolume: 40 };
/** Most one-shot effects allowed to overlap; extra ones are dropped (quiet beats noisy). */
export const MAX_VOICES = 6;

interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function readAudioSettings(kv: KV | null): AudioSettings {
  try {
    const raw = kv?.getItem(AUDIO_KEY);
    if (!raw) return { ...DEFAULT_AUDIO };
    const v = JSON.parse(raw) as Partial<AudioSettings>;
    const pct = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(Math.min(100, Math.max(0, x))) : d);
    return {
      on: typeof v.on === 'boolean' ? v.on : DEFAULT_AUDIO.on,
      volume: pct(v.volume, DEFAULT_AUDIO.volume),
      music: typeof v.music === 'boolean' ? v.music : DEFAULT_AUDIO.music,
      musicVolume: pct(v.musicVolume, DEFAULT_AUDIO.musicVolume),
    };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

/**
 * Perceptual volume curve (0..100 → 0..4.2). Recipes are mixed quietly (peaks ≈ 0.07), so the default 60 %
 * lands around −15 dBFS and 100 % stays below clipping (a compressor catches overlaps).
 */
export const MAX_MASTER = 4.2;
export const masterGain = (s: AudioSettings) => (s.on ? Math.pow(s.volume / 100, 1.5) * MAX_MASTER : 0);
/** Background music sits well under the effects (default 40 % ≈ −25 dBFS). */
export const MAX_MUSIC = 1.6;
export const musicGain = (s: AudioSettings) => (s.on && s.music ? Math.pow(s.musicVolume / 100, 1.5) * MAX_MUSIC : 0);

interface LoopVoice { nodes: AudioNode[]; sources: AudioScheduledSourceNode[]; out: GainNode; pitch: AudioParam[]; base: number[]; level: number }

export class AudioEngine {
  settings: AudioSettings;
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicOut: GainNode | null = null;
  private music: MusicHandle | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SfxName, number>();
  private voices: number[] = [];
  private loops = new Map<LoopName, LoopVoice>();
  /** Requested continuous sounds, kept so they can start once audio is unlocked or switched back on. */
  private wanted = new Map<LoopName, { level: number; pitch: number }>();
  private listeners = new Set<() => void>();
  /** Effects that were requested (for QA: counts per name, including blocked ones). */
  readonly log: { name: SfxName; played: boolean }[] = [];

  constructor(private factory: () => AudioContext | null, private kv: KV | null) {
    this.settings = readAudioSettings(kv);
  }

  /** Call from a real user gesture. Creates or resumes the AudioContext. Safe to call often. */
  unlock() {
    try {
      if (!this.ctx) {
        const ctx = this.factory();
        if (!ctx) return;
        this.ctx = ctx;
        const master = ctx.createGain();
        master.gain.value = masterGain(this.settings);
        let tail: AudioNode = master;
        try {
          const comp = ctx.createDynamicsCompressor();
          comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
          master.connect(comp); tail = comp;
        } catch { /* compressor optional */ }
        tail.connect(ctx.destination);
        this.master = master;
        // music has its own bus straight to the speakers (the effects compressor never pumps it)
        const musicOut = ctx.createGain();
        musicOut.gain.value = musicGain(this.settings);
        musicOut.connect(ctx.destination);
        this.musicOut = musicOut;
        ctx.onstatechange = () => { if (ctx.state === 'running') { this.reapply(); this.syncMusic(); } };
      }
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume().catch(() => {});
      this.syncMusic();
    } catch {
      this.ctx = null; // audio unavailable: the game continues silently
    }
  }

  get ready() { return !!this.ctx && !!this.master && this.ctx.state === 'running'; }
  get musicPlaying() { return !!this.music; }

  /** Start or stop the background music to match the settings (one instance at most). */
  private syncMusic() {
    const want = this.ready && !!this.musicOut && this.settings.on && this.settings.music && this.settings.musicVolume > 0;
    try {
      if (want && !this.music) this.music = startMusic(this.ctx!, this.musicOut!);
      if (!want && this.music) { this.music.stop(); this.music = null; }
    } catch { this.music = null; }
  }

  private noiseBuffer(ctx: AudioContext) {
    if (!this.noise) {
      const len = Math.floor(ctx.sampleRate * 1);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x7fffffff) * 2 - 1; }
      this.noise = buf;
    }
    return this.noise;
  }

  /** Play a one-shot effect. Returns true if it was scheduled. */
  play(name: SfxName): boolean {
    const spec = SFX[name];
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const lastAt = this.last.get(name) ?? -Infinity;
    let ok = this.settings.on && this.settings.volume > 0 && this.ready && now - lastAt >= spec.cooldown;
    if (ok) {
      const ctx = this.ctx!;
      const t = ctx.currentTime;
      this.voices = this.voices.filter((end) => end > t);
      if (this.voices.length >= MAX_VOICES && !spec.priority) ok = false;
      else {
        try {
          const end = spec.build({ ctx, out: this.master!, t: t + 0.005, noise: () => this.noiseBuffer(ctx) });
          this.voices.push(end);
          this.last.set(name, now);
        } catch { ok = false; }
      }
    }
    if (this.log.length > 400) this.log.splice(0, 200);
    this.log.push({ name, played: ok });
    return ok;
  }

  /** Set a continuous sound's level (0 = silent) and optional pitch factor. Creates at most one voice per loop. */
  loop(name: LoopName, level: number, pitch = 1) {
    const ctx = this.ctx;
    let v = this.loops.get(name);
    const target = Math.max(0, Math.min(1, level));
    this.wanted.set(name, { level: target, pitch });
    if (!v) {
      if (target <= 0 || !this.settings.on || this.settings.volume <= 0 || !this.ready || !ctx || !this.master) return;
      try {
        const built = LOOPS[name].build({ ctx, out: this.master, t: ctx.currentTime, noise: () => this.noiseBuffer(ctx) });
        v = { ...built, level: 0 };
        this.loops.set(name, v);
      } catch { return; }
    }
    if (!ctx) return;
    const t = ctx.currentTime;
    if (Math.abs(v.level - target) > 0.01) {
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setTargetAtTime(target * LOOPS[name].gain, t, target > v.level ? LOOPS[name].fadeIn : LOOPS[name].fadeOut);
      v.level = target;
    }
    v.pitch.forEach((p, i) => p.setTargetAtTime(v!.base[i] * pitch, t, 0.15));
  }

  /** Fade out and release a continuous sound (all nodes disconnected). */
  private reapply() { for (const [name, w] of this.wanted) if (!this.loops.has(name) && w.level > 0) this.loop(name, w.level, w.pitch); }

  stopLoop(name: LoopName) {
    this.wanted.delete(name);
    const v = this.loops.get(name);
    if (!v) return;
    this.loops.delete(name);
    this.release(v);
  }

  private release(v: LoopVoice) {
    const ctx = this.ctx;
    try {
      const t = ctx?.currentTime ?? 0;
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setTargetAtTime(0, t, 0.05);
      for (const s of v.sources) { try { s.stop(t + 0.3); } catch { /* already stopped */ } }
    } catch { /* ignore */ }
    setTimeout(() => { for (const n of v.nodes) { try { n.disconnect(); } catch { /* ignore */ } } }, 400);
  }

  stopAllLoops() { for (const name of new Set([...this.loops.keys(), ...this.wanted.keys()])) this.stopLoop(name); }
  /** Silence playing loops but remember them (sound switched off): they come back when it is switched on. */
  private muteLoops() { for (const [name, v] of [...this.loops]) { this.loops.delete(name); this.release(v); } }
  get activeLoops() { return [...this.loops.keys()]; }

  setSettings(next: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...next };
    this.settings.volume = Math.round(Math.min(100, Math.max(0, this.settings.volume)));
    this.settings.musicVolume = Math.round(Math.min(100, Math.max(0, this.settings.musicVolume)));
    try { this.kv?.setItem(AUDIO_KEY, JSON.stringify(this.settings)); } catch { /* storage full or blocked */ }
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(masterGain(this.settings), this.ctx.currentTime, 0.03);
    }
    if (this.musicOut && this.ctx) {
      this.musicOut.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicOut.gain.setTargetAtTime(musicGain(this.settings), this.ctx.currentTime, 0.08);
    }
    this.syncMusic();
    if (!this.settings.on || this.settings.volume === 0) this.muteLoops(); else this.reapply();
    this.listeners.forEach((f) => f());
  }

  subscribe(f: () => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }

  /** Tab hidden → suspend (no sound, no CPU); visible again → resume (allowed after the first gesture). */
  setHidden(hidden: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (hidden && ctx.state === 'running') void ctx.suspend().catch(() => {});
      if (!hidden && ctx.state === 'suspended') void ctx.resume().catch(() => {});
    } catch { /* ignore */ }
  }
}

function browserKV(): KV | null {
  try { return window.localStorage; } catch { return null; }
}
function browserContext(): AudioContext | null {
  const C = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  return C ? new C({ latencyHint: 'interactive' }) : null;
}

export const audio = new AudioEngine(browserContext, typeof window !== 'undefined' ? browserKV() : null);

let installed = false;
/**
 * Unlock audio on the first real gesture, give every button a soft click, and follow tab visibility.
 * Buttons choose their sound with data-sfx="confirm|cancel|select|none|custom"; custom = played by the handler.
 */
export function installAudio() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const unlock = () => audio.unlock();
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(type, unlock, { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('button, [role="radio"], [role="tab"], a.btn') as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
    const tag = el.dataset.sfx;
    if (tag === 'none' || tag === 'custom') return;
    const name: SfxName = tag === 'confirm' || tag === 'cancel' || tag === 'select' ? tag
      : el.getAttribute('role') === 'radio' ? 'select'
      : el.classList.contains('btn-primary') ? 'confirm' : 'click';
    audio.play(name);
  }, true);
  document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden));
}
