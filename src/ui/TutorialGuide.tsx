import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18n';
import type { Key, Params } from '../i18n/translate';
import { AstronautGuide, type GuideMood } from './AstronautGuide';

type GuideAction = { label: Key; run: () => void };

export interface GuideMessage {
  id: string;
  title: Key;
  body: Key;
  params?: Params;
  target?: string;
  stage?: readonly [number, number];
  mood?: GuideMood;
  action?: GuideAction;
}

interface Bounds { left: number; top: number; width: number; height: number }

/** A pointer-transparent outline following the real element, including inside scroll panels. */
function Spotlight({ scope, card, name, reveal }: {
  scope: RefObject<HTMLElement>;
  card: RefObject<HTMLElement>;
  name: string;
  reveal: boolean;
}) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  useEffect(() => {
    const root = scope.current;
    const target = root?.querySelector(`[data-tutorial-target="${name}"]`);
    if (!root || !target) return;
    const dock = root.querySelector('[data-tutorial-dock]');
    const scrollParents: Element[] = [];
    for (let el = target.parentElement; el && el !== document.body; el = el.parentElement) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(el).overflowY)) scrollParents.push(el);
    }
    let frame = 0;
    let initial = true;
    const update = () => {
      const rect = target.getBoundingClientRect();
      const panel = card.current?.getBoundingClientRect();
      const bottomBar = dock?.getBoundingClientRect();
      let top = 2, bottom = window.innerHeight - 2;
      let left = 2, right = window.innerWidth - 2;
      for (const parent of scrollParents) {
        const r = parent.getBoundingClientRect();
        top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom);
        left = Math.max(left, r.left); right = Math.min(right, r.right);
      }
      if (bottomBar && !dock?.contains(target) && bottomBar.bottom >= window.innerHeight - 2 && rect.right > bottomBar.left && rect.left < bottomBar.right) {
        bottom = Math.min(bottom, bottomBar.top);
      }
      if (panel && rect.right > panel.left && rect.left < panel.right && rect.top < panel.bottom && rect.bottom > panel.top) {
        if (rect.top + rect.height / 2 >= panel.top) top = Math.max(top, panel.bottom + 5);
        else bottom = Math.min(bottom, panel.top - 5);
      }
      if (initial && reveal) {
        initial = false;
        if (rect.top < top + 2 || rect.bottom > bottom - 2) {
          target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          frame = requestAnimationFrame(update);
          return;
        }
      }
      const x = Math.max(left, rect.left - 3), y = Math.max(top, rect.top - 3);
      const width = Math.min(right, rect.right + 3) - x, height = Math.min(bottom, rect.bottom + 3) - y;
      const next = width > 10 && height > 10 ? { left: x, top: y, width, height } : null;
      setBounds((old) => old?.left === next?.left && old?.top === next?.top && old?.width === next?.width && old?.height === next?.height ? old : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    schedule();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : undefined;
    for (const el of [root, target, card.current, dock, ...scrollParents]) if (el) observer?.observe(el);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [scope, card, name, reveal]);
  return bounds && createPortal(<div className="tutorial-spot" style={bounds} aria-hidden><i /></div>, document.body);
}

export function TutorialGuide({ message, scope, onPause, onSkip, reveal = false }: {
  message: GuideMessage;
  scope: RefObject<HTMLElement>;
  onPause?: () => void;
  onSkip?: () => void;
  reveal?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const mood = message.mood ?? 'ready';
  return (
    <section ref={ref} className={`tutorial-guide mood-${mood}`} aria-label={t('tut.guide')} data-guide-step={message.id}>
      <AstronautGuide mood={mood} />
      <div className="tutorial-copy" role="status" aria-atomic="true">
        <div className="tutorial-meta">
          <span aria-hidden>{mood === 'happy' ? '✓' : mood === 'caution' ? '!' : '◆'}</span>
          {message.stage ? t('tut.progress', { n: message.stage[0], total: message.stage[1] }) : t('tut.guide')}
        </div>
        <strong>{t(message.title, message.params)}</strong>
        <p>{t(message.body, message.params)}</p>
      </div>
      {(message.action || onPause || onSkip) && (
        <div className="tutorial-actions">
          {message.action && <button type="button" className="btn tutorial-action" onClick={message.action.run}>{t(message.action.label)}</button>}
          {onPause && <button type="button" className="tutorial-link" onClick={onPause}>{t('tut.pause')}</button>}
          {onSkip && <button type="button" className="tutorial-link" onClick={onSkip}>{t('tut.skip')}</button>}
        </div>
      )}
      {message.target && <Spotlight key={message.target} scope={scope} card={ref} name={message.target} reveal={reveal} />}
    </section>
  );
}
