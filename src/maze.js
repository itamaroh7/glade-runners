import { CELLS, SPAN, GRID, GLADE_C0, GLADE_C1, DOOR_CELL, T, cellToWorld } from './config.js';

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

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function generateMaze(seed) {
  const R = rng(seed);
  const g = new Uint8Array(GRID * GRID).fill(T.WALL);
  const set = (x, y, v) => { g[y * GRID + x] = v; };
  const get = (x, y) => g[y * GRID + x];

  for (let cy = 0; cy < CELLS; cy++)
    for (let cx = 0; cx < CELLS; cx++) {
      if (inGladeCell(cx, cy)) continue;
      for (let i = 1; i < SPAN; i++)
        for (let j = 1; j < SPAN; j++) set(cx * SPAN + i, cy * SPAN + j, T.FLOOR);
    }

  // Wall tiles separating cell (cx,cy) from its neighbour in direction (dx,dy).
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

  // Extra openings so there are loops and escape routes.
  for (let cy = 0; cy < CELLS; cy++)
    for (let cx = 0; cx < CELLS; cx++) {
      if (!valid(cx, cy)) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (valid(cx + dx, cy + dy) && !isOpen(cx, cy, dx, dy) && R() < 0.11) open(cx, cy, dx, dy);
      }
    }

  // Remove some lone pillars left where four corridors meet.
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

  // Dead ends are where the good loot hides.
  const deadEnds = [];
  const cellsOpen = [];
  for (let cy = 0; cy < CELLS; cy++)
    for (let cx = 0; cx < CELLS; cx++) {
      if (!valid(cx, cy)) continue;
      let n = 0;
      for (const [dx, dy] of DIRS) {
        const [x, y] = between(cx, cy, dx, dy)[0];
        if (x > 0 && y > 0 && x < GRID - 1 && y < GRID - 1 && get(x, y) !== T.WALL && get(x, y) !== T.RING) n++;
      }
      const dist = Math.max(Math.abs(cx - 12), Math.abs(cy - 12));
      if (n === 1) deadEnds.push([cx, cy, dist]);
      else cellsOpen.push([cx, cy, dist]);
    }

  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const crates = [];
  const used = new Set();

  // Special spots: the day's code piece and the (final-day) Grinder hole.
  const byDist = [...deadEnds].sort((p, q) => q[2] - p[2]);
  const hole = byDist[0] ? [byDist[0][0], byDist[0][1]] : [0, 0];
  const farOnes = byDist.filter(([, , d]) => d >= 8).slice(1);
  const fr = farOnes.length ? farOnes[Math.floor(R() * farOnes.length)] : byDist[1] ?? byDist[0];
  const fragment = [fr[0], fr[1]];
  used.add(hole[1] * CELLS + hole[0]);
  used.add(fragment[1] * CELLS + fragment[0]);
  const place = (cx, cy, dist) => {
    const key = cy * CELLS + cx;
    if (used.has(key)) return;
    used.add(key);
    // Metal supply boxes are rarer and further out.
    const metal = dist >= 7 ? R() < 0.55 : R() < 0.15;
    crates.push({ x: cellToWorld(cx) + (R() - 0.5) * 0.8, z: cellToWorld(cy) + (R() - 0.5) * 0.8, type: metal ? 'metal' : 'wood' });
  };
  shuffle(deadEnds).slice(0, 26).forEach(([cx, cy, d]) => place(cx, cy, d));
  shuffle(cellsOpen).filter(([, , d]) => d > 4).slice(0, 14).forEach(([cx, cy, d]) => place(cx, cy, d));

  return { seed, grid: g, doors, crates, fragment, hole };
}
