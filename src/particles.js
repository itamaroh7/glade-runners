import * as THREE from 'three';
import { toon } from './materials.js';

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const s = new THREE.Vector3();
const p = new THREE.Vector3();
const col = new THREE.Color();

export class Particles {
  constructor(scene, max = 600) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon(0xffffff), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, col.set(0xffffff));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.ps = [];
  }

  /** opts: { colors:[hex], n, speed, up, size, life, gravity, spread } */
  burst(x, y, z, o = {}) {
    const n = o.n ?? 10;
    const colors = o.colors ?? [0xffffff];
    for (let i = 0; i < n && this.ps.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 4) * (0.4 + Math.random() * 0.8);
      const dir = o.dir;
      let vx = Math.cos(a) * sp, vz = Math.sin(a) * sp;
      if (dir) { vx = vx * (o.spread ?? 0.6) + dir.x * sp; vz = vz * (o.spread ?? 0.6) + dir.z * sp; }
      this.ps.push({
        x, y, z, vx, vz,
        vy: (o.up ?? 4) * (0.5 + Math.random() * 0.8),
        life: (o.life ?? 0.7) * (0.6 + Math.random() * 0.6),
        max: 0,
        size: (o.size ?? 0.22) * (0.6 + Math.random() * 0.8),
        g: o.gravity ?? 14,
        rx: Math.random() * 6, ry: Math.random() * 6,
        spin: (Math.random() - 0.5) * 12,
        color: colors[Math.floor(Math.random() * colors.length)],
        float: o.float ?? false,
      });
      const last = this.ps[this.ps.length - 1];
      last.max = last.life;
    }
  }

  update(dt) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const a = ps[i];
      a.life -= dt;
      if (a.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      a.vy -= a.g * dt;
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      if (a.float) { a.vx *= 1 - dt * 2; a.vz *= 1 - dt * 2; }
      if (a.y < a.size * 0.5) { a.y = a.size * 0.5; a.vy *= -0.35; a.vx *= 0.6; a.vz *= 0.6; a.spin *= 0.6; }
      a.rx += a.spin * dt; a.ry += a.spin * dt * 0.7;
    }
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      const k = Math.min(1, a.life / a.max * 2.2);
      e.set(a.rx, a.ry, 0);
      q.setFromEuler(e);
      m4.compose(p.set(a.x, a.y, a.z), q, s.setScalar(a.size * k));
      this.mesh.setMatrixAt(i, m4);
      this.mesh.setColorAt(i, col.set(a.color));
    }
    this.mesh.count = ps.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.ps.length = 0; this.mesh.count = 0; }
}
