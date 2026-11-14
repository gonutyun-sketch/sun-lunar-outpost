import { it } from 'vitest';
import { MISSION } from '../src/game/config';
import { bestPlay } from '../src/game/analysis';
it('best', () => {
  const b = bestPlay(MISSION);
  console.log('[best]', b.score, 'states', b.states);
  console.log('[best] plan', JSON.stringify(b.plan.map((m) => [Object.entries(m.facilities).filter(([, v]) => v).map(([k]) => k).join('+'), m.build, m.choice])));
}, 900000);
