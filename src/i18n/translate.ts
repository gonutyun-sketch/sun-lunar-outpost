/** Pure translation helpers (no React) — usable from game/debrief code and tests. */
import { en } from './en';
import { ko } from './ko';

export type Lang = 'ko' | 'en';
export type Key = keyof typeof en;
export type Params = Record<string, string | number>;
export type T = (key: Key, params?: Params) => string;

export const LANGS: Lang[] = ['ko', 'en'];
export const DEFAULT_LANG: Lang = 'ko';
const DICTS: Record<Lang, Record<Key, string>> = { en, ko };

export function translate(lang: Lang, key: Key, params?: Params): string {
  const s = DICTS[lang][key] ?? en[key] ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m)) : s;
}

export const makeT = (lang: Lang): T => (key, params) => translate(lang, key, params);
