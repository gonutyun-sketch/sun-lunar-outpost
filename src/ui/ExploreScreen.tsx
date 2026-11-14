/**
 * Rover exploration mode (Canvas 2D). Self-contained: owns its own loop and input,
 * and reports { success, failures } back to the base game on exit.
 * Missions are small step lists (MISSIONS below); each step kind has its own interaction.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MISSION } from '../game/config';
import { useI18n } from '../i18n/I18n';
import type { Key } from '../i18n/translate';
import { createCircuit, isSolved, powered, rotateTile, N, E, S, W, type Circuit } from '../rover/circuit';
import { createPressureGame, inBand, P, stepPressure, type PressureGame } from '../rover/pressure';
import { addTrack, batteryLevel, burst, createVis, emit, pruneTracks, snapDirection, stepVis, trackMotion, updateCamera, type BurstKind, type Vis } from '../rover/fx';
import { drawFrame, mapDistance, type Marker } from '../rover/render';
import { createRover, dist, ROVER, stepRover, type Input, type Rover } from '../rover/sim';
import { cameraZoom, joystickVector, knobOffset, renderDpr } from '../rover/touch';
import { MAP, type Site } from '../rover/world';
import { useWarningQueue, WarningBanner, type MissionWarning } from './WarningBanner';

type SiteId = Site['id'];
type StepKind = 'goto' | 'circuit' | 'pickup' | 'scan' | 'pressure' | 'collect' | 'dock';
interface Step { kind: StepKind; site?: SiteId; sites?: SiteId[]; obj: Key; chip: Key }
interface MissionDef { id: string; title: Key; brief: Key; successTitle: Key; successDesc: Key; steps: Step[] }

const MISSIONS: Record<string, MissionDef> = {
  solarRepair: {
    id: 'solarRepair', title: 'ex.mission.solarRepair', brief: 'ex.brief.solarRepair', successTitle: 'ex.successTitle', successDesc: 'ex.successDesc',
    steps: [
      { kind: 'goto', site: 'solarB', obj: 'ex.obj.goto', chip: 'ex.step.goto' },
      { kind: 'circuit', obj: 'ex.obj.repair', chip: 'ex.step.repair' },
      { kind: 'dock', obj: 'ex.obj.return', chip: 'ex.step.return' },
    ],
  },
  oxygenRepair: {
    id: 'oxygenRepair', title: 'ex.mission.oxygenRepair', brief: 'ex.brief.oxygenRepair', successTitle: 'ex.o2.successTitle', successDesc: 'ex.o2.successDesc',
    steps: [
      { kind: 'pickup', site: 'depot', obj: 'ex.o2.obj.pickup', chip: 'ex.o2.step.pickup' },
      { kind: 'scan', sites: ['valveA', 'valveB', 'valveC'], obj: 'ex.o2.obj.scan', chip: 'ex.o2.step.scan' },
      { kind: 'pressure', obj: 'ex.o2.obj.pressure', chip: 'ex.o2.step.pressure' },
      { kind: 'dock', obj: 'ex.obj.return', chip: 'ex.step.return' },
    ],
  },
  sampleSurvey: {
    id: 'sampleSurvey', title: 'ex.mission.sampleSurvey', brief: 'ex.brief.sampleSurvey', successTitle: 'ex.sc.successTitle', successDesc: 'ex.sc.successDesc',
    steps: [
      { kind: 'collect', sites: ['sample1', 'sample2', 'sample3'], obj: 'ex.sc.obj.collect', chip: 'ex.sc.step.collect' },
      { kind: 'dock', obj: 'ex.obj.return', chip: 'ex.step.return' },
    ],
  },
};
/** Seconds of drilling (rover stopped, E held) per sample. */
const DRILL_TIME = 4;
/** Which valve leaks, per attempt (varies when you retry). The first one is NOT the nearest valve, so the player must search. */
const FAULTY: SiteId[] = ['valveC', 'valveB', 'valveA'];

type Phase = 'brief' | 'play' | 'success' | 'failed';

interface Props {
  missionId: string;
  onExit: (result: { success: boolean; failures: number }) => void;
  fx: boolean;
}

interface Hud { battery: number; rate: number; zone: 'sun' | 'shadow' | 'deep' | 'charge'; near: SiteId | null; time: number; drill: number; distance: number | null }

type DirKey = 'up' | 'down' | 'left' | 'right';

/** Touch UI is shown on coarse pointers / touch screens, or as soon as a touch is seen. */
const prefersTouch = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints ?? 0) > 0 || document.documentElement.classList.contains('touch'));

const OVERLAY: StepKind[] = ['circuit', 'pressure'];

/** Respect the OS "reduce motion" setting (no shake, particles or vibration; static feedback instead). */
/** Short haptic pulse on phones that support it (ignored elsewhere). */
const buzz = (pattern: number | number[]) => { try { navigator.vibrate?.(pattern); } catch { /* not supported */ } };

export function ExploreScreen({ missionId, onExit, fx }: Props) {
  const { t } = useI18n();
  const def = MISSIONS[missionId];
  const exp = MISSION.expeditions.find((e) => e.id === missionId)!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rover = useRef<Rover>(createRover(MAP));
  const input = useRef<Input>({ up: false, down: false, left: false, right: false });
  /** Visual-only state (particles, tracks, camera, bursts). Never read by the physics or mission rules. */
  const vis = useRef<Vis>(createVis());
  const shake = useRef(0);
  const motionRef = useRef(fx);
  const touchRef = useRef(false);
  const time = useRef(0);

  const [phase, setPhaseState] = useState<Phase>('brief');
  const phaseRef = useRef<Phase>('brief');
  const [stepIdx, setStepIdxState] = useState(0);
  const stepRef = useRef(0);
  const [paused, setPausedState] = useState(false);
  const pausedRef = useRef(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const confirmRef = useRef(false);
  confirmRef.current = confirmRestart;
  const [failures, setFailures] = useState(0);
  const failuresRef = useRef(0);
  failuresRef.current = failures;
  const [flash, setFlash] = useState<string | null>(null);
  const { warning, add: warn, clear: clearWarnings } = useWarningQueue();
  const batteryWarningsShown = useRef<0 | 1 | 2>(0);
  const [hud, setHud] = useState<Hud>({ battery: ROVER.batteryStart, rate: -ROVER.sunDrain, zone: 'sun', near: null, time: 0, drill: 0, distance: null });
  const [touchUI, setTouchUI] = useState(prefersTouch);
  touchRef.current = touchUI;
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
  const viewSize = useRef({ w: 0, h: 0 });

  // Mission 1: circuit
  const [circuit, setCircuit] = useState<Circuit>(createCircuit);
  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;
  const [cursor, setCursor] = useState(0);
  // Mission 2: cargo, scan, pressure
  const cargo = useRef(false);
  const [scanned, setScanned] = useState<SiteId[]>([]);
  const scannedRef = useRef<SiteId[]>([]);
  scannedRef.current = scanned;
  const [gauges, setGauges] = useState<PressureGame>(createPressureGame);
  const pressureRef = useRef<PressureGame>(gauges);
  const valveSel = useRef(0);
  const [sel, setSel] = useState(0);
  const valveDir = useRef<-1 | 0 | 1>(0);
  const [ventFlash, setVentFlash] = useState<number | null>(null);
  const o2Done = useRef(false);
  // Mission 3: samples (hold E to drill)
  const [collected, setCollected] = useState<SiteId[]>([]);
  const collectedRef = useRef<SiteId[]>([]);
  collectedRef.current = collected;
  const drill = useRef(0);
  const drillHeld = useRef(false);
  const drillSite = useRef<SiteId | null>(null);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { motionRef.current = fx && !query.matches; };
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, [fx]);

  // Development-only hooks for automated play-testing. Not present in production builds.
  if (import.meta.env.DEV) {
    const w = window as unknown as Record<string, unknown>;
    w.__rover = rover;
    w.__explore = { pressureRef, stepRef, vis, faulty: () => FAULTY[failuresRef.current % 3] };
  }

  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const setStep = (i: number) => { stepRef.current = i; setStepIdxState(i); };
  const setPause = (v: boolean) => { pausedRef.current = v; setPausedState(v); };
  const vibrate = (pattern: number | number[]) => {
    if (motionRef.current && touchRef.current) buzz(pattern);
  };
  const step = def.steps[stepIdx];
  const rotIdx = circuit.tiles.map((tt, i) => (tt.rotatable ? i : -1)).filter((i) => i >= 0);
  const rotIdxRef = useRef(rotIdx);
  rotIdxRef.current = rotIdx;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const faulty = () => FAULTY[failuresRef.current % 3];
  const next = () => {
    const n = stepRef.current + 1;
    if (n >= def.steps.length) setPhase('success');
    else setStep(n);
  };
  const say = (msg: string, ms = 1300) => { setFlash(msg); setTimeout(() => setFlash((f) => (f === msg ? null : f)), ms); };
  /** Feedback ring (+ optional text) on the map at a world position. */
  const pop = (kind: BurstKind, x: number, y: number, text?: string) => burst(vis.current, { kind, x, y, t0: performance.now() / 1000, text });
  const sparkle = (x: number, y: number, n = 12) => {
    if (!motionRef.current) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      emit(vis.current, { x, y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, life: 1, decay: 1.4, size: 4, kind: 'sparkle' });
    }
  };

  /** Interaction targets for the current step (sites the rover can use E on). */
  const targetSites = useCallback((): SiteId[] => {
    const s = def.steps[stepRef.current];
    if (!s || phaseRef.current !== 'play') return [];
    if (s.kind === 'goto' || s.kind === 'pickup') return [s.site!];
    if (s.kind === 'scan' || s.kind === 'collect') return s.sites!;
    if (s.kind === 'dock') return ['dock'];
    return [];
  }, [def]);

  const restart = useCallback(() => {
    rover.current = createRover(MAP);
    batteryWarningsShown.current = 0;
    clearWarnings();
    vis.current = createVis();
    time.current = 0;
    cargo.current = false;
    o2Done.current = false;
    const freshCircuit = createCircuit();
    circuitRef.current = freshCircuit;
    setCircuit(freshCircuit);
    setCursor(0);
    setScanned([]);
    setCollected([]);
    drill.current = 0;
    drillHeld.current = false;
    const pg = createPressureGame();
    pressureRef.current = pg;
    setGauges(pg);
    setConfirmRestart(false);
    setPause(false);
    setStep(0);
    setPhase('play');
  }, [clearWarnings]);

  const interact = useCallback(() => {
    const s = def.steps[stepRef.current];
    if (!s || phaseRef.current !== 'play') return;
    const near = targetSites().find((id) => dist(rover.current, MAP.sites[id]) <= MAP.sites[id].r);
    if (!near) {
      // pressed E too far away: say so instead of silently ignoring it
      if (s.kind !== 'collect' && targetSites().length) { say(t('ex.fx.far'), 1000); vibrate(20); }
      return;
    }
    const site = MAP.sites[near];
    rover.current = { ...rover.current, vx: 0, vy: 0 };
    if (s.kind === 'goto') { pop('info', site.x, site.y); next(); }
    else if (s.kind === 'pickup') { cargo.current = true; pop('ok', site.x, site.y, t('ex.fx.loaded')); sparkle(site.x, site.y, 8); say(t('ex.o2.picked')); next(); }
    else if (s.kind === 'dock') { pop('ok', site.x, site.y); next(); }
    else if (s.kind === 'scan') {
      if (near === faulty()) { pop('warn', site.x, site.y, t('ex.fx.leak')); say(t('ex.o2.found')); vibrate([25, 40, 25]); next(); }
      else if (!scannedRef.current.includes(near)) { setScanned([...scannedRef.current, near]); pop('info', site.x, site.y, t('ex.o2.normalTag')); say(t('ex.o2.normal')); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, targetSites, t]);

  const rotate = useCallback((i: number) => {
    if (def.steps[stepRef.current]?.kind !== 'circuit') return;
    const c = circuitRef.current;
    if (isSolved(c)) return;
    const n = rotateTile(c, i);
    if (n === c) return;
    circuitRef.current = n;
    setCircuit(n);
    rover.current = { ...rover.current, battery: Math.max(0, rover.current.battery - ROVER.rotateCost) };
    if (isSolved(n)) {
      setFlash(t('ex.pz.solved'));
      setTimeout(() => {
        setFlash(null);
        if (def.steps[stepRef.current]?.kind === 'circuit') {
          vis.current.solarFixedAt = performance.now() / 1000;
          const sb = MAP.sites.solarB;
          pop('ok', sb.x, sb.y, t('ex.fx.online'));
          next();
        }
      }, 1100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, t]);

  // ---------- keyboard ----------
  useEffect(() => {
    const keymap: Record<string, DirKey> = {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    };
    const down = (e: KeyboardEvent) => {
      const p = phaseRef.current;
      const kind = def.steps[stepRef.current]?.kind;
      if (p === 'brief' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE')) { e.preventDefault(); setPhase('play'); return; }
      if (e.code === 'Escape') {
        e.preventDefault();
        if (confirmRef.current) { setConfirmRestart(false); setPause(false); return; }
        if (p === 'play' && kind && OVERLAY.includes(kind) && !pausedRef.current) { valveDir.current = 0; setStep(stepRef.current - 1); return; }
        if (p === 'play') setPause(!pausedRef.current);
        return;
      }
      if (e.code === 'KeyR' && p === 'play') { e.preventDefault(); setConfirmRestart(true); setPause(true); return; }
      if (pausedRef.current || p !== 'play') return;
      if (kind === 'circuit') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); setCursor((c) => (c + rotIdxRef.current.length - 1) % rotIdxRef.current.length); }
        if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); setCursor((c) => (c + 1) % rotIdxRef.current.length); }
        if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); rotate(rotIdxRef.current[cursorRef.current]); }
        if (/^Digit[1-3]$/.test(e.code)) rotate(rotIdxRef.current[Number(e.code.slice(5)) - 1]);
        return;
      }
      if (kind === 'pressure') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); valveSel.current = (valveSel.current + 2) % 3; setSel(valveSel.current); }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); valveSel.current = (valveSel.current + 1) % 3; setSel(valveSel.current); }
        if (/^Digit[1-3]$/.test(e.code)) { valveSel.current = Number(e.code.slice(5)) - 1; setSel(valveSel.current); }
        if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); valveDir.current = 1; }
        if (e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); valveDir.current = -1; }
        return;
      }
      const k = keymap[e.code];
      if (k) { e.preventDefault(); input.current[k] = true; }
      if (e.code === 'KeyE' && kind === 'collect') { e.preventDefault(); drillHeld.current = true; return; }
      if (e.code === 'KeyE') { e.preventDefault(); interact(); }
    };
    const up = (e: KeyboardEvent) => {
      const k = keymap[e.code];
      if (k) input.current[k] = false;
      if (e.code === 'KeyE') drillHeld.current = false;
      if ((e.code === 'ArrowUp' || e.code === 'KeyW') && valveDir.current === 1) valveDir.current = 0;
      if ((e.code === 'ArrowDown' || e.code === 'KeyS') && valveDir.current === -1) valveDir.current = 0;
    };
    const blur = () => { input.current = { up: false, down: false, left: false, right: false }; valveDir.current = 0; drillHeld.current = false; };
    // tab hidden / app switched: release every input and pause, so nothing stays pressed and no time is lost unseen
    const vis = () => { if (document.hidden) { blur(); if (phaseRef.current === 'play') setPause(true); } };
    const resize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize); document.removeEventListener('visibilitychange', vis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, interact, rotate]);

  // ---------- game loop ----------
  useEffect(() => {
    const cv = canvasRef.current!, g = cv.getContext('2d')!;
    let raf = 0, last = performance.now(), hudTimer = 0, gaugeTimer = 0;
    // CSS size of the view; the backing store is CSS size × capped DPR (never stretched)
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const { clientWidth: width, clientHeight: height } = wrap;
      viewSize.current = { w: width, h: height };
      const dpr = renderDpr(window.devicePixelRatio);
      const W = Math.max(1, Math.floor(width * dpr)), H = Math.max(1, Math.floor(height * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener('resize', measure);
    const labels = {
      shadow: t('ex.map.shadow'), deep: t('ex.map.deep', { deep: ROVER.deepDrain }), dock: t('ex.map.dock'), charger: t('ex.map.charger'), solarB: t('ex.map.solarB'),
      base: t('ex.map.base'), oxygen: t('ex.map.oxygen'), samples: t('ex.map.samples'), depot: t('ex.map.depot'),
    };
    let alive = true;
    let idle = 1, bumpCool = 0, trackPrune = 0, prevNear: SiteId | null = null;
    const frame = (now: number) => {
      // stop if the screen was closed (a late frame can arrive after unmount)
      if (!alive || !wrapRef.current || !canvasRef.current) return;
      // dt is capped, so a long pause (hidden tab, slow device) never makes the rover jump or drain at once
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const tNow = now / 1000;
      const v = vis.current;
      const mo = motionRef.current;
      const p = phaseRef.current;
      const kind = def.steps[stepRef.current]?.kind;
      const active = p === 'play' && !pausedRef.current;
      const frozen = !!kind && OVERLAY.includes(kind);
      let res = stepRover(MAP, rover.current, { up: false, down: false, left: false, right: false }, 0, true);
      if (active) {
        res = stepRover(MAP, rover.current, input.current, dt, frozen);
        rover.current = res.rover;
        time.current += dt;
        const R = res.rover;
        if (mo) {
          trackMotion(v, R, dt);
          if (res.moving) addTrack(v, R, tNow);
        }
        // soft bump: a short shake, dust and sparks at the contact side (rate-limited)
        bumpCool = Math.max(0, bumpCool - dt);
        if (res.bumped && v.speed > 40 && bumpCool === 0) {
          bumpCool = 0.35;
          if (mo) {
            shake.current = Math.min(6, shake.current + 3);
            const fx0 = R.x + Math.cos(R.angle) * 22, fy0 = R.y + Math.sin(R.angle) * 22;
            for (let i = 0; i < 5; i++) emit(v, { x: fx0, y: fy0, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 1, decay: 2.6, size: 3, kind: i < 2 ? 'spark' : 'dust' });
            vibrate(15);
          }
        }
        // wheel dust: more when fast or accelerating hard
        if (res.moving && mo) {
          const rate = 0.35 + 0.5 * Math.min(1, v.speed / ROVER.maxSpeed) + (Math.abs(v.accel) > 300 ? 0.3 : 0);
          for (const side of [-1, 1]) {
            if (Math.random() > rate) continue;
            const bx = R.x - Math.cos(R.angle) * 18 - Math.sin(R.angle) * 17 * side, by = R.y - Math.sin(R.angle) * 18 + Math.cos(R.angle) * 17 * side;
            emit(v, { x: bx, y: by, vx: -R.vx * 0.15 + (Math.random() - 0.5) * 40, vy: -R.vy * 0.15 + (Math.random() - 0.5) * 40, life: 1, decay: 1.5, size: 2 + Math.random() * 2, kind: 'dust' });
          }
        }
        if (kind === 'pressure') {
          const r = stepPressure(pressureRef.current, valveSel.current, valveDir.current, dt);
          pressureRef.current = r.game;
          if (r.vented !== null) { setVentFlash(r.vented); setTimeout(() => setVentFlash(null), 900); vibrate(40); }
          gaugeTimer += dt;
          if (gaugeTimer > 1 / 30 || r.game.done) { gaugeTimer = 0; setGauges(r.game); }
          if (r.game.done) {
            o2Done.current = true; valveDir.current = 0;
            v.oxygenFixedAt = tNow;
            const pl = MAP.blocks[5];
            if (pl) pop('ok', pl.x + pl.w / 2, pl.y + pl.h / 2, t('ex.fx.o2ok'));
            say(t('ex.o2.stable'), 1800); next();
          }
        }
        if (kind === 'collect') {
          const here = (def.steps[stepRef.current].sites ?? []).find((id) => !collectedRef.current.includes(id) && dist(rover.current, MAP.sites[id]) <= MAP.sites[id].r);
          const still = Math.hypot(rover.current.vx, rover.current.vy) < 15;
          if (here && still && drillHeld.current) {
            if (drillSite.current !== here) { drillSite.current = here; drill.current = 0; }
            drill.current += dt / DRILL_TIME;
            // drilling: regolith spray around the rover
            if (mo && Math.random() < 0.7) {
              const a = Math.random() * Math.PI * 2;
              emit(v, { x: R.x + Math.cos(a) * 8, y: R.y + Math.sin(a) * 8, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 1, decay: 1.8, size: 2.5, kind: 'dust' });
            }
            if (drill.current >= 1) {
              drill.current = 0;
              const got = [...collectedRef.current, here];
              collectedRef.current = got;
              setCollected(got);
              const site = MAP.sites[here];
              pop('ok', site.x, site.y, t('ex.fx.sample', { n: got.length, total: 3 }));
              sparkle(site.x, site.y, 14);
              vibrate(30);
              if (got.length >= 3) {
                pop('big', R.x, R.y, t('ex.fx.allSamples'));
                sparkle(R.x, R.y, 24);
                say(t('ex.sc.all'), 2600);
                next();
              } else say(t('ex.sc.got', { n: got.length, total: 3 }));
            }
          } else if (!here || !still) {
            drill.current = 0; // moving away or driving cancels drilling
          }
        }
        // One large warning per threshold per sortie attempt. The HUD keeps showing the current level.
        const lvl = batteryLevel(R.battery);
        if (lvl > batteryWarningsShown.current) {
          const messages: MissionWarning[] = [];
          if (batteryWarningsShown.current === 0) {
            messages.push({ id: 'battery-low', tone: 'caution', title: 'notice.battery.low', action: 'notice.battery.action' });
          }
          if (lvl === 2) {
            messages.push({ id: 'battery-critical', tone: 'critical', title: 'notice.battery.critical', action: 'notice.battery.urgent' });
          }
          batteryWarningsShown.current = lvl;
          warn(...messages);
          pop('warn', R.x, R.y);
          vibrate(lvl === 2 ? [40, 60, 40] : 30);
        }
        if (rover.current.battery <= 0) { setPhase('failed'); setFailures((f) => f + 1); }
      }
      // gas from the leaking valve (Mission 2 clue)
      const leakSite = def.id === 'oxygenRepair' && !o2Done.current ? MAP.sites[faulty()] : null;
      if (leakSite && mo && Math.random() < dt * 9) {
        emit(v, { x: leakSite.x + (Math.random() - 0.5) * 8, y: leakSite.y - 6, vx: 18 + Math.random() * 22, vy: -30 - Math.random() * 25, life: 1, decay: 0.7, size: 4, kind: 'gas' });
      }
      stepVis(v, dt, tNow);
      trackPrune += dt;
      if (trackPrune > 1) { trackPrune = 0; pruneTracks(v, tNow); }
      shake.current = mo ? Math.max(0, shake.current - dt * 20) : 0;

      const box = viewSize.current;
      if (!box.w) measure();
      const zoom = cameraZoom(box.w, box.h);
      updateCamera(v.cam, rover.current, box.w / zoom, box.h / zoom, MAP.w, MAP.h, dt);

      let nearId: SiteId | null = null;
      const markers: Marker[] = targetSites().map((id) => {
        const s = MAP.sites[id];
        const near = dist(rover.current, s) <= s.r;
        const done = (kind === 'scan' && scannedRef.current.includes(id)) || (kind === 'collect' && collectedRef.current.includes(id));
        if (near) nearId = id;
        return { x: s.x, y: s.y, r: s.r, state: done ? 'done' : near ? 'near' : 'goal', note: done ? t(kind === 'collect' ? 'ex.sc.doneTag' : 'ex.o2.normalTag') : undefined };
      });
      // arriving at a target: a ring + short buzz, right away (before pressing anything)
      if (nearId && nearId !== prevNear && active) {
        const ns = MAP.sites[nearId as SiteId];
        const done = (kind === 'scan' && scannedRef.current.includes(nearId)) || (kind === 'collect' && collectedRef.current.includes(nearId));
        if (!done) { pop('ping', ns.x, ns.y); vibrate(12); }
      }
      prevNear = nearId;
      // the faulty valve stays marked while the pressure panel is open
      if (kind === 'pressure') { const s = MAP.sites[faulty()]; markers.push({ x: s.x, y: s.y, r: s.r, state: 'near' }); }

      // Full frame rate while driving; when paused or behind a menu/briefing, redraw at ~12 fps to save battery
      idle += dt;
      if (active || idle > 1 / 12) {
        idle = 0;
        g.setTransform(cv.width / Math.max(1, box.w), 0, 0, cv.height / Math.max(1, box.h), 0, 0);
        drawFrame(g, box.w, box.h, MAP, rover.current, {
          t: tNow, targets: markers, solarRepaired: def.id !== 'solarRepair' || isSolved(circuitRef.current),
          oxygenRepaired: def.id !== 'oxygenRepair' || o2Done.current, leak: leakSite ? [leakSite.x, leakSite.y] : null, cargo: cargo.current || collectedRef.current.length > 0,
          samples: def.id === 'sampleSurvey' ? (['sample1', 'sample2', 'sample3'] as SiteId[]).map((id) => ({ x: MAP.sites[id].x, y: MAP.sites[id].y, done: collectedRef.current.includes(id) })) : [],
          drill: drill.current,
          inShadow: res.inShadow, deep: res.deep, shake: shake.current, vis: v, motion: mo, labels, zoom,
        });
      }
      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        let distance = Infinity;
        for (const mk of markers) if (mk.state !== 'done') distance = Math.min(distance, mapDistance(mk, rover.current));
        setHud({ battery: rover.current.battery, rate: res.rate, zone: res.charging ? 'charge' : res.deep ? 'deep' : res.inShadow ? 'shadow' : 'sun', near: nearId, time: time.current, drill: drill.current, distance: Number.isFinite(distance) ? distance : null });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); ro?.disconnect(); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, def, targetSites, fx, warn]);

  // ---------- touch controls ----------
  const onStick = (ax: number, ay: number) => { const d = snapDirection(ax, ay); input.current.ax = d.x; input.current.ay = d.y; };
  const onActionDown = () => {
    if (def.steps[stepRef.current]?.kind === 'collect') drillHeld.current = true;
    else interact();
  };
  const onActionUp = () => { drillHeld.current = false; };

  const playing = phase === 'play';
  const stepText = (s: Step) => t(touchUI && s.kind === 'collect' ? 'ex.touch.collectObj' : s.obj);
  const objective = playing && step ? stepText(step) : '';
  const prompt = hud.near && !paused && playing
    ? step.kind === 'goto' ? t('ex.prompt.repair')
      : step.kind === 'pickup' ? t('ex.o2.prompt.pickup')
      : step.kind === 'scan' ? (scanned.includes(hud.near) ? null : t('ex.o2.prompt.scan'))
      : step.kind === 'collect' ? (collected.includes(hud.near) ? null : t('ex.sc.prompt'))
      : step.kind === 'dock' ? t('ex.prompt.dock') : null
    : null;
  const low = hud.battery < 25;
  const pct = Math.round(((def.id === 'solarRepair' ? exp.solarMult : exp.oxygenMult) ?? 1) * 100);
  const doneIdx = phase === 'success' ? def.steps.length : stepIdx;
  const driving = playing && !paused && !OVERLAY.includes(step.kind);
  const actionLabel = !hud.near ? null
    : step.kind === 'goto' ? t('ex.touch.repair')
    : step.kind === 'pickup' ? t('ex.touch.load')
    : step.kind === 'scan' ? (scanned.includes(hud.near) ? null : t('ex.touch.scan'))
    : step.kind === 'collect' ? (collected.includes(hud.near) ? null : t('ex.touch.drill'))
    : step.kind === 'dock' ? t('ex.touch.dock') : null;

  return (
    <div className={`explore screen ${fx ? '' : 'no-fx'} ${touchUI ? 'touch' : ''}`}
      onPointerDown={(e) => { if (e.pointerType === 'touch' && !touchUI) setTouchUI(true); }}
      onContextMenu={(e) => e.preventDefault()}>
      <WarningBanner warning={warning} />
      <header className="ex-top panel">
        <div className="ex-mission">
          <span className="tag">{t('ex.badge')}</span>
          <h1>{t(def.title)}</h1>
          <div className="ex-obj">
            {objective}
            {driving && hud.distance !== null && <span className="ex-distance" title={t('ex.distance')}>{hud.distance} m</span>}
          </div>
          <span className="ex-progress-short" aria-label={t('ex.progress')}>
            {Math.min(doneIdx + 1, def.steps.length)} / {def.steps.length}
          </span>
        </div>
        <div className="ex-steps" aria-label={t('ex.progress')}>
          {def.steps.map((s, i) => (
            <span key={i} className={`ex-step ${i < doneIdx ? 'done' : i === doneIdx && playing ? 'now' : ''}`}>{i + 1}. {t(s.chip, { n: collected.length, total: 3 })}</span>
          ))}
        </div>
        <div className={`ex-battery ${low ? 'low' : ''} ${hud.battery < 10 ? 'crit' : ''}`} title={t('ex.batteryTip')}>
          <div className="ex-bat-head">
            <span>{t('ex.battery')}</span>
            <b>{Math.round(hud.battery)}</b>
            <span className={`ex-rate ${hud.rate >= 0 ? 'up' : 'down'}`}>{hud.rate >= 0 ? '+' : ''}{hud.rate.toFixed(2)}/s</span>
          </div>
          <div className="bar"><i style={{ width: `${hud.battery}%` }} /></div>
          <div className={`ex-zone ${hud.zone}`}>{t(`ex.zone.${hud.zone}` as Key)}</div>
        </div>
      </header>

      <div className="ex-view panel" ref={wrapRef}>
        <canvas ref={canvasRef} className="ex-canvas" aria-label={t('ex.canvasAria')} />
        <div className="ex-scenario">{t('ex.scenario')}</div>
        {flash && playing && !OVERLAY.includes(step.kind) && <div className="ex-toast">{flash}</div>}
        {phase === 'brief' && (
          <div className="ex-overlay">
            <div className="ex-card panel">
              <span className="badge-data game">{t('ex.badge')}</span>
              <h2>{t(def.title)}</h2>
              <p>{t(def.brief, { pct, leak: exp.oxygenLeak ?? 0, reward: exp.rewardResearch ?? 0, deep: ROVER.deepDrain })}</p>
              <ol>{def.steps.map((s, i) => <li key={i}>{stepText(s)}</li>)}</ol>
              <p className="ex-tip">{t('ex.brief.battery', { sun: ROVER.sunDrain, shadow: ROVER.shadowDrain, deep: ROVER.deepDrain, move: ROVER.moveDrain, charge: ROVER.padCharge })}</p>
              <p className="ex-tip">{touchUI ? t('ex.touch.controls') : t('ex.controls')}</p>
              {touchUI && portrait && <p className="ex-tip ex-rotate">{t('ex.touch.rotate')}</p>}
              <div className="ex-actions">
                <button className="btn btn-primary" autoFocus onClick={() => setPhase('play')}>{t('ex.start')}</button>
                <button className="btn" onClick={() => onExit({ success: false, failures })}>{t('ex.later')}</button>
              </div>
            </div>
          </div>
        )}

        {playing && step.kind === 'circuit' && (
          <div className="ex-overlay soft">
            <div className="ex-card panel puzzle">
              <button type="button" className="touch-btn close-btn" aria-label={t('ex.close')} onClick={() => setStep(stepRef.current - 1)}>✕</button>
              <h2>{t('ex.pz.title')}</h2>
              <p className="ex-tip">{t(touchUI ? 'ex.touch.circuit' : 'ex.pz.help', { cost: ROVER.rotateCost })}</p>
              <CircuitView c={circuit} cursor={rotIdx[cursor]} onRotate={(i) => { setCursor(rotIdx.indexOf(i)); rotate(i); }} labels={{ src: t('ex.pz.source'), sink: t('ex.pz.sink') }} />
              {flash ? <div className="ex-flash">{flash}</div> : !touchUI && <p className="ex-tip">{t('ex.pz.close')}</p>}
            </div>
          </div>
        )}

        {playing && step.kind === 'pressure' && (
          <div className="ex-overlay soft">
            <div className="ex-card panel puzzle pressure">
              <button type="button" className="touch-btn close-btn" aria-label={t('ex.close')} onClick={() => { valveDir.current = 0; setStep(stepRef.current - 1); }}>✕</button>
              <h2>{t('ex.o2.pz.title')}</h2>
              <p className="ex-tip">{t('ex.o2.pz.help', { hold: P.hold })}</p>
              <PressureView game={gauges} sel={sel} vent={ventFlash}
                onSelect={(i) => { valveSel.current = i; setSel(i); }}
                onHold={(i, d) => { valveSel.current = i; setSel(i); valveDir.current = d; }}
                labels={{ gauge: t('ex.o2.pz.gauge'), vent: t('ex.o2.pz.vent'), hold: t('ex.o2.pz.hold') }} />
              {flash ? <div className="ex-flash">{flash}</div> : <p className="ex-tip">{t(touchUI ? 'ex.touch.pressure' : 'ex.o2.pz.keys')}</p>}
            </div>
          </div>
        )}

        {paused && (
          <div className="ex-overlay">
            <div className="ex-card panel">
              {confirmRestart ? (
                <>
                  <h2>{t('ex.restartQ')}</h2>
                  <p>{t('ex.restartDesc')}</p>
                  <div className="ex-actions">
                    <button className="btn btn-primary" autoFocus onClick={restart}>{t('ex.restart')}</button>
                    <button className="btn" onClick={() => { setConfirmRestart(false); setPause(false); }}>{t('ex.cancel')}</button>
                  </div>
                </>
              ) : (
                <>
                  <h2>{t('ex.paused')}</h2>
                  <div className="ex-actions col">
                    <button className="btn btn-primary" autoFocus onClick={() => setPause(false)}>{t('ex.resume')}</button>
                    <button className="btn" onClick={() => setConfirmRestart(true)}>{t('ex.restart')}</button>
                    <button className="btn btn-ghost" onClick={() => onExit({ success: false, failures })}>{t('ex.abort')}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {phase === 'success' && (
          <div className="ex-overlay">
            <div className="ex-card panel win">
              <span className="badge-data measured">{t('ex.success')}</span>
              <h2>{t(def.successTitle)}</h2>
              <p className="ex-reward">{t(def.successDesc, { pct, leak: exp.oxygenLeak ?? 0, reward: exp.rewardResearch ?? 0 })}</p>
              <p className="ex-tip">{t('ex.stats', { t: Math.round(hud.time), b: Math.round(hud.battery) })}</p>
              {failures > 0 && <p className="ex-tip">{t(exp.failOxygenCost ? 'ex.o2.failCost' : 'ex.failCost', { n: failures, cost: failures * exp.failEnergyCost, o2: failures * (exp.failOxygenCost ?? 0) })}</p>}
              <div className="ex-actions"><button className="btn btn-primary" autoFocus onClick={() => onExit({ success: true, failures })}>{t('ex.back')}</button></div>
            </div>
          </div>
        )}

        {phase === 'failed' && (
          <div className="ex-overlay">
            <div className="ex-card panel lose">
              <span className="badge-data game">{t('ex.failed')}</span>
              <h2>{t('ex.failedTitle')}</h2>
              <p>{exp.failOxygenCost ? t('ex.o2.failedDesc', { cost: exp.failEnergyCost, o2: exp.failOxygenCost }) : t('ex.failedDesc', { cost: exp.failEnergyCost })}</p>
              <p className="ex-tip">{t('ex.failedLesson')}</p>
              <div className="ex-actions">
                <button className="btn btn-primary" autoFocus onClick={restart}>{t('ex.retry')}</button>
                <button className="btn" onClick={() => onExit({ success: false, failures })}>{t('ex.backFail')}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {touchUI && driving && (
        <div className="ex-controls panel">
          <TouchStick onMove={onStick} label={t('ex.touch.stick')} />
          <button type="button" className="touch-btn pause-btn" aria-label={t('ex.paused')} onClick={() => { onActionUp(); onStick(0, 0); setPause(true); }}>❚❚</button>
          <div className="ex-interact">
            {actionLabel && (
              <ActionButton label={actionLabel} hold={step.kind === 'collect'} progress={hud.drill} onDown={onActionDown} onUp={onActionUp} />
            )}
          </div>
        </div>
      )}

      <footer className="ex-bottom panel">
        <span className="ex-keys">{t('ex.controls')}</span>
        <span className={`ex-prompt ${prompt ? 'show' : ''}`}>{prompt ?? (playing && step.kind === 'circuit' ? t('ex.pz.short') : playing && step.kind === 'pressure' ? t('ex.o2.pz.short') : '')}</span>
        <span className="ex-warn">
          {low && phase !== 'failed' && <b className="crit">{t(hud.battery < 10 ? 'ex.warn.crit' : 'ex.warn.low')}</b>}
          {!low && hud.zone === 'shadow' && <b>{t('ex.warn.shadow')}</b>}
          {!low && hud.zone === 'deep' && <b className="crit">{t('ex.warn.deep', { deep: ROVER.deepDrain })}</b>}
        </span>
      </footer>
    </div>
  );
}

/** Pointer capture keeps a finger's events on its control; it can throw for inactive pointers, which must not block the press. */
function capture(e: React.PointerEvent) {
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer not capturable: events still arrive while over the element */ }
}

/** Virtual joystick (bottom-left). Pointer Events with capture: one finger owns it; others stay free. */
function TouchStick({ onMove, label }: { onMove: (ax: number, ay: number) => void; label: string }) {
  const base = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const owner = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const update = (e: React.PointerEvent) => {
    const b = base.current!.getBoundingClientRect();
    const dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
    const inputRadius = b.width / 2;
    const knobRadius = Math.max(0, (b.width - (handle.current?.offsetWidth ?? 0)) / 2 - 2);
    const v = joystickVector(dx, dy, inputRadius);
    setKnob(knobOffset(dx, dy, knobRadius));
    onMove(v.x, v.y);
  };
  const end = (e?: React.PointerEvent) => {
    if (e && owner.current !== null && e.pointerId !== owner.current) return;
    owner.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  // release on unmount only (callbacks change every render; a dependency here would cancel input 10× a second)
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  useEffect(() => () => moveRef.current(0, 0), []);
  return (
    <div ref={base} className="touch-stick" role="application" aria-label={label}
      onPointerDown={(e) => { if (owner.current !== null) return; owner.current = e.pointerId; capture(e); update(e); }}
      onPointerMove={(e) => { if (e.pointerId === owner.current) update(e); }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <div ref={handle} className="touch-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** Context action button (bottom-right). Tap = E; for drilling, hold = E held, with a progress ring. */
function ActionButton({ label, hold, progress, onDown, onUp }: { label: string; hold: boolean; progress: number; onDown: () => void; onUp: () => void }) {
  const owner = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const up = (e?: React.PointerEvent) => {
    if (e && owner.current !== null && e.pointerId !== owner.current) return;
    owner.current = null; setPressed(false); onUp();
  };
  const upRef = useRef(onUp);
  upRef.current = onUp;
  useEffect(() => () => upRef.current(), []);
  const C = 2 * Math.PI * 44;
  return (
    <button type="button" className={`touch-btn action-btn ${pressed ? 'pressed' : ''} ${hold ? 'hold' : ''}`} aria-label={label}
      onPointerDown={(e) => { if (owner.current !== null) return; owner.current = e.pointerId; capture(e); setPressed(true); onDown(); }}
      onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={(e) => e.preventDefault()}>
      {hold && (
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="44" className="ring-bg" />
          <circle cx="50" cy="50" r="44" className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, progress))} />
        </svg>
      )}
      <span>{label}</span>
    </button>
  );
}

/** Three vertical gauges with target bands; hold ▲/▼ (keys or buttons) to move the selected valve. */
function PressureView({ game, sel, vent, onSelect, onHold, labels }: {
  game: PressureGame; sel: number; vent: number | null;
  onSelect: (i: number) => void; onHold: (i: number, d: -1 | 0 | 1) => void;
  labels: { gauge: string; vent: string; hold: string };
}) {
  const H = 170;
  const y = (v: number) => 10 + (1 - v / 100) * H;
  return (
    <div className="pressure-wrap">
      <div className="gauges">
        {game.gauges.map((gg, i) => {
          const ok = inBand(gg);
          return (
            <div key={i} className={`gauge ${sel === i ? 'sel' : ''} ${ok ? 'ok' : ''} ${vent === i ? 'vent' : ''}`} onClick={() => onSelect(i)}>
              <div className="g-label">{labels.gauge} {i + 1}</div>
              <svg viewBox="0 0 70 190" width="70" height="190" aria-label={`${labels.gauge} ${i + 1}: ${Math.round(gg.p)}`}>
                <rect x="20" y="10" width="30" height={H} className="g-tube" />
                {[0, 20, 40, 60, 80, 100].map((mark) => (
                  <line key={mark} x1="51" x2={mark % 40 === 0 ? 63 : 57} y1={y(mark)} y2={y(mark)} className="g-tick" />
                ))}
                <rect x="20" y={y(gg.band[1])} width="30" height={y(gg.band[0]) - y(gg.band[1])} className="g-band" />
                <rect x="22" y={y(gg.p)} width="26" height={Math.max(0, 10 + H - y(gg.p) - 2)} className="g-fill" />
                <line x1="14" x2="56" y1={y(gg.p)} y2={y(gg.p)} className="g-needle" />
                <polygon points={`6,${y(gg.valve) - 5} 14,${y(gg.valve)} 6,${y(gg.valve) + 5}`} className="g-valve" />
                <line x1="20" x2="50" y1={y(95)} y2={y(95)} className="g-limit" />
              </svg>
              <div className="g-val">{Math.round(gg.p)}</div>
              <div className="g-btns">
                {([1, -1] as const).map((d) => (
                  <button key={d} type="button" className="g-btn" aria-label={`${labels.gauge} ${i + 1} ${d > 0 ? '▲' : '▼'}`}
                    onPointerDown={(e) => { e.preventDefault(); capture(e); onHold(i, d); }}
                    onPointerUp={() => onHold(i, 0)} onPointerCancel={() => onHold(i, 0)} onLostPointerCapture={() => onHold(i, 0)}
                    onContextMenu={(e) => e.preventDefault()}>
                    {d > 0 ? '▲' : '▼'}
                  </button>
                ))}
              </div>
              {vent === i && <div className="g-vent">{labels.vent}</div>}
            </div>
          );
        })}
      </div>
      <div className="g-hold">
        <span>{labels.hold}</span>
        <div className="bar"><i style={{ width: `${Math.min(100, (game.stable / P.hold) * 100)}%` }} /></div>
      </div>
    </div>
  );
}

/** SVG view of the 3×3 circuit. Powered tiles glow; rotatable tiles are yellow and clickable. */
function CircuitView({ c, cursor, onRotate, labels }: { c: Circuit; cursor: number; onRotate: (i: number) => void; labels: { src: string; sink: string } }) {
  const on = powered(c);
  const solved = isSolved(c);
  const S0 = 84, O = 60;
  const seg = (mask: number, cx: number, cy: number) => {
    const h = S0 / 2;
    return [[N, cx, cy - h], [E, cx + h, cy], [S, cx, cy + h], [W, cx - h, cy]]
      .filter(([d]) => mask & (d as number))
      .map(([, x, yy], k) => <line key={k} x1={cx} y1={cy} x2={x as number} y2={yy as number} />);
  };
  return (
    <svg className={`circuit ${solved ? 'solved' : ''}`} viewBox={`0 0 ${O * 2 + S0 * 3} ${S0 * 3 + 20}`} role="group">
      <text x={O / 2} y={S0 * 1.5 - 22} textAnchor="middle" className="cz-label">{labels.src}</text>
      <line x1={8} y1={S0 * 1.5} x2={O} y2={S0 * 1.5} className="cz-wire on" />
      <line x1={8} y1={S0 * 1.5} x2={O} y2={S0 * 1.5} className="cz-flow-wire" />
      <text x={O * 1.5 + S0 * 3} y={S0 * 2.5 - 22} textAnchor="middle" className="cz-label">{labels.sink}</text>
      <line x1={O + S0 * 3} y1={S0 * 2.5} x2={O * 2 + S0 * 3 - 8} y2={S0 * 2.5} className={`cz-wire ${solved ? 'on' : ''}`} />
      {solved && <line x1={O + S0 * 3} y1={S0 * 2.5} x2={O * 2 + S0 * 3 - 8} y2={S0 * 2.5} className="cz-flow-wire" />}
      {c.tiles.map((tile, i) => {
        const r = Math.floor(i / 3), col = i % 3;
        const x = O + col * S0, yy = r * S0;
        return (
          <g key={i} className={`cz-tile ${tile.rotatable ? 'rot' : ''} ${on.has(i) ? 'on' : ''} ${cursor === i ? 'sel' : ''}`}
            onClick={() => tile.rotatable && onRotate(i)} role={tile.rotatable ? 'button' : undefined} tabIndex={-1}>
            <rect x={x + 3} y={yy + 3} width={S0 - 6} height={S0 - 6} className="cz-board" />
            {tile.rotatable && (
              <>
                <rect x={x + 7} y={yy + 7} width="5" height="5" className="cz-screw" />
                <rect x={x + S0 - 12} y={yy + S0 - 12} width="5" height="5" className="cz-screw" />
              </>
            )}
            <g className="cz-path">{seg(tile.mask, x + S0 / 2, yy + S0 / 2)}</g>
            {on.has(i) && <g className="cz-flow" aria-hidden>{seg(tile.mask, x + S0 / 2, yy + S0 / 2)}</g>}
            {tile.mask !== 0 && <rect x={x + S0 / 2 - 6} y={yy + S0 / 2 - 6} width="12" height="12" className="cz-contact" />}
          </g>
        );
      })}
    </svg>
  );
}
