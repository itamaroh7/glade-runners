import * as THREE from 'three';
import { Kit, charMaterial } from './character.js';
import { worldToTile } from './config.js';

const models = {};
function model(type) {
  const g = new THREE.Group();
  const kit = new Kit();
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 7).rotateX(Math.PI / 2);
  const cone = new THREE.ConeGeometry(1, 1, 7).rotateX(Math.PI / 2);
  const sph = new THREE.SphereGeometry(1, 8, 6);
  if (type === 'spear') {
    kit.add(g, cyl, 0x8a5a32, { s: [0.05, 0.05, 1.5] });
    kit.add(g, cone, 0xd7dee8, { p: [0, 0, 0.92], s: [0.11, 0.11, 0.36] });
  } else if (type === 'stone') {
    kit.add(g, sph, 0x9a93a6, { s: [0.17, 0.15, 0.17] });
  } else if (type === 'dart') {
    kit.add(g, cyl, 0x2a2a34, { s: [0.04, 0.04, 0.5] });
    kit.add(g, cone, 0xdfe6ee, { p: [0, 0, 0.36], s: [0.07, 0.07, 0.26] });
    kit.add(g, cone, 0x3fb6ff, { p: [0, 0, -0.28], r: [Math.PI, 0, 0], s: [0.1, 0.1, 0.16], outline: false });
  } else if (type === 'net') {
    kit.add(g, sph, 0xc9b27a, { s: 0.35 });
    for (let i = 0; i < 4; i++) kit.add(g, sph, 0x6b5536, { p: [Math.cos(i * 1.57) * 0.35, 0, Math.sin(i * 1.57) * 0.35], s: 0.1, outline: false });
  }
  kit.bake(models.mat ??= charMaterial(), { thick: 0.03 });
  return g;
}

export class Projectiles {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.list = [];
    this.pool = { spear: [], stone: [], dart: [], net: [] };
  }

  /** opts: { type, speed, range, dmg, owner, pierce, lob } */
  fire(x, z, dir, o) {
    const type = o.type ?? 'spear';
    const mesh = this.pool[type].pop() ?? model(type);
    mesh.position.set(x, 1.15, z);
    mesh.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
    this.scene.add(mesh);
    this.list.push({ mesh, type, x, z, dx: dir.x, dz: dir.z, speed: o.speed ?? 26, range: o.range ?? 11, dist: 0, dmg: o.dmg ?? 600, owner: o.owner ?? 'player', hitSet: null, lob: !!o.lob });
  }

  /** h: { world, crates, enemies, onWall(x,z,pr), onCrate(c,pr), onEnemy(e,pr), onLand(pr) } */
  update(dt, h) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pr = this.list[i];
      let done = false;
      const steps = Math.ceil((pr.speed * dt) / 0.35);
      const st = (pr.speed * dt) / steps;
      for (let k = 0; k < steps && !done; k++) {
        pr.x += pr.dx * st;
        pr.z += pr.dz * st;
        pr.dist += st;
        if (!pr.lob) {
          for (const e of h.enemies) {
            if (e.alive && (e.pos.x - pr.x) ** 2 + (e.pos.z - pr.z) ** 2 < (e.r + 0.3) ** 2) { h.onEnemy(e, pr); done = true; break; }
          }
          if (!done && pr.owner === 'player') for (const c of h.crates.items) {
            if (c.alive && (c.x - pr.x) ** 2 + (c.z - pr.z) ** 2 < 0.95 * 0.95) { h.onCrate(c, pr); done = true; break; }
          }
          if (!done && h.world.blocks(pr.x, pr.z)) { h.onWall(pr.x - pr.dx * 0.3, pr.z - pr.dz * 0.3, pr); done = true; }
        } else if (h.world.solidTile(worldToTile(pr.x), worldToTile(pr.z))) {
          pr.x -= pr.dx * st; pr.z -= pr.dz * st;
          h.onLand(pr); done = true;
        }
        if (!done && pr.dist >= pr.range) {
          if (pr.lob) h.onLand(pr);
          else this.particles.burst(pr.x, 0.4, pr.z, { n: 4, colors: [0xcfc6b8, 0xa89f92], speed: 2, up: 2, size: 0.16 });
          done = true;
        }
      }
      if (done) {
        this.scene.remove(pr.mesh);
        this.pool[pr.type].push(pr.mesh);
        this.list.splice(i, 1);
        continue;
      }
      const f = pr.dist / pr.range;
      const arc = pr.lob ? 3.2 : 0.6;
      pr.mesh.position.set(pr.x, 1.15 + Math.sin(f * Math.PI) * arc - f * 0.4, pr.z);
      if (pr.type === 'stone' || pr.type === 'net') pr.mesh.rotation.x += dt * 14;
      else pr.mesh.rotation.x = (f - 0.5) * (pr.lob ? 1.6 : 0.6);
    }
  }

  clear() { for (const p of this.list) { this.scene.remove(p.mesh); this.pool[p.type].push(p.mesh); } this.list.length = 0; }
}
