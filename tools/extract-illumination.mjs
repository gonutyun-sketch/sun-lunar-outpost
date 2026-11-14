#!/usr/bin/env node
/**
 * Reproducible extraction of average solar illumination from the NASA LRO/LOLA
 * polar illumination product (Mazarico et al. 2011), PDS product
 * AVGVISIB_85S_060M_201608 (85°S–90°S, 60 m/px, polar stereographic).
 *
 * Only the few image rows around each site are downloaded via HTTP Range
 * requests (~50 KB per site) instead of the full 51 MB IMG file.
 *
 * Usage: node tools/extract-illumination.mjs [lat lon] ...
 *   (no args = run the verification + site list below)
 *
 * Label facts (AVGVISIB_85S_060M_201608.LBL):
 *   LINES = LINE_SAMPLES = 5058, RECORD_BYTES = 10116, LSB_INTEGER 16-bit
 *   SCALING_FACTOR = 0.00004, OFFSET = 0  -> value = fraction of time sunlit (0..1)
 *   MAP_SCALE = 60 m/px, sphere radius 1737.4 km, CENTER_LATITUDE = -90
 * Projection (DSMAP_POLAR.CAT, LOLA PDS catalog): in the south, longitude 0
 * points up (toward line 1) and 90°E points right (higher sample).
 */
const URL_IMG = 'http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/AVGVISIB_85S_060M_201608.IMG';
const N = 5058;
const RECORD_BYTES = 10116;
const SCALE = 60; // m/px
const R_MOON = 1737400; // m
const DN_SCALE = 0.00004;

/** lat/lon (deg, planetocentric, east-positive) -> 1-based sample I, line J. */
export function toPixel(lat, lon) {
  const r = 2 * R_MOON * Math.tan(((90 - Math.abs(lat)) * Math.PI) / 360);
  const x = r * Math.sin((lon * Math.PI) / 180);
  const y = r * Math.cos((lon * Math.PI) / 180);
  return { I: Math.round(x / SCALE + N / 2 + 0.5), J: Math.round(-y / SCALE + N / 2 + 0.5) };
}

/** 1-based pixel -> lat/lon, per DSMAP_POLAR.CAT forward equations (NS = -1). */
export function toLatLon(I, J) {
  const x = (I - N / 2 - 0.5) * SCALE;
  const y = (J - N / 2 - 0.5) * SCALE * -1;
  const r = Math.hypot(x, y);
  return { lat: -90 + (180 / Math.PI) * 2 * Math.atan((0.5 * r) / R_MOON), lon: (Math.atan2(x, y) * 180) / Math.PI };
}

async function readWindow(I, J, rad) {
  const first = J - rad, last = J + rad;
  const start = (first - 1) * RECORD_BYTES;
  const end = last * RECORD_BYTES - 1;
  const res = await fetch(URL_IMG, { headers: { Range: `bytes=${start}-${end}` } });
  if (res.status !== 206) throw new Error(`Range request failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const grid = [];
  for (let j = first; j <= last; j++) {
    const row = [];
    for (let i = I - rad; i <= I + rad; i++) {
      row.push(buf.readInt16LE((j - first) * RECORD_BYTES + (i - 1) * 2) * DN_SCALE);
    }
    grid.push(row);
  }
  return grid;
}

export async function sample(lat, lon, rad = 2) {
  const { I, J } = toPixel(lat, lon);
  const grid = await readWindow(I, J, rad);
  const flat = grid.flat();
  const center = grid[rad][rad];
  let best = { v: -1, i: 0, j: 0 };
  grid.forEach((row, dj) => row.forEach((v, di) => { if (v > best.v) best = { v, i: I - rad + di, j: J - rad + dj }; }));
  return {
    lat, lon, I, J,
    center: +center.toFixed(4),
    mean: +(flat.reduce((a, b) => a + b, 0) / flat.length).toFixed(4),
    max: +best.v.toFixed(4),
    maxAt: { I: best.i, J: best.j, ...Object.fromEntries(Object.entries(toLatLon(best.i, best.j)).map(([k, v]) => [k, +v.toFixed(4)])) },
    windowKm: +(((2 * rad + 1) * SCALE) / 1000).toFixed(2),
  };
}

const argv = process.argv.slice(2);
const args = argv.map(Number);
if (argv[0] === '--scan') {
  // --scan lat lon radiusPx : brightest pixel in a square window (radius ≤ 80 px ≈ 1.6 MB)
  const [lat, lon, rad] = args.slice(1);
  console.log(JSON.stringify(await sample(lat, lon, Math.min(80, rad || 40))));
} else if (args.length >= 2) {
  for (let k = 0; k + 1 < args.length; k += 2) console.log(JSON.stringify(await sample(args[k], args[k + 1], 2)));
} else {
  // Orientation check: crater floors that are known permanently shadowed regions should read ~0.
  const psr = [
    ['Shackleton floor', -89.67, 129.78],
    ['Shoemaker floor', -88.1, 44.9],
    ['Faustini floor', -87.3, 77.0],
    ['Haworth floor', -87.45, -5.1],
    ['de Gerlache floor', -88.5, -87.1],
  ];
  for (const [name, lat, lon] of psr) {
    const s = await sample(lat, lon, 2);
    console.log(`PSR check  ${name.padEnd(18)} center=${s.center} mean=${s.mean}`);
  }
}
