import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { audio } from '../audio/engine';
import { useI18n } from '../i18n/I18n';

/** Current sound settings, re-rendered whenever they change anywhere in the game. */
export function useSoundSettings() {
  return useSyncExternalStore((f) => audio.subscribe(f), () => audio.settings, () => audio.settings);
}

function Speaker({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" shapeRendering="crispEdges" aria-hidden>
      <path fill="currentColor" d="M2 6h3l4-3h1v10H9L5 10H2z" />
      {on ? <path fill="currentColor" d="M11 6h1v4h-1zm2-2h1v8h-1z" /> : <path fill="currentColor" d="M11 5h1v1h1v1h1v2h-1v1h-1v1h-1v-1h1V9h1V7h-1V6h-1zm3 0h1v1h-1zm0 5h1v1h-1z" />}
    </svg>
  );
}

/** Speaker button + small settings panel (sound on/off, effects volume). Saved automatically. */
export function SoundControl({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const s = useSoundSettings();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc, true);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  const audibleLevel = s.volume || (s.music ? s.musicVolume : 0);
  const muted = !s.on || audibleLevel === 0;
  return (
    <div ref={box} className={`sound-control ${className}`}>
      <button type="button" className="icon-btn sound-btn" aria-expanded={open} aria-haspopup="dialog"
        title={t('sound.title')} aria-label={`${t('sound.title')}: ${muted ? t('sound.off') : `${audibleLevel}%`}`} onClick={() => setOpen(!open)}>
        <Speaker on={!muted} /><span className="sound-label">{muted ? t('sound.off') : `${audibleLevel}%`}</span>
      </button>
      {open && (
        <div className="sound-panel" role="dialog" aria-label={t('sound.title')}>
          <div className="sound-row">
            <span>{t('sound.title')}</span>
            <button type="button" role="switch" aria-checked={s.on} data-sfx="custom" className={`sound-switch ${s.on ? 'on' : ''}`}
              onClick={() => { audio.unlock(); audio.setSettings({ on: !s.on }); if (!s.on) audio.play('confirm'); }}>
              {t(s.on ? 'sound.on' : 'sound.off')}
            </button>
          </div>
          <label className="sound-row sound-volume">
            <span>{t('sound.volume')}</span>
            <input type="range" min={0} max={100} step={5} value={s.volume} disabled={!s.on} aria-valuetext={`${s.volume}%`}
              onChange={(e) => audio.setSettings({ volume: Number(e.target.value) })}
              onPointerUp={() => audio.play('select')} onKeyUp={() => audio.play('select')} />
            <b>{s.volume}%</b>
          </label>
          <div className="sound-row">
            <span>{t('sound.music')}</span>
            <button type="button" role="switch" aria-checked={s.music} data-sfx="custom" disabled={!s.on} className={`sound-switch ${s.music && s.on ? 'on' : ''}`}
              onClick={() => { audio.unlock(); audio.setSettings({ music: !s.music }); audio.play('select'); }}>
              {t(s.music ? 'sound.on' : 'sound.off')}
            </button>
          </div>
          <label className="sound-row sound-volume">
            <span>{t('sound.musicVolume')}</span>
            <input type="range" min={0} max={100} step={5} value={s.musicVolume} disabled={!s.on || !s.music} aria-valuetext={`${s.musicVolume}%`}
              onChange={(e) => audio.setSettings({ musicVolume: Number(e.target.value) })} />
            <b>{s.musicVolume}%</b>
          </label>
          <p className="sound-note">{t('sound.note')}</p>
        </div>
      )}
    </div>
  );
}
