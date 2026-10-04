import * as THREE from 'three';
import { GLADE_HALF } from './config.js';
import { toon, outlineMat, hullMat, blockGeo, merge, paint } from './materials.js';
import { rng } from './maze.js';
import { BUILDINGS, BEDS, plotsFor, GROW_TIME, CHOP_REGROW } from './data.js';
import { checkerTex } from './world.js';

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Fixed building spots (x, z, footprint w x d).
export const SITES = {
  homestead: { x: 16, z: -17, w: 10, d: 8 },
  tower: { x: -24, z: -24, w: 3.4, d: 3.4 },
  forge: { x: 24, z: 7, w: 4.4, d: 3.8 },
  kitchen: { x: -7, z: 23, w: 5, d: 4 },
  infirmary: { x: -8, z: -24, w: 5, d: 4 },
  workshop: { x: 6, z: -26, w: 5, d: 4 },
  pen: { x: -22, z: -12, w: 9, d: 7 },
};
const FIELD_ORIGIN = { x: 9, z: 12, step: 4.4, cols: 4 };
export const FIELDS_SIGN = { x: 5.4, z: 9.2 };
export const CAMPFIRE = { x: -10, z: -6 };
const ZONES = {
  farmer: [7, 10, 25, 24],
  woodcutter: [-28, 10, -12, 28],
  builder: [6, -12, 12, -6],
  smith: [20, 9, 26, 12],
  medic: [-12, -20, -4, -18],
  idle: [-14, -9, -6, -3],
};
const GUARD_SPOTS = [[0, -28.5], [0, 28.5], [-28.5, 0], [28.5, 0]];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Persistent glade state lives in save.glade; this builds it the first time. */
export function ensureGladeState(save) {
  save.buildings = { homestead: 1, fields: 1, tower: 0, forge: 0, kitchen: 0, infirmary: 0, workshop: 0, pen: 0, ...(save.buildings ?? {}) };
  save.construction ??= {};
  save.glade ??= { plots: [] };
  while (save.glade.plots.length < 12) save.glade.plots.push({ s: 'empty', t: 0 });
}

/** Crops keep growing overnight. */
export function overnightGlade(save) {
  for (const p of save.glade.plots) if (p.s === 'growing') { p.t += GROW_TIME; if (p.t >= GROW_TIME) p.s = 'ripe'; }
}

export class Glade {
  /** ctx: { particles, pickups, fx, sfx, onBuilt(key), onProduce(type, n, x, z) } */
  constructor(scene, world, save, ctx) {
    this.scene = scene;
    this.world = world;
    this.save = save;
    this.ctx = ctx;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.R = rng(save.seed + save.day * 17);
    this.time = 0;
    this.siteGroups = {};
    this.siteRects = {};
    this.buildStatic();
    this.buildPlots();
    this.buildTrees();
    for (const k of Object.keys(SITES)) this.buildSite(k);
    this.animals = [];
    this.buildAnimals();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }

  // ---------- static decor ----------
  buildStatic() {
    const R = this.R;
    const vc = toon(0xffffff, { vertexColors: true });
    // The Box
    const box = new THREE.Group();
    const frame = new THREE.Mesh(blockGeo(4.2, 0.22, 4.2, { bottom: 0x3c4150, top: 0x5b6273, rim: 0x3c4150, cap: 0x6d7588, inset: 0.3 }), vc);
    frame.receiveShadow = true;
    box.add(frame);
    const barGeo = new THREE.BoxGeometry(3.4, 0.08, 0.16);
    for (let i = -2; i <= 2; i++) { const bar = new THREE.Mesh(barGeo, toon(0x2e3240)); bar.position.set(0, 0.25, i * 0.65); box.add(bar); }
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 3.6), toon(0xf2c14e));
    seam.position.y = 0.26;
    box.add(seam);
    this.group.add(box);
    this.boxMesh = box;

    // Campfire with log seats
    const fire = new THREE.Group();
    fire.position.set(CAMPFIRE.x, 0, CAMPFIRE.z);
    const stoneGeo = new THREE.DodecahedronGeometry(0.32, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const st = new THREE.Mesh(stoneGeo, toon(0x8b8796));
      st.position.set(Math.cos(a) * 0.95, 0.15, Math.sin(a) * 0.95);
      st.rotation.set(R() * 3, R() * 3, 0);
      fire.add(st);
    }
    const logGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.3, 8);
    for (let i = 0; i < 3; i++) {
      const lg = new THREE.Mesh(logGeo, toon(0x6b4428));
      lg.rotation.set(Math.PI / 2 - 0.35, (i / 3) * Math.PI * 2, 0, 'YXZ');
      lg.position.y = 0.3;
      fire.add(lg);
    }
    this.flames = [];
    const flameGeo = new THREE.ConeGeometry(0.42, 1.2, 7).translate(0, 0.6, 0);
    [[0xff7a1a, 1], [0xffc531, 0.62], [0xfff1a8, 0.32]].forEach(([c, s]) => {
      const f = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: c }));
      f.scale.setScalar(s);
      f.position.y = 0.25;
      fire.add(f);
      this.flames.push({ mesh: f, base: s });
    });
    this.fireLight = new THREE.PointLight(0xff9a40, 14, 12, 1.6);
    this.fireLight.position.y = 1.6;
    fire.add(this.fireLight);
    const seatGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.2, 10);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const seat = new THREE.Mesh(seatGeo, toon(0x8a5a34));
      seat.position.set(Math.cos(a) * 2.6, 0.35, Math.sin(a) * 2.6);
      seat.rotation.set(0, -a, Math.PI / 2, 'YXZ');
      seat.castShadow = true;
      seat.add(new THREE.Mesh(seatGeo, outlineMat(0.05)));
      fire.add(seat);
    }
    this.group.add(fire);
    this.world.circles.push({ x: CAMPFIRE.x, z: CAMPFIRE.z, r: 1.15, alive: true, solid: true });

    // Fields sign
    this.group.add(this.signpost(FIELDS_SIGN.x, FIELDS_SIGN.z, 0x7cc95a));

    // Graves in a quiet corner of the forest.
    for (let i = 0; i < 4; i++) {
      const gs = new THREE.Mesh(blockGeo(0.7, 1.0, 0.25, { bottom: 0x6d6880, top: 0xa8a2bc, rim: 0x5a5470, cap: 0x9a94ae }), vc);
      gs.position.set(-28 + i * 1.6, 0, 28.5);
      this.group.add(gs);
    }

    // Grass tufts & flowers
    const tufts = [];
    for (let i = 0; i < 520; i++) {
      const x = (R() - 0.5) * GLADE_HALF * 1.9, z = (R() - 0.5) * GLADE_HALF * 1.9;
      if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
      if (x > 6 && x < 26 && z > 9 && z < 24) continue;
      tufts.push([x, z, R()]);
    }
    const tuftGeo = merge([-0.12, 0, 0.12].map((o, i) => new THREE.ConeGeometry(0.07, 0.42 + i * 0.08, 4).rotateZ(o * 2).translate(o, 0.2, 0)));
    const tm = new THREE.InstancedMesh(tuftGeo, toon(0x4f9e3f), tufts.length);
    const flowerGeo = new THREE.SphereGeometry(0.12, 6, 4);
    const fl = tufts.filter(([, , r]) => r < 0.18);
    const fm = new THREE.InstancedMesh(flowerGeo, toon(0xffffff), fl.length);
    const fc = [0xffe066, 0xff8ab0, 0xffffff, 0x9ad0ff].map((c) => new THREE.Color(c));
    tufts.forEach(([x, z, r], i) => { M.compose(P.set(x, 0, z), Q.setFromAxisAngle(UP, r * 6), S.setScalar(0.8 + r * 0.6)); tm.setMatrixAt(i, M); });
    fl.forEach(([x, z, r], i) => { M.makeTranslation(x + 0.15, 0.5, z); fm.setMatrixAt(i, M); fm.setColorAt(i, fc[i % 4]); });
    this.group.add(tm, fm);
  }

  signpost(x, z, color) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6).translate(0, 0.8, 0), toon(0x7a4f2c));
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.12), toon(color));
    board.position.y = 1.5;
    board.add(new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.82, 0.08), hullMat));
    g.add(post, board);
    return g;
  }

  // ---------- fields ----------
  plotPos(i) {
    const c = i % FIELD_ORIGIN.cols, r = Math.floor(i / FIELD_ORIGIN.cols);
    return { x: FIELD_ORIGIN.x + c * FIELD_ORIGIN.step, z: FIELD_ORIGIN.z + r * FIELD_ORIGIN.step };
  }

  buildPlots() {
    this.plots = [];
    const soilGeo = blockGeo(3.4, 0.3, 3.4, { bottom: 0x4f321d, top: 0x6b4528, rim: 0x5a3a22, cap: 0x7a5232, inset: 0.18 });
    const lockedGeo = blockGeo(3.4, 0.12, 3.4, { bottom: 0x5e8a44, top: 0x6e9a50, rim: 0x5e8a44, cap: 0x86b860, inset: 0.18 });
    const rowGeo = new THREE.BoxGeometry(2.8, 0.06, 0.18);
    for (let i = 0; i < 12; i++) {
      const { x, z } = this.plotPos(i);
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const soil = new THREE.Mesh(soilGeo, toon(0xffffff, { vertexColors: true }));
      soil.receiveShadow = true;
      const locked = new THREE.Mesh(lockedGeo, toon(0xffffff, { vertexColors: true }));
      for (let k = -1; k <= 1; k++) { const r = new THREE.Mesh(rowGeo, toon(0x4a2e1a)); r.position.set(0, 0.31, k * 0.9); soil.add(r); }
      const crop = new THREE.Group();
      const leafGeo = new THREE.ConeGeometry(0.28, 0.75, 5).translate(0, 0.37, 0);
      const fruitGeo = new THREE.SphereGeometry(0.17, 8, 6);
      const fruitMat = toon([0xe8452c, 0xff9a2e, 0xf2d43a][i % 3]);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b += 2) {
          const pl = new THREE.Group();
          pl.position.set(a * 0.9, 0.3, b * 0.6);
          const leaf = new THREE.Mesh(leafGeo, toon(0x5cbf48));
          leaf.castShadow = true;
          const fruit = new THREE.Mesh(fruitGeo, fruitMat);
          fruit.position.set(0.16, 0.5, 0.08);
          pl.add(leaf, fruit);
          crop.add(pl);
        }
      const sparkle = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.95, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.8, depthWrite: false }));
      sparkle.position.y = 0.36;
      g.add(soil, locked, crop, sparkle);
      this.group.add(g);
      const st = this.save.glade.plots[i];
      this.plots.push({ i, x, z, g, soil, locked, crop, sparkle, st, reserved: null });
    }
    this.refreshPlots();
  }

  get unlockedPlots() { return plotsFor(this.save.buildings.fields); }

  refreshPlots() {
    for (const p of this.plots) {
      const unlocked = p.i < this.unlockedPlots;
      p.locked.visible = !unlocked;
      p.soil.visible = unlocked;
      p.crop.visible = unlocked && p.st.s !== 'empty';
      p.sparkle.visible = unlocked && p.st.s === 'ripe';
    }
  }

  plant(p) {
    if (p.st.s !== 'empty' || p.i >= this.unlockedPlots) return false;
    p.st.s = 'growing';
    p.st.t = 0;
    this.ctx.particles.burst(p.x, 0.5, p.z, { n: 8, colors: [0x6b4528, 0x5cbf48], speed: 2, up: 3, size: 0.15 });
    this.refreshPlots();
    return true;
  }

  /** Harvest yields food; by: 'player' spawns pickups, NPC adds directly. */
  harvest(p, by) {
    if (p.st.s !== 'ripe') return 0;
    p.st.s = 'empty';
    p.st.t = 0;
    const n = 2 + this.save.buildings.kitchen;
    if (by === 'player') this.ctx.pickups.spawn('food', p.x, p.z, n, { safe: true });
    else this.ctx.onProduce('food', n, p.x, p.z);
    this.ctx.particles.burst(p.x, 0.8, p.z, { n: 12, colors: [0xe8452c, 0x5cbf48, 0xffe066], speed: 3, up: 4, size: 0.18 });
    this.refreshPlots();
    return n;
  }

  // ---------- forest ----------
  buildTrees() {
    const R = this.R;
    const list = [];
    for (let tries = 0; tries < 900 && list.length < 34; tries++) {
      const x = -29 + R() * 18, z = 9 + R() * 20;
      if (x > -12 && z > 19) continue;
      if (x < -25 && z > 26) continue;
      if (list.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > 8)) list.push({ x, z, s: 0.85 + R() * 0.45 });
    }
    this.trees = list.map((t) => ({ ...t, hp: 3, alive: true, regrow: 0, fall: 0, shake: 0, reserved: null }));
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 1.8, 8).translate(0, 0.9, 0);
    const crownGeo = merge([paint(new THREE.IcosahedronGeometry(1.3, 1).translate(0, 2.7, 0), 0x3f9446), paint(new THREE.IcosahedronGeometry(0.9, 1).translate(0.15, 3.75, 0.1), 0x56b04f)]);
    const stumpGeo = new THREE.CylinderGeometry(0.38, 0.42, 0.4, 8).translate(0, 0.2, 0);
    const n = this.trees.length;
    this.trunks = new THREE.InstancedMesh(trunkGeo, toon(0x7a4f2e), n);
    this.trunkO = new THREE.InstancedMesh(trunkGeo, outlineMat(0.06), n);
    this.crowns = new THREE.InstancedMesh(crownGeo, toon(0xffffff, { vertexColors: true }), n);
    this.crownO = new THREE.InstancedMesh(crownGeo, outlineMat(0.07), n);
    this.stumps = new THREE.InstancedMesh(stumpGeo, toon(0x8a5a32), n);
    for (const m of [this.trunks, this.crowns, this.trunkO, this.crownO, this.stumps]) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trunks.castShadow = this.crowns.castShadow = true;
    this.group.add(this.trunks, this.trunkO, this.crowns, this.crownO, this.stumps);
    for (const t of this.trees) { t.collider = { x: t.x, z: t.z, r: 0.45 * t.s + 0.1, alive: true, solid: true }; this.world.circles.push(t.collider); }
    this.writeTrees();
  }

  writeTrees() {
    this.trees.forEach((t, i) => {
      const grow = t.alive ? 1 : t.regrow > CHOP_REGROW - 8 ? (t.regrow - (CHOP_REGROW - 8)) / 8 : 0;
      const s = t.s * (t.alive ? 1 : grow);
      const shake = t.shake > 0 ? Math.sin(t.shake * 40) * 0.08 : 0;
      const fall = t.fall;
      Q.setFromAxisAngle(UP, (t.x * 13.7 + t.z) % 6);
      if (fall > 0) Q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), fall * 1.5));
      else if (shake) Q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), shake));
      const vis = t.alive || fall > 0 || grow > 0;
      M.compose(P.set(t.x, 0, t.z), Q, S.setScalar(vis ? Math.max(0.001, fall > 0 ? t.s : s) : 0));
      this.trunks.setMatrixAt(i, M);
      this.trunkO.setMatrixAt(i, M);
      this.crowns.setMatrixAt(i, M);
      this.crownO.setMatrixAt(i, M);
      M.compose(P.set(t.x, 0, t.z), Q.identity(), S.setScalar(t.alive ? 0 : t.s));
      this.stumps.setMatrixAt(i, M);
    });
    for (const m of [this.trunks, this.crowns, this.trunkO, this.crownO, this.stumps]) m.instanceMatrix.needsUpdate = true;
  }

  /** One axe/arm swing at a tree. Returns true when it falls. */
  chopHit(t, by) {
    if (!t.alive) return false;
    t.hp--;
    t.shake = 0.3;
    this.ctx.particles.burst(t.x, 1.3, t.z, { n: 5, colors: [0x8a5a32, 0x5cbf48], speed: 2.5, up: 3, size: 0.15 });
    if (t.hp > 0) return false;
    t.alive = false;
    t.fall = 0.01;
    t.regrow = 0;
    t.collider.alive = false;
    const n = 2;
    if (by === 'player') setTimeout(() => this.ctx.pickups.spawn('wood', t.x, t.z, n + 1, { safe: true }), 450);
    else this.ctx.onProduce('wood', n, t.x, t.z);
    return true;
  }

  // ---------- buildings ----------
  level(key) { return this.save.buildings[key] ?? 0; }
  construction(key) { return this.save.construction[key] ?? null; }

  buildSite(key) {
    const old = this.siteGroups[key];
    if (old) { this.group.remove(old); old.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); }
    const s = SITES[key];
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    const lvl = this.level(key);
    const con = this.construction(key);
    const shown = con ? Math.max(lvl, 1) : lvl;
    g.userData.rising = !!con && lvl === 0;
    if (shown === 0) this.siteVisual(g, s);
    else this.buildingVisual(g, key, con ? con.to : lvl, g.userData.rising ? con : null);
    if (con) this.scaffold(g, s, con.p);
    this.group.add(g);
    this.siteGroups[key] = g;
    // collision only for real buildings (pen fence is walk-around)
    const rect = this.siteRects[key];
    if (rect) this.world.rects.splice(this.world.rects.indexOf(rect), 1);
    delete this.siteRects[key];
    if (shown > 0 && key !== 'pen') {
      const r = { x0: s.x - s.w / 2, x1: s.x + s.w / 2, z0: s.z - s.d / 2, z1: s.z + s.d / 2 };
      this.world.rects.push(r);
      this.siteRects[key] = r;
    }
    if (key === 'homestead') this.buildHuts(g, lvl);
  }

  siteVisual(g, s) {
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d).rotateX(-Math.PI / 2), toon(0x9a7450));
    dirt.position.y = 0.02;
    dirt.receiveShadow = true;
    g.add(dirt);
    const sign = this.signpost(-s.w / 2 + 0.6, s.d / 2 - 0.4, 0xffd23f);
    g.add(sign);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.4), toon(0xb57a45));
    for (let i = 0; i < 3; i++) { const p = plank.clone(); p.position.set(0.6, 0.07 + i * 0.14, -0.4 + i * 0.1); p.rotation.y = i * 0.2; g.add(p); }
    const stakeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5).translate(0, 0.35, 0);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const st = new THREE.Mesh(stakeGeo, toon(0xc9a06a)); st.position.set(a * s.w / 2, 0, b * s.d / 2); g.add(st); }
  }

  scaffold(g, s, p) {
    const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 4.2, 5).translate(0, 2.1, 0);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(postGeo, toon(0xc9a06a));
      post.position.set(a * (s.w / 2 + 0.3), 0, b * (s.d / 2 + 0.3));
      g.add(post);
    }
    for (const y of [1.4, 2.8]) for (const b of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.8, 0.12, 0.12), toon(0xb08850));
      beam.position.set(0, y, b * (s.d / 2 + 0.3));
      g.add(beam);
    }
    g.userData.progress = p;
  }

  buildingVisual(g, key, lvl, con) {
    const vc = toon(0xffffff, { vertexColors: true });
    const s = SITES[key];
    const body = new THREE.Group();
    const block = (w, h, d, colors, x = 0, z = 0, y = 0) => {
      const m = new THREE.Mesh(blockGeo(w, h, d, colors), vc);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      m.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.08, d + 0.14).translate(0, h / 2, 0), hullMat));
      body.add(m);
      return m;
    };
    const roof = (w, d, y, color, x = 0, z = 0) => {
      const tri = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, w * 0.32)]);
      const geo = new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
      const r = new THREE.Mesh(geo, toon(color));
      r.position.set(x, y, z);
      r.castShadow = true;
      const hull = new THREE.Mesh(geo, hullMat);
      hull.scale.set(1.04, 1.06, 1.04);
      hull.position.y = -0.04;
      r.add(hull);
      body.add(r);
    };
    const wood = { bottom: 0x7a4e2c, top: 0xb57a45, rim: 0x6b4428, cap: 0x8a5a34 };
    const stone = { bottom: 0x55505e, top: 0x8f8999, rim: 0x3d3944, cap: 0x5e5866 };
    const win = (x, y, z) => { const w = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.18), toon(0xffd76a, { emissive: 0x6b4f10 })); w.position.set(x, y, z); body.add(w); };
    const door = (x, z, h = 2.2) => { const d = new THREE.Mesh(new THREE.BoxGeometry(1.4, h, 0.2), toon(0x4a2e1c)); d.position.set(x, h / 2, z); body.add(d); };
    switch (key) {
      case 'homestead':
        block(10, 3.6, 8, wood);
        roof(11.4, 9, 3.55, 0xb5482f);
        door(-2, 4.05); win(1.5, 2.1, 4.05); win(3.6, 2.1, 4.05);
        break;
      case 'tower': {
        const h = lvl >= 2 ? 6.5 : 4.8;
        const postGeo = new THREE.CylinderGeometry(0.16, 0.2, h, 6).translate(0, h / 2, 0);
        for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
          const p = new THREE.Mesh(postGeo, toon(0x7a4f2e));
          p.position.set(dx, 0, dz);
          p.castShadow = true;
          p.add(new THREE.Mesh(postGeo, outlineMat(0.05)));
          body.add(p);
        }
        block(3.4, 0.35, 3.4, wood, 0, 0, h);
        for (const [dx, dz, w, d] of [[0, -1.6, 3.4, 0.15], [0, 1.6, 3.4, 0.15], [-1.6, 0, 0.15, 3.4], [1.6, 0, 0.15, 3.4]]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), toon(0x8a5a34));
          rail.position.set(dx, h + 0.7, dz);
          body.add(rail);
        }
        const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), toon(0xb5482f));
        cap.rotation.y = Math.PI / 4;
        cap.position.y = h + 2.6;
        cap.castShadow = true;
        cap.add(new THREE.Mesh(cap.geometry, outlineMat(0.06)));
        body.add(cap);
        if (lvl >= 2) { const flag = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.05), toon(0x3fb6ff)); flag.position.set(0.6, h + 4.1, 0); body.add(flag); this.flag = flag; }
        break;
      }
      case 'forge': {
        block(4.2, 2.4, 3.6, stone);
        block(1.0, 2.2, 1.0, { bottom: 0x6e6878, top: 0x8f8999, rim: 0x2a2630, cap: 0x1d1a22 }, 1.2, -1.0, 2.4);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.1), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
        glow.position.set(-0.6, 0.7, 1.82);
        body.add(glow);
        this.forgeGlow = glow;
        const anvil = new THREE.Group();
        const ab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.4), toon(0x3a3f4f)); ab.position.y = 0.3;
        const at = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.45), toon(0x4a5060)); at.position.y = 0.72;
        anvil.add(ab, at);
        anvil.position.set(-2.4, 0, 3.2);
        body.add(anvil);
        if (lvl >= 2) block(1.6, 1.2, 1.4, stone, 2.9, 1.4);
        this.chimney = new THREE.Vector3(s.x + 1.2, 5, s.z - 1.0);
        break;
      }
      case 'kitchen': {
        const postGeo = new THREE.CylinderGeometry(0.14, 0.16, 2.6, 6).translate(0, 1.3, 0);
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(postGeo, toon(0x7a4f2c)); p.position.set(a * 2.2, 0, b * 1.7); p.castShadow = true; body.add(p); }
        roof(5.6, 4.4, 2.6, lvl >= 2 ? 0x3f8fd8 : 0xd8a03a);
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 0.8, 12).translate(0, 0.4, 0), toon(0x2e2a36));
        pot.position.set(-0.8, 0, 0);
        pot.add(new THREE.Mesh(pot.geometry, outlineMat(0.05)));
        const soup = new THREE.Mesh(new THREE.CircleGeometry(0.62, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa23a }));
        soup.position.set(-0.8, 0.78, 0);
        body.add(pot, soup);
        block(1.6, 0.8, 1.0, wood, 1.1, 0.2);
        this.kitchenSteam = new THREE.Vector3(s.x - 0.8, 1.1, s.z);
        break;
      }
      case 'infirmary':
        block(5, 2.6, 4, { bottom: 0xb8b4c4, top: 0xf2f0f6, rim: 0xa8a4b4, cap: 0xd8d4e0 });
        roof(5.6, 4.6, 2.55, 0x6a8fb8);
        door(0, 2.05, 1.9);
        for (const [w, h] of [[0.9, 0.28], [0.28, 0.9]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), toon(0xe0393e)); c.position.set(1.5, 1.8, 2.05); body.add(c); }
        if (lvl >= 2) block(2, 1.4, 1.6, { bottom: 0xb8b4c4, top: 0xf2f0f6, rim: 0xa8a4b4, cap: 0xd8d4e0 }, -3.4, 0);
        break;
      case 'workshop':
        block(5, 2.4, 4, wood);
        roof(5.6, 4.6, 2.35, 0x3f8fd8);
        door(-1.2, 2.05, 1.9);
        block(1.8, 0.8, 0.8, { bottom: 0x6b4428, top: 0x9a6a3a, rim: 0x5a3a22, cap: 0xb07a45 }, 1.3, 2.7);
        if (lvl >= 2) { const gear = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.16, 6, 10), toon(0xa8b4c8)); gear.position.set(0, 3.3, 2.3); body.add(gear); this.gear = gear; }
        break;
      case 'pen': {
        const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.1, 5).translate(0, 0.55, 0);
        const railGeoX = new THREE.BoxGeometry(s.w, 0.1, 0.08), railGeoZ = new THREE.BoxGeometry(0.08, 0.1, s.d);
        for (let i = 0; i <= 6; i++) for (const b of [-1, 1]) { const p = new THREE.Mesh(postGeo, toon(0x8a5a34)); p.position.set(-s.w / 2 + (i / 6) * s.w, 0, b * s.d / 2); body.add(p); }
        for (let i = 1; i < 5; i++) for (const a of [-1, 1]) { const p = new THREE.Mesh(postGeo, toon(0x8a5a34)); p.position.set(a * s.w / 2, 0, -s.d / 2 + (i / 5) * s.d); body.add(p); }
        for (const y of [0.45, 0.9]) {
          for (const b of [-1, 1]) { const r = new THREE.Mesh(railGeoX, toon(0xb57a45)); r.position.set(0, y, b * s.d / 2); body.add(r); }
          for (const a of [-1, 1]) { const r = new THREE.Mesh(railGeoZ, toon(0xb57a45)); r.position.set(a * s.w / 2, y, 0); body.add(r); }
        }
        const hay = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.8, 10).rotateZ(Math.PI / 2), toon(0xe8c060));
        hay.position.set(s.w / 2 - 1.2, 0.7, -s.d / 2 + 1.2);
        body.add(hay);
        const coop = new THREE.Mesh(blockGeo(2, 1.4, 1.6, wood), vc);
        coop.position.set(-s.w / 2 + 1.4, 0, -s.d / 2 + 1.2);
        body.add(coop);
        break;
      }
    }
    if (con) {
      // Rises out of the ground as construction progresses.
      body.scale.y = 0.15 + 0.85 * con.p;
      body.position.y = 0;
    }
    g.add(body);
    g.userData.body = body;
  }

  buildHuts(g, lvl) {
    for (const r of this.hutRects ?? []) this.world.rects.splice(this.world.rects.indexOf(r), 1);
    this.hutRects = [];
    const vc = toon(0xffffff, { vertexColors: true });
    const spots = [[9, 7], [9, 0]];
    for (let i = 0; i < lvl - 1 && i < 2; i++) {
      const [dx, dz] = spots[i];
      const hut = new THREE.Mesh(blockGeo(3.6, 2.4, 3.2, { bottom: 0x7a4e2c, top: 0xb57a45, rim: 0x6b4428, cap: 0x8a5a34 }), vc);
      hut.position.set(dx, 0, dz);
      hut.castShadow = true;
      const tri = new THREE.Shape([new THREE.Vector2(-2.1, 0), new THREE.Vector2(2.1, 0), new THREE.Vector2(0, 1.4)]);
      const rg = new THREE.ExtrudeGeometry(tri, { depth: 3.6, bevelEnabled: false }).translate(0, 0, -1.8);
      const r = new THREE.Mesh(rg, toon(0xa8513a));
      r.position.set(dx, 2.38, dz);
      g.add(hut, r);
      const s = SITES.homestead;
      const rect = { x0: s.x + dx - 1.8, x1: s.x + dx + 1.8, z0: s.z + dz - 1.6, z1: s.z + dz + 1.6 };
      this.world.rects.push(rect);
      this.hutRects.push(rect);
    }
  }

  startBuild(key) {
    const lvl = this.level(key);
    this.save.construction[key] = { to: lvl + 1, p: 0 };
    this.buildSite(key);
  }

  /** Add construction progress; returns true on completion. */
  progressBuild(key, amount) {
    const con = this.construction(key);
    if (!con) return false;
    con.p = Math.min(1, con.p + amount / (BUILDINGS[key].work ?? 1));
    const sg = this.siteGroups[key];
    if (sg?.userData.rising && sg.userData.body) sg.userData.body.scale.y = 0.15 + 0.85 * con.p;
    if (con.p >= 1) {
      this.save.buildings[key] = con.to;
      delete this.save.construction[key];
      this.buildSite(key);
      if (key === 'fields') this.refreshPlots();
      if (key === 'pen') this.buildAnimals();
      this.ctx.particles.burst(SITES[key].x, 2, SITES[key].z, { n: 40, colors: [0xffd23f, 0xffffff, 0xb57a45], speed: 6, up: 7, size: 0.25, life: 1.2 });
      this.ctx.onBuilt(key);
      return true;
    }
    return false;
  }

  // ---------- animals ----------
  buildAnimals() {
    for (const a of this.animals) this.group.remove(a.g);
    this.animals = [];
    const lvl = this.level('pen');
    if (lvl < 1) return;
    const s = SITES.pen;
    const mk = (kind) => {
      const g = new THREE.Group();
      if (kind === 'chicken') {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), toon(0xffffff)); b.scale.set(1, 0.9, 1.2); b.position.y = 0.4;
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), toon(0xffffff)); h.position.set(0, 0.7, 0.3);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4).rotateX(Math.PI / 2), toon(0xffb020)); beak.position.set(0, 0.68, 0.5);
        const comb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), toon(0xe0393e)); comb.position.set(0, 0.88, 0.3);
        g.add(b, h, beak, comb);
        b.add(new THREE.Mesh(b.geometry, outlineMat(0.05)));
      } else {
        const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 4, 10).rotateX(Math.PI / 2), toon(0xf4a8b8)); b.position.y = 0.55;
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), toon(0xf4a8b8)); h.position.set(0, 0.65, 0.6);
        const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 8).rotateX(Math.PI / 2), toon(0xe88aa0)); snout.position.set(0, 0.6, 0.94);
        for (const sx of [-0.25, 0.25]) for (const sz of [-0.3, 0.3]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 5), toon(0xe88aa0)); l.position.set(sx, 0.15, sz); g.add(l); }
        g.add(b, h, snout);
        b.add(new THREE.Mesh(b.geometry, outlineMat(0.05)));
      }
      g.position.set(s.x + (this.R() - 0.5) * (s.w - 2), 0, s.z + (this.R() - 0.5) * (s.d - 2));
      this.group.add(g);
      this.animals.push({ g, kind, target: g.position.clone(), wait: this.R() * 3, t: this.R() * 5 });
    };
    for (let i = 0; i < 4 + lvl * 2; i++) mk('chicken');
    for (let i = 0; i < (lvl >= 2 ? 3 : 1); i++) mk('pig');
  }

  // ---------- NPC jobs ----------
  assignJob(npc) {
    const role = npc.role;
    const job = npc.job;
    if (job) return;
    const free = (o) => !o.reserved || o.reserved === npc;
    if (role === 'farmer') {
      let best = null, bd = 1e9;
      for (const p of this.plots) {
        if (p.i >= this.unlockedPlots || !free(p)) continue;
        if (p.st.s === 'growing') continue;
        const d = dist(p, npc.pos) - (p.st.s === 'ripe' ? 30 : 0);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) {
        best.reserved = npc;
        npc.job = { kind: 'plot', obj: best };
        npc.goTo(best.x + 1.9, best.z, () => { npc.work(1.6, 'cast', () => { if (best.st.s === 'ripe') this.harvest(best, 'npc'); this.plant(best); best.reserved = null; npc.job = null; }); });
        return;
      }
    } else if (role === 'woodcutter') {
      let best = null, bd = 1e9;
      for (const t of this.trees) { if (!t.alive || !free(t)) continue; const d = dist(t, npc.pos); if (d < bd) { bd = d; best = t; } }
      if (best) {
        best.reserved = npc;
        npc.job = { kind: 'tree', obj: best };
        const a = Math.atan2(npc.pos.z - best.z, npc.pos.x - best.x);
        npc.goTo(best.x + Math.cos(a) * 1.4, best.z + Math.sin(a) * 1.4, () => {
          const swing = () => {
            if (!best.alive) { best.reserved = null; npc.job = null; return; }
            npc.face(best);
            npc.work(1.4, 'smash', () => { if (this.chopHit(best, 'npc')) { best.reserved = null; npc.job = null; } else swing(); });
          };
          swing();
        });
        return;
      }
    } else if (role === 'builder') {
      const key = Object.keys(this.save.construction)[0];
      if (key) {
        const s = SITES[key];
        const side = (npc.i % 4);
        const off = [[s.w / 2 + 1, 0], [-s.w / 2 - 1, 0], [0, s.d / 2 + 1], [0, -s.d / 2 - 1]][side];
        npc.job = { kind: 'build', key };
        npc.goTo(s.x + off[0], s.z + off[1], () => { npc.face(s); npc.job.working = true; });
        return;
      }
    } else if (role === 'smith' && this.level('forge') > 0) {
      const s = SITES.forge;
      npc.job = { kind: 'smith', t: 0 };
      npc.goTo(s.x - 2.4 + 0.9, s.z + 3.2, () => { npc.job.working = true; });
      return;
    } else if (role === 'guard') {
      const [x, z] = GUARD_SPOTS[npc.i % 4];
      npc.job = { kind: 'guard' };
      npc.goTo(x + (this.R() - 0.5) * 3, z + (this.R() - 0.5) * 2, () => { npc.job.working = true; npc.face({ x: x * 2, z: z * 2 }); });
      return;
    }
    // Wander in the role's zone.
    const zn = ZONES[role] ?? ZONES.idle;
    npc.job = { kind: 'wander' };
    npc.goTo(zn[0] + this.R() * (zn[2] - zn[0]), zn[1] + this.R() * (zn[3] - zn[1]), () => { npc.wait = 1.5 + this.R() * 3; npc.job = null; });
  }

  releaseJob(npc) {
    const j = npc.job;
    if (j?.obj) j.obj.reserved = null;
    npc.job = null;
  }

  // ---------- per frame ----------
  update(dt, { player, npcs, active }) {
    this.time += dt;
    const t = this.time;
    this.flames.forEach((f, i) => {
      const k = 1 + Math.sin(t * (11 + i * 3)) * 0.12 + Math.sin(t * (17 + i * 5)) * 0.08;
      f.mesh.scale.set(f.base * (1 - (k - 1) * 0.5), f.base * k, f.base * (1 - (k - 1) * 0.5));
      f.mesh.rotation.y = t * (1 + i);
    });
    this.fireLight.intensity = 12 + Math.sin(t * 13) * 2 + Math.sin(t * 29) * 1.5;
    if (this.flag) this.flag.rotation.y = Math.sin(t * 3) * 0.3;
    if (this.gear) this.gear.rotation.z = t * 2;
    if (this.forgeGlow) this.forgeGlow.material.color.setHSL(0.07, 1, 0.5 + Math.sin(t * 9) * 0.06);

    // Crops grow, ripe crops sparkle.
    let changed = false;
    for (const p of this.plots) {
      if (p.i >= this.unlockedPlots) continue;
      if (active && p.st.s === 'growing') {
        p.st.t += dt;
        if (p.st.t >= GROW_TIME) { p.st.s = 'ripe'; changed = true; }
      }
      if (p.crop.visible) {
        const g = p.st.s === 'ripe' ? 1 : Math.min(1, 0.25 + 0.75 * (p.st.t / GROW_TIME));
        p.crop.scale.setScalar(g);
        p.crop.children.forEach((pl) => { pl.children[1].visible = p.st.s === 'ripe'; });
      }
      if (p.sparkle.visible) { p.sparkle.material.opacity = 0.5 + Math.sin(t * 5 + p.i) * 0.3; p.sparkle.scale.setScalar(1 + Math.sin(t * 3 + p.i) * 0.05); }
    }
    if (changed) this.refreshPlots();

    // Trees: shake, fall, regrow.
    let treeDirty = false;
    for (const tr of this.trees) {
      if (tr.shake > 0) { tr.shake = Math.max(0, tr.shake - dt); treeDirty = true; }
      if (tr.fall > 0) {
        tr.fall += dt * 2.2;
        treeDirty = true;
        if (tr.fall >= 1) { tr.fall = 0; this.ctx.particles.burst(tr.x, 0.4, tr.z, { n: 14, colors: [0x5cbf48, 0x3f9446, 0x8a5a32], speed: 4, up: 3, size: 0.3 }); this.ctx.sfx.crateBreak(); }
      }
      if (!tr.alive && active) {
        tr.regrow += dt;
        if (tr.regrow > CHOP_REGROW - 8) treeDirty = true;
        if (tr.regrow >= CHOP_REGROW) {
          const blocked = player && dist(player.pos, tr) < 1.4;
          if (!blocked) { tr.alive = true; tr.hp = 3; tr.collider.alive = true; treeDirty = true; }
        }
      }
    }
    if (treeDirty) this.writeTrees();

    // Animals potter about.
    const s = SITES.pen;
    for (const a of this.animals) {
      a.t += dt;
      if (a.wait > 0) a.wait -= dt;
      else {
        const dx = a.target.x - a.g.position.x, dz = a.target.z - a.g.position.z, d = Math.hypot(dx, dz);
        if (d < 0.2) { a.wait = 1 + Math.random() * 4; a.target.set(s.x + (Math.random() - 0.5) * (s.w - 1.6), 0, s.z + (Math.random() - 0.5) * (s.d - 1.6)); }
        else { const sp = a.kind === 'chicken' ? 1.6 : 1; a.g.position.x += (dx / d) * sp * dt; a.g.position.z += (dz / d) * sp * dt; a.g.rotation.y = Math.atan2(dx, dz); }
      }
      a.g.position.y = a.wait > 0 ? 0 : Math.abs(Math.sin(a.t * (a.kind === 'chicken' ? 14 : 8))) * 0.12;
    }

    if (!active) return;
    // NPC jobs & passive production.
    let builders = 0;
    for (const n of npcs) {
      if (n.taken || n.follower) continue;
      if (!n.job && n.wait <= 0) this.assignJob(n);
      const j = n.job;
      if (!j?.working) continue;
      if (j.kind === 'build') {
        if (!this.save.construction[j.key]) { n.job = null; continue; }
        builders++;
        if (!n.busy) n.work(0.6, 'smash', () => {});
      } else if (j.kind === 'smith') {
        j.t += dt;
        if (!n.busy) n.work(0.6, 'smash', () => {});
        if (j.t > 40) { j.t = 0; this.ctx.onProduce('metal', 1, n.pos.x, n.pos.z); }
      }
    }
    for (const key of Object.keys(this.save.construction)) {
      const near = player && !player.dead && dist(player.pos, SITES[key]) < Math.max(SITES[key].w, SITES[key].d) / 2 + 2.2;
      this.playerBuilding = near ? key : null;
      const rate = 0.006 + builders * 0.022 + (near ? 0.045 : 0);
      if (this.progressBuild(key, rate * dt)) break;
    }
    if (!Object.keys(this.save.construction).length) this.playerBuilding = null;

    // Animal pen lays food every so often.
    const pen = this.level('pen');
    if (pen > 0) {
      this.penT = (this.penT ?? 0) + dt;
      if (this.penT > 32 / pen) { this.penT = 0; this.ctx.onProduce('food', 1, s.x, s.z); }
    }
  }

  /** Tap targets (the caller adds NPCs and doors). */
  hitTest(x, z) {
    let best = null, bd = 1e9;
    const consider = (obj, r, kind) => {
      const d = Math.hypot(obj.x - x, obj.z - z);
      if (d < r && d < bd) { bd = d; best = { kind, obj }; }
    };
    for (const p of this.plots) consider(p, 2.3, 'plot');
    for (const t of this.trees) if (t.alive) consider(t, 1.6, 'tree');
    for (const [k, s] of Object.entries(SITES)) {
      if (Math.abs(x - s.x) < s.w / 2 + 0.6 && Math.abs(z - s.z) < s.d / 2 + 0.6) { const d = Math.hypot(x - s.x, z - s.z) * 0.5; if (d < bd) { bd = d; best = { kind: 'site', obj: { key: k, ...s } }; } }
    }
    consider({ x: 0, z: 0 }, 2.6, 'box');
    consider(CAMPFIRE, 3.2, 'campfire');
    consider(FIELDS_SIGN, 1.4, 'fields');
    return best;
  }
}

export { BEDS };
