import type { Facilities, FacilityId, UpgradeId, Upgrades } from '../game/types';
import { useI18n } from '../i18n/I18n';

/** Deterministic pseudo-random stars so the scene is identical on every render. */
function stars(n: number, w: number, h: number, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, (_, i) => ({ id: i, x: rnd() * w, y: rnd() * h, r: rnd() * 1.3 + 0.3, d: rnd() * 4 }));
}
const STARS = stars(90, 1000, 300);

interface Props {
  facilities: Facilities;
  illumination: number;
  radiation: boolean;
  shift: number;
  /** Facility whose control card is hovered/focused — highlighted in the scene. */
  highlight?: FacilityId | null;
  upgrades?: Upgrades;
  /** Upgrade under construction this shift (drawn as a dashed outline). */
  building?: UpgradeId | null;
  /** Upgrade completed last shift (celebration glow). */
  fresh?: UpgradeId | null;
  /** Battery charge 0..1. */
  battery?: number;
  /** Dust coating the solar panels this shift. */
  dust?: boolean;
}

const NONE: Upgrades = { solar: false, oxygen: false, battery: false };

/** Ground anchor (x centre, half-width) of each facility, for highlight rings and power cables. */
const SPOTS: Record<FacilityId, { x: number; w: number }> = {
  oxygen: { x: 366, w: 52 },
  greenhouse: { x: 632, w: 62 },
  shelter: { x: 770, w: 62 },
  lab: { x: 898, w: 58 },
};
const HAB_X = 495;

/** Deterministic radiation particle streaks. */
const STREAKS = Array.from({ length: 14 }, (_, i) => ({ x: 40 + ((i * 137) % 900), d: (i % 7) * 0.25, l: 30 + (i % 4) * 14 }));

const Label = ({ x, y, text, on }: { x: number; y: number; text: string; on?: boolean }) => (
  <g>
    <rect x={x - 62} y={y - 12} width={124} height={20} rx={4} fill="rgba(8,13,25,0.75)" stroke={on ? '#6CE0B2' : 'rgba(86,199,242,0.3)'} />
    <text x={x} y={y + 2} textAnchor="middle" fontSize="11" fontWeight="600" fill={on ? '#6CE0B2' : '#b8c7da'} fontFamily="Inter, sans-serif">
      {text}
    </text>
  </g>
);

const Led = ({ x, y, on }: { x: number; y: number; on: boolean }) => (
  <circle cx={x} cy={y} r={4} fill={on ? '#6CE0B2' : '#3a4a60'} className={on ? 'blink' : undefined} />
);

export function BaseScene({ facilities: f, illumination, radiation, shift, highlight, upgrades = NONE, building = null, fresh = null, battery = 0.5, dust = false }: Props) {
  const fx = (id: UpgradeId) => (fresh === id ? 'upg-fresh' : undefined);
  const { t } = useI18n();
  const sunY = 300 - illumination * 60; // the Sun skims the polar horizon
  const panelGlow = Math.max(0.15, illumination);
  return (
    <svg className="scene" viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid slice" role="img"
      aria-label={t('scene.aria', { n: shift, pct: Math.round(illumination * 100) })}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#04070f" />
          <stop offset="1" stopColor="#0d1526" />
        </linearGradient>
        <radialGradient id="sunGlow">
          <stop offset="0" stopColor="#fff6d8" stopOpacity="1" />
          <stop offset="0.25" stopColor="#F4CA65" stopOpacity="0.8" />
          <stop offset="1" stopColor="#F4CA65" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4f5c" />
          <stop offset="1" stopColor="#1e222c" />
        </linearGradient>
        <linearGradient id="cell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c4f7a" />
          <stop offset="1" stopColor="#0d2a47" />
        </linearGradient>
        <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e3e8ef" />
          <stop offset="1" stopColor="#8d97a6" />
        </linearGradient>
        <radialGradient id="ghLight">
          <stop offset="0" stopColor="#8dffb8" stopOpacity="0.9" />
          <stop offset="1" stopColor="#6CE0B2" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="radGlow" cx="0.1" cy="0.5" r="1">
          <stop offset="0" stopColor="#FF986A" stopOpacity="1" />
          <stop offset="1" stopColor="#FF986A" stopOpacity="0" />
        </radialGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>

      {/* Sky & stars */}
      <rect width="1000" height="520" fill="url(#sky)" />
      {STARS.map((s) => (
        <circle key={s.id} cx={s.x} cy={s.y} r={s.r} fill="#cfe3ff" className="twinkle" style={{ animationDelay: `${s.d}s` }} />
      ))}
      {/* Earth low over the horizon */}
      <g opacity="0.9">
        <circle cx="840" cy="90" r="22" fill="#1d4f8f" />
        <path d="M826 80 q8 -6 14 2 q6 8 -2 12 q-10 2 -12 -14z M846 96 q6 -2 8 4 q-4 6 -10 2z" fill="#4f9e6a" opacity="0.9" />
        <circle cx="840" cy="90" r="22" fill="none" stroke="#7fc6ff" strokeOpacity="0.5" strokeWidth="2" />
      </g>
      {/* Low polar Sun */}
      <g className="panel-glow" opacity={0.35 + illumination * 0.65}>
        <circle cx="70" cy={sunY} r={90} fill="url(#sunGlow)" />
        <circle cx="70" cy={sunY} r={13} fill="#fff6d8" />
      </g>

      {/* Distant ridges */}
      <path d="M0 330 L60 300 L130 318 L210 280 L300 312 L380 296 L470 320 L560 288 L660 314 L760 290 L860 316 L940 300 L1000 312 L1000 520 L0 520Z" fill="#2c313d" />
      <path d="M0 345 L90 325 L180 340 L280 322 L400 344 L520 330 L640 346 L760 328 L880 344 L1000 332 L1000 520 L0 520Z" fill="#3a3f4b" />
      {/* Foreground regolith */}
      <path d="M0 370 Q250 352 500 362 T1000 360 L1000 520 L0 520Z" fill="url(#ground)" />
      <ellipse cx="140" cy="470" rx="70" ry="12" fill="#1a1d25" opacity="0.7" />
      <ellipse cx="610" cy="490" rx="90" ry="14" fill="#1a1d25" opacity="0.6" />
      <ellipse cx="900" cy="462" rx="50" ry="9" fill="#1a1d25" opacity="0.7" />
      {/* Long grazing shadows (sun at left) */}
      <g fill="#000" opacity={0.25 + illumination * 0.2}>
        <path d="M300 404 L520 412 L520 418 L300 414Z" />
        <path d="M640 404 L900 410 L900 416 L640 414Z" />
      </g>

      {/* Low-light dimming of the terrain: darker shifts are visibly darker */}
      <rect width="1000" height="520" fill="#02040a" opacity={(1 - illumination) * 0.5} className="panel-glow" />

      {/* Battery bank: charge level, more cells after the Battery Upgrade */}
      <g transform="translate(372 452)" className={fx('battery')}>
        {(upgrades.battery || building === 'battery') && (
          <rect x={-4} y={-4} width={(upgrades.battery ? 5 : 3) * 16 + 8 + (building === 'battery' && !upgrades.battery ? 32 : 0)} height={30} rx={4}
            fill="none" stroke="#F4CA65" strokeDasharray={upgrades.battery ? undefined : '4 3'} strokeOpacity={upgrades.battery ? 0.7 : 0.9} />
        )}
        {Array.from({ length: upgrades.battery ? 5 : 3 }, (_, i) => {
          const cells = upgrades.battery ? 5 : 3;
          const level = Math.max(0, Math.min(1, battery * cells - i));
          return (
            <g key={i}>
              <rect x={i * 16} y={0} width={12} height={22} rx={2} fill="#1d2b40" stroke="#8d97a6" />
              <rect x={i * 16 + 2} y={2 + 18 * (1 - level)} width={8} height={18 * level} rx={1} fill="#F4CA65" opacity="0.9" />
            </g>
          );
        })}
      </g>

      {/* Small rover parked by the habitat */}
      <g transform="translate(470 474)">
        <rect x="0" y="0" width="34" height="10" rx="3" fill="#c9d0da" />
        <rect x="6" y="-8" width="14" height="8" rx="2" fill="#8d97a6" />
        <line x1="26" y1="0" x2="30" y2="-12" stroke="#9aa4b2" strokeWidth="1.5" />
        <circle cx="30" cy="-13" r="2" fill="#56C7F2" />
        {[5, 17, 29].map((x) => <circle key={x} cx={x} cy="12" r="4" fill="#3a3f4b" stroke="#8d97a6" />)}
      </g>

      {/* Radiation event tint + particle streaks */}
      {radiation && (
        <g>
          <rect width="1000" height="520" fill="url(#radGlow)" className="rad-pulse" />
          {STREAKS.map((s, i) => (
            <line key={i} x1={s.x} y1={-40} x2={s.x + s.l * 0.6} y2={-40 + s.l} stroke="#FF986A" strokeWidth="2" strokeLinecap="round" className="rad-streak" style={{ animationDelay: `${s.d}s` }} />
          ))}
        </g>
      )}

      {/* Highlight ring for the hovered control card */}
      {highlight && (
        <ellipse cx={SPOTS[highlight].x} cy={406} rx={SPOTS[highlight].w + 10} ry={12} fill="none" stroke="#56C7F2" strokeWidth="2.5" className="hl-ring" />
      )}

      {/* ---- Solar array (vertical panels track the low Sun) ---- */}
      <g>
        {[0, 1, 2].map((i) => {
          const x = 120 + i * 62;
          return (
            <g key={i}>
              <rect x={x + 22} y={300} width={4} height={104} fill="#9aa4b2" />
              <rect x={x} y={250} width={48} height={92} rx={2} fill="url(#cell)" stroke="#5d7a99" />
              {[0, 1, 2, 3, 4, 5].map((r) => (
                <line key={r} x1={x} y1={250 + r * 15.3} x2={x + 48} y2={250 + r * 15.3} stroke="#2f6a99" strokeWidth="1" />
              ))}
              <line x1={x + 24} y1={250} x2={x + 24} y2={342} stroke="#2f6a99" />
              <rect x={x} y={250} width={48} height={92} rx={2} fill="#F4CA65" opacity={panelGlow * 0.35} className="panel-glow" />
              {upgrades.solar && (
                <g className={fx('solar')}>
                  <rect x={x + 22} y={206} width={4} height={44} fill="#c9a24a" />
                  <rect x={x} y={200} width={48} height={46} rx={2} fill="url(#cell)" stroke="#F4CA65" strokeWidth="1.5" />
                  {[0, 1, 2].map((r) => <line key={r} x1={x} y1={200 + r * 15.3} x2={x + 48} y2={200 + r * 15.3} stroke="#2f6a99" />)}
                  <rect x={x} y={200} width={48} height={46} rx={2} fill="#F4CA65" opacity={panelGlow * 0.35} />
                </g>
              )}
              {building === 'solar' && !upgrades.solar && (
                <rect x={x} y={200} width={48} height={46} rx={2} fill="none" stroke="#F4CA65" strokeDasharray="4 3" className="blink" />
              )}
              {dust && <rect x={x} y={upgrades.solar ? 200 : 250} width={48} height={upgrades.solar ? 142 : 92} rx={2} fill="#8a7d6a" opacity="0.6" />}
            </g>
          );
        })}
        <rect x={110} y={400} width={190} height={6} rx={2} fill="#7d8796" />
        <rect x={106} y={242} width={198} height={110} rx={6} fill="none" stroke="#F4CA65" strokeOpacity={panelGlow * 0.6} filter="url(#soft)" className="panel-glow" />
        <Label x={205} y={438} text={t('scene.solar', { pct: Math.round(illumination * 100) })} on={illumination >= 0.5} />
      </g>

      {/* Power cables: solar -> habitat always; habitat -> each facility, animated when it draws power */}
      <path d="M300 404 Q380 414 440 404" stroke="#F4CA65" strokeOpacity={0.25 + illumination * 0.5} strokeWidth="2.5" fill="none" strokeDasharray="6 6" className="flow" />
      {(Object.keys(SPOTS) as FacilityId[]).map((id) => {
        const tx = SPOTS[id].x;
        const d = `M${HAB_X} 406 Q${(HAB_X + tx) / 2} ${418 + Math.abs(tx - HAB_X) * 0.04} ${tx} 406`;
        return (
          <path key={id} d={d} fill="none" strokeWidth="2"
            stroke={f[id] ? '#56C7F2' : '#3a4a60'} strokeOpacity={f[id] ? 0.85 : 0.5}
            strokeDasharray={f[id] ? '6 6' : '2 6'} className={f[id] ? 'flow' : undefined} />
        );
      })}

      {/* ---- Oxygen recycling ---- */}
      <g>
        <rect x={330} y={320} width={34} height={84} rx={17} fill="url(#hull)" />
        <rect x={372} y={332} width={30} height={72} rx={15} fill="url(#hull)" />
        <rect x={334} y={350} width={26} height={6} fill={f.oxygen ? '#56C7F2' : '#56606f'} />
        <rect x={376} y={358} width={22} height={6} fill={f.oxygen ? '#56C7F2' : '#56606f'} />
        <path d="M364 380 H372" stroke="#8d97a6" strokeWidth="4" />
        {f.oxygen && <circle cx={366} cy={360} r={40} fill="#56C7F2" opacity="0.12" filter="url(#soft)" />}
        {upgrades.oxygen && (
          <g className={fx('oxygen')}>
            <rect x={406} y={350} width={20} height={54} rx={10} fill="url(#hull)" stroke="#6CE0B2" strokeWidth="1.5" />
            <rect x={409} y={370} width={14} height={5} fill={f.oxygen ? '#6CE0B2' : '#56606f'} />
            <path d="M402 384 H406" stroke="#8d97a6" strokeWidth="3" />
          </g>
        )}
        {building === 'oxygen' && !upgrades.oxygen && (
          <rect x={406} y={350} width={20} height={54} rx={10} fill="none" stroke="#F4CA65" strokeDasharray="4 3" className="blink" />
        )}
        <Led x={347} y={334} on={f.oxygen} />
        <Label x={366} y={438} text={t('scene.oxygen')} on={f.oxygen} />
      </g>

      {/* ---- Main habitat ---- */}
      <g>
        <rect x={430} y={330} width={130} height={74} rx={30} fill="url(#hull)" />
        <path d="M446 334 Q495 284 544 334Z" fill="#c9d0da" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={452 + i * 24} y={356} width={14} height={10} rx={3} fill="#F4CA65" opacity="0.85" />
        ))}
        <rect x={430} y={376} width={130} height={4} fill="#56C7F2" opacity="0.6" />
        <rect x={488} y={286} width={3} height={22} fill="#9aa4b2" />
        <circle cx={489.5} cy={284} r={3} fill="#FF986A" className="blink" />
        <Label x={495} y={438} text={t('scene.habitat')} on />
      </g>

      {/* ---- Greenhouse ---- */}
      <g>
        {f.greenhouse && <ellipse cx={632} cy={370} rx={70} ry={50} fill="url(#ghLight)" className="gh-glow" />}
        <path d="M580 404 L580 368 Q632 318 684 368 L684 404Z" fill={f.greenhouse ? 'rgba(108,224,178,0.28)' : 'rgba(160,180,200,0.14)'} stroke="#b8c7da" strokeWidth="2" />
        {[598, 616, 634, 652, 670].map((x) => (
          <line key={x} x1={x} y1={404} x2={x} y2={366 - (x === 634 ? 14 : x === 616 || x === 652 ? 8 : 0)} stroke="#b8c7da" strokeOpacity="0.5" />
        ))}
        {[592, 612, 632, 652, 672].map((x) => (
          <g key={x} opacity={f.greenhouse ? 1 : 0.45}>
            <path d={`M${x} 402 q-6 -12 0 -18 q6 6 0 18z`} fill="#4fc28a" />
            <path d={`M${x} 402 q8 -10 4 -20 q-8 6 -4 20z`} fill="#6CE0B2" />
          </g>
        ))}
        <Led x={590} y={372} on={f.greenhouse} />
        <Label x={632} y={438} text={t('scene.greenhouse')} on={f.greenhouse} />
      </g>

      {/* ---- Radiation shelter (regolith-covered) ---- */}
      <g>
        {f.shelter && <path d="M712 404 Q770 296 828 404Z" fill="#56C7F2" opacity="0.4" className="shield-dome" />}
        <path d="M716 404 Q770 318 824 404Z" fill="#5b606c" />
        <path d="M730 404 Q770 340 810 404Z" fill="#6c717d" />
        <rect x={758} y={378} width={24} height={26} rx={3} fill={f.shelter ? '#F4CA65' : '#2a2f3a'} />
        <Led x={770} y={370} on={f.shelter} />
        <Label x={770} y={438} text={t('scene.shelter')} on={f.shelter} />
      </g>

      {/* ---- Science laboratory ---- */}
      <g>
        <rect x={850} y={346} width={96} height={58} rx={10} fill="url(#hull)" />
        <rect x={862} y={360} width={20} height={12} rx={2} fill={f.lab ? '#56C7F2' : '#4d5868'} />
        <rect x={890} y={360} width={20} height={12} rx={2} fill={f.lab ? '#56C7F2' : '#4d5868'} />
        <rect x={918} y={360} width={18} height={12} rx={2} fill={f.lab ? '#56C7F2' : '#4d5868'} />
        <rect x={906} y={312} width={4} height={34} fill="#9aa4b2" />
        <path d="M890 312 Q908 290 926 312Z" fill="#c9d0da" stroke="#8d97a6" />
        {f.lab && <circle cx={908} cy={300} r={18} fill="#56C7F2" opacity="0.18" className="blink" />}
        <Led x={862} y={392} on={f.lab} />
        <Label x={898} y={438} text={t('scene.lab')} on={f.lab} />
      </g>
    </svg>
  );
}
