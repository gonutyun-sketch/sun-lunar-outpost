import { describe, expect, it } from 'vitest';
import { MISSION } from '../game/config';
import { takeaways, missionTitle } from '../game/debrief';
import { createInitialState } from '../game/engine';
import { en } from './en';
import { ko } from './ko';
import { makeT, translate, type Key } from './translate';

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n dictionaries', () => {
  it('Korean has every English key and no extra keys', () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
  });

  it('placeholders match between languages', () => {
    for (const k of Object.keys(en) as Key[]) expect(params(ko[k]), k).toEqual(params(en[k]));
  });

  it('no empty Korean strings', () => {
    for (const k of Object.keys(ko) as Key[]) expect(ko[k].trim().length, k).toBeGreaterThan(0);
  });

  it('substitutes parameters', () => {
    expect(translate('ko', 'mission.shift', { n: 3, total: 8 })).toBe('임무 교대 3 / 8');
    expect(translate('en', 'advance.hintEnds', { n: 2 })).toBe('Ends Shift 2 (12 h)');
  });

  it('debrief text follows the chosen language', () => {
    const s = { ...createInitialState(MISSION), status: 'success' as const };
    expect(missionTitle(s, makeT('ko'))).toBe('임무 성공');
    expect(missionTitle(s, makeT('en'))).toBe('Mission Successful');
    expect(takeaways(s, MISSION, makeT('ko'))[0]).toContain('NASA LRO/LOLA');
  });
});
