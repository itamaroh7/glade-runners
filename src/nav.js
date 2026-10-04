import { CELLS, SPAN, cellToWorld, worldToTile } from './config.js';
import { inGladeCell } from './maze.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const clampC = (v) => Math.max(0, Math.min(CELLS - 1, v));

/**
 * Navigation on the cell graph. Corridor openings are centred on cell centres, so
 * walking centre-to-centre never clips a wall.
 */
export class Nav {
  constructor(world) {
    this.world = world;
    this.queue = new Int16Array(CELLS * CELLS);
  }

  cellOf(x, z) {
    return [clampC(Math.floor(worldToTile(x) / SPAN)), clampC(Math.floor(worldToTile(z) / SPAN))];
  }

  center(cx, cy, out) { out.x = cellToWorld(cx); out.z = cellToWorld(cy); return out; }

  open(cx, cy, dx, dy, glade = false) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= CELLS || ny >= CELLS) return false;
    if (!glade && (inGladeCell(nx, ny) || inGladeCell(cx, cy))) return false;
    let tx, tz;
    if (dx) { tx = (dx > 0 ? cx + 1 : cx) * SPAN; tz = cy * SPAN + 1; }
    else { tx = cx * SPAN + 1; tz = (dy > 0 ? cy + 1 : cy) * SPAN; }
    return !this.world.solidTile(tx, tz);
  }

  neighbours(cx, cy, glade = false) {
    const out = [];
    for (const [dx, dy] of DIRS) if (this.open(cx, cy, dx, dy, glade)) out.push([cx + dx, cy + dy]);
    return out;
  }

  /** BFS distances from (cx,cy) into dist (Int16Array, -1 = unreached). */
  flow(cx, cy, dist, glade = false, maxD = 200) {
    dist.fill(-1);
    const q = this.queue;
    let h = 0, t = 0;
    const start = cy * CELLS + cx;
    dist[start] = 0;
    q[t++] = start;
    while (h < t) {
      const c = q[h++];
      const x = c % CELLS, y = (c / CELLS) | 0;
      const d = dist[c];
      if (d >= maxD) continue;
      for (const [dx, dy] of DIRS) {
        const n = (y + dy) * CELLS + x + dx;
        if (!this.open(x, y, dx, dy, glade) || dist[n] !== -1) continue;
        dist[n] = d + 1;
        q[t++] = n;
      }
    }
    return dist;
  }

  /** Neighbour cell that is one step closer along a flow field (or null). */
  downhill(cx, cy, dist, glade = false) {
    const here = dist[cy * CELLS + cx];
    let best = null, bd = here < 0 ? 1e9 : here;
    for (const [dx, dy] of DIRS) {
      if (!this.open(cx, cy, dx, dy, glade)) continue;
      const d = dist[(cy + dy) * CELLS + cx + dx];
      if (d >= 0 && d < bd) { bd = d; best = [cx + dx, cy + dy]; }
    }
    return best;
  }
}
