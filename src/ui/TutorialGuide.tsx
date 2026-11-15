import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18n';
import type { Key, Lang, Params } from '../i18n/translate';
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

type Edges = { left: number; top: number; right: number; bottom: number };
const clipping = /^(auto|scroll|hidden|clip)$/;
const padding = 3;

function visibleArea(host: DOMRect, ancestors: HTMLElement[]): Edges {
  const view = window.visualViewport;
  const clip: Edges = {
    left: Math.max(host.left, view?.offsetLeft ?? 0),
    top: Math.max(host.top, view?.offsetTop ?? 0),
    right: Math.min(host.right, view ? view.offsetLeft + view.width : window.innerWidth),
    bottom: Math.min(host.bottom, view ? view.offsetTop + view.height : window.innerHeight),
  };
  for (const parent of ancestors) {
    const css = getComputedStyle(parent);
    const clipX = clipping.test(css.overflowX), clipY = clipping.test(css.overflowY);
    if ((!clipX && !clipY) || !parent.offsetWidth || !parent.offsetHeight) continue;
    const rect = parent.getBoundingClientRect();
    const scaleX = rect.width / parent.offsetWidth, scaleY = rect.height / parent.offsetHeight;
    const x = rect.left + parent.clientLeft * scaleX, y = rect.top + parent.clientTop * scaleY;
    if (clipX) {
      clip.left = Math.max(clip.left, x);
      clip.right = Math.min(clip.right, x + parent.clientWidth * scaleX);
    }
    if (clipY) {
      clip.top = Math.max(clip.top, y);
      clip.bottom = Math.min(clip.bottom, y + parent.clientHeight * scaleY);
    }
  }
  return clip;
}

function clipBehind(clip: Edges, rect: DOMRect, element: Element | null) {
  const cover = element?.getBoundingClientRect();
  if (!cover || rect.right <= cover.left || rect.left >= cover.right || rect.top >= cover.bottom || rect.bottom <= cover.top) return;
  if (cover.top - rect.top >= rect.bottom - cover.bottom) clip.bottom = Math.min(clip.bottom, cover.top);
  else clip.top = Math.max(clip.top, cover.bottom);
}

function isMoving(element: Element) {
  return element.getAnimations?.().some(animation =>
    (animation.pending || animation.playState === 'running') &&
    Number.isFinite(animation.effect?.getComputedTiming().endTime),
  );
}

/** The portal and the measured target both use viewport coordinates. The outline never receives input. */
function Spotlight({ scope, card, name, reveal, lang }: {
  scope: RefObject<HTMLElement>;
  card: RefObject<HTMLElement>;
  name: string;
  reveal: boolean;
  lang: Lang;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const outline = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scope.current, host = layer.current, ring = outline.current;
    if (!root || !host || !ring) return;
    let frame = 0;
    let needsReveal = reveal;
    let target: Element | null = null;
    let parent: Element | null = null;
    let ancestors: HTMLElement[] = [];
    let dock: Element | null = null;
    const viewport = window.visualViewport;
    const selector = `[data-tutorial-target="${name}"]`;

    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    const sizes = new ResizeObserver(schedule);

    function update() {
      frame = 0;
      if (!root || !host || !ring) return;
      const next = root.querySelector(selector);
      const nextParent = next?.parentElement ?? null;
      const nextDock = root.querySelector('[data-tutorial-dock]');
      if (next !== target || nextParent !== parent || nextDock !== dock) {
        target = next;
        parent = nextParent;
        dock = nextDock;
        ancestors = [];
        for (let node = parent; node && node !== document.body; node = node.parentElement) {
          if (node instanceof HTMLElement) ancestors.push(node);
        }
        sizes.disconnect();
        for (const element of new Set([root, target, card.current, dock, ...ancestors])) {
          if (element) sizes.observe(element);
        }
      }
      if (!target) { ring.hidden = true; return; }

      // Resizing misses translation-only animations, including the entrance of the circuit panel.
      if (isMoving(target) || ancestors.some(isMoving)) schedule();
      const rect = target.getBoundingClientRect();
      const origin = host.getBoundingClientRect();
      if (!rect.width || !rect.height || !origin.width || !origin.height || getComputedStyle(target).visibility !== 'visible') {
        ring.hidden = true;
        return;
      }

      const clip = visibleArea(origin, ancestors);
      if (!dock?.contains(target)) clipBehind(clip, rect, dock);
      if (!card.current?.contains(target)) clipBehind(clip, rect, card.current);
      if (needsReveal) {
        needsReveal = false;
        if (rect.top < clip.top || rect.bottom > clip.bottom || rect.left < clip.left || rect.right > clip.right) {
          target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          schedule();
          return;
        }
      }
      if (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom) {
        ring.hidden = true;
        return;
      }

      // A clipped control keeps the same outline and only its hidden portion is masked.
      const sx = host.clientWidth / origin.width, sy = host.clientHeight / origin.height;
      const left = rect.left - padding / sx, top = rect.top - padding / sy;
      const right = rect.right + padding / sx, bottom = rect.bottom + padding / sy;
      const insets = [
        Math.max(0, (clip.top - top) * sy), Math.max(0, (right - clip.right) * sx),
        Math.max(0, (bottom - clip.bottom) * sy), Math.max(0, (clip.left - left) * sx),
      ];
      const inset = insets.some(n => n > 0) ? `inset(${insets.map(n => `${n}px`).join(' ')})` : 'none';
      const style = `left:${(left - origin.left) * sx}px;top:${(top - origin.top) * sy}px;` +
        `width:${(right - left) * sx}px;height:${(bottom - top) * sy}px;clip-path:${inset}`;
      if (ring.getAttribute('style') !== style) ring.setAttribute('style', style);
      ring.hidden = false;
    }

    const changes = new MutationObserver(schedule);
    changes.observe(root, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-expanded', 'data-tutorial-target'],
    });
    const motion = ['animationstart', 'animationend', 'transitionrun', 'transitionend'];
    for (const event of motion) window.addEventListener(event, schedule, true);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    viewport?.addEventListener('resize', schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      changes.disconnect();
      for (const event of motion) window.removeEventListener(event, schedule, true);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      viewport?.removeEventListener('resize', schedule);
      document.fonts?.removeEventListener('loadingdone', schedule);
    };
  }, [scope, card, name, reveal, lang]);

  return createPortal(
    <div ref={layer} className="tutorial-spot-layer" aria-hidden>
      <div ref={outline} className="tutorial-spot" hidden><i /></div>
    </div>,
    document.body,
  );
}

export function TutorialGuide({ message, scope, onPause, onSkip, reveal = false }: {
  message: GuideMessage;
  scope: RefObject<HTMLElement>;
  onPause?: () => void;
  onSkip?: () => void;
  reveal?: boolean;
}) {
  const { lang, t } = useI18n();
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
      {message.target && <Spotlight key={message.target} scope={scope} card={ref} name={message.target} reveal={reveal} lang={lang} />}
    </section>
  );
}
