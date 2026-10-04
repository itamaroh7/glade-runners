import * as THREE from 'three';
import { toon, part, merge, paint } from './materials.js';

let models;
function buildModels() {
  if (models) return models;
  const apple = merge([
    paint(new THREE.SphereGeometry(0.26, 14, 10), 0xe8452c),
    paint(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 5).translate(0, 0.3, 0), 0x5a3a22),
    paint(new THREE.SphereGeometry(0.09, 6, 4).scale(1.6, 0.5, 1).translate(0.1, 0.34, 0), 0x5cbf48),
  ]);
  const log = merge([
    paint(new THREE.CylinderGeometry(0.17, 0.17, 0.75, 10).rotateZ(Math.PI / 2), 0x9a6638),
    paint(new THREE.CylinderGeometry(0.13, 0.13, 0.77, 10).rotateZ(Math.PI / 2), 0xe0b070),
  ]);
  const gear = merge([
    paint(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12).rotateX(Math.PI / 2), 0xa8b4c8),
    paint(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 8).rotateX(Math.PI / 2), 0x56627a),
    ...[0, 1, 2, 3, 4, 5].map((i) =>
      paint(new THREE.BoxGeometry(0.12, 0.12, 0.13).translate(0.3, 0, 0).rotateZ((i / 6) * Math.PI * 2), 0xa8b4c8)),
  ]);
  const mat = toon(0xffffff, { vertexColors: true });
  models = { food: [apple, mat], wood: [log, mat], metal: [gear, mat] };
  return models;
}

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    buildModels();
  }

  /** opts.safe: goes straight to the Glade's stock (not lost if you fall). */
  spawn(type, x, z, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const [geo, mat] = models[type];
      const mesh = part(geo, mat, null, { thick: 0.03 });
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 2.5;
      this.items.push({ type, mesh, x, z, y: opts.y ?? 0.8, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 6 + Math.random() * 2, t: 0, state: 'pop', safe: !!opts.safe });
    }
  }

  /** Calls onCollect(type) for every pickup the player gathers. */
  update(dt, player, world, onCollect) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const dx = player.pos.x - it.x, dz = player.pos.z - it.z;
      const d = Math.hypot(dx, dz);
      if (it.state === 'pop') {
        it.vy -= 22 * dt;
        const nx = it.x + it.vx * dt, nz = it.z + it.vz * dt;
        if (!world.blocks(nx, nz)) { it.x = nx; it.z = nz; } else { it.vx *= -0.3; it.vz *= -0.3; }
        it.y += it.vy * dt;
        if (it.y < 0.5) { it.y = 0.5; it.vy = Math.abs(it.vy) * 0.35; it.vx *= 0.5; it.vz *= 0.5; if (it.vy < 1) it.state = 'idle'; }
      } else if (it.state === 'idle') {
        it.y = 0.6 + Math.sin(it.t * 4) * 0.12;
        if (d < 3.2 && it.t > 0.35) it.state = 'magnet';
      } else {
        const sp = 14 + it.t * 4;
        it.x += (dx / (d || 1)) * sp * dt;
        it.z += (dz / (d || 1)) * sp * dt;
        it.y += (1.2 - it.y) * dt * 8;
        if (d < 0.6) {
          this.scene.remove(it.mesh);
          this.items.splice(i, 1);
          onCollect(it.type, it);
          continue;
        }
      }
      it.mesh.position.set(it.x, it.y, it.z);
      it.mesh.rotation.y = it.t * 2.5;
    }
  }

  clear() { for (const it of this.items) this.scene.remove(it.mesh); this.items.length = 0; }
}
