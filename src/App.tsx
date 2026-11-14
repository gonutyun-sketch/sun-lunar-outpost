import { useState } from 'react';
import { MISSION } from './game/config';
import { applyExpedition, createInitialState } from './game/engine';
import type { GameState } from './game/types';
import { ExploreScreen } from './ui/ExploreScreen';
import { MissionScreen } from './ui/MissionScreen';
import { Credits, HowToPlay, MainMenu, Results, Starfield } from './ui/Screens';

type Screen = 'menu' | 'how' | 'credits' | 'mission' | 'explore' | 'results';

function readFxPref(): boolean {
  try {
    return localStorage.getItem('sun-fx') !== 'off';
  } catch {
    return true;
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [game, setGame] = useState<GameState>(() => createInitialState(MISSION));
  const [fx, setFx] = useState(readFxPref);
  const [expedition, setExpedition] = useState<string | null>(null);

  const start = () => {
    const fresh = createInitialState(MISSION);
    // Development-only QA shortcut: ?devShift=N starts at shift N (stripped from production builds)
    const dev = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('devShift')) : 0;
    setGame(dev > 1 && dev <= MISSION.totalShifts ? { ...fresh, shift: dev } : fresh);
    setScreen('mission');
  };
  const toggleFx = () => {
    const next = !fx;
    setFx(next);
    try { localStorage.setItem('sun-fx', next ? 'on' : 'off'); } catch { /* storage unavailable */ }
  };

  return (
    <div className={fx ? '' : 'no-fx'}>
      {screen !== 'mission' && screen !== 'explore' && <Starfield />}
      {screen === 'menu' && <MainMenu onStart={start} onHow={() => setScreen('how')} onCredits={() => setScreen('credits')} />}
      {screen === 'how' && <HowToPlay onBack={() => setScreen('menu')} onStart={start} />}
      {screen === 'credits' && <Credits onBack={() => setScreen('menu')} />}
      {screen === 'mission' && (
        <MissionScreen
          state={game}
          setState={setGame}
          onFinish={() => setScreen('results')}
          onQuit={() => setScreen('menu')}
          onExplore={(id) => { setExpedition(id); setScreen('explore'); }}
          fx={fx}
          onToggleFx={toggleFx}
        />
      )}
      {screen === 'explore' && expedition && (
        <ExploreScreen
          missionId={expedition}
          fx={fx}
          onExit={(result) => {
            // The base game state is kept in App while exploring; only the result is applied.
            setGame((g) => applyExpedition(g, MISSION, expedition, result));
            setExpedition(null);
            setScreen('mission');
          }}
        />
      )}
      {screen === 'results' && <Results state={game} onRestart={start} onMenu={() => setScreen('menu')} />}
    </div>
  );
}
