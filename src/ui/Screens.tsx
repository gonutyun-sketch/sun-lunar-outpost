import { MISSION } from '../game/config';
import { computeScore, totalSolarWithSiteFraction } from '../game/engine';
import { missionSummary, missionTitle, takeaways } from '../game/debrief';
import type { GameState, Resources } from '../game/types';
import { LangToggle, useI18n } from '../i18n/I18n';
import type { Key } from '../i18n/translate';

/* ---------------- Animated background ---------------- */
const BG_STARS = Array.from({ length: 140 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return { i, x: (a - Math.floor(a)) * 100, y: (b - Math.floor(b)) * 100, r: ((a * b) % 1 + 1) % 1 * 1.4 + 0.3, d: (i % 9) * 0.5 };
});

export function Starfield() {
  return (
    <div className="starfield" aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="mg" cx="0.35" cy="0.35">
            <stop offset="0" stopColor="#d9dde4" />
            <stop offset="0.7" stopColor="#8f96a3" />
            <stop offset="1" stopColor="#4b505b" />
          </radialGradient>
          <radialGradient id="halo">
            <stop offset="0.6" stopColor="#56C7F2" stopOpacity="0.15" />
            <stop offset="1" stopColor="#56C7F2" stopOpacity="0" />
          </radialGradient>
        </defs>
        {BG_STARS.map((s) => (
          <circle key={s.i} cx={s.x} cy={s.y} r={s.r * 0.12} fill="#cfe3ff" className="twinkle" style={{ animationDelay: `${s.d}s` }} />
        ))}
        <g className="moon-drift">
          <circle cx="50" cy="128" r="62" fill="url(#halo)" />
          <circle cx="50" cy="128" r="52" fill="url(#mg)" />
          <circle cx="34" cy="94" r="5" fill="#7a808c" opacity="0.6" />
          <circle cx="60" cy="88" r="3" fill="#7a808c" opacity="0.6" />
          <circle cx="72" cy="100" r="6" fill="#7a808c" opacity="0.5" />
          <circle cx="47" cy="104" r="2.2" fill="#7a808c" opacity="0.6" />
        </g>
      </svg>
    </div>
  );
}

/* ---------------- Main menu ---------------- */
export function MainMenu({ onStart, onHow, onCredits }: { onStart: () => void; onHow: () => void; onCredits: () => void }) {
  const { t } = useI18n();
  return (
    <div className="screen menu">
      <LangToggle className="menu-lang" />
      <div className="kicker">{t('menu.kicker')}</div>
      <h1><span className="sun">SUN</span>: Lunar Outpost</h1>
      {t('menu.titleSub') && <div className="title-sub">{t('menu.titleSub')}</div>}
      <p className="sub">{t('menu.sub')}</p>
      <div className="menu-buttons">
        <button className="btn btn-primary" onClick={onStart} autoFocus>{t('menu.start')}</button>
        <button className="btn" onClick={onHow}>{t('menu.how')}</button>
        <button className="btn" onClick={onCredits}>{t('menu.credits')}</button>
      </div>
      <div className="menu-foot">{t('menu.foot')}</div>
    </div>
  );
}

/* ---------------- How to play ---------------- */
export function HowToPlay({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const { t, tr } = useI18n();
  const f = MISSION.facilities;
  const minHealth = MISSION.failure.minHealth;
  const research = MISSION.capacity.research;
  return (
    <div className="screen info-page">
      <header>
        <h1>{t('how.title')}</h1>
        <div className="header-actions">
          <LangToggle />
          <button className="btn" onClick={onBack}>{t('common.back')}</button>
          <button className="btn btn-primary" onClick={onStart}>{t('common.startMission')}</button>
        </div>
      </header>
      <section className="panel">
        <h2>{t('how.goalH')}</h2>
        <p>{tr('how.goal', { shifts: MISSION.totalShifts, research })}</p>
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
    </div>
  );
}

/* ---------------- Science & credits ---------------- */
export function Credits({ onBack }: { onBack: () => void }) {
  const { t, tr } = useI18n();
  const site = MISSION.site;
  const siteSolar = {
    site: totalSolarWithSiteFraction(MISSION, site.averageSunlitFraction),
    alt: totalSolarWithSiteFraction(MISSION, site.nearbyComparisons[0].value),
  };
  const mods = MISSION.shifts.map((s) => s.scenarioModifier);
  const pct1 = (site.averageSunlitFraction * 100).toFixed(1);
  const bars = [
    { label: t('cr.ridgePixel'), value: site.averageSunlitFraction },
    { label: t('site.cmp0'), value: site.nearbyComparisons[0].value },
    { label: t('site.cmp1'), value: site.nearbyComparisons[1].value },
  ];
  return (
    <div className="screen info-page">
      <header>
        <h1>{t('cr.title')}</h1>
        <div className="header-actions">
          <LangToggle />
          <button className="btn" onClick={onBack}>{t('common.back')}</button>
        </div>
      </header>
      <section className="panel">
        <h2>{t('cr.whereH')}</h2>
        <p>{tr('cr.where', { name: t('site.name'), lat: Math.abs(site.latitude).toFixed(4), lon: Math.abs(site.longitude).toFixed(4), note: t('site.longNote') })}</p>
        <p>
          <span className="badge-data measured">{t('cr.nasaBadge')}</span>{' '}
          {tr('cr.value', { pct: pct1, v: site.averageSunlitFraction })}
        </p>
        <div className="clarify">{tr('cr.clarify', { pct: pct1 })}</div>
      </section>
      <section className="panel">
        <h2>{t('cr.whyH')}</h2>
        <div className="site-bars" role="img" aria-label={t('cr.barsAria')}>
          {bars.map((c) => (
            <div className="site-bar" key={c.label}>
              <span className="lbl">{c.label}</span>
              <span className="track"><i style={{ width: `${c.value * 100}%` }} /></span>
              <span className="pct">{(c.value * 100).toFixed(1)}%{c.value === 0 ? t('cr.shadow') : ''}</span>
            </div>
          ))}
        </div>
        <p>
          {tr('cr.why1', { n: MISSION.totalShifts, alt: siteSolar.alt, site: siteSolar.site, pct: Math.round((1 - siteSolar.alt / siteSolar.site) * 100) })}{' '}
          <span className="badge-data game">{t('cr.gameCalc')}</span>
        </p>
        <p>{t('cr.why2')}</p>
      </section>
      <section className="panel">
        <h2>{t('cr.howH')}</h2>
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
      </section>
      <section className="panel">
        <h2>{t('cr.dataH')}</h2>
        <ul className="src-list">
          <li><b>{t('cr.product')}</b> {t('site.product')}</li>
          <li><b>{t('cr.producer')}</b> {t('site.provider')}</li>
          <li><b>{t('cr.units')}</b> {t('site.units')}</li>
          <li><b>{t('cr.extraction')}</b> {t('site.extraction')}</li>
          <li><b>{t('cr.extracted')}</b> {t('cr.extractedNote', { date: site.extractedOn })}</li>
        </ul>
        <h2 style={{ marginTop: 14 }}>{t('cr.limitsH')}</h2>
        <ul className="src-list">
          {(['site.lim0', 'site.lim1', 'site.lim2', 'site.lim3'] as Key[]).map((k) => <li key={k}>{t(k)}</li>)}
        </ul>
      </section>
      <section className="panel">
        <h2>{t('cr.sourcesH')}</h2>
        <ul className="src-list">
          <li>{site.source.citation}</li>
          <li>{t('cr.pgda')} <a href={site.source.productPage} target="_blank" rel="noreferrer">{site.source.productPage}</a></li>
          <li>{t('cr.dataFile')} <a href={site.source.dataUrl} target="_blank" rel="noreferrer">{site.source.dataUrl}</a> ({t('cr.label')} <a href={site.source.labelUrl} target="_blank" rel="noreferrer">.LBL</a>)</li>
          <li>{t('cr.projection')} <a href={site.source.projectionReference} target="_blank" rel="noreferrer">LOLA PDS DSMAP_POLAR.CAT</a></li>
          <li>{site.source.visualization}. {t('cr.svsNote')}</li>
        </ul>
      </section>
      <section className="panel">
        <h2>{t('cr.teamH')}</h2>
        <p>{t('cr.team')}</p>
      </section>
      <section className="panel">
        <h2>{t('cr.aiH')}</h2>
        <p>{t('cr.ai')}</p>
      </section>
      <section className="panel">
        <h2>{t('cr.techH')}</h2>
        <p>{t('cr.tech')}</p>
      </section>
    </div>
  );
}

/* ---------------- Results ---------------- */
const SERIES: { k: keyof Resources; color: string }[] = [
  { k: 'energy', color: '#F4CA65' },
  { k: 'oxygen', color: '#56C7F2' },
  { k: 'food', color: '#6CE0B2' },
  { k: 'health', color: '#ff8fa0' },
];

function HistoryGraph({ state }: { state: GameState }) {
  const { t } = useI18n();
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
  const score = computeScore(state, MISSION);
  const lessons = takeaways(state, MISSION, t);
  return (
    <div className="screen results">
      <div className="results-lang"><LangToggle /></div>
      <section className={`results-hero panel ${state.status}`}>
        <div>
          <span className="tag">{t('results.tag')}</span>
          <h1>{missionTitle(state, t)}</h1>
          <p>{missionSummary(state, MISSION, t)}</p>
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
