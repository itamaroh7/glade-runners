import * as THREE from 'three';
import { TILE, GRID, T, WALL_H, RING_H, GLADE_HALF, SPAN, CELLS, tileToWorld, worldToTile, cellToWorld } from './config.js';
import { toon, outlineMat, hullMat, blockGeo, merge, paint } from './materials.js';
import { rng, sectorOfCell } from './maze.js';
import { THEMES, SHRINES } from './data.js';

const texCache = {};
export function checkerTex(key, c1, c2, { speck = 0x000000, speckAlpha = 0.06, bevel = 0.08, tufts = false, single = false } = {}) {
  if (texCache[key]) return texCache[key];
  const s = single ? 128 : 256, h = single ? 128 : s / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const x = cv.getContext('2d');
  const R = rng(key.length * 991);
  const n = single ? 1 : 2;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      x.fillStyle = '#' + new THREE.Color((i + j) % 2 ? c2 : c1).getHexString();
      x.fillRect(i * h, j * h, h, h);
      x.fillStyle = `rgba(255,255,255,${bevel})`;
      x.fillRect(i * h, j * h, h, 4);
      x.fillRect(i * h, j * h, 4, h);
      x.fillStyle = `rgba(0,0,0,${bevel * 1.2})`;
      x.fillRect(i * h, j * h + h - 4, h, 4);
      x.fillRect(i * h + h - 4, j * h, 4, h);
    }
  const sc = new THREE.Color(speck);
  for (let k = 0; k < (single ? 70 : 260); k++) {
    x.fillStyle = `rgba(${sc.r * 255 | 0},${sc.g * 255 | 0},${sc.b * 255 | 0},${speckAlpha * (0.5 + R())})`;
    x.beginPath();
    x.arc(R() * s, R() * s, 1 + R() * 3, 0, Math.PI * 2);
    x.fill();
  }
  if (tufts) {
    x.strokeStyle = 'rgba(40,110,40,0.35)';
    x.lineWidth = 3;
    x.lineCap = 'round';
    for (let k = 0; k < 40; k++) {
      const px = R() * s, py = R() * s;
      for (const dx of [-5, 0, 5]) { x.beginPath(); x.moveTo(px, py); x.lineTo(px + dx, py - 9 - R() * 4); x.stroke(); }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache[key] = tex;
  return tex;
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const E = new THREE.Euler();
const C = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function instanced(geo, mat, list, fn, { shadow = false, receive = false } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  mesh.count = list.length;
  list.forEach((it, i) => fn(it, i, mesh));
  mesh.castShadow = shadow;
  mesh.receiveShadow = receive;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export class World {
  /** opts: { fragment, hole, particles, sfx } */
  constructor(scene, maze, opts = {}) {
    this.scene = scene;
    this.maze = maze;
    this.grid = maze.grid;
    this.opts = opts;
    this.particles = opts.particles;
    this.R = rng(maze.seed * 7 + 3);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.circles = [];
    this.rects = [];
    this.doorByTile = new Map();
    this.time = 0;
    this.shiftH = new Float32Array(GRID * GRID);
    this.flags = new Uint8Array(GRID * GRID); // bit 1 water, 2 bush, 4 spikes
    this.sector = new Uint8Array(GRID * GRID);
    for (let z = 0; z < GRID; z++)
      for (let x = 0; x < GRID; x++) {
        const cx = Math.min(CELLS - 1, Math.floor(x / SPAN)), cy = Math.min(CELLS - 1, Math.floor(z / SPAN));
        this.sector[z * GRID + x] = sectorOfCell(cx, cy);
      }
    for (const [x, z] of maze.water) this.flags[z * GRID + x] |= 1;
    for (const [x, z] of maze.bushes) this.flags[z * GRID + x] |= 2;
    for (const [x, z] of maze.spikes) this.flags[z * GRID + x] |= 4;

    this.buildFloor();
    this.buildWalls();
    this.buildIvy();
    this.buildDoors();
    this.buildShifters();
    this.buildCracks();
    this.buildDecor();
    this.buildHazards();
    this.buildPOIs();
    if (opts.fragment) this.buildFragment(opts.fragment);
    if (opts.hole) this.buildHole(opts.hole);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && o.material.userData?.own) o.material.dispose();
    });
  }

  tile(tx, tz) { return this.grid[tz * GRID + tx]; }
  themeAtTile(tx, tz) { const s = this.sector[tz * GRID + tx]; return s === 255 ? null : THEMES[this.maze.order[s]]; }
  sectorAt(x, z) {
    const tx = worldToTile(x), tz = worldToTile(z);
    if (tx < 0 || tz < 0 || tx >= GRID || tz >= GRID) return 255;
    return this.sector[tz * GRID + tx];
  }
  themeAt(x, z) { const s = this.sectorAt(x, z); return s === 255 ? null : THEMES[this.maze.order[s]]; }
  flagAt(x, z) {
    const tx = worldToTile(x), tz = worldToTile(z);
    if (tx < 0 || tz < 0 || tx >= GRID || tz >= GRID) return 0;
    return this.flags[tz * GRID + tx];
  }

  // ---------- floor & walls ----------
  buildFloor() {
    const tex = checkerTex('stone1', 0xf2f0f6, 0xf2f0f6, { speck: 0x3a3550, speckAlpha: 0.12, single: true, bevel: 0.1 });
    const tiles = [];
    for (let z = 0; z < GRID; z++)
      for (let x = 0; x < GRID; x++) {
        const t = this.tile(x, z);
        if (t === T.WALL || t === T.RING || t === T.GLADE) continue;
        tiles.push([x, z]);
      }
    const geo = new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2);
    const mat = toon(0xffffff, { map: tex });
    const floor = instanced(geo, mat, tiles, ([x, z], i, m) => {
      M.makeTranslation(tileToWorld(x), 0, tileToWorld(z));
      m.setMatrixAt(i, M);
      const th = this.themeAtTile(x, z) ?? THEMES[7];
      const water = this.flags[z * GRID + x] & 1;
      C.set(water ? 0x5d7f8a : th.floor[(x + z) & 1]);
      m.setColorAt(i, C);
    }, { receive: true });
    this.group.add(floor);

    const outer = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), toon(0x3b3a4f));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    this.group.add(outer);

    const grass = checkerTex('grass', 0x82cc5c, 0x78c254, { speck: 0x2f6e2a, speckAlpha: 0.1, tufts: true });
    const gt = grass.clone();
    gt.repeat.set(GLADE_HALF / TILE, GLADE_HALF / TILE);
    gt.needsUpdate = true;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(GLADE_HALF * 2, GLADE_HALF * 2), toon(0xffffff, { map: gt }));
    g.rotation.x = -Math.PI / 2;
    g.position.y = 0.01;
    g.receiveShadow = true;
    this.group.add(g);
  }

  buildWalls() {
    const byTheme = THEMES.map(() => []);
    const rings = [];
    for (let z = 0; z < GRID; z++)
      for (let x = 0; x < GRID; x++) {
        const t = this.tile(x, z);
        if (t === T.WALL) {
          // Wall lines take the theme of a neighbouring floor so seams look right.
          const th = this.themeAtTile(x, z);
          byTheme[th ? THEMES.indexOf(th) : 7].push([x, z]);
        } else if (t === T.RING) rings.push([x, z]);
      }
    const vc = toon(0xffffff, { vertexColors: true });
    byTheme.forEach((list, i) => {
      if (!list.length) return;
      const mesh = instanced(blockGeo(TILE, WALL_H, TILE, THEMES[i].wall), vc, list, ([x, z], k, m) => {
        M.makeTranslation(tileToWorld(x), 0, tileToWorld(z));
        m.setMatrixAt(k, M);
        const v = 0.9 + this.R() * 0.14;
        m.setColorAt(k, C.setRGB(v, v, v));
      }, { shadow: true, receive: true });
      this.group.add(mesh);
    });
    this.group.add(instanced(blockGeo(TILE, RING_H, TILE, { bottom: 0x5a4a44, top: 0xb19d89, rim: 0x55843f, cap: 0x7fbd5a }), vc, rings, ([x, z], k, m) => {
      M.makeTranslation(tileToWorld(x), 0, tileToWorld(z));
      m.setMatrixAt(k, M);
      const v = 0.9 + this.R() * 0.14;
      m.setColorAt(k, C.setRGB(v, v, v));
    }, { shadow: true, receive: true }));
  }

  buildIvy() {
    const R = this.R;
    const leaves = [];
    const solid = (t) => t !== T.FLOOR && t !== T.GLADE;
    for (let z = 1; z < GRID - 1; z++)
      for (let x = 1; x < GRID - 1; x++) {
        const t = this.tile(x, z);
        if (t !== T.WALL && t !== T.RING) continue;
        const H = t === T.RING ? RING_H : WALL_H;
        const th = this.themeAtTile(x, z);
        const p = t === T.RING ? 0.7 : (th?.ivy ?? 0.3);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (solid(this.tile(x + dx, z + dz)) || R() > p) continue;
          const u = (R() - 0.5) * TILE * 0.8;
          const len = H * (0.25 + R() * 0.7);
          for (let y = H - 0.05; y > H - len; y -= 0.34 + R() * 0.1) {
            const off = TILE / 2 + 0.06;
            leaves.push([tileToWorld(x) + dx * off + (dz ? u + (R() - 0.5) * 0.25 : 0), y, tileToWorld(z) + dz * off + (dx ? u + (R() - 0.5) * 0.25 : 0), Math.atan2(dx, dz), 0.7 + R() * 0.6, R()]);
          }
        }
      }
    const list = leaves.slice(0, 12000);
    const geo = new THREE.OctahedronGeometry(0.3, 0);
    geo.scale(1, 0.85, 0.45);
    const greens = [0x3f8f3a, 0x4fa444, 0x5bb54c, 0x367a34].map((c) => new THREE.Color(c));
    this.group.add(instanced(geo, toon(0xffffff), list, ([px, py, pz, rot, s, r], i, m) => {
      E.set((r - 0.5) * 0.6, rot, (r - 0.5) * 1.2);
      M.compose(P.set(px, py, pz), Q.setFromEuler(E), S.setScalar(s));
      m.setMatrixAt(i, M);
      m.setColorAt(i, greens[Math.floor(r * greens.length)]);
    }));
  }

  buildDoors() {
    const slabGeo = blockGeo(TILE * 0.98, RING_H - 0.08, TILE * 0.7, { bottom: 0x3d3644, top: 0x777082, rim: 0x2f2a36, cap: 0x5a5366, inset: 0.1 });
    const toothGeo = new THREE.ConeGeometry(0.22, 0.75, 6);
    toothGeo.rotateZ(-Math.PI / 2);
    const toothMat = toon(0x6e6878);
    this.doors = this.maze.doors.map((d) => {
      const door = { ...d, open: 0, slabs: [] };
      d.tiles.forEach(([tx, tz], k) => {
        const grp = new THREE.Group();
        const slab = new THREE.Mesh(slabGeo, toon(0xffffff, { vertexColors: true }));
        slab.castShadow = slab.receiveShadow = true;
        grp.add(slab);
        const dir = k === 0 ? 1 : -1;
        for (let i = 0; i < 3; i++) {
          const tooth = new THREE.Mesh(toothGeo, toothMat);
          tooth.add(new THREE.Mesh(toothGeo, outlineMat(0.04)));
          tooth.position.set(dir * (TILE / 2 + 0.25), 0.7 + i * 1.2 + (k ? 0.6 : 0), 0);
          if (dir < 0) tooth.rotation.y = Math.PI;
          grp.add(tooth);
        }
        if (d.axis === 'z') grp.rotation.y = Math.PI / 2;
        const closed = new THREE.Vector3(tileToWorld(tx), 0, tileToWorld(tz));
        const shift = (k === 0 ? -1 : 1) * TILE * 1.02;
        const opened = closed.clone().add(d.axis === 'x' ? new THREE.Vector3(shift, 0, 0) : new THREE.Vector3(0, 0, shift));
        grp.position.copy(closed);
        this.group.add(grp);
        door.slabs.push({ grp, closed, opened });
        this.doorByTile.set(tz * GRID + tx, door);
      });
      const [ax, az] = d.tiles[0], [bx, bz] = d.tiles[1];
      door.center = new THREE.Vector3((tileToWorld(ax) + tileToWorld(bx)) / 2, 0, (tileToWorld(az) + tileToWorld(bz)) / 2);
      return door;
    });
  }

  setDoors(f) {
    for (const d of this.doors) {
      d.open = f;
      const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
      for (const s of d.slabs) s.grp.position.lerpVectors(s.closed, s.opened, e);
    }
  }

  // ---------- moving walls ----------
  buildShifters() {
    const segs = this.maze.shifters;
    const list = [];
    segs.forEach((s, si) => { s.h = s.startOpen ? 0 : 1; s.warn = false; for (const t of s.tiles) list.push([t, si]); });
    this.shiftList = list;
    const geo = blockGeo(TILE * 0.98, WALL_H, TILE * 0.98, { bottom: 0x3a3548, top: 0x7a7090, rim: 0xf2c14e, cap: 0x5e5674, inset: 0.22 });
    this.shiftMesh = instanced(geo, toon(0xffffff, { vertexColors: true }), list, () => {}, { shadow: true, receive: true });
    this.shiftMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.shiftMesh);
    const stripe = new THREE.PlaneGeometry(TILE * 0.95, TILE * 0.95).rotateX(-Math.PI / 2);
    this.warnMat = new THREE.MeshBasicMaterial({ color: 0xffc531, transparent: true, opacity: 0, depthWrite: false });
    this.warnMat.userData.own = true;
    this.warnMesh = instanced(stripe, this.warnMat, list, ([[x, z]], i, m) => { M.makeTranslation(tileToWorld(x), 0.03, tileToWorld(z)); m.setMatrixAt(i, M); });
    this.warnMesh.renderOrder = 2;
    this.group.add(this.warnMesh);
    this.updateShifters(0, true);
  }

  updateShifters(dt, force = false) {
    const segs = this.maze.shifters;
    let anyWarn = false;
    const near = [];
    for (const s of segs) {
      const P0 = s.period, half = P0 / 2;
      const cyc = ((this.time + s.phase * P0) % P0 + P0) % P0;
      const firstHalf = cyc < half;
      const closed = s.startOpen ? !firstHalf : firstHalf;
      const local = cyc % half;
      const k = Math.min(1, local / 1.5);
      const from = closed ? 0 : 1, to = closed ? 1 : 0;
      const nh = this.time < 2 ? to : from + (to - from) * (k * k * (3 - 2 * k));
      const warn = local > half - 3;
      if (warn && !s.warn) near.push(s);
      s.warn = warn;
      if (warn) anyWarn = true;
      if (Math.abs(nh - s.h) > 1e-4 || force) {
        if (nh > s.h + 0.02 && s.h < 0.05 && this.particles) {
          for (const [x, z] of s.tiles) this.particles.burst(tileToWorld(x), 0.3, tileToWorld(z), { n: 4, colors: [0xbdb3a3, 0x958b7c], speed: 2, up: 1.5, size: 0.35, float: true, gravity: 2, life: 1 });
        }
        s.h = nh;
        for (const [x, z] of s.tiles) this.shiftH[z * GRID + x] = nh;
      }
    }
    this.shiftList.forEach(([[x, z], si], i) => {
      const s = segs[si];
      M.makeTranslation(tileToWorld(x), -(1 - s.h) * (WALL_H + 0.05), tileToWorld(z));
      this.shiftMesh.setMatrixAt(i, M);
      const blink = s.warn ? (Math.sin(this.time * 14) > 0 ? 1 : 0.4) : 0;
      M.makeTranslation(tileToWorld(x), s.warn ? 0.03 : -5, tileToWorld(z));
      this.warnMesh.setMatrixAt(i, M);
      if (blink) this.warnMat.opacity = 0.35 + blink * 0.3;
    });
    if (!anyWarn) this.warnMat.opacity = 0;
    this.shiftMesh.instanceMatrix.needsUpdate = true;
    this.warnMesh.instanceMatrix.needsUpdate = true;
    return near;
  }

  // ---------- breakable walls ----------
  buildCracks() {
    const list = [];
    this.crackByTile = new Map();
    this.maze.cracks.forEach((c, ci) => {
      c.hp = 1400;
      c.alive = true;
      c.idx = [];
      for (const t of c.tiles) { c.idx.push(list.length); list.push(t); this.crackByTile.set(t[1] * GRID + t[0], c); }
      c.x = (tileToWorld(c.tiles[0][0]) + tileToWorld(c.tiles[1][0])) / 2;
      c.z = (tileToWorld(c.tiles[0][1]) + tileToWorld(c.tiles[1][1])) / 2;
    });
    const geo = blockGeo(TILE, WALL_H * 0.92, TILE, { bottom: 0x7a6248, top: 0xd8bf96, rim: 0x5a4632, cap: 0xc9ad84, inset: 0.3 });
    // Crack lines painted as dark slivers.
    const crackGeo = merge([0, 1, 2].map((i) => paint(new THREE.BoxGeometry(0.06, 0.9, TILE + 0.02).rotateX(0.4 * (i - 1)).translate((i - 1) * 0.5, 1.2 + i * 0.5, 0), 0x3a2a1e)));
    this.crackMesh = instanced(merge([geo, crackGeo]), toon(0xffffff, { vertexColors: true }), list, ([x, z], i, m) => {
      M.makeTranslation(tileToWorld(x), 0, tileToWorld(z));
      m.setMatrixAt(i, M);
    }, { shadow: true, receive: true });
    this.group.add(this.crackMesh);
  }

  crackAt(x, z) {
    const tx = worldToTile(x), tz = worldToTile(z);
    const c = this.crackByTile.get(tz * GRID + tx);
    return c && c.alive ? c : null;
  }

  /** Returns true when the wall breaks. */
  damageCrack(c, dmg) {
    if (!c.alive) return false;
    c.hp -= dmg;
    this.particles?.burst(c.x, 1.5, c.z, { n: 6, colors: [0xd8bf96, 0x9a8466], speed: 3, up: 3, size: 0.22 });
    if (c.hp > 0) return false;
    c.alive = false;
    for (const [x, z] of c.tiles) this.grid[z * GRID + x] = T.FLOOR;
    for (const i of c.idx) { M.makeScale(0, 0, 0); this.crackMesh.setMatrixAt(i, M); }
    this.crackMesh.instanceMatrix.needsUpdate = true;
    this.particles?.burst(c.x, 1.2, c.z, { n: 30, colors: [0xd8bf96, 0x9a8466, 0x6e5a44], speed: 6, up: 6, size: 0.4, life: 1.1 });
    this.onGridChange?.(c.tiles);
    return true;
  }

  // ---------- decor per sector ----------
  buildDecor() {
    const R = this.R;
    const cellsOf = (pred) => {
      const out = [];
      for (let cy = 0; cy < CELLS; cy++)
        for (let cx = 0; cx < CELLS; cx++) {
          const s = sectorOfCell(cx, cy);
          if (s === 255) continue;
          const th = THEMES[this.maze.order[s]];
          if (pred(th)) out.push([cx, cy, th]);
        }
      return out;
    };

    // Bushes (hide inside them).
    const bushes = [];
    for (const [x, z] of this.maze.bushes) for (let k = 0; k < 3; k++) bushes.push([tileToWorld(x) + (R() - 0.5) * 1.2, tileToWorld(z) + (R() - 0.5) * 1.2, 0.75 + R() * 0.35, R()]);
    const bushGeo = new THREE.IcosahedronGeometry(1, 1);
    const bushCols = [0x3f9446, 0x4aa34c, 0x358a3e].map((c) => new THREE.Color(c));
    const bm = instanced(bushGeo, toon(0xffffff), bushes, ([x, z, s, r], i, m) => {
      M.compose(P.set(x, s * 0.85, z), Q.setFromAxisAngle(UP, r * 6), S.set(s, s * 1.15, s));
      m.setMatrixAt(i, M);
      m.setColorAt(i, bushCols[Math.floor(r * 3)]);
    }, { shadow: true });
    this.group.add(bm);
    this.group.add(instanced(bushGeo, outlineMat(0.06), bushes, ([x, z, s, r], i, m) => {
      M.compose(P.set(x, s * 0.85, z), Q.setFromAxisAngle(UP, r * 6), S.set(s, s * 1.15, s));
      m.setMatrixAt(i, M);
    }));

    // Water surface.
    const water = this.maze.water;
    const wgeo = new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshBasicMaterial({ color: 0x5ec8e8, transparent: true, opacity: 0.5, depthWrite: false });
    this.waterMat.userData.own = true;
    const wm = instanced(wgeo, this.waterMat, water, ([x, z], i, m) => { M.makeTranslation(tileToWorld(x), 0.12, tileToWorld(z)); m.setMatrixAt(i, M); });
    wm.renderOrder = 2;
    this.group.add(wm);
    const reeds = [];
    for (const [x, z] of water) if (R() < 0.35) reeds.push([tileToWorld(x) + (R() - 0.5) * 1.6, tileToWorld(z) + (R() - 0.5) * 1.6, R()]);
    const reedGeo = merge([-0.12, 0, 0.12].map((o, i) => new THREE.ConeGeometry(0.06, 1 + i * 0.25, 4).rotateZ(o * 2).translate(o, 0.5, 0)));
    this.group.add(instanced(reedGeo, toon(0x5a9a46), reeds, ([x, z, r], i, m) => { M.compose(P.set(x, 0, z), Q.setFromAxisAngle(UP, r * 6), S.setScalar(0.8 + r * 0.6)); m.setMatrixAt(i, M); }));

    // Rubble (ruins), mushrooms (glowshade), bones, pipes.
    const rubble = [], shrooms = [], bones = [], skulls = [], pipes = [];
    for (const [cx, cy, th] of cellsOf(() => true)) {
      const bx = cellToWorld(cx), bz = cellToWorld(cy);
      if (th.rubble && R() < 0.45) for (let k = 0; k < 3; k++) rubble.push([bx + (R() - 0.5) * 3.2, bz + (R() - 0.5) * 3.2, 0.2 + R() * 0.35, R()]);
      if (th.shrooms && R() < 0.6) for (let k = 0; k < 3; k++) shrooms.push([bx + (R() - 0.5) * 3.2, bz + (R() - 0.5) * 3.2, 0.6 + R() * 0.7, R()]);
      if (th.bones && R() < 0.4) {
        for (let k = 0; k < 3; k++) bones.push([bx + (R() - 0.5) * 3, bz + (R() - 0.5) * 3, R()]);
        if (R() < 0.5) skulls.push([bx + (R() - 0.5) * 2.4, bz + (R() - 0.5) * 2.4, R()]);
      }
    }
    for (let z = 1; z < GRID - 1; z++)
      for (let x = 1; x < GRID - 1; x++) {
        if (this.tile(x, z) !== T.WALL) continue;
        const th = this.themeAtTile(x, z);
        if (!th?.pipes || R() > 0.35) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (this.tile(x + dx, z + dz) !== T.FLOOR) continue;
          pipes.push([tileToWorld(x) + dx * 1.15, tileToWorld(z) + dz * 1.15, dx !== 0, 0.8 + R() * 1.6]);
          break;
        }
      }
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    this.group.add(instanced(rockGeo, toon(0xb8a07c), rubble, ([x, z, s, r], i, m) => { E.set(r * 3, r * 7, 0); M.compose(P.set(x, s * 0.5, z), Q.setFromEuler(E), S.setScalar(s)); m.setMatrixAt(i, M); }, { shadow: true }));
    const stemGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6).translate(0, 0.25, 0);
    const capGeo = new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.48, 0);
    this.group.add(instanced(stemGeo, toon(0xe8e2f0), shrooms, ([x, z, s], i, m) => { M.compose(P.set(x, 0, z), Q.identity(), S.setScalar(s)); m.setMatrixAt(i, M); }));
    const shroomMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    shroomMat.userData.own = true;
    const sc = [0x6fe8ff, 0xd77aff, 0x7dffb0].map((c) => new THREE.Color(c));
    this.group.add(instanced(capGeo, shroomMat, shrooms, ([x, z, s, r], i, m) => { M.compose(P.set(x, 0, z), Q.identity(), S.setScalar(s)); m.setMatrixAt(i, M); m.setColorAt(i, sc[Math.floor(r * 3)]); }));
    const boneGeo = new THREE.CapsuleGeometry(0.07, 0.6, 3, 6).rotateZ(Math.PI / 2);
    this.group.add(instanced(boneGeo, toon(0xf2ead6), bones, ([x, z, r], i, m) => { M.compose(P.set(x, 0.08, z), Q.setFromAxisAngle(UP, r * 6), S.setScalar(1)); m.setMatrixAt(i, M); }));
    const skullGeo = merge([paint(new THREE.SphereGeometry(0.3, 10, 8), 0xf2ead6), paint(new THREE.SphereGeometry(0.08, 6, 4).translate(-0.11, 0.04, 0.24), 0x2a2020), paint(new THREE.SphereGeometry(0.08, 6, 4).translate(0.11, 0.04, 0.24), 0x2a2020)]);
    this.group.add(instanced(skullGeo, toon(0xffffff, { vertexColors: true }), skulls, ([x, z, r], i, m) => { M.compose(P.set(x, 0.24, z), Q.setFromAxisAngle(UP, r * 6), S.setScalar(1)); m.setMatrixAt(i, M); }));
    const pipeGeo = new THREE.CylinderGeometry(0.16, 0.16, TILE, 8).rotateZ(Math.PI / 2);
    this.group.add(instanced(pipeGeo, toon(0x7f8a9c), pipes, ([x, z, alongZ, h], i, m) => { M.compose(P.set(x, h, z), Q.setFromAxisAngle(UP, alongZ ? Math.PI / 2 : 0), S.setScalar(1)); m.setMatrixAt(i, M); }, { shadow: true }));
  }

  // ---------- traps ----------
  buildHazards() {
    const spikes = this.maze.spikes;
    this.spikePhase = new Map();
    for (const [x, z] of spikes) {
      const cx = Math.floor(x / SPAN), cy = Math.floor(z / SPAN);
      this.spikePhase.set(z * GRID + x, ((cx * 7 + cy * 13) % 10) / 10);
    }
    const plateGeo = new THREE.BoxGeometry(TILE * 0.92, 0.08, TILE * 0.92).translate(0, 0.04, 0);
    this.spikePlateMat = toon(0x6e5a54);
    this.group.add(instanced(plateGeo, this.spikePlateMat, spikes, ([x, z], i, m) => { M.makeTranslation(tileToWorld(x), 0, tileToWorld(z)); m.setMatrixAt(i, M); }, { receive: true }));
    const cone = new THREE.ConeGeometry(0.16, 0.8, 5);
    const sg = merge([[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]].map(([a, b]) => paint(cone.clone().translate(a, 0.4, b), 0xc9ced8)));
    this.spikeList = spikes;
    this.spikeMesh = instanced(sg, toon(0xffffff, { vertexColors: true }), spikes, () => {}, { shadow: true });
    this.spikeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.spikeMesh);

    this.vents = this.maze.vents.map(([cx, cy], i) => ({ x: cellToWorld(cx), z: cellToWorld(cy), phase: (i * 0.37) % 1, state: 'idle' }));
    const ventGeo = merge([
      paint(new THREE.CylinderGeometry(0.8, 0.9, 0.18, 12), 0x3a3f4a),
      ...[-0.4, 0, 0.4].map((o) => paint(new THREE.BoxGeometry(1.3, 0.05, 0.12).translate(0, 0.1, o), 0x1d2028)),
    ]);
    this.group.add(instanced(ventGeo, toon(0xffffff, { vertexColors: true }), this.vents, (v, i, m) => { M.makeTranslation(v.x, 0.05, v.z); m.setMatrixAt(i, M); }, { receive: true }));
  }

  spikeState(tx, tz) {
    const ph = this.spikePhase.get(tz * GRID + tx);
    if (ph === undefined) return 'none';
    const c = ((this.time / 3.4 + ph) % 1) * 3.4;
    return c < 1.6 ? 'idle' : c < 2.3 ? 'warn' : c < 3.2 ? 'up' : 'idle';
  }

  updateHazards() {
    this.spikeList.forEach(([x, z], i) => {
      const st = this.spikeState(x, z);
      const y = st === 'up' ? 0 : st === 'warn' ? -0.55 + Math.sin(this.time * 40) * 0.04 : -0.82;
      M.makeTranslation(tileToWorld(x), y, tileToWorld(z));
      this.spikeMesh.setMatrixAt(i, M);
    });
    this.spikeMesh.instanceMatrix.needsUpdate = true;
    for (const v of this.vents) {
      const c = ((this.time / 4.6 + v.phase) % 1) * 4.6;
      const st = c < 2.8 ? 'idle' : c < 3.6 ? 'warn' : 'burst';
      v.state = st;
      if (!this.particles) continue;
      if (st === 'warn' && Math.random() < 0.3) this.particles.burst(v.x, 0.3, v.z, { n: 1, colors: [0xdfe6ee], speed: 0.6, up: 2, size: 0.25, gravity: -1, float: true, life: 0.6 });
      if (st === 'burst') this.particles.burst(v.x + (Math.random() - 0.5), 0.4, v.z + (Math.random() - 0.5), { n: 2, colors: [0xffffff, 0xdfe6ee, 0xc9d2de], speed: 0.8, up: 9, size: 0.55, gravity: -2, float: true, life: 0.9 });
    }
  }

  // ---------- points of interest ----------
  buildPOIs() {
    const mz = this.maze;
    this.levers = [];
    this.shrines = [];
    this.vault = null;
    if (mz.vault) {
      const v = mz.vault;
      const barGeo = new THREE.CylinderGeometry(0.12, 0.12, WALL_H, 6).translate(0, WALL_H / 2, 0);
      const gate = new THREE.Group();
      for (const [x, z] of v.gate) {
        for (let k = -2; k <= 2; k++) {
          const horiz = this.tile(x + 1, z) === T.GATE || this.tile(x - 1, z) === T.GATE;
          const bar = new THREE.Mesh(barGeo, toon(0xc9a43a));
          bar.position.set(tileToWorld(x) + (horiz ? k * 0.38 : 0), 0, tileToWorld(z) + (horiz ? 0 : k * 0.38));
          bar.castShadow = true;
          gate.add(bar);
        }
      }
      const top = new THREE.Group();
      gate.add(top);
      this.group.add(gate);
      const vx = cellToWorld(v.cell[0]), vz = cellToWorld(v.cell[1]);
      const chest = new THREE.Group();
      const body = new THREE.Mesh(blockGeo(1.6, 0.9, 1.1, { bottom: 0x7a4f2c, top: 0xb57a45, rim: 0xf2c14e, cap: 0xb57a45 }), toon(0xffffff, { vertexColors: true }));
      body.castShadow = true;
      body.add(new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.0, 1.25).translate(0, 0.45, 0), hullMat));
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), toon(0xf2c14e));
      lid.position.set(0, 0.9, 0);
      lid.rotation.y = Math.PI / 2;
      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, 0.9, -0.55);
      lid.position.set(0, 0, 0.55);
      lidPivot.add(lid);
      chest.add(body, lidPivot);
      chest.position.set(vx, 0, vz);
      this.group.add(chest);
      this.circles.push({ x: vx, z: vz, r: 0.9, alive: true, solid: true });
      this.vault = { ...v, x: vx, z: vz, gateMesh: gate, chest, lidPivot, open: false, looted: false, gateY: 0 };
      v.levers.forEach(([cx, cy], i) => {
        const g = new THREE.Group();
        const x = cellToWorld(cx), z = cellToWorld(cy);
        g.position.set(x, 0, z);
        const base = new THREE.Mesh(blockGeo(0.9, 0.5, 0.9, { bottom: 0x4a4561, top: 0x8f89a3, rim: 0x3c3750, cap: 0x6d6880 }), toon(0xffffff, { vertexColors: true }));
        base.castShadow = true;
        const arm = new THREE.Group();
        arm.position.y = 0.5;
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6).translate(0, 0.55, 0), toon(0x8a5a32));
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8).translate(0, 1.1, 0), toon(0xe0393e));
        arm.add(stick, knob);
        arm.rotation.x = -0.7;
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
        light.material.userData.own = true;
        light.position.set(0, 0.6, 0.48);
        g.add(base, arm, light);
        this.group.add(g);
        this.circles.push({ x, z, r: 0.55, alive: true, solid: true });
        this.levers.push({ x, z, arm, light, knob, pulled: false, i });
      });
    }
    for (const s of mz.shrines) {
      const x = cellToWorld(s.cell[0]), z = cellToWorld(s.cell[1]);
      const def = SHRINES[s.kind];
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const ped = new THREE.Mesh(blockGeo(1.2, 0.7, 1.2, { bottom: 0x4a4561, top: 0x9b94ad, rim: 0x3c3750, cap: 0x7a7490 }), toon(0xffffff, { vertexColors: true }));
      ped.castShadow = true;
      const crystalMat = new THREE.MeshBasicMaterial({ color: def.color });
      crystalMat.userData.own = true;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), crystalMat);
      crystal.scale.set(1, 1.6, 1);
      crystal.position.y = 1.7;
      crystal.add(new THREE.Mesh(crystal.geometry, outlineMat(0.06)));
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.45, 28).rotateX(-Math.PI / 2), crystalMat);
      ring.position.y = 0.04;
      g.add(ped, crystal, ring);
      this.group.add(g);
      this.circles.push({ x, z, r: 0.75, alive: true, solid: true });
      this.shrines.push({ x, z, kind: s.kind, crystal, ring, used: false, mat: crystalMat });
    }
  }

  pullLever(l) {
    if (l.pulled) return false;
    l.pulled = true;
    l.light.material.color.setHex(0x5ee05a);
    l.knob.material = toon(0x5ee05a);
    return true;
  }

  openGate() {
    if (!this.vault || this.vault.open) return;
    this.vault.open = true;
    for (const [x, z] of this.vault.gate) this.grid[z * GRID + x] = T.FLOOR;
    this.onGridChange?.(this.vault.gate);
  }

  useShrine(s) {
    s.used = true;
    s.mat.color.setHex(0x55506a);
  }

  buildFragment([cx, cy]) {
    const x = cellToWorld(cx), z = cellToWorld(cy);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const ped = new THREE.Mesh(blockGeo(1.1, 0.6, 1.1, { bottom: 0x4a4561, top: 0x8f89a3, rim: 0x3c3750, cap: 0x6d6880 }), toon(0xffffff, { vertexColors: true }));
    ped.castShadow = true;
    g.add(ped);
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.95, 0.14), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    tablet.material.userData.own = true;
    tablet.position.y = 1.5;
    tablet.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.1), hullMat));
    g.add(tablet);
    const beamGeo = new THREE.CylinderGeometry(0.55, 0.9, 40, 14, 1, true).translate(0, 20, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.material.userData.own = true;
    beam.renderOrder = 4;
    g.add(beam);
    this.group.add(g);
    this.fragment = { x, z, group: g, tablet, beam, taken: false };
  }

  takeFragment() {
    if (!this.fragment || this.fragment.taken) return;
    this.fragment.taken = true;
    this.fragment.tablet.visible = false;
    this.fragment.beam.visible = false;
  }

  buildHole([cx, cy]) {
    const x = cellToWorld(cx), z = cellToWorld(cy);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const pit = new THREE.Mesh(new THREE.CircleGeometry(1.7, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x07040c }));
    pit.position.y = 0.03;
    const rim = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9a5cff }));
    rim.material.userData.own = true;
    rim.position.y = 0.035;
    g.add(pit, rim);
    const rockGeo = new THREE.DodecahedronGeometry(0.35, 0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = new THREE.Mesh(rockGeo, toon(0x5a5268));
      r.position.set(Math.cos(a) * 2.1, 0.15, Math.sin(a) * 2.1);
      r.rotation.set(i, i * 2, 0);
      g.add(r);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 40, 16, 1, true).translate(0, 20, 0), new THREE.MeshBasicMaterial({ color: 0xb07aff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.material.userData.own = true;
    beam.renderOrder = 4;
    g.add(beam);
    this.group.add(g);
    this.hole = { x, z, beam, rim };
  }

  // ---------- per frame ----------
  update(dt) {
    this.time += dt;
    const t = this.time;
    const shiftWarn = this.updateShifters(dt);
    this.updateHazards();
    if (this.fragment && !this.fragment.taken) {
      this.fragment.tablet.rotation.y = t * 1.6;
      this.fragment.tablet.position.y = 1.5 + Math.sin(t * 2.5) * 0.15;
      this.fragment.beam.material.opacity = 0.22 + Math.sin(t * 3) * 0.08;
    }
    if (this.hole) {
      this.hole.beam.material.opacity = 0.2 + Math.sin(t * 2) * 0.08;
      this.hole.rim.material.color.setHSL(0.75, 0.9, 0.55 + Math.sin(t * 4) * 0.1);
    }
    for (const s of this.shrines) {
      s.crystal.rotation.y = t * (s.used ? 0.3 : 1.5);
      s.crystal.position.y = 1.7 + (s.used ? 0 : Math.sin(t * 2.2 + s.x) * 0.15);
    }
    if (this.vault) {
      const v = this.vault;
      if (v.open && v.gateY < WALL_H) { v.gateY = Math.min(WALL_H + 0.1, v.gateY + dt * 2.2); v.gateMesh.position.y = -v.gateY; }
      if (v.looted && v.lidPivot.rotation.x > -1.9) v.lidPivot.rotation.x -= dt * 5;
    }
    this.waterMat.opacity = 0.45 + Math.sin(t * 1.5) * 0.06;
    return shiftWarn;
  }

  // ---------- queries ----------
  solidTile(tx, tz, doorsSolid = false) {
    if (tx < 0 || tz < 0 || tx >= GRID || tz >= GRID) return true;
    const i = tz * GRID + tx;
    const t = this.grid[i];
    if (t === T.FLOOR || t === T.GLADE) return false;
    if (t === T.SHIFT) return this.shiftH[i] > 0.5;
    if (t === T.DOOR) return doorsSolid || this.doorByTile.get(i).open < 0.8;
    return true;
  }

  doorAt(x, z) {
    const tx = worldToTile(x), tz = worldToTile(z);
    return this.grid[tz * GRID + tx] === T.DOOR ? this.doorByTile.get(tz * GRID + tx) : null;
  }

  inGlade(x, z) { return Math.abs(x) < GLADE_HALF && Math.abs(z) < GLADE_HALF; }

  blocks(x, z) {
    if (this.solidTile(worldToTile(x), worldToTile(z))) return true;
    for (const r of this.rects) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
    for (const c of this.circles) if (c.solid && c.alive && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    return false;
  }

  lineOfSight(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.5);
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
      if (this.solidTile(worldToTile(x), worldToTile(z))) return false;
      for (const r of this.rects) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return false;
    }
    return true;
  }

  collide(p, r, doorsSolid = false) {
    const half = GRID / 2;
    const tx0 = worldToTile(p.x - r), tx1 = worldToTile(p.x + r);
    const tz0 = worldToTile(p.z - r), tz1 = worldToTile(p.z + r);
    for (let tz = tz0; tz <= tz1; tz++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.solidTile(tx, tz, doorsSolid)) continue;
        const x0 = (tx - half) * TILE, z0 = (tz - half) * TILE;
        pushOutOfRect(p, r, x0, z0, x0 + TILE, z0 + TILE);
      }
    for (const q of this.rects) pushOutOfRect(p, r, q.x0, q.z0, q.x1, q.z1);
    for (const c of this.circles) {
      if (!c.alive || c.solid === false) continue;
      const dx = p.x - c.x, dz = p.z - c.z;
      const min = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (min - d);
        p.z += (dz / d) * (min - d);
      }
    }
  }
}

function pushOutOfRect(p, r, x0, z0, x1, z1) {
  const cx = Math.max(x0, Math.min(p.x, x1));
  const cz = Math.max(z0, Math.min(p.z, z1));
  const dx = p.x - cx, dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    p.x += (dx / d) * (r - d);
    p.z += (dz / d) * (r - d);
  } else {
    const l = p.x - x0, rr = x1 - p.x, u = p.z - z0, b = z1 - p.z;
    const m = Math.min(l, rr, u, b);
    if (m === l) p.x = x0 - r;
    else if (m === rr) p.x = x1 + r;
    else if (m === u) p.z = z0 - r;
    else p.z = z1 + r;
  }
}
