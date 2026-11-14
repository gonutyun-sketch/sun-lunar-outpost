/**
 * Save / continue (browser localStorage). Pure helpers — no React.
 *
 * What is stored: only the mission GameState (shift, resources, facilities, upgrades, decisions,
 * shift history, rover results) plus a version number and a save time. No names, IDs or other
 * personal data. Language ('sun-lang') and effects ('sun-fx') keep their own keys.
 *
 * Rover exploration uses a checkpoint: the base state is not changed while exploring, so the save
 * always holds the last safe base state. `exploring` marks an interrupted run so the menu can say
 * the game resumes from the base; the expedition result is applied (once) only when the run ends.
 */
import { FACILITY_IDS, UPGRADE_IDS } from './types';
import type { GameState, MissionConfig } from './types';

export const SAVE_KEY = 'sun-save';
export const SAVE_VERSION = 1;

export interface SaveFile {
  v: number;
  savedAt: number;
  state: GameState;
  /** Expedition id while the rover is out (checkpoint marker); null at the base. */
  exploring: string | null;
}

export type LoadResult =
  | { kind: 'none' }
  | { kind: 'ok'; save: SaveFile }
  /** Present but unreadable (corrupt JSON, wrong shape or another version): ignored and removed. */
  | { kind: 'invalid'; reason: 'parse' | 'version' | 'shape' };

/** Minimal storage interface (localStorage-compatible) so the logic can be unit tested. */
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function browserStorage(): KV | null {
  try {
    const s = window.localStorage;
    return s ?? null;
  } catch {
    return null; // private mode / blocked storage: the game still runs, just without saving
  }
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const RES = ['energy', 'oxygen', 'food', 'health', 'research'] as const;
const STATUS = ['playing', 'success', 'partial', 'failed'];
const FAIL = ['oxygen', 'food', 'health', 'power'];

function validResources(x: unknown): boolean {
  return isObj(x) && RES.every((k) => isNum(x[k]) && x[k] >= 0 && x[k] <= 1000);
}
function validFlags(x: unknown, keys: readonly string[]): boolean {
  return isObj(x) && keys.every((k) => typeof x[k] === 'boolean');
}

/** Structural check of a GameState read from storage against the current mission config. */
export function isValidState(x: unknown, cfg: MissionConfig): x is GameState {
  if (!isObj(x)) return false;
  const expIds = cfg.expeditions.map((e) => e.id);
  if (!isNum(x.shift) || !Number.isInteger(x.shift) || x.shift < 1 || x.shift > cfg.totalShifts) return false;
  if (!validResources(x.resources)) return false;
  if (!validFlags(x.facilities, FACILITY_IDS) || !validFlags(x.upgrades, UPGRADE_IDS)) return false;
  if (x.build !== null && !UPGRADE_IDS.includes(x.build as never)) return false;
  if (x.choice !== null) {
    const ev = cfg.events.find((e) => e.shift === x.shift);
    if (!ev || !ev.choices.some((c) => c.id === x.choice)) return false;
  }
  if (!Array.isArray(x.expeditionsDone) || !x.expeditionsDone.every((id) => expIds.includes(id as string))) return false;
  if (new Set(x.expeditionsDone).size !== x.expeditionsDone.length) return false;
  if (!isNum(x.expeditionFails) || x.expeditionFails < 0) return false;
  if (!Array.isArray(x.expeditionLog) || !x.expeditionLog.every((l) => isObj(l) && isNum(l.shift) && expIds.includes(l.id as string) && typeof l.success === 'boolean' && isNum(l.failures))) return false;
  if (typeof x.status !== 'string' || !STATUS.includes(x.status)) return false;
  if (x.failReason !== undefined && !FAIL.includes(x.failReason as string)) return false;
  if (!Array.isArray(x.history) || x.history.length > cfg.totalShifts) return false;
  // History feeds the shift reports, results graph and debrief: check the fields they read.
  const okHistory = x.history.every((h, i) =>
    isObj(h) && h.shift === i + 1 && validResources(h.before) && validResources(h.after) &&
    validFlags(h.facilities, FACILITY_IDS) && validFlags(h.ran, FACILITY_IDS) &&
    isNum(h.solar) && isNum(h.illumination) && isNum(h.demand) && Array.isArray(h.demandBreakdown) &&
    typeof h.radiation === 'string');
  if (!okHistory) return false;
  // History must be consistent with the current shift.
  if (x.status === 'playing' && x.history.length !== x.shift - 1) return false;
  return true;
}

export function loadGame(kv: KV | null, cfg: MissionConfig): LoadResult {
  if (!kv) return { kind: 'none' };
  let raw: string | null;
  try { raw = kv.getItem(SAVE_KEY); } catch { return { kind: 'none' }; }
  if (raw === null) return { kind: 'none' };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return discard(kv, 'parse'); }
  if (!isObj(data)) return discard(kv, 'shape');
  if (data.v !== SAVE_VERSION) return discard(kv, 'version'); // future: migrate older versions here
  if (!isValidState(data.state, cfg)) return discard(kv, 'shape');
  const exploring = typeof data.exploring === 'string' && cfg.expeditions.some((e) => e.id === data.exploring) ? data.exploring : null;
  return { kind: 'ok', save: { v: SAVE_VERSION, savedAt: isNum(data.savedAt) ? data.savedAt : 0, state: data.state, exploring } };
}

function discard(kv: KV, reason: 'parse' | 'version' | 'shape'): LoadResult {
  try { kv.removeItem(SAVE_KEY); } catch { /* ignore */ }
  return { kind: 'invalid', reason };
}

export function saveGame(kv: KV | null, state: GameState, exploring: string | null = null, now = Date.now()): boolean {
  if (!kv) return false;
  const file: SaveFile = { v: SAVE_VERSION, savedAt: now, state, exploring };
  try {
    kv.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false; // quota / blocked storage: keep playing without saving
  }
}

export function clearSave(kv: KV | null): void {
  try { kv?.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

/** A save the player would lose by starting over (an unfinished mission). */
export function hasProgress(save: SaveFile | null): boolean {
  return !!save && save.state.status === 'playing' && (save.state.shift > 1 || save.state.history.length > 0 || save.state.expeditionLog.length > 0 || save.state.build !== null || save.state.choice !== null);
}
