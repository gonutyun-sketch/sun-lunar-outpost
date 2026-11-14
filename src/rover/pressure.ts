/**
 * Pressure-regulation repair minigame (pure logic, unit-tested).
 * Three gauges, each fed by a valve the player opens/closes by hand.
 * - Pressure follows its valve with a lag and is pulled down by a constant leak,
 *   so each valve must sit a little ABOVE its target band.
 * - Holding a valve key accelerates the valve; turning it too fast makes the
 *   pressure wobble (unstable). Gentle taps keep it steady.
 * - Over-pressure (> VENT) triggers a safety vent: the gauge drops and the hold timer resets.
 * - Success: all three gauges inside their bands continuously for HOLD seconds.
 * All values are fictional gameplay units.
 */
export const P = {
  response: 1.6, // 1/s — how fast pressure follows the valve
  valveAccel: 80, // %/s² while a key is held
  kick: 20, // %/s immediately on a fresh press, so every tap moves the valve (below the wobble threshold)
  valveMax: 50, // %/s max valve speed
  wobbleGain: 30, // wobble added per second at full valve speed (above the calm threshold)
  calm: 0.7, // fraction of max valve speed that causes no wobble (taps stay calm, long holds do not)
  wobbleDecay: 0.25, // 1/s — instability fades slowly, so rushing costs time
  vent: 95,
  ventTo: 25,
  hold: 3, // seconds all gauges must stay in band
};

export interface Gauge {
  p: number; // pressure 0..100
  valve: number; // valve opening 0..100
  speed: number; // current valve speed %/s (signed)
  wobble: number; // instability amplitude
  leak: number; // pressure lost per second
  band: [number, number];
}

export interface PressureGame {
  gauges: Gauge[];
  time: number;
  stable: number;
  vents: number;
  done: boolean;
}

export function createPressureGame(): PressureGame {
  const mk = (leak: number, band: [number, number], p: number): Gauge => ({ p, valve: p, speed: 0, wobble: 0, leak, band });
  return {
    gauges: [mk(2.5, [55, 68], 22), mk(4, [38, 50], 70), mk(5.5, [62, 74], 30)],
    time: 0,
    stable: 0,
    vents: 0,
    done: false,
  };
}

export const inBand = (g: Gauge) => g.p >= g.band[0] && g.p <= g.band[1];

/** Advance by dt. `sel` = gauge being adjusted; `dir` = +1 open, −1 close, 0 none. */
export function stepPressure(s: PressureGame, sel: number, dir: -1 | 0 | 1, dt: number): { game: PressureGame; vented: number | null } {
  if (s.done) return { game: s, vented: null };
  let vented: number | null = null;
  const time = s.time + dt;
  const gauges = s.gauges.map((g0, i) => {
    const g = { ...g0 };
    if (i === sel && dir !== 0) {
      // keep accelerating in the held direction; reversing starts from rest
      const same = Math.sign(g.speed) === dir;
      g.speed = (same ? g.speed : dir * P.kick) + dir * P.valveAccel * dt;
      if (Math.abs(g.speed) > P.valveMax) g.speed = dir * P.valveMax;
    } else {
      g.speed = 0;
    }
    g.valve = Math.max(0, Math.min(100, g.valve + g.speed * dt));
    const frac = Math.abs(g.speed) / P.valveMax;
    if (frac > P.calm) g.wobble += P.wobbleGain * (frac - P.calm) * dt / (1 - P.calm) * 2;
    g.wobble *= Math.exp(-P.wobbleDecay * dt);
    const osc = g.wobble * Math.sin(time * 6.5 + i * 2.1) * 6.5;
    g.p += ((g.valve - g.p) * P.response - g.leak + osc) * dt;
    g.p = Math.max(0, Math.min(100, g.p));
    if (g.p > P.vent) {
      g.p = P.ventTo;
      g.wobble = 0;
      vented = i;
    }
    return g;
  });
  const all = gauges.every(inBand);
  const stable = vented !== null || !all ? 0 : s.stable + dt;
  return {
    game: { gauges, time, stable, vents: s.vents + (vented !== null ? 1 : 0), done: stable >= P.hold },
    vented,
  };
}
