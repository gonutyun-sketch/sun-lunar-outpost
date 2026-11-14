import { useEffect, useRef } from 'react';
import { drawOutpost, drawOutpostLights, OUTPOST_HEIGHT, OUTPOST_WIDTH, outpostLabels, type OutpostState } from '../art/outpost';
import type { FacilityId } from '../game/types';
import { useI18n } from '../i18n/I18n';

interface Props {
  state: OutpostState;
  shift?: number;
  highlight?: FacilityId | null;
  fx?: boolean;
}

const artIds = Object.keys(outpostLabels) as (keyof typeof outpostLabels)[];

export function BaseScene({ state, shift, highlight, fx = true }: Props) {
  const { t } = useI18n();
  const scene = useRef<HTMLCanvasElement>(null);
  const lights = useRef<HTMLCanvasElement>(null);
  const preview = shift === undefined;

  useEffect(() => {
    const g = scene.current?.getContext('2d', { alpha: false });
    if (g) drawOutpost(g, state);
  }, [state]);

  useEffect(() => {
    const canvas = lights.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer = 0;
    let visible = true;
    const draw = () => {
      const motion = fx && !reduced.matches;
      drawOutpostLights(g, state, Math.floor(performance.now() / 125), motion, highlight);
    };
    const sync = () => {
      window.clearInterval(timer);
      if (document.hidden || !visible) return;
      draw();
      if (fx && !reduced.matches) timer = window.setInterval(draw, 125);
    };
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer?.observe(canvas);
    reduced.addEventListener?.('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      window.clearInterval(timer);
      observer?.disconnect();
      reduced.removeEventListener?.('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [fx, state, highlight]);

  const pct = Math.round(state.sunlight * 100);
  return (
    <div className={`outpost-view ${preview ? 'outpost-preview' : ''}`} aria-hidden={preview || undefined}>
      <div className="outpost-frame">
        <canvas className="outpost-art" ref={scene} width={OUTPOST_WIDTH} height={OUTPOST_HEIGHT}
          role={preview ? undefined : 'img'} aria-label={preview ? undefined : t('scene.aria', { n: shift, pct })} />
        <canvas className="outpost-art" ref={lights} width={OUTPOST_WIDTH} height={OUTPOST_HEIGHT} aria-hidden />
        {!preview && artIds.map((id) => {
          const [x, y] = outpostLabels[id];
          const on = id === 'habitat' ? !state.habitatOffline : id === 'solar' ? state.sunlight >= 0.5 && !state.dust : state.facilities[id];
          const fault = id === 'solar' ? state.solarFault : id === 'oxygen' ? state.oxygenFault : id === 'greenhouse' ? state.pumpFault
            : id === 'habitat' ? state.habitatOffline : id === 'shelter' && state.radiation;
          return (
            <span key={id} className={`outpost-name ${on ? 'is-on' : ''} ${fault ? 'is-fault' : ''} ${highlight === id ? 'is-focused' : ''}`}
              style={{ left: `${x / OUTPOST_WIDTH * 100}%`, top: `${y / OUTPOST_HEIGHT * 100}%` }}>
              {t(`scene.${id}`, { pct })}
            </span>
          );
        })}
      </div>
    </div>
  );
}
