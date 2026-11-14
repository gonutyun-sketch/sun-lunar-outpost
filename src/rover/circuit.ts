/**
 * Circuit-rotation repair puzzle (pure logic).
 * A 3×3 grid of tiles; each tile connects some of its sides (N=1, E=2, S=4, W=8).
 * Power enters from the West side of the middle-left tile and must reach the East side of the
 * bottom-right tile. Three damaged tiles can be rotated; the rest are fixed.
 */
export const N = 1, E = 2, S = 4, W = 8;

export interface Tile {
  mask: number;
  rotatable: boolean;
}

export interface Circuit {
  size: number;
  tiles: Tile[]; // row-major
  source: { row: number; col: number; side: number };
  sink: { row: number; col: number; side: number };
}

/** Rotate a side mask 90° clockwise. */
export const rotateMask = (m: number) => ((m << 1) | (m >> 3)) & 15;

const OPP: Record<number, number> = { [N]: S, [S]: N, [E]: W, [W]: E };
const STEP: Record<number, [number, number]> = { [N]: [-1, 0], [S]: [1, 0], [E]: [0, 1], [W]: [0, -1] };

/** Solution path: W→(1,0)→(0,0)→(0,1)→(0,2)→(1,2)→(2,2)→E. Rotatable tiles start scrambled. */
export function createCircuit(): Circuit {
  const solved = [
    { r: 0, c: 0, mask: S | E, rot: true },
    { r: 0, c: 1, mask: W | E, rot: false },
    { r: 0, c: 2, mask: W | S, rot: true },
    { r: 1, c: 0, mask: W | N, rot: false },
    { r: 1, c: 2, mask: N | S, rot: false },
    { r: 2, c: 2, mask: N | E, rot: true },
  ];
  // decorative fixed pieces that are not on the path
  const tiles: Tile[] = Array.from({ length: 9 }, (_, i) => ({ mask: [0, 0, 0, 0, E | W, 0, N | E, W | E, 0][i], rotatable: false }));
  for (const p of solved) {
    // scramble rotatable tiles by 1–2 quarter turns (always unsolved at start)
    let mask = p.mask;
    // scramble: 2, 1 and 3 quarter turns → the player needs 2 + 3 + 1 = 6 rotations
    const turns = p.r === 0 && p.c === 0 ? 2 : p.r === 0 ? 1 : 3;
    if (p.rot) for (let k = 0; k < turns; k++) mask = rotateMask(mask);
    tiles[p.r * 3 + p.c] = { mask, rotatable: p.rot };
  }
  // middle tile: decorative cross piece that is NOT connected to the path tiles (fixed)
  tiles[4] = { mask: 0, rotatable: false };
  return { size: 3, tiles, source: { row: 1, col: 0, side: W }, sink: { row: 2, col: 2, side: E } };
}

export function rotateTile(c: Circuit, index: number): Circuit {
  const t = c.tiles[index];
  if (!t?.rotatable) return c;
  const tiles = c.tiles.slice();
  tiles[index] = { ...t, mask: rotateMask(t.mask) };
  return { ...c, tiles };
}

/** Indices of tiles currently powered from the source (flood fill through matching sides). */
export function powered(c: Circuit): Set<number> {
  const out = new Set<number>();
  const { row, col, side } = c.source;
  const first = row * c.size + col;
  if (!(c.tiles[first].mask & side)) return out;
  const stack = [first];
  out.add(first);
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / c.size), cc = i % c.size;
    for (const d of [N, E, S, W]) {
      if (!(c.tiles[i].mask & d)) continue;
      const [dr, dc] = STEP[d];
      const nr = r + dr, nc = cc + dc;
      if (nr < 0 || nc < 0 || nr >= c.size || nc >= c.size) continue;
      const j = nr * c.size + nc;
      if (out.has(j) || !(c.tiles[j].mask & OPP[d])) continue;
      out.add(j);
      stack.push(j);
    }
  }
  return out;
}

export function isSolved(c: Circuit): boolean {
  const k = c.sink.row * c.size + c.sink.col;
  return powered(c).has(k) && !!(c.tiles[k].mask & c.sink.side);
}
