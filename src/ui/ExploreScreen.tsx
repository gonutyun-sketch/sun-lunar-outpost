/**
 * Rover exploration mode (Canvas 2D). Self-contained: owns its own loop and input,
 * and reports { success, failures } back to the base game on exit.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MISSION } from '../game/config';
import { useI18n } from '../i18n/I18n';
import type { Key } from '../i18n/translate';
import { createCircuit, isSolved, powered, rotateTile, N, E, S, W, type Circuit } from '../rover/circuit';
import { drawFrame, type Particle } from '../rover/render';
import { createRover, dist, ROVER, stepRover, type Input, type Rover } from '../rover/sim';
import { MAP } from '../rover/world';

type Phase = 'brief' | 'goto' | 'repair' | 'return' | 'success' | 'failed';

interface Props {
  missionId: string;
  onExit: (result: { success: boolean; failures: number }) => void;
  fx: boolean;
}

interface Hud {
  battery: number;
  rate: number;
  zone: 'sun' | 'shadow' | 'charge';
  near: boolean;
  time: number;
}

const STEPS: Phase[] = ['goto', 'repair', 'return'];

export function ExploreScreen({ missionId, onExit, fx }: Props) {
  const { t } = useI18n();
  const exp = MISSION.expeditions.find((e) => e.id === missionId)!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rover = useRef<Rover>(createRover(MAP));
  const input = useRef<Input>({ up: false, down: false, left: false, right: false });
  const particles = useRef<Particle[]>([]);
  const shake = useRef(0);
  const time = useRef(0);
  const [phase, setPhase] = useState<Phase>('brief');
  const phaseRef = useRef<Phase>('brief');
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [failures, setFailures] = useState(0);
  const [circuit, setCircuit] = useState<Circuit>(createCircuit);
  const [cursor, setCursor] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({ battery: ROVER.batteryStart, rate: 0, zone: 'sun', near: false, time: 0 });
  // Development-only hook for automated play-testing (read-only rover position). Not present in production builds.
  if (import.meta.env.DEV) (window as unknown as { __rover?: unknown }).__rover = rover;

  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const setPause = (v: boolean) => { pausedRef.current = v; setPaused(v); };
  const rotIdx = circuit.tiles.map((tt, i) => (tt.rotatable ? i : -1)).filter((i) => i >= 0);

  const target = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'goto' || p === 'repair') return MAP.sites.solarB;
    if (p === 'return') return MAP.sites.dock;
    return null;
  }, []);

  const restart = useCallback(() => {
    rover.current = createRover(MAP);
    particles.current = [];
    time.current = 0;
    setCircuit(createCircuit());
    setCursor(0);
    setConfirmRestart(false);
    setPause(false);
    go('goto');
  }, []);

  const interact = useCallback(() => {
    const p = phaseRef.current;
    const tg = target();
    if (!tg || dist(rover.current, tg) > tg.r) return;
    if (p === 'goto') { go('repair'); rover.current = { ...rover.current, vx: 0, vy: 0 }; }
    else if (p === 'return') go('success');
  }, [target]);

  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;
  const rotate = useCallback((i: number) => {
    if (phaseRef.current !== 'repair') return;
    const c = circuitRef.current;
    if (isSolved(c)) return;
    const n = rotateTile(c, i);
    if (n === c) return;
    circuitRef.current = n;
    setCircuit(n);
    rover.current = { ...rover.current, battery: Math.max(0, rover.current.battery - ROVER.rotateCost) };
    if (isSolved(n)) {
      setFlash(t('ex.pz.solved'));
      setTimeout(() => { setFlash(null); if (phaseRef.current === 'repair') go('return'); }, 1100);
    }
  }, [t]);

  // ---------- keyboard ----------
  useEffect(() => {
    const keymap: Record<string, keyof Input> = {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    };
    const down = (e: KeyboardEvent) => {
      const p = phaseRef.current;
      if (p === 'brief' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE')) { e.preventDefault(); go('goto'); return; }
      if (e.code === 'Escape') {
        e.preventDefault();
        if (confirmRestartRef.current) { setConfirmRestart(false); return; }
        if (p === 'repair' && !pausedRef.current) { go('goto'); return; }
        if (p === 'goto' || p === 'return') setPause(!pausedRef.current);
        return;
      }
      if (e.code === 'KeyR' && p !== 'brief' && p !== 'success') { e.preventDefault(); setConfirmRestart(true); setPause(true); return; }
      if (pausedRef.current) return;
      if (p === 'repair') {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); setCursor((c) => (c + rotIdxRef.current.length - 1) % rotIdxRef.current.length); }
        if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'ArrowDown' || e.code === 'KeyS') { e.preventDefault(); setCursor((c) => (c + 1) % rotIdxRef.current.length); }
        if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); rotate(rotIdxRef.current[cursorRef.current]); }
        if (/^Digit[1-3]$/.test(e.code)) rotate(rotIdxRef.current[Number(e.code.slice(5)) - 1]);
        return;
      }
      const k = keymap[e.code];
      if (k) { e.preventDefault(); input.current[k] = true; }
      if (e.code === 'KeyE') { e.preventDefault(); interact(); }
    };
    const up = (e: KeyboardEvent) => { const k = keymap[e.code]; if (k) input.current[k] = false; };
    const blur = () => { input.current = { up: false, down: false, left: false, right: false }; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [interact, rotate]);
  const confirmRestartRef = useRef(false);
  confirmRestartRef.current = confirmRestart;
  const rotIdxRef = useRef(rotIdx);
  rotIdxRef.current = rotIdx;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  // ---------- game loop ----------
  const solvedRef = useRef(false);
  solvedRef.current = isSolved(circuit);
  useEffect(() => {
    const cv = canvasRef.current!, g = cv.getContext('2d')!;
    let raf = 0, last = performance.now(), hudTimer = 0;
    const labels = {
      shadow: t('ex.map.shadow'), dock: t('ex.map.dock'), charger: t('ex.map.charger'), solarB: t('ex.map.solarB'),
      base: t('ex.map.base'), oxygen: t('ex.map.oxygen'), samples: t('ex.map.samples'),
    };
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = phaseRef.current;
      const active = (p === 'goto' || p === 'repair' || p === 'return') && !pausedRef.current;
      let res = { inShadow: false, charging: false, moving: false, rate: 0, bumped: false };
      if (active) {
        const r = stepRover(MAP, rover.current, input.current, dt, p === 'repair');
        rover.current = r.rover;
        res = r;
        time.current += dt;
        if (r.bumped && Math.hypot(r.rover.vx, r.rover.vy) > 40) shake.current = Math.min(6, shake.current + 3);
        if (r.moving && fx && Math.random() < 0.6) {
          const back = r.rover.angle + Math.PI;
          particles.current.push({ x: r.rover.x + Math.cos(back) * 20, y: r.rover.y + Math.sin(back) * 20, vx: Math.cos(back) * 20 + (Math.random() - 0.5) * 30, vy: Math.sin(back) * 20 + (Math.random() - 0.5) * 30, life: 1 });
        }
        if (r.rover.battery <= 0) { go('failed'); setFailures((f) => f + 1); }
      } else {
        const r = stepRover(MAP, rover.current, { up: false, down: false, left: false, right: false }, 0, true);
        res = r;
      }
      particles.current = particles.current.filter((q) => (q.life -= dt * 1.4) > 0).map((q) => ({ ...q, x: q.x + q.vx * dt, y: q.y + q.vy * dt }));
      shake.current = fx ? Math.max(0, shake.current - dt * 20) : 0;

      // size canvas to its box (device pixels)
      const box = wrapRef.current!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(box.width * dpr) || cv.height !== Math.round(box.height * dpr)) {
        cv.width = Math.round(box.width * dpr);
        cv.height = Math.round(box.height * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tg = target();
      const near = !!tg && dist(rover.current, tg) <= tg.r;
      drawFrame(g, box.width, box.height, MAP, rover.current, {
        t: now / 1000, target: tg, targetNear: near, solarRepaired: solvedRef.current, inShadow: res.inShadow,
        shake: shake.current, particles: particles.current, labels,
      });
      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        setHud({ battery: rover.current.battery, rate: res.rate, zone: res.charging ? 'charge' : res.inShadow ? 'shadow' : 'sun', near, time: time.current });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [t, target, fx]);

  const stepIndex = Math.max(0, STEPS.indexOf(phase === 'success' ? 'return' : phase === 'failed' || phase === 'brief' ? 'goto' : phase));
  const objective = phase === 'goto' ? t('ex.obj.goto') : phase === 'repair' ? t('ex.obj.repair') : phase === 'return' ? t('ex.obj.return') : '';
  const prompt = hud.near && !paused
    ? phase === 'goto' ? t('ex.prompt.repair') : phase === 'return' ? t('ex.prompt.dock') : null
    : null;
  const low = hud.battery < 25;
  const pct = Math.round((exp.solarMult ?? 1) * 100);

  return (
    <div className={`explore screen ${fx ? '' : 'no-fx'}`}>
      <header className="ex-top panel">
        <div className="ex-mission">
          <span className="tag">{t('ex.badge')}</span>
          <h1>{t(`ex.mission.${missionId}` as Key)}</h1>
          <div className="ex-obj">{objective}</div>
        </div>
        <div className="ex-steps" aria-label={t('ex.progress')}>
          {STEPS.map((s, i) => (
            <span key={s} className={`ex-step ${i < stepIndex || phase === 'success' ? 'done' : i === stepIndex ? 'now' : ''}`}>{i + 1}. {t(`ex.step.${s}` as Key)}</span>
          ))}
        </div>
        <div className={`ex-battery ${low ? 'low' : ''}`} title={t('ex.batteryTip')}>
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

        {phase === 'brief' && (
          <div className="ex-overlay">
            <div className="ex-card panel">
              <span className="badge-data game">{t('ex.badge')}</span>
              <h2>{t(`ex.mission.${missionId}` as Key)}</h2>
              <p>{t('ex.brief.solarRepair', { pct })}</p>
              <ol>
                <li>{t('ex.obj.goto')}</li>
                <li>{t('ex.obj.repair')}</li>
                <li>{t('ex.obj.return')}</li>
              </ol>
              <p className="ex-tip">{t('ex.brief.battery', { sun: ROVER.sunCharge, shadow: ROVER.shadowDrain, move: ROVER.moveDrain })}</p>
              <p className="ex-tip">{t('ex.controls')}</p>
              <div className="ex-actions">
                <button className="btn btn-primary" autoFocus onClick={() => go('goto')}>{t('ex.start')}</button>
                <button className="btn" onClick={() => onExit({ success: false, failures })}>{t('ex.later')}</button>
              </div>
            </div>
          </div>
        )}

        {phase === 'repair' && (
          <div className="ex-overlay soft">
            <div className="ex-card panel puzzle">
              <h2>{t('ex.pz.title')}</h2>
              <p className="ex-tip">{t('ex.pz.help', { cost: ROVER.rotateCost })}</p>
              <CircuitView c={circuit} cursor={rotIdx[cursor]} onRotate={(i) => { setCursor(rotIdx.indexOf(i)); rotate(i); }} labels={{ src: t('ex.pz.source'), sink: t('ex.pz.sink') }} />
              {flash ? <div className="ex-flash">{flash}</div> : <p className="ex-tip">{t('ex.pz.close')}</p>}
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
              <h2>{t('ex.successTitle')}</h2>
              <p className="ex-reward">{t('ex.successDesc', { pct })}</p>
              <p className="ex-tip">{t('ex.stats', { t: Math.round(hud.time), b: Math.round(hud.battery) })}</p>
              {failures > 0 && <p className="ex-tip">{t('ex.failCost', { n: failures, cost: failures * exp.failEnergyCost })}</p>}
              <div className="ex-actions"><button className="btn btn-primary" autoFocus onClick={() => onExit({ success: true, failures })}>{t('ex.back')}</button></div>
            </div>
          </div>
        )}

        {phase === 'failed' && (
          <div className="ex-overlay">
            <div className="ex-card panel lose">
              <span className="badge-data game">{t('ex.failed')}</span>
              <h2>{t('ex.failedTitle')}</h2>
              <p>{t('ex.failedDesc', { cost: exp.failEnergyCost })}</p>
              <p className="ex-tip">{t('ex.failedLesson')}</p>
              <div className="ex-actions">
                <button className="btn btn-primary" autoFocus onClick={restart}>{t('ex.retry')}</button>
                <button className="btn" onClick={() => onExit({ success: false, failures })}>{t('ex.backFail')}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="ex-bottom panel">
        <span className="ex-keys">{t('ex.controls')}</span>
        <span className={`ex-prompt ${prompt ? 'show' : ''}`}>{prompt ?? (phase === 'repair' ? t('ex.pz.short') : '')}</span>
        <span className="ex-warn">
          {low && phase !== 'failed' && <b className="crit">{t('ex.warn.low')}</b>}
          {!low && hud.zone === 'shadow' && <b>{t('ex.warn.shadow')}</b>}
        </span>
      </footer>
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
      .map(([, x, y], k) => <line key={k} x1={cx} y1={cy} x2={x as number} y2={y as number} />);
  };
  return (
    <svg className="circuit" viewBox={`0 0 ${O * 2 + S0 * 3} ${S0 * 3 + 20}`} role="group">
      <text x={O / 2} y={S0 * 1.5 - 22} textAnchor="middle" className="cz-label">{labels.src}</text>
      <line x1={8} y1={S0 * 1.5} x2={O} y2={S0 * 1.5} className="cz-wire on" />
      <text x={O * 1.5 + S0 * 3} y={S0 * 2.5 - 22} textAnchor="middle" className="cz-label">{labels.sink}</text>
      <line x1={O + S0 * 3} y1={S0 * 2.5} x2={O * 2 + S0 * 3 - 8} y2={S0 * 2.5} className={`cz-wire ${solved ? 'on' : ''}`} />
      {c.tiles.map((tile, i) => {
        const r = Math.floor(i / 3), col = i % 3;
        const x = O + col * S0, y = r * S0;
        return (
          <g key={i} className={`cz-tile ${tile.rotatable ? 'rot' : ''} ${on.has(i) ? 'on' : ''} ${cursor === i ? 'sel' : ''}`}
            onClick={() => tile.rotatable && onRotate(i)} role={tile.rotatable ? 'button' : undefined} tabIndex={-1}>
            <rect x={x + 3} y={y + 3} width={S0 - 6} height={S0 - 6} rx={8} />
            <g className="cz-path">{seg(tile.mask, x + S0 / 2, y + S0 / 2)}</g>
            {tile.mask !== 0 && <circle cx={x + S0 / 2} cy={y + S0 / 2} r={6} />}
          </g>
        );
      })}
    </svg>
  );
}
