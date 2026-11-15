import type { RoverTuning } from '../game/difficulty';
import { ROVER } from '../rover/sim';
import type { TutorialEvent, TutorialProgress } from '../tutorial/progress';
import type { GuideMessage } from './TutorialGuide';

export function roverMessage(progress: TutorialProgress, tune: RoverTuning, view: {
  step: string; touch: boolean; touchUI: boolean; near: boolean; tile: number; success: boolean; solar: boolean;
}, send: (event: TutorialEvent) => void): GuideMessage {
  const stage = (n: number) => [n, 6] as const;
  const interactionTarget = view.touch ? 'rover-action' : view.touchUI ? 'rover-objective' : 'rover-prompt';
  if (view.success) return { id: 'rover-done', title: 'tut.rover.done', body: 'tut.rover.done.line', stage: stage(6), mood: 'happy', target: 'rover-finish' };
  if (view.step === 'dock') return {
    id: view.near ? 'rover-dock' : 'rover-return', title: view.near ? 'tut.rover.dock' : 'tut.rover.return',
    body: view.near ? view.touch ? 'tut.rover.dock.touch' : 'tut.rover.dock.keys' : view.solar ? 'tut.rover.return.repaired' : 'tut.rover.return.line',
    target: view.near ? interactionTarget : 'rover-objective', stage: stage(6), mood: view.solar ? 'happy' : 'ready',
  };
  if (view.step === 'circuit') return {
    id: progress.rover.rotated ? 'rover-solve' : 'rover-circuit',
    title: progress.rover.rotated ? 'tut.rover.circuit.solve' : 'tut.rover.circuit',
    body: progress.rover.rotated ? 'tut.rover.circuit.solveLine' : view.touch ? 'tut.rover.circuit.touch' : 'tut.rover.circuit.keys',
    target: progress.rover.rotated ? 'circuit' : `circuit-tile-${view.tile}`, stage: stage(5), mood: progress.rover.rotated ? 'happy' : 'thinking',
  };
  if (view.near) return {
    id: 'rover-interact', title: 'tut.rover.near', stage: stage(4), mood: 'happy', target: interactionTarget,
    body: view.step === 'collect' ? view.touch ? 'tut.rover.drill.touch' : 'tut.rover.drill.keys' : view.touch ? 'tut.rover.near.touch' : 'tut.rover.near.keys',
  };
  if (!progress.rover.moved) return { id: 'rover-move', title: 'tut.rover.move',
    body: view.touch ? 'tut.rover.move.touch' : 'tut.rover.move.keys', target: view.touch ? 'rover-stick' : view.touchUI ? 'rover-objective' : 'rover-keys', stage: stage(1) };
  if (!progress.rover.battery) {
    const drive = Number((ROVER.sunCharge - ROVER.moveDrain * tune.drainScale).toFixed(2));
    return { id: 'rover-battery', title: 'tut.rover.battery', body: 'tut.rover.battery.line', target: 'rover-battery', stage: stage(2), mood: 'happy',
      params: { sun: ROVER.sunCharge, drive: drive > 0 ? `+${drive}` : drive, shade: Number((ROVER.shadowDrain * tune.drainScale).toFixed(2)) },
      action: { label: 'tut.checked', run: () => send({ type: 'rover', skill: 'battery' }) } };
  }
  return { id: 'rover-target', title: 'tut.rover.target', body: 'tut.rover.target.line', target: 'rover-objective', stage: stage(3) };
}
