import * as THREE from 'three';
import { TILE, GRID, T, WALL_H, RING_H, GLADE_HALF, tileToWorld, worldToTile, cellToWorld } from './config.js';
import { toon, outlineMat, hullMat, blockGeo, merge, paint, INK } from './materials.js';
import { rng } from './maze.js';

const texCache = {};
function checkerTex(key, c1, c2, { speck = 0x000000, speckAlpha = 0.06, bevel = 0.08, tufts = false } = {}) {
  if (texCache[key]) return texCache[key];
  const s = 256, h = s / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const x = cv.getContext('2d');
  const R = rng(key.length * 991);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
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
  for (let k = 0; k < 260; k++) {
    x.fillStyle = `rgba(${sc.r * 255 | 0},${sc.g * 255 | 0},${sc.b * 255 | 0},${speckAlpha * (0.5 + R())})`;
    const r = 1 + R() * 3;
    x.beginPath();
    x.arc(R() * s, R() * s, r, 0, Math.PI * 2);
    x.fill();
  }
  if (tufts) {
    x.strokeStyle = 'rgba(40,110,40,0.35)';
    x.lineWidth = 3;
    x.lineCap = 'round';
    for (let k = 0; k < 40; k++) {
      const px = R() * s, py = R() * s;
      for (const dx of [-5, 0, 5]) {
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + dx, py - 9 - R() * 4);
        x.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache[key] = tex;
  return tex;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpE = new THREE.Euler();

export class World {
  constructor(scene, maze, colony = { fields: 2, homestead: 1, tower: 0, forge: 0 }, opts = {}) {
    this.scene = scene;
    this.maze = maze;
    this.colony = colony;
    this.opts = opts;
    this.grid = maze.grid;
    this.R = rng(maze.seed * 7 + 3);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.circles = [];
    this.rects = [];
    this.doorByTile = new Map();
    this.time = 0;
    this.buildFloor();
    this.buildWalls();
    this.buildIvy();
    this.buildDoors();
    this.buildGlade();
    this.buildStructures();
    if (opts.fragment) this.buildFragment(opts.fragment);
    if (opts.hole) this.buildHole(opts.hole);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }

  tile(tx, tz) { return this.grid[tz * GRID + tx]; }

  // ---------- building ----------
  buildFloor() {
    const size = GRID * TILE;
    const stone = checkerTex('stone', 0x9a97a8, 0x8f8c9f, { speck: 0x3a3550, speckAlpha: 0.08 });
    const floorTex = stone.clone();
    floorTex.repeat.set(GRID / 2, GRID / 2);
    floorTex.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), toon(0xffffff, { map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const outer = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), toon(0x3b3a4f));
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
    const walls = [], rings = [];
    for (let z = 0; z < GRID; z++)
      for (let x = 0; x < GRID; x++) {
        const t = this.tile(x, z);
        if (t === T.WALL) walls.push([x, z]);
        else if (t === T.RING) rings.push([x, z]);
      }
    const mk = (list, geo) => {
      const mesh = new THREE.InstancedMesh(geo, toon(0xffffff, { vertexColors: true }), list.length);
      const c = new THREE.Color();
      list.forEach(([x, z], i) => {
        tmpM.makeTranslation(tileToWorld(x), 0, tileToWorld(z));
        mesh.setMatrixAt(i, tmpM);
        const v = 0.9 + this.R() * 0.14;
        mesh.setColorAt(i, c.setRGB(v, v, v));
      });
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    mk(walls, blockGeo(TILE, WALL_H, TILE, { bottom: 0x4a4561, top: 0x9b94ad, rim: 0x4d7f3c, cap: 0x74b257 }));
    mk(rings, blockGeo(TILE, RING_H, TILE, { bottom: 0x5a4a44, top: 0xb19d89, rim: 0x55843f, cap: 0x7fbd5a }));
  }

  buildIvy() {
    const R = this.R;
    const leaves = [];
    const solid = (t) => t === T.WALL || t === T.RING || t === T.DOOR;
    for (let z = 1; z < GRID - 1; z++)
      for (let x = 1; x < GRID - 1; x++) {
        const t = this.tile(x, z);
        if (t !== T.WALL && t !== T.RING) continue;
        const H = t === T.RING ? RING_H : WALL_H;
        const p = t === T.RING ? 0.75 : 0.32;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (solid(this.tile(x + dx, z + dz)) || R() > p) continue;
          const vines = 1 + Math.floor(R() * 2);
          for (let v = 0; v < vines; v++) {
            const u = (R() - 0.5) * TILE * 0.8;
            const len = H * (0.25 + R() * 0.7);
            for (let y = H - 0.05; y > H - len; y -= 0.32 + R() * 0.1) {
              const off = TILE / 2 + 0.06;
              const px = tileToWorld(x) + dx * off + (dz ? u + (R() - 0.5) * 0.25 : 0);
              const pz = tileToWorld(z) + dz * off + (dx ? u + (R() - 0.5) * 0.25 : 0);
              leaves.push([px, y, pz, Math.atan2(dx, dz), 0.7 + R() * 0.6, R()]);
            }
          }
        }
      }
    const max = Math.min(leaves.length, 9000);
    const geo = new THREE.OctahedronGeometry(0.3, 0);
    geo.scale(1, 0.85, 0.45);
    const mesh = new THREE.InstancedMesh(geo, toon(0xffffff), max);
    const greens = [0x3f8f3a, 0x4fa444, 0x5bb54c, 0x367a34].map((c) => new THREE.Color(c));
    for (let i = 0; i < max; i++) {
      const [px, py, pz, rot, s, r] = leaves[i];
      tmpE.set((r - 0.5) * 0.6, rot, (r - 0.5) * 1.2);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpP.set(px, py, pz), tmpQ, tmpS.setScalar(s));
      mesh.setMatrixAt(i, tmpM);
      mesh.setColorAt(i, greens[Math.floor(r * greens.length)]);
    }
    this.group.add(mesh);
  }

  buildDoors() {
    const slabGeo = blockGeo(TILE * 0.98, RING_H - 0.08, TILE * 0.7, { bottom: 0x3d3644, top: 0x777082, rim: 0x2f2a36, cap: 0x5a5366, inset: 0.1 });
    const toothGeo = new THREE.ConeGeometry(0.22, 0.75, 6);
    toothGeo.rotateZ(-Math.PI / 2); // point along +x
    const toothMat = toon(0x6e6878);
    this.doors = this.maze.doors.map((d) => {
      const door = { ...d, open: 0, slabs: [] };
      d.tiles.forEach(([tx, tz], k) => {
        const grp = new THREE.Group();
        const slab = new THREE.Mesh(slabGeo, toon(0xffffff, { vertexColors: true }));
        slab.castShadow = slab.receiveShadow = true;
        grp.add(slab);
        const dir = k === 0 ? 1 : -1; // teeth point toward the other slab
        for (let i = 0; i < 3; i++) {
          const tooth = new THREE.Mesh(toothGeo, toothMat);
          const o = new THREE.Mesh(toothGeo, outlineMat(0.04));
          tooth.add(o);
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

  buildGlade() {
    const R = this.R;
    // The Box: the lift hatch everyone arrives through.
    const boxGrp = new THREE.Group();
    const frame = new THREE.Mesh(blockGeo(4.2, 0.22, 4.2, { bottom: 0x3c4150, top: 0x5b6273, rim: 0x3c4150, cap: 0x6d7588, inset: 0.3 }), toon(0xffffff, { vertexColors: true }));
    frame.receiveShadow = true;
    boxGrp.add(frame);
    const barGeo = new THREE.BoxGeometry(3.4, 0.08, 0.16);
    for (let i = -2; i <= 2; i++) {
      const bar = new THREE.Mesh(barGeo, toon(0x2e3240));
      bar.position.set(0, 0.25, i * 0.65);
      boxGrp.add(bar);
    }
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 3.6), toon(0xf2c14e));
    seam.position.y = 0.26;
    boxGrp.add(seam);
    this.group.add(boxGrp);

    // Homestead (north-east).
    const hs = new THREE.Group();
    hs.position.set(11.5, 0, -11.5);
    const base = new THREE.Mesh(blockGeo(9, 3.6, 7, { bottom: 0x7a4e2c, top: 0xb57a45, rim: 0x6b4428, cap: 0x6b4428 }), toon(0xffffff, { vertexColors: true }));
    base.castShadow = base.receiveShadow = true;
    hs.add(base);
    const baseHull = new THREE.Mesh(new THREE.BoxGeometry(9.2, 3.7, 7.2), hullMat);
    baseHull.position.y = 1.8;
    hs.add(baseHull);
    const tri = new THREE.Shape([new THREE.Vector2(-5.3, 0), new THREE.Vector2(5.3, 0), new THREE.Vector2(0, 3.2)]);
    const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: 8, bevelEnabled: false });
    roofGeo.translate(0, 0, -4);
    const roof = new THREE.Mesh(roofGeo, toon(0xb5482f));
    roof.position.y = 3.55;
    roof.castShadow = true;
    hs.add(roof);
    const roofHull = new THREE.Mesh(roofGeo, hullMat);
    roofHull.position.y = 3.5;
    roofHull.scale.set(1.03, 1.05, 1.03);
    hs.add(roofHull);
    const doorM = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.2), toon(0x4a2e1c));
    doorM.position.set(-1.5, 1.2, 3.55);
    hs.add(doorM);
    for (const wx of [1.6, 3.4]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.2), toon(0xffd76a, { emissive: 0x6b4f10 }));
      w.position.set(wx, 2.1, 3.55);
      hs.add(w);
    }
    this.group.add(hs);
    this.rects.push({ x0: 11.5 - 4.6, x1: 11.5 + 4.6, z0: -11.5 - 3.6, z1: -11.5 + 3.6 });

    // The Deadheads forest (south-west).
    const trees = [];
    for (let tries = 0; tries < 400 && trees.length < 24; tries++) {
      const x = -18 + R() * 13, z = 5 + R() * 13;
      if (trees.every(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 > 7)) trees.push([x, z, 0.8 + R() * 0.5]);
    }
    this.addTrees(trees);

    // Gardens (south-east): crop beds.
    const bedGeo = blockGeo(2.2, 0.3, 9, { bottom: 0x4f321d, top: 0x6b4528, rim: 0x5a3a22, cap: 0x7a5232, inset: 0.15 });
    const crops = [];
    for (let i = 0; i < Math.min(4, this.colony.fields); i++) {
      const bx = 6 + i * 3.3, bz = 11.5;
      const bed = new THREE.Mesh(bedGeo, toon(0xffffff, { vertexColors: true }));
      bed.position.set(bx, 0, bz);
      bed.receiveShadow = true;
      this.group.add(bed);
      for (let j = 0; j < 7; j++) crops.push([bx + (R() - 0.5) * 0.5, bz - 3.8 + j * 1.25, i]);
    }
    this.addCrops(crops);

    // Campfire (north-west) with log seats.
    const fire = new THREE.Group();
    fire.position.set(-10, 0, -9);
    const stoneGeo = new THREE.DodecahedronGeometry(0.32, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const st = new THREE.Mesh(stoneGeo, toon(0x8b8796));
      st.position.set(Math.cos(a) * 0.95, 0.15, Math.sin(a) * 0.95);
      st.rotation.set(R() * 3, R() * 3, 0);
      st.castShadow = true;
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
    const flameGeo = new THREE.ConeGeometry(0.42, 1.2, 7);
    flameGeo.translate(0, 0.6, 0);
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
      fire.add(seat);
      const hull = new THREE.Mesh(seatGeo, outlineMat(0.05));
      seat.add(hull);
    }
    this.group.add(fire);
    this.circles.push({ x: -10, z: -9, r: 1.15, alive: true, solid: true });
    this.firePos = fire.position;

    // Grass tufts across the open Glade.
    const tufts = [];
    for (let i = 0; i < 260; i++) {
      const x = (R() - 0.5) * GLADE_HALF * 1.9, z = (R() - 0.5) * GLADE_HALF * 1.9;
      if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
      if (x > 6 && z < -6) continue;
      if (x > 4 && z > 6) continue;
      tufts.push([x, z]);
    }
    const tuftGeo = merge([-0.12, 0, 0.12].map((o, i) => {
      const c = new THREE.ConeGeometry(0.07, 0.42 + i * 0.08, 4);
      c.rotateZ(o * 2);
      c.translate(o, 0.2, 0);
      return c;
    }));
    const tm = new THREE.InstancedMesh(tuftGeo, toon(0x4f9e3f), tufts.length);
    tufts.forEach(([x, z], i) => {
      tmpQ.setFromAxisAngle(tmpP.set(0, 1, 0), R() * 6);
      tmpM.compose(tmpP.set(x, 0, z), tmpQ, tmpS.setScalar(0.8 + R() * 0.6));
      tm.setMatrixAt(i, tmpM);
    });
    this.group.add(tm);
  }

  // Buildings that appear as the colony grows.
  buildStructures() {
    const c = this.colony;
    const vc = toon(0xffffff, { vertexColors: true });
    const block = (w, h, d, colors, x, z, y = 0) => {
      const m = new THREE.Mesh(blockGeo(w, h, d, colors), vc);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.1, d + 0.16), hullMat);
      hull.position.y = h / 2;
      m.add(hull);
      this.group.add(m);
      return m;
    };
    const wood = { bottom: 0x7a4e2c, top: 0xb57a45, rim: 0x6b4428, cap: 0x8a5a34 };
    const roof = (w, d, x, z, y, color = 0xb5482f) => {
      const tri = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, w * 0.32)]);
      const geo = new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false });
      geo.translate(0, 0, -d / 2);
      const r = new THREE.Mesh(geo, toon(color));
      r.position.set(x, y, z);
      r.castShadow = true;
      const hull = new THREE.Mesh(geo, hullMat);
      hull.scale.set(1.04, 1.06, 1.04);
      hull.position.y = -0.04;
      r.add(hull);
      this.group.add(r);
    };
    const hut = (x, z) => {
      block(3.6, 2.4, 3.2, wood, x, z);
      roof(4.2, 3.6, x, z, 2.38, 0xa8513a);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.12), toon(0x4a2e1c));
      door.position.set(x, 0.8, z + 1.62);
      this.group.add(door);
      this.rects.push({ x0: x - 1.8, x1: x + 1.8, z0: z - 1.6, z1: z + 1.6 });
    };
    if (c.homestead >= 2) hut(16.6, -5.6);
    if (c.homestead >= 3) hut(-16, -4.6);

    if (c.tower >= 1) {
      const h = c.tower >= 2 ? 6.5 : 4.8;
      const x = -16, z = -16;
      const postGeo = new THREE.CylinderGeometry(0.16, 0.2, h, 6);
      postGeo.translate(0, h / 2, 0);
      for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
        const p = new THREE.Mesh(postGeo, toon(0x7a4f2e));
        p.position.set(x + dx, 0, z + dz);
        p.castShadow = true;
        p.add(new THREE.Mesh(postGeo, outlineMat(0.05)));
        this.group.add(p);
      }
      block(3.4, 0.35, 3.4, wood, x, z, h);
      for (const [dx, dz, w, d] of [[0, -1.6, 3.4, 0.15], [0, 1.6, 3.4, 0.15], [-1.6, 0, 0.15, 3.4], [1.6, 0, 0.15, 3.4]]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), toon(0x8a5a34));
        rail.position.set(x + dx, h + 0.7, z + dz);
        this.group.add(rail);
      }
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), toon(0xb5482f));
      cap.rotation.y = Math.PI / 4;
      cap.position.set(x, h + 2.6, z);
      cap.castShadow = true;
      cap.add(new THREE.Mesh(cap.geometry, outlineMat(0.06)));
      this.group.add(cap);
      for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 5), toon(0x7a4f2e));
        s.position.set(x + dx, h + 1.1, z + dz);
        this.group.add(s);
      }
      if (c.tower >= 2) {
        const flag = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.05), toon(0x3fb6ff));
        flag.position.set(x + 0.6, h + 4.1, z);
        this.flag = flag;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), toon(0xdddddd));
        pole.position.set(x, h + 3.9, z);
        this.group.add(flag, pole);
      }
      this.rects.push({ x0: x - 1.45, x1: x + 1.45, z0: z - 1.45, z1: z + 1.45 });
    }

    if (c.forge >= 1) {
      const x = 15.6, z = 1.2;
      block(4.2, 2.4, 3.6, { bottom: 0x55505e, top: 0x8f8999, rim: 0x3d3944, cap: 0x5e5866 }, x, z);
      const ch = block(1.0, 2.2, 1.0, { bottom: 0x6e6878, top: 0x8f8999, rim: 0x2a2630, cap: 0x1d1a22 }, x + 1.2, z - 1.0, 2.4);
      ch.castShadow = true;
      const glow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.1), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
      glow.position.set(x - 0.6, 0.7, z + 1.82);
      this.group.add(glow);
      this.forgeGlow = glow;
      const anvil = new THREE.Group();
      const ab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.4), toon(0x3a3f4f));
      ab.position.y = 0.3;
      const at = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.45), toon(0x4a5060));
      at.position.y = 0.72;
      anvil.add(ab, at);
      anvil.position.set(x - 2.6, 0, z + 2.6);
      this.group.add(anvil);
      this.chimney = new THREE.Vector3(x + 1.2, 5, z - 1.0);
      this.rects.push({ x0: x - 2.1, x1: x + 2.1, z0: z - 1.8, z1: z + 1.8 });
      this.circles.push({ x: x - 2.6, z: z + 2.6, r: 0.55, alive: true, solid: true });
    }
  }

  buildFragment([cx, cy]) {
    const x = cellToWorld(cx), z = cellToWorld(cy);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const ped = new THREE.Mesh(blockGeo(1.1, 0.6, 1.1, { bottom: 0x4a4561, top: 0x8f89a3, rim: 0x3c3750, cap: 0x6d6880 }), toon(0xffffff, { vertexColors: true }));
    ped.castShadow = true;
    g.add(ped);
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.95, 0.14), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    tablet.position.y = 1.5;
    tablet.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.1), hullMat));
    g.add(tablet);
    const beamGeo = new THREE.CylinderGeometry(0.55, 0.9, 40, 14, 1, true);
    beamGeo.translate(0, 20, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
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
    const beamGeo = new THREE.CylinderGeometry(1.3, 1.6, 40, 16, 1, true);
    beamGeo.translate(0, 20, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xb07aff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.renderOrder = 4;
    g.add(beam);
    this.group.add(g);
    this.hole = { x, z, beam, rim };
  }

  addTrees(list) {
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 1.8, 8);
    trunkGeo.translate(0, 0.9, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1.3, 1);
    crownGeo.translate(0, 2.7, 0);
    const topGeo = new THREE.IcosahedronGeometry(0.9, 1);
    topGeo.translate(0.15, 3.75, 0.1);
    const mk = (geo, mat, outline) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      m.castShadow = true;
      m.receiveShadow = true;
      const o = new THREE.InstancedMesh(geo, outlineMat(outline), list.length);
      list.forEach(([x, z, s], i) => {
        tmpQ.setFromAxisAngle(tmpP.set(0, 1, 0), (x * 13.7 + z) % 6);
        tmpM.compose(tmpP.set(x, 0, z), tmpQ, tmpS.setScalar(s));
        m.setMatrixAt(i, tmpM);
        o.setMatrixAt(i, tmpM);
      });
      this.group.add(m, o);
      return m;
    };
    mk(trunkGeo, toon(0x7a4f2e), 0.06);
    mk(crownGeo, toon(0x3f9446), 0.07);
    mk(topGeo, toon(0x56b04f), 0.07);
    for (const [x, z, s] of list) this.circles.push({ x, z, r: 0.45 * s + 0.1, alive: true, solid: true });
  }

  addCrops(list) {
    const leafGeo = new THREE.ConeGeometry(0.28, 0.75, 5);
    leafGeo.translate(0, 0.65, 0);
    const fruitGeo = new THREE.SphereGeometry(0.16, 8, 6);
    const leaves = new THREE.InstancedMesh(leafGeo, toon(0x5cbf48), list.length);
    const fruit = new THREE.InstancedMesh(fruitGeo, toon(0xffffff), list.length);
    const fruitCols = [0xe8452c, 0xff9a2e, 0xf2d43a, 0xc0392b].map((c) => new THREE.Color(c));
    list.forEach(([x, z, row], i) => {
      tmpM.makeTranslation(x, 0.3, z);
      leaves.setMatrixAt(i, tmpM);
      tmpM.makeTranslation(x + 0.18, 0.75, z + 0.1);
      fruit.setMatrixAt(i, tmpM);
      fruit.setColorAt(i, fruitCols[row]);
    });
    leaves.castShadow = true;
    this.group.add(leaves, fruit);
  }

  // ---------- per frame ----------
  update(dt) {
    this.time += dt;
    const t = this.time;
    this.flames.forEach((f, i) => {
      const k = 1 + Math.sin(t * (11 + i * 3)) * 0.12 + Math.sin(t * (17 + i * 5)) * 0.08;
      f.mesh.scale.set(f.base * (1 - (k - 1) * 0.5), f.base * k, f.base * (1 - (k - 1) * 0.5));
      f.mesh.rotation.y = t * (1 + i);
    });
    this.fireLight.intensity = 12 + Math.sin(t * 13) * 2 + Math.sin(t * 29) * 1.5;
    if (this.fragment && !this.fragment.taken) {
      this.fragment.tablet.rotation.y = t * 1.6;
      this.fragment.tablet.position.y = 1.5 + Math.sin(t * 2.5) * 0.15;
      this.fragment.beam.material.opacity = 0.22 + Math.sin(t * 3) * 0.08;
    }
    if (this.hole) {
      this.hole.beam.material.opacity = 0.2 + Math.sin(t * 2) * 0.08;
      this.hole.rim.material.color.setHSL(0.75, 0.9, 0.55 + Math.sin(t * 4) * 0.1);
    }
    if (this.flag) this.flag.rotation.y = Math.sin(t * 3) * 0.3;
    if (this.forgeGlow) this.forgeGlow.material.color.setHSL(0.07, 1, 0.5 + Math.sin(t * 9) * 0.06);
  }

  // ---------- queries ----------
  solidTile(tx, tz, doorsSolid = false) {
    if (tx < 0 || tz < 0 || tx >= GRID || tz >= GRID) return true;
    const t = this.grid[tz * GRID + tx];
    if (t === T.WALL || t === T.RING) return true;
    if (t === T.DOOR) return doorsSolid || this.doorByTile.get(tz * GRID + tx).open < 0.8;
    return false;
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
      if (!c.alive) continue;
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

export { INK };
