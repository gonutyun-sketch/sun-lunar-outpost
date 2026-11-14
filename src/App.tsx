import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { MISSION } from './game/config';
import { applyExpedition, createInitialState } from './game/engine';
import { browserStorage, clearSave, hasProgress, loadGame, saveGame } from './game/save';
import type { GameState } from './game/types';
import { useI18n } from './i18n/I18n';
import { ExploreScreen } from './ui/ExploreScreen';
import { MissionScreen } from './ui/MissionScreen';
import { ConfirmNewGame, Credits, HowToPlay, MainMenu, Results, Starfield, type SaveSlot } from './ui/Screens';

type Screen = 'menu' | 'how' | 'credits' | 'mission' | 'explore' | 'results';
type Notice = 'invalid' | 'resumed' | null;

function readFxPref(): boolean {
  try {
    return localStorage.getItem('sun-fx') !== 'off';
  } catch {
    return true;
  }
}

const storage = browserStorage();

/** Read the save once at start-up (module scope: StrictMode would run a state initializer twice,
 *  and the first run already removes an unreadable save). */
function initialLoad(): { game: GameState; saved: boolean; notice: Notice } {
  const r = loadGame(storage, MISSION);
  if (r.kind === 'ok') return { game: r.save.state, saved: true, notice: r.save.exploring ? 'resumed' : null };
  return { game: createInitialState(MISSION), saved: false, notice: r.kind === 'invalid' ? 'invalid' : null };
}
const BOOT = initialLoad();

export default function App() {
  const boot = BOOT;
  const [screen, setScreen] = useState<Screen>('menu');
  const [game, setGame] = useState<GameState>(boot.game);
  const [saved, setSaved] = useState(boot.saved);
  const [notice, setNotice] = useState<Notice>(boot.notice);
  const [confirm, setConfirm] = useState(false);
  const [fx, setFx] = useState(readFxPref);
  const [expedition, setExpedition] = useState<string | null>(null);
  const { t } = useI18n();
  /** Guards against an expedition result being applied twice (double tap, repeated events). */
  const exitDone = useRef(false);

  // Autosave while a game is open. During exploration the base state is unchanged, so the save is
  // the last safe base state (checkpoint) plus the id of the expedition in progress.
  const inGame = screen === 'mission' || screen === 'explore' || screen === 'results';
  useEffect(() => {
    if (!inGame) return;
    if (saveGame(storage, game, screen === 'explore' ? expedition : null)) setSaved(true);
  }, [game, inGame, screen, expedition]);

  const slot: SaveSlot | null = saved ? { shift: game.shift, total: MISSION.totalShifts, finished: game.status !== 'playing' } : null;

  const startFresh = () => {
    clearSave(storage);
    const fresh = createInitialState(MISSION);
    // Development-only QA shortcut: ?devShift=N starts at shift N (stripped from production builds)
    const dev = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('devShift')) : 0;
    setGame(dev > 1 && dev <= MISSION.totalShifts ? { ...fresh, shift: dev } : fresh);
    setNotice(null);
    setConfirm(false);
    setScreen('mission');
  };
  /** New game: ask first if it would overwrite an unfinished saved mission. */
  const newGame = () => {
    if (saved && hasProgress({ v: 1, savedAt: 0, state: game, exploring: null })) setConfirm(true);
    else startFresh();
  };
  const continueGame = () => {
    setScreen(game.status === 'playing' ? 'mission' : 'results');
  };
  const toggleFx = () => {
    const next = !fx;
    setFx(next);
    try { localStorage.setItem('sun-fx', next ? 'on' : 'off'); } catch { /* storage unavailable */ }
  };
  /** Recover from a crash caused by unexpected saved data: drop the save and return to the menu. */
  const recover = () => {
    clearSave(storage);
    setSaved(false);
    setGame(createInitialState(MISSION));
    setExpedition(null);
    setNotice('invalid');
    setScreen('menu');
  };

  return (
    <div className={fx ? '' : 'no-fx'}>
      {(screen === 'how' || screen === 'credits' || screen === 'results') && <Starfield />}
      <Guard onError={recover} resetKey={screen}>
        {screen === 'menu' && (
          <MainMenu
            onStart={newGame}
            onContinue={saved ? continueGame : undefined}
            slot={slot}
            notice={notice === 'invalid' ? t('save.invalid') : notice === 'resumed' ? t('save.resumed') : null}
            onHow={() => setScreen('how')}
            onCredits={() => setScreen('credits')}
            fx={fx}
          />
        )}
        {screen === 'how' && <HowToPlay onBack={() => setScreen('menu')} onStart={saved && game.status === 'playing' ? continueGame : newGame} />}
        {screen === 'credits' && <Credits onBack={() => setScreen('menu')} />}
        {screen === 'mission' && (
          <MissionScreen
            state={game}
            setState={setGame}
            onFinish={() => setScreen('results')}
            onQuit={() => setScreen('menu')}
            onExplore={(id) => { exitDone.current = false; setNotice(null); setExpedition(id); setScreen('explore'); }}
            fx={fx}
            onToggleFx={toggleFx}
          />
        )}
        {screen === 'explore' && expedition && (
          <ExploreScreen
            missionId={expedition}
            fx={fx}
            onExit={(result) => {
              if (exitDone.current) return;
              exitDone.current = true;
              // The base game state is kept in App while exploring; only the result is applied (once).
              setGame((g) => applyExpedition(g, MISSION, expedition, result));
              setExpedition(null);
              setScreen('mission');
            }}
          />
        )}
        {screen === 'results' && <Results state={game} onRestart={startFresh} onMenu={() => setScreen('menu')} />}
      </Guard>
      {confirm && slot && <ConfirmNewGame slot={slot} onYes={startFresh} onNo={() => setConfirm(false)} />}
    </div>
  );
}

/** Error boundary: if a screen crashes (e.g. on unexpected saved data) the game recovers instead of going blank. */
class Guard extends Component<{ children: ReactNode; onError: () => void; resetKey: string }, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { failed: boolean; key: string }) {
    return p.resetKey !== s.key ? { failed: false, key: p.resetKey } : null;
  }
  componentDidCatch(err: unknown) {
    console.error('Screen error — resetting saved game', err);
    this.props.onError();
  }
  render() { return this.state.failed ? null : this.props.children; }
}
