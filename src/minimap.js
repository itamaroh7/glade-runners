import { GRID, T, worldToTile } from './config.js';

const COLORS = {
  [T.FLOOR]: [222, 214, 196],
  [T.WALL]: [60, 54, 82],
  [T.RING]: [92, 74, 64],
  [T.DOOR]: [255, 192, 74],
  [T.GLADE]: [124, 201, 90],
};

export class Minimap {
  constructor(small, big) {
    this.small = small;
    this.big = big;
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = GRID;
    this.bctx = this.base.getContext('2d');
    this.img = this.bctx.createImageData(GRID, GRID);
    this.explored = new Uint8Array(GRID * GRID);
    this.count = 0;
    this.total = 1;
    this.dirty = true;
  }

  reset(maze) {
    this.maze = maze;
    this.explored.fill(0);
    this.img.data.fill(0);
    this.count = 0;
    this.total = 0;
    for (let i = 0; i < GRID * GRID; i++) {
      const t = maze.grid[i];
      if (t === T.FLOOR) this.total++;
      if (t === T.GLADE || t === T.RING || t === T.DOOR) this.mark(i);
    }
    this.dirty = true;
  }

  mark(i) {
    if (this.explored[i]) return false;
    this.explored[i] = 1;
    const c = COLORS[this.maze.grid[i]];
    const d = this.img.data;
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    if (this.maze.grid[i] === T.FLOOR) this.count++;
    this.dirty = true;
    return true;
  }

  reveal(x, z, radius = 6) {
    const cx = worldToTile(x), cz = worldToTile(z);
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const tx = cx + dx, tz = cz + dz;
        if (tx < 0 || tz < 0 || tx >= GRID || tz >= GRID) continue;
        this.mark(tz * GRID + tx);
      }
  }

  get percent() { return Math.round((this.count / Math.max(1, this.total)) * 100); }

  flush() {
    if (!this.dirty) return;
    this.bctx.putImageData(this.img, 0, 0);
    this.dirty = false;
  }

  drawMarkers(ctx, markers, toScreen, s, clampBox) {
    for (const m of markers) {
      let [x, y] = toScreen(m.x / 2 + GRID / 2, m.z / 2 + GRID / 2);
      if (clampBox) {
        if (!m.edge && (x < 0 || y < 0 || x > clampBox || y > clampBox)) continue;
        x = Math.max(4, Math.min(clampBox - 4, x));
        y = Math.max(4, Math.min(clampBox - 4, y));
      }
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.5, s * (m.r ?? 0.8)), 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, s * 0.3);
      ctx.strokeStyle = '#1d1426';
      ctx.stroke();
    }
  }

  drawSmall(player, facing, markers = []) {
    this.flush();
    const cv = this.small;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth * dpr, h = cv.clientHeight * dpr;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(24,18,40,0.82)';
    ctx.fillRect(0, 0, w, h);
    const view = 34; // tiles across
    const px = player.pos.x / 2 + GRID / 2, pz = player.pos.z / 2 + GRID / 2;
    const s = w / view;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, px - view / 2, pz - view / 2, view, view, 0, 0, w, h);
    this.drawMarkers(ctx, markers, (tx, tz) => [(tx - px + view / 2) * s, (tz - pz + view / 2) * s], s, w);
    this.drawPlayer(ctx, w / 2, h / 2, facing, s * 1.6);
  }

  drawBig(player, facing, markers = []) {
    this.flush();
    const cv = this.big;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth * dpr, h = cv.clientHeight * dpr;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const size = Math.min(w, h);
    const ox = (w - size) / 2, oy = (h - size) / 2;
    ctx.fillStyle = 'rgba(24,18,40,0.9)';
    ctx.fillRect(ox, oy, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, ox, oy, size, size);
    const s = size / GRID;
    const px = ox + (player.pos.x / 2 + GRID / 2) * s, pz = oy + (player.pos.z / 2 + GRID / 2) * s;
    this.drawMarkers(ctx, markers, (tx, tz) => [ox + tx * s, oy + tz * s], s * 1.2, 0);
    this.drawPlayer(ctx, px, pz, facing, s * 2.4);
  }

  drawPlayer(ctx, x, y, facing, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-facing);
    ctx.beginPath();
    ctx.moveTo(0, r * 1.2);
    ctx.lineTo(r * 0.85, -r * 0.8);
    ctx.lineTo(0, -r * 0.35);
    ctx.lineTo(-r * 0.85, -r * 0.8);
    ctx.closePath();
    ctx.fillStyle = '#4fd1ff';
    ctx.strokeStyle = '#1d1426';
    ctx.lineWidth = Math.max(2, r * 0.35);
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}
