import * as THREE from 'three';
import { toon, hullMat, merge, paint } from './materials.js';

const SIZE = 1.4;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const sc = new THREE.Vector3();
const p = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

function crateGeo(body, band, accent) {
  const parts = [];
  const b = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  parts.push(paint(b, body));
  for (const y of [-0.42, 0.42]) {
    const r = new THREE.BoxGeometry(SIZE + 0.06, 0.2, SIZE + 0.06);
    r.translate(0, y, 0);
    parts.push(paint(r, band));
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const c = new THREE.BoxGeometry(0.2, SIZE + 0.04, 0.2);
    c.translate((x * SIZE) / 2, 0, (z * SIZE) / 2);
    parts.push(paint(c, band));
  }
  if (accent) {
    const s = new THREE.BoxGeometry(SIZE + 0.04, 0.16, SIZE + 0.04);
    parts.push(paint(s, accent));
  }
  const g = merge(parts);
  g.translate(0, SIZE / 2, 0);
  return g;
}

export const CRATE_TYPES = {
  wood: { hp: 1100, geo: null, colors: [0xc08a50, 0x8a5a32, 0xe0b070], drops: () => [['wood', 1 + rnd(2)], ['food', Math.random() < 0.45 ? 1 + rnd(2) : 0]] },
  metal: { hp: 1700, geo: null, colors: [0x8d9ab0, 0x56627a, 0xf2c14e], drops: () => [['metal', 1 + rnd(3)], ['food', Math.random() < 0.25 ? 1 : 0], ['wood', rnd(2)]] },
};
function rnd(n) { return Math.floor(Math.random() * n); }

export class Crates {
  constructor(scene, world, list) {
    CRATE_TYPES.wood.geo ??= crateGeo(0xc08a50, 0x7d512d);
    CRATE_TYPES.metal.geo ??= crateGeo(0x8d9ab0, 0x4f5a70, 0xf2c14e);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = list.map((c) => ({ ...c, hp: CRATE_TYPES[c.type].hp, alive: true, anim: 0, rot: Math.random() * 0.6 - 0.3 }));
    const hullGeo = new THREE.BoxGeometry(SIZE + 0.16, SIZE + 0.12, SIZE + 0.16);
    hullGeo.translate(0, SIZE / 2, 0);
    this.meshes = {};
    for (const type of Object.keys(CRATE_TYPES)) {
      const items = this.items.filter((c) => c.type === type);
      const mesh = new THREE.InstancedMesh(CRATE_TYPES[type].geo, toon(0xffffff, { vertexColors: true }), Math.max(1, items.length));
      const hull = new THREE.InstancedMesh(hullGeo, hullMat, Math.max(1, items.length));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.count = hull.count = items.length;
      items.forEach((c, i) => { c.mesh = mesh; c.hull = hull; c.idx = i; });
      this.group.add(mesh, hull);
      this.meshes[type] = { mesh, hull };
    }
    this.items.forEach((c) => {
      c.collider = { x: c.x, z: c.z, r: 0.85, alive: true, solid: true, crate: c };
      world.circles.push(c.collider);
      this.writeMatrix(c);
    });
    for (const { mesh, hull } of Object.values(this.meshes)) { mesh.instanceMatrix.needsUpdate = hull.instanceMatrix.needsUpdate = true; }
    this.animating = new Set();
  }

  writeMatrix(c) {
    let sx = 1, sy = 1;
    if (!c.alive) sx = sy = 0;
    else if (c.anim > 0) {
      const k = Math.sin((c.anim / 0.22) * Math.PI);
      sx = 1 + k * 0.18;
      sy = 1 - k * 0.2;
    }
    q.setFromAxisAngle(up, c.rot);
    m4.compose(p.set(c.x, 0, c.z), q, sc.set(sx, sy, sx));
    c.mesh.setMatrixAt(c.idx, m4);
    c.hull.setMatrixAt(c.idx, m4);
    c.mesh.instanceMatrix.needsUpdate = c.hull.instanceMatrix.needsUpdate = true;
  }

  /** Returns true if the crate broke. */
  hit(c, dmg) {
    if (!c.alive) return false;
    c.hp -= dmg;
    c.anim = 0.22;
    this.animating.add(c);
    if (c.hp <= 0) {
      c.alive = false;
      c.collider.alive = false;
      this.writeMatrix(c);
      return true;
    }
    return false;
  }

  update(dt) {
    for (const c of this.animating) {
      c.anim = Math.max(0, c.anim - dt);
      this.writeMatrix(c);
      if (c.anim === 0) this.animating.delete(c);
    }
  }

  nearestAlive(x, z, range, world) {
    let best = null, bd = range * range;
    for (const c of this.items) {
      if (!c.alive) continue;
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bd && world.lineOfSight(x, z, c.x, c.z)) { bd = d; best = c; }
    }
    return best;
  }

  dispose(scene) { scene.remove(this.group); }
}
