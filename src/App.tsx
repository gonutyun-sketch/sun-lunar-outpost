import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { MISSION } from './game/config';
import { DEFAULT_DIFFICULTY, missionFor, type DifficultyId } from './game/difficulty';
import { applyExpedition, createInitialState } from './game/engine';
import { browserStorage, clearSave, hasProgress, loadGame, saveGame, SAVE_VERSION } from './game/save';
import type { GameState } from './game/types';
import { useI18n } from './i18n/I18n';
import { learn, startTutorial, TUTORIAL_PREF_KEY, type TutorialEvent, type TutorialProgress } from './tutorial/progress';
import { ExploreScreen } from './ui/ExploreScreen';
import { MissionScreen } from './ui/MissionScreen';
import { ConfirmNewGame, Credits, DifficultySelect, HowToPlay, MainMenu, Results, Starfield, TutorialStart, type SaveSlot } from './ui/Screens';

type Screen = 'menu' | 'difficulty' | 'guide-choice' | 'practice' | 'how' | 'credits' | 'mission' | 'explore' | 'results';
type Notice = 'invalid' | 'resumed' | 'migrated' | null;
interface Run { game: GameState; tutorial: TutorialProgress | null }

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
function initialLoad(): Run & { saved: boolean; notice: Notice } {
  // structure (shifts, events, expeditions) is the same in every difficulty
  const r = loadGame(storage, MISSION);
  if (r.kind === 'ok') return { game: r.save.state, tutorial: r.save.tutorial ?? null, saved: true, notice: r.save.exploring ? 'resumed' : r.migratedFrom ? 'migrated' : null };
  return { game: createInitialState(missionFor(DEFAULT_DIFFICULTY)), tutorial: null, saved: false, notice: r.kind === 'invalid' ? 'invalid' : null };
}
const BOOT = initialLoad();

export default function App() {
  const boot = BOOT;
  const [screen, setScreen] = useState<Screen>('menu');
  const [live, setLive] = useState<Run>({ game: boot.game, tutorial: boot.tutorial });
  const [practice, setPractice] = useState<Run | null>(null);
  const [practiceBack, setPracticeBack] = useState<'menu' | 'how'>('menu');
  const practicing = practice !== null;
  const { game, tutorial } = practice ?? live;
  const [saved, setSaved] = useState(boot.saved);
  const [notice, setNotice] = useState<Notice>(boot.notice);
  const [confirm, setConfirm] = useState(false);
  const [fx, setFx] = useState(readFxPref);
  const [expedition, setExpedition] = useState<string | null>(null);
  /** Difficulty pre-selected on the difficulty screen (last one played, else Easy). */
  const [pick, setPick] = useState<DifficultyId>(boot.saved ? boot.game.difficulty : DEFAULT_DIFFICULTY);
  const [seenGuide, setSeenGuide] = useState(() => {
    try { return boot.saved || storage?.getItem(TUTORIAL_PREF_KEY) === 'seen'; } catch { return boot.saved; }
  });
  const cfg = missionFor(game.difficulty);
  const { t } = useI18n();
  /** Guards against an expedition result being applied twice (double tap, repeated events). */
  const exitDone = useRef(false);
  const seenBaseWarnings = useRef(new Set<string>());
  const seenPracticeWarnings = useRef(new Set<string>());
  const updateRun = useCallback((update: (previous: Run) => Run) => {
    if (practicing) setPractice(previous => previous && update(previous));
    else setLive(update);
  }, [practicing]);
  const setGame = (next: GameState) => updateRun(previous => ({ ...previous, game: next }));
  const teach = useCallback((event: TutorialEvent) => updateRun(previous => {
    const next = learn(previous.tutorial, event);
    return next === previous.tutorial ? previous : { ...previous, tutorial: next };
  }), [updateRun]);

  // Autosave while a game is open. During exploration the base state is unchanged, so the save is
  // the last safe base state (checkpoint) plus the id of the expedition in progress.
  const inGame = screen === 'mission' || screen === 'explore' || screen === 'results';
  useEffect(() => {
    if (!inGame || practicing) return;
    if (saveGame(storage, game, screen === 'explore' ? expedition : null, Date.now(), tutorial)) setSaved(true);
  }, [game, inGame, screen, expedition, practicing, tutorial]);

  const slot: SaveSlot | null = saved ? { shift: live.game.shift, total: cfg.totalShifts, finished: live.game.status !== 'playing', difficulty: live.game.difficulty } : null;

  const markGuideSeen = () => {
    setSeenGuide(true);
    try { storage?.setItem(TUTORIAL_PREF_KEY, 'seen'); } catch { /* storage unavailable */ }
  };
  const startFresh = (withGuide: boolean) => {
    clearSave(storage);
    seenBaseWarnings.current.clear();
    markGuideSeen();
    const fresh = createInitialState(missionFor(pick));
    // Development-only QA shortcut: ?devShift=N starts at shift N (stripped from production builds)
    const dev = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('devShift')) : 0;
    const fastForward = dev > 1 && dev <= MISSION.totalShifts;
    const progress = withGuide ? startTutorial() : null;
    setLive({ game: fastForward ? { ...fresh, shift: dev } : fresh,
      tutorial: progress && fastForward ? { ...progress, base: 'done' } : progress });
    setNotice(null);
    setConfirm(false);
    setScreen('mission');
  };
  /** New game: ask first if it would overwrite an unfinished saved mission, then choose the difficulty. */
  const newGame = () => {
    const guidedProgress = live.game.status === 'playing' && live.tutorial && live.tutorial.base !== 'energy';
    if (saved && (guidedProgress || hasProgress({ v: SAVE_VERSION, savedAt: 0, state: live.game, exploring: null }))) setConfirm(true);
    else chooseDifficulty();
  };
  const chooseDifficulty = () => { setConfirm(false); setNotice(null); setScreen('difficulty'); };
  const chooseGuide = (difficulty: DifficultyId) => { setPick(difficulty); setScreen('guide-choice'); };
  const openPractice = (from: 'menu' | 'how') => { setPracticeBack(from); setScreen('practice'); };
  const startPractice = () => {
    seenPracticeWarnings.current.clear();
    markGuideSeen();
    setPractice({ game: createInitialState(missionFor(DEFAULT_DIFFICULTY)), tutorial: startTutorial() });
    setScreen('mission');
    window.scrollTo(0, 0);
  };
  const exitToMenu = () => { if (practicing) setPractice(null); setScreen('menu'); };
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
    if (practicing) { setPractice(null); setExpedition(null); setScreen('menu'); return; }
    clearSave(storage);
    seenBaseWarnings.current.clear();
    setSaved(false);
    setLive({ game: createInitialState(missionFor(DEFAULT_DIFFICULTY)), tutorial: null });
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
            notice={notice === 'invalid' ? t('save.invalid') : notice === 'resumed' ? t('save.resumed') : notice === 'migrated' ? t('save.migrated') : null}
            onHow={() => setScreen('how')}
            onCredits={() => setScreen('credits')}
            onPractice={() => openPractice('menu')}
            fx={fx}
          />
        )}
        {screen === 'difficulty' && <DifficultySelect initial={pick} onStart={chooseGuide} onBack={() => setScreen('menu')} />}
        {screen === 'guide-choice' && <TutorialStart difficulty={pick} first={!seenGuide} onGuided={() => startFresh(true)} onDirect={() => startFresh(false)} onBack={() => setScreen('difficulty')} />}
        {screen === 'practice' && <TutorialStart onGuided={startPractice} onBack={() => setScreen(practiceBack)} />}
        {screen === 'how' && <HowToPlay cfg={saved ? cfg : missionFor(pick)} onBack={() => setScreen('menu')} onStart={saved && game.status === 'playing' ? continueGame : newGame} onPractice={() => openPractice('how')} />}
        {screen === 'credits' && <Credits onBack={() => setScreen('menu')} />}
        {screen === 'mission' && (
          <MissionScreen
            state={game}
            setState={setGame}
            onFinish={() => setScreen('results')}
            onQuit={exitToMenu}
            onExplore={(id) => { exitDone.current = false; if (!practicing) setNotice(null); setExpedition(id); setScreen('explore'); }}
            fx={fx}
            onToggleFx={toggleFx}
            seenWarnings={practicing ? seenPracticeWarnings.current : seenBaseWarnings.current}
            tutorial={tutorial}
            teach={teach}
            practice={practicing}
          />
        )}
        {screen === 'explore' && expedition && (
          <ExploreScreen
            missionId={expedition}
            difficulty={game.difficulty}
            fx={fx}
            tutorial={tutorial}
            teach={teach}
            onExit={(result) => {
              if (exitDone.current) return;
              exitDone.current = true;
              // The base game state is kept in App while exploring; only the result is applied (once).
              updateRun(previous => {
                const g = previous.game;
                const next = applyExpedition(g, missionFor(g.difficulty), expedition, result);
                const docked = result.success && next.expeditionsDone.includes(expedition);
                let progress = previous.tutorial;
                if (docked) {
                  progress = learn(progress, { type: 'rover', skill: 'docked' });
                  if (expedition === 'solarRepair') progress = learn(progress, { type: 'rover', skill: 'solar' });
                }
                return { game: next, tutorial: progress };
              });
              setExpedition(null);
              setScreen('mission');
            }}
          />
        )}
        {screen === 'results' && <Results state={game} onRestart={practicing ? startPractice : chooseDifficulty} onMenu={exitToMenu} />}
      </Guard>
      {confirm && slot && <ConfirmNewGame slot={slot} onYes={chooseDifficulty} onNo={() => setConfirm(false)} />}
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
