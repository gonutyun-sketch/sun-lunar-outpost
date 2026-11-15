import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { MISSION } from '../game/config';
import { computeScore, totalSolarWithSiteFraction } from '../game/engine';
import { missionSummary, missionTitle, takeaways } from '../game/debrief';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_IDS, missionFor, type DifficultyId } from '../game/difficulty';
import type { GameState, MissionConfig, Resources } from '../game/types';
import { LangToggle, useI18n } from '../i18n/I18n';
import type { Key } from '../i18n/translate';
import type { OutpostState } from '../art/outpost';
import { paintLunarBackdrop } from '../art/lunarBackdrop';
import { BaseScene } from './BaseScene';
import { SoundControl } from './SoundControl';
import { AstronautGuide } from './AstronautGuide';
import { DifficultyBadge } from './MissionScreen';

export function LunarBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = canvas.current?.getContext('2d', { alpha: false });
    if (g) paintLunarBackdrop(g);
  }, []);
  return <canvas ref={canvas} className="lunar-backdrop" width={416} height={234} aria-hidden />;
}

/* ---------------- Main menu ---------------- */
export interface SaveSlot { shift: number; total: number; finished: boolean; difficulty: DifficultyId }

const menuOutpost: OutpostState = {
  facilities: { oxygen: true, greenhouse: true, shelter: false, lab: true },
  sunlight: 0.91,
  battery: 0.72,
  upgrades: { solar: false, oxygen: false, battery: false },
};

export function MainMenu({ onStart, onHow, onCredits, onPractice, onContinue, slot, notice, fx }: {
  onStart: () => void; onHow: () => void; onCredits: () => void; onPractice: () => void;
  /** Present when a saved game exists. */
  onContinue?: () => void; slot?: SaveSlot | null;
  /** One-off message about the save (cleared damaged save, interrupted expedition). */
  notice?: string | null;
  fx: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="screen menu">
      <div className="menu-lang menu-corner"><LangToggle /><SoundControl /></div>
      <div className="menu-art"><BaseScene state={menuOutpost} fx={fx} /></div>
      <div className="menu-content">
        <div className="kicker">{t('menu.kicker')}</div>
        <h1><span className="sun">SUN:</span> Lunar Outpost</h1>
        {t('menu.titleSub') && <div className="title-sub">{t('menu.titleSub')}</div>}
        <p className="sub">{t('menu.sub')}</p>
        <div className="menu-buttons">
          {onContinue && slot ? (
            <>
              <button className="btn btn-primary btn-continue" onClick={onContinue} autoFocus>
                {t('save.continue')}
                <small>{slot.finished ? t('save.slotDone', { diff: t(`diff.${slot.difficulty}.name` as Key) }) : t('save.slot', { n: slot.shift, total: slot.total, diff: t(`diff.${slot.difficulty}.name` as Key) })}</small>
              </button>
              <button className="btn" onClick={onStart}>{t('save.newGame')}</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={onStart} autoFocus>{t('menu.start')}</button>
          )}
          <button className="btn menu-practice" onClick={onPractice}>{t('tut.practice')}</button>
          <button className="btn" onClick={onHow}>{t('menu.how')}</button>
          <button className="btn" onClick={onCredits}>{t('menu.credits')}</button>
        </div>
        {notice && <p className="save-notice" role="status">{notice}</p>}
        <div className="menu-foot">{t('menu.foot')}<br /><span className="save-note">{t('save.note')}</span></div>
      </div>
    </div>
  );
}

export function TutorialStart({ difficulty = DEFAULT_DIFFICULTY, first = false, onGuided, onDirect, onBack }: {
  difficulty?: DifficultyId; first?: boolean; onGuided: () => void; onDirect?: () => void; onBack: () => void;
}) {
  const { t } = useI18n();
  const practice = !onDirect;
  return (
    <main className="screen info-page tutorial-start">
      <header>
        <DifficultyBadge id={difficulty} />
        <div className="header-actions">
          <LangToggle />
          <button type="button" className="btn" onClick={onBack}>{t('common.back')}</button>
        </div>
      </header>
      <section className="panel tutorial-start-card" aria-labelledby="tutorial-start-title">
        <AstronautGuide mood={practice ? 'happy' : 'ready'} />
        <div>
          <h1 id="tutorial-start-title">{t(practice ? 'tut.practice.h' : 'tut.start.h')}</h1>
          <p>{t(practice ? 'tut.practice.line' : 'tut.start.line')}</p>
          {!practice && first && difficulty === 'easy' && <small>{t('tut.start.easy')}</small>}
        </div>
        <div className="tutorial-start-actions">
          <button type="button" className={`btn ${first || practice ? 'btn-primary' : ''}`} data-tutorial-start="guided" onClick={onGuided} autoFocus={first || practice}>{t(practice ? 'tut.practice.start' : 'tut.start.with')}</button>
          {onDirect && <button type="button" className={`btn ${first ? '' : 'btn-primary'}`} data-tutorial-start="direct" onClick={onDirect} autoFocus={!first}>{t('tut.start.direct')}</button>}
        </div>
      </section>
    </main>
  );
}

/* ---------------- New-game confirmation ---------------- */
export function ConfirmNewGame({ slot, onYes, onNo }: { slot: SaveSlot; onYes: () => void; onNo: () => void }) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onKeyDown={(e) => { if (e.key === 'Escape') onNo(); }}>
      <div className="modal panel confirm-modal">
        <h2 id="confirm-title">{t('save.confirmTitle')}</h2>
        <p>{t('save.confirmBody', { n: slot.shift, total: slot.total })}</p>
        <div className="actions">
          <button className="btn" onClick={onNo} autoFocus>{t('common.cancel')}</button>
          <button className="btn btn-danger" onClick={onYes}>{t('save.confirmYes')}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Difficulty select ---------------- */
export function DifficultySelect({ initial, onStart, onBack }: { initial: DifficultyId; onStart: (d: DifficultyId) => void; onBack: () => void }) {
  const { t } = useI18n();
  const [sel, setSel] = useState<DifficultyId>(initial);
  const move = (e: KeyboardEvent, i: number) => {
    const k = e.key;
    if (k === 'Enter' || k === ' ') { e.preventDefault(); if (sel === DIFFICULTY_IDS[i]) onStart(sel); else setSel(DIFFICULTY_IDS[i]); return; }
    const d = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = DIFFICULTY_IDS[(i + d + 3) % 3];
    setSel(n);
    (document.querySelector(`[data-diff="${n}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div className="screen info-page diff-page">
      <header>
        <h1>{t('diff.title')}</h1>
        <div className="header-actions">
          <LangToggle />
          <button className="btn" onClick={onBack}>{t('common.back')}</button>
        </div>
      </header>
      <p className="diff-sub">{t('diff.sub')}</p>
      <div className="diff-grid" role="radiogroup" aria-label={t('diff.title')}>
        {DIFFICULTY_IDS.map((id, i) => {
          const c = missionFor(id);
          const d = DIFFICULTIES[id];
          const on = sel === id;
          return (
            <div key={id} data-diff={id} role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
              className={`diff-card diff-${id} ${on ? 'sel' : ''}`}
              onClick={() => setSel(id)} onDoubleClick={() => onStart(id)} onKeyDown={(e) => move(e, i)}>
              <div className="diff-top">
                <span className="diff-pips" aria-hidden>{[0, 1, 2].map((k) => <i key={k} className={k <= i ? 'on' : ''} />)}</span>
                <span className="diff-name">{t(`diff.${id}.name` as Key)}</span>
                {id === DEFAULT_DIFFICULTY && <span className="diff-rec">{t('diff.recommended')}</span>}
              </div>
              <p className="diff-desc">{t(`diff.${id}.desc` as Key)}</p>
              <dl>
                {(['for', 'resources', 'rover', 'help'] as const).map((row) => (
                  <div key={row}><dt>{t(`diff.row.${row}` as Key)}</dt><dd>{t(`diff.${id}.${row}` as Key)}</dd></div>
                ))}
              </dl>
              <div className="diff-nums" aria-label={t('diff.numsAria')}>
                <span><b>{c.initial.energy}</b>{t('res.short.energy')}</span>
                <span><b>{c.initial.oxygen}</b>{t('res.short.oxygen')}</span>
                <span><b>{c.initial.food}</b>{t('res.short.food')}</span>
                <span><b>{d.rover.batteryStart}</b>{t('diff.roverBattery')}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="diff-note"><span className="badge-data measured">{t('cr.nasaBadge')}</span> {t('diff.nasaNote')}</p>
      <div className="diff-actions">
        <button className="btn btn-primary" onClick={() => onStart(sel)}>{t('diff.start', { name: t(`diff.${sel}.name` as Key) })}</button>
        <span className="diff-later">{t('diff.later')}</span>
      </div>
    </div>
  );
}

/* ---------------- How to play ---------------- */
export function HowToPlay({ cfg, onBack, onStart, onPractice }: { cfg: MissionConfig; onBack: () => void; onStart: () => void; onPractice: () => void }) {
  const { t, tr } = useI18n();
  const MISSION = cfg;
  const f = MISSION.facilities;
  const minHealth = MISSION.failure.minHealth;
  const research = MISSION.capacity.research;
  return (
    <div className="screen info-page info-terminal">
      <header>
        <h1>{t('how.title')}</h1>
        <div className="header-actions">
          <LangToggle />
          <button className="btn" onClick={onBack}>{t('common.back')}</button>
          <button className="btn" onClick={onPractice}>{t('tut.practice')}</button>
          <button className="btn btn-primary" onClick={onStart}>{t('common.startMission')}</button>
        </div>
      </header>
      <section className="panel">
        <h2>{t('how.goalH')}</h2>
        <p>{tr('how.goal', { shifts: MISSION.totalShifts, research })}</p>
      </section>
      <section className="panel">
        <h2>{t('how.diffH')}</h2>
        <p>{tr('how.diff')}</p>
        <p className="how-diff-now">{t('how.diffNow')} <DifficultyBadge id={cfg.difficulty} /></p>
      </section>
      <section className="panel">
        <h2>{t('how.roverH')}</h2>
        <ul>
          <li>{tr('how.rover1')}</li>
          <li>{tr('how.rover2')}</li>
          <li>{tr('how.rover3')}</li>
        </ul>
      </section>
      <section className="panel">
        <h2>{t('how.eachH')}</h2>
        <ol>
          <li>{t('how.each1')}</li>
          <li>{t('how.each2')}</li>
          <li>{t('how.each3')}</li>
          <li>{tr('how.each4', { btn: t('advance.btn').replace(' ▸', '') })}</li>
        </ol>
      </section>
      <section className="panel">
        <h2>{t('how.facH')}</h2>
        <table>
          <thead><tr><th>{t('how.thSystem')}</th><th>{t('how.thEnergy')}</th><th>{t('how.thEffect')}</th></tr></thead>
          <tbody>
            <tr><td>{t('how.habitatRow')}</td><td>{MISSION.habitat.energyCost}</td><td>{t('how.eff.habitat')}</td></tr>
            <tr><td>{t('fac.oxygen')}</td><td>{f.oxygen.energyCost}</td><td>{t('how.eff.oxygen', { prod: f.oxygen.produces, use: MISSION.crew.oxygenUse })}</td></tr>
            <tr><td>{t('fac.greenhouse')}</td><td>{f.greenhouse.energyCost}</td><td>{t('how.eff.greenhouse', { prod: f.greenhouse.produces, use: MISSION.crew.foodUse })}</td></tr>
            <tr><td>{t('fac.shelter')}</td><td>{f.shelter.energyCost}</td><td>{t('how.eff.shelter', { dmg: MISSION.events.find((e) => e.radiation)?.radiation?.damage ?? 0 })}</td></tr>
            <tr><td>{t('fac.lab')}</td><td>{f.lab.energyCost}</td><td>{t('how.eff.lab', { max: research })}</td></tr>
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>{t('how.powerH')}</h2>
        <p>{t('how.power1', { cap: MISSION.capacity.energy })}</p>
        <p>{t('how.power2', { pct: Math.round(MISSION.site.averageSunlitFraction * 100) })}</p>
      </section>
      <section className="panel">
        <h2>{t('how.chH')}</h2>
        <p>{t('how.ch')}</p>
      </section>
      <section className="panel">
        <h2>{t('how.upgH')}</h2>
        <p>{tr('how.upg', { n: MISSION.upgradeUnlockShift })}</p>
      </section>
      <section className="panel">
        <h2>{t('how.evH')}</h2>
        <p>{tr('how.ev')}</p>
        <ul>{MISSION.events.map((e) => <li key={e.id}>{t('results.shiftN', { n: e.shift })} · {t(`ev.${e.id}.title` as Key)} <span className="badge-data game">{t('ev.badge')}</span></li>)}</ul>
      </section>
      <section className="panel">
        <h2>{t('how.winH')}</h2>
        <ul>
          <li>{tr('how.win', { minHealth, research })}</li>
          <li>{tr('how.partial')}</li>
          <li>{tr('how.fail', { minHealth })}</li>
        </ul>
        <p>{t('how.score')}</p>
        <p>{t('how.grades')}</p>
      </section>
      <section className="panel">
        <h2>{t('how.helpH')}</h2>
        <p>{tr('how.help')}</p>
      </section>
    </div>
  );
}

/* ---------------- Science & credits ---------------- */
type SciTab = 'survive' | 'data' | 'pole' | 'power' | 'life' | 'rover' | 'real' | 'qa' | 'sources' | 'team';
const SCI_TABS: SciTab[] = ['survive', 'data', 'pole', 'power', 'life', 'rover', 'real', 'qa', 'sources', 'team'];
const QA: { n: number; tab: SciTab }[] = [
  { n: 1, tab: 'life' }, { n: 2, tab: 'power' }, { n: 3, tab: 'pole' }, { n: 4, tab: 'power' },
  { n: 5, tab: 'life' }, { n: 6, tab: 'life' }, { n: 7, tab: 'rover' }, { n: 8, tab: 'real' },
];

/** One topic: a short explanation for everyone, plus "learn more" for students who want the science. */
function Topic({ id, icon, tag, children }: { id: string; icon: string; tag?: 'nasa' | 'game'; children?: ReactNode }) {
  const { t, tr } = useI18n();
  return (
    <article className="topic">
      <h3><span className="topic-icon" aria-hidden>{icon}</span>{t(`sci.${id}.t` as Key)}
        {tag && <span className={`badge-data ${tag === 'nasa' ? 'measured' : 'game'}`}>{t(tag === 'nasa' ? 'sci.tagNasa' : 'sci.tagGame')}</span>}
      </h3>
      <p>{tr(`sci.${id}.s` as Key)}</p>
      {children}
      <details>
        <summary>{t('sci.more')}</summary>
        <p>{tr(`sci.${id}.m` as Key)}</p>
      </details>
    </article>
  );
}

/** Short definitions of the hard words used on a tab. */
function Terms({ ids }: { ids: string[] }) {
  const { t } = useI18n();
  return (
    <div className="glossary">
      <h3>{t('sci.terms')}</h3>
      <dl>{ids.map((id) => <div key={id}><dt>{t(`gl.${id}.t` as Key)}</dt><dd>{t(`gl.${id}.d` as Key)}</dd></div>)}</dl>
    </div>
  );
}

export function Credits({ onBack }: { onBack: () => void }) {
  const { t, tr } = useI18n();
  const [tab, setTab] = useState<SciTab>('survive');
  const site = MISSION.site;
  const siteSolar = {
    site: totalSolarWithSiteFraction(MISSION, site.averageSunlitFraction),
    alt: totalSolarWithSiteFraction(MISSION, site.nearbyComparisons[0].value),
  };
  const mods = MISSION.shifts.map((s) => s.scenarioModifier);
  const pct1 = (site.averageSunlitFraction * 100).toFixed(2);
  const bars = [
    { label: t('cr.ridgePixel'), value: site.averageSunlitFraction },
    { label: t('site.cmp0'), value: site.nearbyComparisons[0].value },
    { label: t('site.cmp1'), value: site.nearbyComparisons[1].value },
  ];
  const go = (next: SciTab) => {
    setTab(next);
    document.getElementById(`sci-tab-${next}`)?.focus();
    window.scrollTo({ top: 0 });
  };
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    go(SCI_TABS[(i + d + SCI_TABS.length) % SCI_TABS.length]);
  };
  return (
    <div className="screen info-page info-terminal sci-page">
      <header>
        <h1>{t('cr.title')}</h1>
        <div className="header-actions">
          <LangToggle />
          <button className="btn" onClick={onBack}>{t('common.back')}</button>
        </div>
      </header>
      <p className="sci-intro">{tr('sci.intro')}</p>
      <div className="sci-tabs" role="tablist" aria-label={t('sci.tabsAria')}>
        {SCI_TABS.map((id, i) => (
          <button key={id} id={`sci-tab-${id}`} role="tab" type="button" aria-selected={tab === id} aria-controls="sci-panel"
            tabIndex={tab === id ? 0 : -1} className={`sci-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)} onKeyDown={(e) => onTabKey(e, i)}>
            {t(`sci.tab.${id}` as Key)}
          </button>
        ))}
      </div>

      <section id="sci-panel" className="panel sci-panel" role="tabpanel" aria-labelledby={`sci-tab-${tab}`}>
        <h2>{t(`sci.tab.${tab}` as Key)}</h2>
        <p className="sci-lead">{tr(`sci.lead.${tab}` as Key)}</p>

        {tab === 'survive' && (
          <>
            <div className="topics">
              <Topic id="gravity" icon="⇣" />
              <Topic id="daynight" icon="◐" />
              <Topic id="vacuum" icon="○" />
              <Topic id="temp" icon="≋" />
              <Topic id="radiation" icon="☢" />
              <Topic id="dust" icon="∴" />
            </div>
            <Terms ids={['regolith', 'vacuum', 'radiation']} />
          </>
        )}

        {tab === 'data' && (
          <>
            <div className="topics">
              <Topic id="lola" icon="⌖" tag="nasa" />
            </div>
            <div className="sci-block">
              <h3>{t('cr.whereH')}</h3>
              <p>{tr('cr.where', { name: t('site.name'), lat: Math.abs(site.latitude).toFixed(4), lon: Math.abs(site.longitude).toFixed(4), note: t('site.longNote') })}</p>
              <p><span className="badge-data measured">{t('cr.nasaBadge')}</span>{' '}{tr('cr.value', { pct: pct1, v: site.averageSunlitFraction })}</p>
              <div className="clarify">{tr('cr.clarify', { pct: pct1 })}</div>
            </div>
            <div className="sci-block">
              <h3>{t('cr.whyH')}</h3>
              <div className="site-bars" role="img" aria-label={t('cr.barsAria')}>
                {bars.map((c) => (
                  <div className="site-bar" key={c.label}>
                    <span className="lbl">{c.label}</span>
                    <span className="track"><i style={{ width: `${c.value * 100}%` }} /></span>
                    <span className="pct">{(c.value * 100).toFixed(2)}%{c.value === 0 ? t('cr.shadow') : ''}</span>
                  </div>
                ))}
              </div>
              <p>{tr('sci.compare')}</p>
              <p>
                {tr('cr.why1', { n: MISSION.totalShifts, alt: siteSolar.alt, site: siteSolar.site, pct: Math.round((1 - siteSolar.alt / siteSolar.site) * 100) })}{' '}
                <span className="badge-data game">{t('cr.gameCalc')}</span>
              </p>
            </div>
            <Terms ids={['lro', 'altimeter', 'pixel', 'sunlit']} />
          </>
        )}

        {tab === 'pole' && (
          <>
            <div className="topics">
              <Topic id="whyPole" icon="⊙" />
              <Topic id="psr" icon="●" tag="nasa" />
              <Topic id="ice" icon="❄" />
              <Topic id="gameShadow" icon="▦" tag="game" />
            </div>
            <p>{t('cr.why2')}</p>
            <Terms ids={['psr', 'axis', 'ice']} />
          </>
        )}

        {tab === 'power' && (
          <>
            <div className="topics">
              <Topic id="needPower" icon="⚡" />
              <Topic id="solar" icon="▤" />
              <Topic id="battery" icon="▮" />
              <Topic id="choose" icon="⚖" />
            </div>
            <div className="sci-block">
              <h3>{t('cr.howH')}</h3>
              <p className="formula">{t('cr.formula1', { v: site.averageSunlitFraction })}<br />{t('cr.formula2')}</p>
              <p>
                <span className="badge-data game">{t('cr.scenarioBadge')}</span>{' '}
                {tr('cr.scenario', {
                  n: MISSION.totalShifts,
                  min: Math.min(...mods).toFixed(2),
                  max: Math.max(...mods).toFixed(2),
                  avg: Math.round((mods.reduce((a, m) => a + m, 0) / mods.length) * site.averageSunlitFraction * 100),
                  site: Math.round(site.averageSunlitFraction * 100),
                })}
              </p>
            </div>
            <Terms ids={['solarCell', 'charge', 'capacity']} />
          </>
        )}

        {tab === 'life' && (
          <>
            <div className="topics">
              <Topic id="oxygen" icon="O₂" />
              <Topic id="water" icon="◌" />
              <Topic id="food" icon="❦" />
              <Topic id="shelter" icon="⌂" />
              <Topic id="lab" icon="⚗" />
            </div>
            <Terms ids={['electrolysis', 'hydroponics', 'lifeSupport']} />
          </>
        )}

        {tab === 'rover' && (
          <>
            <div className="topics">
              <Topic id="whyRover" icon="⛭" />
              <Topic id="samples" icon="◆" />
              <Topic id="terrain" icon="⛰" />
              <Topic id="route" icon="↯" tag="game" />
              <Topic id="history" icon="⌛" />
            </div>
            <Terms ids={['rover', 'sample', 'route']} />
          </>
        )}

        {tab === 'real' && (
          <div className="real-grid">
            <div className="real-col nasa">
              <h3><span className="badge-data measured">{t('sci.tagNasa')}</span> {t('real.nasaH')}</h3>
              <ul>{[0, 1, 2, 3, 4].map((i) => <li key={i}>{tr(`real.nasa.${i}` as Key, { pct: pct1 })}</li>)}</ul>
            </div>
            <div className="real-col game">
              <h3><span className="badge-data game">{t('sci.tagGame')}</span> {t('real.gameH')}</h3>
              <ul>{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <li key={i}>{tr(`real.game.${i}` as Key)}</li>)}</ul>
            </div>
            <p className="clarify real-why">{tr('real.why')}</p>
          </div>
        )}

        {tab === 'qa' && (
          <ol className="qa-list">
            {QA.map((q) => (
              <li key={q.n}>
                <b>{t(`qa.${q.n}.q` as Key)}</b>
                <p>{tr(`qa.${q.n}.a` as Key, { pct: pct1 })}</p>
                <button type="button" className="btn btn-ghost qa-go" onClick={() => go(q.tab)}>{t('qa.go', { tab: t(`sci.tab.${q.tab}` as Key) })}</button>
              </li>
            ))}
          </ol>
        )}

        {tab === 'sources' && (
          <>
            <div className="sci-block">
              <h3>{t('cr.dataH')}</h3>
              <ul className="src-list">
                <li><b>{t('cr.product')}</b> {t('site.product')}</li>
                <li><b>{t('cr.producer')}</b> {t('site.provider')}</li>
                <li><b>{t('cr.units')}</b> {t('site.units')}</li>
                <li><b>{t('cr.extraction')}</b> {t('site.extraction')}</li>
                <li><b>{t('cr.extracted')}</b> {t('cr.extractedNote', { date: site.extractedOn })}</li>
              </ul>
            </div>
            <div className="sci-block">
              <h3>{t('cr.limitsH')}</h3>
              <ul className="src-list">
                {(['site.lim0', 'site.lim1', 'site.lim2', 'site.lim3'] as Key[]).map((k) => <li key={k}>{t(k)}</li>)}
              </ul>
            </div>
            <div className="sci-block">
              <h3>{t('cr.sourcesH')}</h3>
              <ul className="src-list">
                <li>{site.source.citation}</li>
                <li>{t('cr.pgda')} <a href={site.source.productPage} target="_blank" rel="noreferrer">{site.source.productPage}</a></li>
                <li>{t('cr.dataFile')} <a href={site.source.dataUrl} target="_blank" rel="noreferrer">{site.source.dataUrl}</a> ({t('cr.label')} <a href={site.source.labelUrl} target="_blank" rel="noreferrer">.LBL</a>)</li>
                <li>{t('cr.projection')} <a href={site.source.projectionReference} target="_blank" rel="noreferrer">LOLA PDS DSMAP_POLAR.CAT</a></li>
                <li>{site.source.visualization}. {t('cr.svsNote')}</li>
              </ul>
            </div>
            <div className="sci-block">
              <h3>{t('src.generalH')}</h3>
              <p>{t('src.generalNote')}</p>
              <ul className="src-list">
                {SOURCES.map((x) => <li key={x.url}>{t(x.label)} <a href={x.url} target="_blank" rel="noreferrer">{x.url}</a></li>)}
              </ul>
            </div>
          </>
        )}

        {tab === 'team' && (
          <>
            <div className="team-card">
              <dl>
                {(['name', 'event', 'challenge', 'goal', 'users', 'why'] as const).map((k) => (
                  <div key={k}><dt>{t(`team.${k}.k` as Key)}</dt><dd>{tr(`team.${k}.v` as Key)}</dd></div>
                ))}
              </dl>
            </div>
            <div className="sci-block">
              <h3>{t('team.processH')}</h3>
              <ol className="timeline">{[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <li key={i}><b>{t(`team.step${i}.t` as Key)}</b><span>{t(`team.step${i}.d` as Key)}</span></li>)}</ol>
            </div>
            <div className="sci-block">
              <h3>{t('team.rolesH')}</h3>
              <div className="roles">
                {(['human', 'claude', 'codex'] as const).map((r) => (
                  <div key={r} className={`role role-${r}`}>
                    <h4>{t(`team.role.${r}` as Key)}</h4>
                    <ul>{Array.from({ length: ROLE_ITEMS[r] }, (_, i) => <li key={i}>{t(`team.role.${r}.${i}` as Key)}</li>)}</ul>
                  </div>
                ))}
              </div>
              <p className="role-note">{tr('team.rolesNote')}</p>
            </div>
            <div className="sci-block">
              <h3>{t('cr.aiH')}</h3>
              <p>{tr('cr.ai')}</p>
            </div>
            <div className="sci-block">
              <h3>{t('cr.techH')}</h3>
              <p>{t('cr.tech')}</p>
              <p>{t('team.assets')}</p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const ROLE_ITEMS = { human: 7, claude: 6, codex: 4 } as const;

/** General background references (checked links); the game's numbers come only from site.json. */
const SOURCES: { label: Key; url: string }[] = [
  { label: 'src.moon', url: 'https://science.nasa.gov/moon/' },
  { label: 'src.lro', url: 'https://science.nasa.gov/mission/lro/' },
  { label: 'src.artemis', url: 'https://www.nasa.gov/humans-in-space/artemis/' },
];

/* ---------------- Results ---------------- */
const SERIES: { k: keyof Resources; color: string }[] = [
  { k: 'energy', color: '#F4CA65' },
  { k: 'oxygen', color: '#56C7F2' },
  { k: 'food', color: '#6CE0B2' },
  { k: 'health', color: '#ff8fa0' },
];

function HistoryGraph({ state }: { state: GameState }) {
  const { t } = useI18n();
  const MISSION = missionFor(state.difficulty);
  const points: Resources[] = [MISSION.initial, ...state.history.map((h) => h.after)];
  const W = 600, H = 240, L = 34, R = 10, T = 10, B = 28;
  const n = MISSION.totalShifts;
  const x = (i: number) => L + (i / n) * (W - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('results.graphAria')}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(86,199,242,0.12)" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#8ea3bd">{v}</text>
          </g>
        ))}
        {Array.from({ length: n + 1 }, (_, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#8ea3bd">{i === 0 ? t('results.start') : t('results.s', { n: i })}</text>
        ))}
        {MISSION.events.filter((e) => e.radiation).map((s) => {
          const h = state.history.find((r) => r.shift === s.shift);
          const col = !h ? '#56606f' : h.radiation === 'protected' ? '#6CE0B2' : '#ff6b7a';
          return (
            <g key={s.shift}>
              <rect x={x(s.shift - 1)} y={T} width={x(s.shift) - x(s.shift - 1)} height={H - T - B} fill={col} opacity="0.08" />
              <text x={(x(s.shift - 1) + x(s.shift)) / 2} y={T + 12} textAnchor="middle" fontSize="10" fill={col}>
                ☢ {!h ? '' : t(h.radiation === 'protected' ? 'results.sheltered' : h.radiation === 'partial' ? 'results.worked' : 'results.exposed')}
              </text>
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(MISSION.failure.minHealth)} y2={y(MISSION.failure.minHealth)} stroke="#ff8fa0" strokeDasharray="4 4" strokeOpacity="0.5" />
        {SERIES.map((s) => (
          <g key={s.k}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" points={points.map((p, i) => `${x(i)},${y(p[s.k])}`).join(' ')} />
            {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p[s.k])} r="3" fill={s.color} />)}
          </g>
        ))}
      </svg>
      <div className="legend">
        {SERIES.map((s) => <span key={s.k}><i style={{ background: s.color }} />{t(`res.${s.k}` as Key)}</span>)}
        <span><i style={{ background: '#ff8fa0', opacity: 0.5 }} />{t('results.limit', { v: MISSION.failure.minHealth })}</span>
      </div>
    </>
  );
}

export function Results({ state, onRestart, onMenu }: { state: GameState; onRestart: () => void; onMenu: () => void }) {
  const { t } = useI18n();
  const MISSION = missionFor(state.difficulty);
  const score = computeScore(state, MISSION);
  const lessons = takeaways(state, MISSION, t);
  return (
    <div className="screen results">
      <div className="results-lang"><LangToggle /></div>
      <section className={`results-hero panel ${state.status}`}>
        <div>
          <span className="tag">{t('results.tag')}</span> <DifficultyBadge id={state.difficulty} />
          <h1>{missionTitle(state, t)}</h1>
          <p>{missionSummary(state, MISSION, t)}</p>
          <p className="results-diff">{t(`results.diff.${state.difficulty}` as Key)}</p>
        </div>
        <div className="grade grade-ring" aria-label={t('results.gradeAria', { g: score.grade, n: score.total })}>
          <svg viewBox="0 0 120 120" aria-hidden>
            <circle cx="60" cy="60" r="52" fill="none" stroke="#1d2b40" strokeWidth="9" />
            <circle className="ring-fg" cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 * (1 - score.total / 100)} />
          </svg>
          <div className="inner">
            <div className="letter">{score.grade}</div>
            <div className="pts">{score.total} / 100</div>
          </div>
        </div>
      </section>
      <div className="results-grid">
        <section className="score-card panel">
          <h2>{t('results.scoreH')}</h2>
          {([
            [t('results.survival'), score.survival, 40],
            [t('results.research', { r: state.resources.research, max: MISSION.capacity.research }), score.research, 30],
            [t('results.safety', { h: state.resources.health }), score.safety, 20],
            [t('results.energy', { e: state.resources.energy }), score.energy, 10],
          ] as [string, number, number][]).map(([label, v, max]) => (
            <div className="score-row" key={max}>
              <span>{label}</span><span className="v">{v} / {max}</span>
              <span className="mini" aria-hidden><i style={{ width: `${(v / max) * 100}%` }} /></span>
            </div>
          ))}
          <div className="score-row total"><span>{t('results.total')}</span><span className="v">{score.total}</span></div>
          <div className="grade-scale">{t('results.gradeScale')}</div>
        </section>
        <section className="graph-card panel">
          <h2>{t('results.graphH')}</h2>
          <HistoryGraph state={state} />
        </section>
      </div>
      <section className="decisions panel">
        <div>
          <h2>{t('results.decisionsH')}</h2>
          <ul>
            {state.history.filter((h) => h.eventId && h.choiceId).map((h) => (
              <li key={h.shift}><span className="when">{t('results.shiftN', { n: h.shift })}</span> {t(`ev.${h.eventId}.title` as Key)} → <b>{t(`ev.${h.eventId}.${h.choiceId}` as Key)}</b></li>
            ))}
          </ul>
        </div>
        <div>
          <h2>{t('results.upgradesH')}</h2>
          <ul>
            {state.history.filter((h) => h.built).map((h) => (
              <li key={h.shift}><span className="when">{t('results.shiftN', { n: h.shift })}</span> <b>{t(`upg.${h.built}` as Key)}</b></li>
            ))}
            {!state.history.some((h) => h.built) && <li className="muted">{t('results.noUpgrades')}</li>}
            {state.expeditionsDone.includes('solarRepair') && <li><span className="when">🚙</span> <b>{t('ex.doneTag')}</b></li>}
            {state.expeditionsDone.includes('oxygenRepair') && <li><span className="when">🚙</span> <b>{t('ex.o2.doneTag')}</b></li>}
            {state.expeditionsDone.includes('sampleSurvey') && <li><span className="when">🚙</span> <b>{t('ex.sc.doneTag2')}</b></li>}
          </ul>
        </div>
      </section>
      <section className="takeaways panel">
        <h2>{t('results.teachH')}</h2>
        <ol>{lessons.map((l, i) => <li key={i}>{l}</li>)}</ol>
      </section>
      <div className="results-actions">
        <button className="btn btn-primary" onClick={onRestart} autoFocus>{t('results.restart')}</button>
        <button className="btn" onClick={onMenu}>{t('results.menu')}</button>
      </div>
    </div>
  );
}
