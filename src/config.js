// World layout: the maze is a grid of cells; every cell is (SPAN-1)x(SPAN-1) floor
// tiles with a one-tile wall line between cells. The Glade is a block of cells
// in the middle, ringed by tall walls with one door on each side.
export const TILE = 2;
export const SPAN = 3;
export const CELLS = 35;
export const GRID = CELLS * SPAN + 1; // 106 tiles per side
export const GLADE_C0 = 12;
export const GLADE_C1 = 22;
export const DOOR_CELL = 17;
export const WALL_H = 3.2;
export const RING_H = 4.6;
export const GLADE_HALF = ((GLADE_C1 + 1 - GLADE_C0) * SPAN - 1) * TILE / 2; // 32 world units

export const T = { FLOOR: 0, WALL: 1, RING: 2, DOOR: 3, GLADE: 4, SHIFT: 5, CRACK: 6, GATE: 7 };

const params = new URLSearchParams(location.search);
export const DEBUG = params.has('debug');
const dayLen = Number(params.get('day')) || 420;
export const DAY = {
  length: dayLen,
  openAt: Math.min(25, dayLen * 0.06), // doors open by themselves (or when you tap one)
  openDur: 4,
  closeDur: 12,
  warnLeft: Math.min(60, dayLen * 0.2),
};

export const tileToWorld = (t) => (t + 0.5 - GRID / 2) * TILE;
export const worldToTile = (w) => Math.floor(w / TILE + GRID / 2);
export const cellToWorld = (c) => (c * SPAN + SPAN / 2 + 0.5 - GRID / 2) * TILE;
