import { useState } from 'react';
import { MISSION } from './game/config';
import { createInitialState } from './game/engine';
import type { GameState } from './game/types';
import { MissionScreen } from './ui/MissionScreen';
import { Credits, HowToPlay, MainMenu, Results, Starfield } from './ui/Screens';

type Screen = 'menu' | 'how' | 'credits' | 'mission' | 'results';

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

  const start = () => {
    setGame(createInitialState(MISSION));
    setScreen('mission');
  };
  const toggleFx = () => {
    const next = !fx;
    setFx(next);
    try { localStorage.setItem('sun-fx', next ? 'on' : 'off'); } catch { /* storage unavailable */ }
  };

  return (
    <div className={fx ? '' : 'no-fx'}>
      {screen !== 'mission' && <Starfield />}
      {screen === 'menu' && <MainMenu onStart={start} onHow={() => setScreen('how')} onCredits={() => setScreen('credits')} />}
      {screen === 'how' && <HowToPlay onBack={() => setScreen('menu')} onStart={start} />}
      {screen === 'credits' && <Credits onBack={() => setScreen('menu')} />}
      {screen === 'mission' && (
        <MissionScreen
          state={game}
          setState={setGame}
          onFinish={() => setScreen('results')}
          onQuit={() => setScreen('menu')}
          fx={fx}
          onToggleFx={toggleFx}
        />
      )}
      {screen === 'results' && <Results state={game} onRestart={start} onMenu={() => setScreen('menu')} />}
    </div>
  );
}
