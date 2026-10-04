import { CELLS, SPAN, GRID, GLADE_C0, GLADE_C1, DOOR_CELL, T, cellToWorld } from './config.js';
import { THEMES } from './data.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const inGladeCell = (cx, cy) =>
  cx >= GLADE_C0 && cx <= GLADE_C1 && cy >= GLADE_C0 && cy <= GLADE_C1;

/** Sector 0..7 around the Glade; each door faces the middle of a sector. */
export function sectorOfCell(cx, cy) {
  if (inGladeCell(cx, cy)) return 255;
  const a = Math.atan2(cy - DOOR_CELL, cx - DOOR_CELL);
  return Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 8;
}

/** Fixed per save: which theme each of the 8 sectors gets. */
export function themeOrder(seed) {
  const R = rng(seed * 13 + 7);
  const o = THEMES.map((_, i) => i);
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function generateMaze(seed, order) {
  const R = rng(seed);
  const g = new Uint8Array(GRID * GRID).fill(T.WALL);
  const set = (x, y, v) => { g[y * GRID + x] = v; };
  const get = (x, y) => g[y * GRID + x];
  const chebyshev = (cx, cy) => Math.max(Math.abs(cx - DOOR_CELL), Math.abs(cy - DOOR_CELL));
  const themeOfCell = (cx, cy) => THEMES[order[sectorOfCell(cx, cy)]];

  for (let cy = 0; cy < CELLS; cy++)
    for (let cx = 0; cx < CELLS; cx++) {
      if (inGladeCell(cx, cy)) continue;
      for (let i = 1; i < SPAN; i++)
        for (let j = 1; j < SPAN; j++) set(cx * SPAN + i, cy * SPAN + j, T.FLOOR);
    }

  const between = (cx, cy, dx, dy) => {
    const out = [];
    if (dx) {
      const x = (dx > 0 ? cx + 1 : cx) * SPAN;
      for (let j = 1; j < SPAN; j++) out.push([x, cy * SPAN + j]);
    } else {
      const y = (dy > 0 ? cy + 1 : cy) * SPAN;
      for (let i = 1; i < SPAN; i++) out.push([cx * SPAN + i, y]);
    }
    return out;
  };
  const open = (cx, cy, dx, dy) => between(cx, cy, dx, dy).forEach(([x, y]) => set(x, y, T.FLOOR));
  const isOpen = (cx, cy, dx, dy) => get(...between(cx, cy, dx, dy)[0]) !== T.WALL;
  const valid = (cx, cy) => cx >= 0 && cy >= 0 && cx < CELLS && cy < CELLS && !inGladeCell(cx, cy);

  // Recursive backtracker: long winding corridors.
  const visited = new Uint8Array(CELLS * CELLS);
  const stack = [[0, 0]];
  visited[0] = 1;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = DIRS.filter(([dx, dy]) => valid(cx + dx, cy + dy) && !visited[(cy + dy) * CELLS + cx + dx]);
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy] = opts[Math.floor(R() * opts.length)];
    open(cx, cy, dx, dy);
    visited[(cy + dy) * CELLS + cx + dx] = 1;
    stack.push([cx + dx, cy + dy]);
  }

  // Loops, and a few open "plazas" so fights have room.
  for (let cy = 0; cy < CELLS; cy++)
    for (let cx = 0; cx < CELLS; cx++) {
      if (!valid(cx, cy)) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (valid(cx + dx, cy + dy) && !isOpen(cx, cy, dx, dy) && R() < 0.12) open(cx, cy, dx, dy);
      }
    }
  for (let k = 0; k < 7; k++) {
    const cx = 1 + Math.floor(R() * (CELLS - 3)), cy = 1 + Math.floor(R() * (CELLS - 3));
    if (!valid(cx, cy) || !valid(cx + 1, cy + 1) || !valid(cx + 1, cy) || !valid(cx, cy + 1)) continue;
    open(cx, cy, 1, 0); open(cx, cy, 0, 1); open(cx + 1, cy, 0, 1); open(cx, cy + 1, 1, 0);
    set((cx + 1) * SPAN, (cy + 1) * SPAN, T.FLOOR);
  }

  // Remove lone pillars where four corridors meet.
  for (let j = 1; j < CELLS; j++)
    for (let i = 1; i < CELLS; i++) {
      const px = i * SPAN, py = j * SPAN;
      if (inGladeCell(i, j) || inGladeCell(i - 1, j - 1) || inGladeCell(i - 1, j) || inGladeCell(i, j - 1)) continue;
      if (get(px + 1, py) !== T.WALL && get(px - 1, py) !== T.WALL && get(px, py + 1) !== T.WALL && get(px, py - 1) !== T.WALL && R() < 0.6)
        set(px, py, T.FLOOR);
    }

  // The Glade and its ring wall.
  const a = GLADE_C0 * SPAN, b = (GLADE_C1 + 1) * SPAN;
  for (let y = a; y <= b; y++)
    for (let x = a; x <= b; x++) set(x, y, x === a || x === b || y === a || y === b ? T.RING : T.GLADE);
  const d0 = DOOR_CELL * SPAN + 1, d1 = DOOR_CELL * SPAN + 2;
  const doors = [
    { side: 'N', axis: 'x', tiles: [[d0, a], [d1, a]], out: [0, -1] },
    { side: 'S', axis: 'x', tiles: [[d0, b], [d1, b]], out: [0, 1] },
    { side: 'W', axis: 'z', tiles: [[a, d0], [a, d1]], out: [-1, 0] },
    { side: 'E', axis: 'z', tiles: [[b, d0], [b, d1]], out: [1, 0] },
  ];
  for (const d of doors) for (const [x, y] of d.tiles) set(x, y, T.DOOR);
  const nearDoor = (cx, cy) => Math.abs(cx - DOOR_CELL) <= 1 && (Math.abs(cy - GLADE_C0 + 1) <= 1 || Math.abs(cy - GLADE_C1 - 1) <= 1)
    || Math.abs(cy - DOOR_CELL) <= 1 && (Math.abs(cx - GLADE_C0 + 1) <= 1 || Math.abs(cx - GLADE_C1 - 1) <= 1);

  // Dead ends (good loot spots) vs. regular cells.
  const deadEnds = [], cellsOpen = [];
  const exits = (cx, cy) => DIRS.filter(([dx, dy]) => {
    const [x, y] = between(cx, cy, dx, dy)[0];
    return x > 0 && y > 0 && x < GRID - 1 && y < GRID - 1 && get(x, y) !== T.WALL && get(x, y) !== T.RING;
  });
  for (let cy = 0; cy < CELLS; cy++)
    for (let cx = 0; cx < CELLS; cx++) {
      if (!valid(cx, cy)) continue;
      const n = exits(cx, cy).length;
      (n === 1 ? deadEnds : cellsOpen).push([cx, cy, chebyshev(cx, cy)]);
    }
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const used = new Set();
  const key = (cx, cy) => cy * CELLS + cx;
  const take = (list, pred) => { const c = list.find((p) => !used.has(key(p[0], p[1])) && pred(p)); if (c) used.add(key(c[0], c[1])); return c ?? null; };

  // Points of interest.
  const byDist = [...deadEnds].sort((p, q) => q[2] - p[2]);
  const holeC = take(byDist, () => true);
  shuffle(deadEnds);
  const fragC = take(deadEnds, ([, , d]) => d >= 10) ?? take(deadEnds, () => true);
  const vaultC = take(deadEnds, ([, , d]) => d >= 7);
  let vault = null;
  if (vaultC) {
    const [vx, vy] = vaultC;
    const [dx, dy] = exits(vx, vy)[0];
    const gate = between(vx, vy, dx, dy);
    for (const [x, y] of gate) set(x, y, T.GATE);
    const sec = sectorOfCell(vx, vy);
    shuffle(cellsOpen);
    const levers = [];
    for (const pass of [true, false]) {
      for (const c of cellsOpen) {
        if (levers.length >= 3) break;
        if (used.has(key(c[0], c[1])) || c[2] < 5) continue;
        if (pass && sectorOfCell(c[0], c[1]) !== sec) continue;
        if (Math.abs(c[0] - vx) + Math.abs(c[1] - vy) < 4) continue;
        used.add(key(c[0], c[1]));
        levers.push([c[0], c[1]]);
      }
    }
    vault = { cell: [vx, vy], gate, levers };
  }
  const shrines = [];
  const kinds = ['swift', 'fury', 'regen'];
  for (let i = 0; i < 4; i++) {
    const c = take(cellsOpen, ([, , d]) => d >= 6);
    if (c) shrines.push({ cell: [c[0], c[1]], kind: kinds[i % 3] });
  }
  const strandedC = R() < 0.75 ? take(deadEnds, ([, , d]) => d >= 7) : null;

  // Sector features on walls and floors.
  const shifters = [];
  const cracks = [];
  const water = [], bushes = [], spikes = [], vents = [];
  for (let cy = 0; cy < CELLS; cy++)
    for (let cx = 0; cx < CELLS; cx++) {
      if (!valid(cx, cy)) continue;
      const th = themeOfCell(cx, cy);
      const poi = used.has(key(cx, cy));
      const door = nearDoor(cx, cy);
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (!valid(cx + dx, cy + dy) || door || nearDoor(cx + dx, cy + dy)) continue;
        const tiles = between(cx, cy, dx, dy);
        const t0 = get(...tiles[0]);
        if (t0 === T.GATE) continue;
        if (used.has(key(cx + dx, cy + dy)) || poi) continue;
        const r = R();
        if (r < th.shift && shifters.length < 60) {
          for (const [x, y] of tiles) set(x, y, T.SHIFT);
          shifters.push({ tiles, startOpen: t0 !== T.WALL, period: 26 + R() * 26, phase: R() });
        } else if (t0 === T.WALL && R() < th.crack) {
          for (const [x, y] of tiles) set(x, y, T.CRACK);
          cracks.push({ tiles });
        }
      }
      if (poi || door) continue;
      const interior = [[1, 1], [2, 1], [1, 2], [2, 2]].map(([i, j]) => [cx * SPAN + i, cy * SPAN + j]);
      const r = R();
      if (r < th.water) water.push(...interior);
      else if (r < th.water + th.bush) bushes.push(...interior);
      else if (r < th.water + th.bush + th.spikes) spikes.push(...interior);
      else if (r < th.water + th.bush + th.spikes + th.vents) vents.push([cx, cy]);
    }

  // Crates
  const crates = [];
  const place = (cx, cy, d) => {
    if (used.has(key(cx, cy))) return;
    used.add(key(cx, cy));
    const th = themeOfCell(cx, cy);
    const metal = R() < (th.metal ?? (d >= 9 ? 0.45 : 0.15));
    crates.push({ x: cellToWorld(cx) + (R() - 0.5) * 0.8, z: cellToWorld(cy) + (R() - 0.5) * 0.8, type: metal ? 'metal' : 'wood' });
  };
  shuffle(deadEnds).slice(0, 44).forEach(([cx, cy, d]) => place(cx, cy, d));
  shuffle(cellsOpen).filter(([, , d]) => d > 6).slice(0, 26).forEach(([cx, cy, d]) => place(cx, cy, d));

  return {
    seed, grid: g, doors, crates, order,
    fragment: [fragC[0], fragC[1]],
    hole: [holeC[0], holeC[1]],
    vault, shrines,
    stranded: strandedC ? [strandedC[0], strandedC[1]] : null,
    shifters, cracks, water, bushes, spikes, vents,
    deadEnds: deadEnds.map(([x, y]) => [x, y]),
  };
}
