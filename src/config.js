// World layout: the maze is a grid of cells; every cell is (SPAN-1)x(SPAN-1) floor
// tiles with a one-tile wall line between cells. The Glade is a block of cells
// in the middle, ringed by tall walls with one door on each side.
export const TILE = 2;
export const SPAN = 3;
export const CELLS = 25;
export const GRID = CELLS * SPAN + 1; // 76 tiles per side
export const GLADE_C0 = 9;
export const GLADE_C1 = 15;
export const DOOR_CELL = 12;
export const WALL_H = 3.2;
export const RING_H = 4.6;
export const GLADE_HALF = ((GLADE_C1 + 1 - GLADE_C0) * SPAN - 1) * TILE / 2; // 20 world units

export const T = { FLOOR: 0, WALL: 1, RING: 2, DOOR: 3, GLADE: 4 };

const params = new URLSearchParams(location.search);
export const DEBUG = params.has('debug');
const dayLen = Number(params.get('day')) || 300;
export const DAY = {
  length: dayLen,
  openAt: 2.5,
  openDur: 4,
  closeDur: 12,
  warnLeft: Math.min(60, dayLen * 0.25),
};

export const tileToWorld = (t) => (t + 0.5 - GRID / 2) * TILE;
export const worldToTile = (w) => Math.floor(w / TILE + GRID / 2);
export const cellToWorld = (c) => (c * SPAN + SPAN / 2 + 0.5 - GRID / 2) * TILE;
