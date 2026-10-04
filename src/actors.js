import * as THREE from 'three';
import { buildGlader } from './character.js';
import { RUNNERS } from './data.js';

const lerpAngle = (a, b, t) => {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
};

export class Player {
  constructor(scene, id = 'theo', mods) {
    this.scene = scene;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.r = 0.55;
    this.facing = 0;
    this.setRunner(id, mods);
  }

  setRunner(id, mods = {}) {
    if (this.model) { this.scene.remove(this.model.root); this.model.dispose(); }
    this.id = id;
    this.def = RUNNERS[id];
    this.mods = { dmgMul: 1, reloadMul: 1, ammoBonus: 0, hpMul: 1, ...mods };
    this.model = buildGlader(this.def.look, { sil: 0x6fd6ff, weapon: this.def.weapon });
    this.scene.add(this.model.root);
    const a = this.def.attack;
    this.maxHp = Math.round(this.def.hp * this.mods.hpMul / 100) * 100;
    this.ammoMax = a.ammo + this.mods.ammoBonus;
    this.reloadTime = a.reload * this.mods.reloadMul;
    this.speed = this.def.speed;
    this.model.root.position.copy(this.pos);
  }

  reset(x, z) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp;
    this.ammo = this.ammoMax;
    this.reloadT = 0;
    this.cooldown = 0;
    this.superCharge = 0;
    this.facing = 0;
    this.dead = false;
    this.invuln = 0;
    this.dash = null;
    this.spin = 0;
    this.lastHurt = 99;
    this.lastAttack = 99;
    this.model.root.visible = true;
    this.model.root.rotation.set(0, 0, 0);
    this.model.root.position.copy(this.pos);
  }

  get dmgMul() { return this.mods.dmgMul; }

  update(dt, move, aimDir, world) {
    this.lastHurt += dt;
    this.lastAttack += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.dead) {
      this.model.root.rotation.z = Math.min(Math.PI / 2, this.model.root.rotation.z + dt * 6);
      this.model.update(dt, 0);
      return 0;
    }
    let speed01;
    if (this.dash) {
      const d = this.dash;
      d.t -= dt;
      this.pos.x += d.dx * d.speed * dt;
      this.pos.z += d.dz * d.speed * dt;
      world.collide(this.pos, this.r);
      this.vel.set(d.dx * this.speed, 0, d.dz * this.speed);
      if (d.t <= 0) this.dash = null;
      speed01 = 1;
    } else {
      const sp = this.speed * (this.spin > 0 ? 1.2 : 1);
      const acc = Math.min(1, dt * 16);
      this.vel.x += (move.x * sp - this.vel.x) * acc;
      this.vel.z += (move.z * sp - this.vel.z) * acc;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      world.collide(this.pos, this.r);
      speed01 = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / this.speed);
    }
    this.spin = Math.max(0, this.spin - dt);

    let want = null;
    if (aimDir) want = Math.atan2(aimDir.x, aimDir.z);
    else if (speed01 > 0.1) want = Math.atan2(this.vel.x, this.vel.z);
    if (want !== null && !this.spin) this.facing = lerpAngle(this.facing, want, Math.min(1, dt * 14));

    if (this.ammo < this.ammoMax) {
      this.reloadT += dt;
      if (this.reloadT >= this.reloadTime) { this.ammo++; this.reloadT = 0; }
    } else this.reloadT = 0;
    this.cooldown = Math.max(0, this.cooldown - dt);

    // Brawl-style regeneration after a short break from combat.
    if (this.lastHurt > 3 && this.lastAttack > 2.5 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.13 * dt);

    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
    this.model.update(dt, speed01);
    return speed01;
  }

  get ammoFrac() { return this.ammo + (this.ammo < this.ammoMax ? this.reloadT / this.reloadTime : 0); }
  canFire() { return !this.dead && this.ammo >= 1 && this.cooldown <= 0 && !this.dash; }

  consumeShot() {
    this.ammo--;
    this.cooldown = this.def.attack.cooldown;
    this.lastAttack = 0;
  }

  damage(dmg) {
    if (this.dead || this.invuln > 0 || this.dash) return false;
    this.hp -= dmg;
    this.lastHurt = 0;
    this.model.hurt();
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return true;
  }

  revive(frac) {
    this.dead = false;
    this.hp = this.maxHp * frac;
    this.invuln = 2;
    this.model.root.rotation.z = 0;
  }
}

const ZONES = {
  farmer: [5, 6.5, 17, 16.5],
  woodcutter: [-16.5, 5, -6, 17],
  smith: [10.5, 3.5, 14.5, 6.5],
  medic: [5, -6.5, 13.5, -3.8],
  idle: [-13.5, -12.5, -6, -5.5],
};
const GUARD_SPOTS = [[0, -16.8], [0, 16.8], [-16.8, 0], [16.8, 0]];

export class Npc {
  constructor(scene, glader, i, R) {
    this.scene = scene;
    this.glader = glader;
    this.role = glader.role;
    this.model = buildGlader(glader.look, { accessory: glader.role === 'idle' ? null : glader.role, pack: false });
    scene.add(this.model.root);
    this.R = R;
    this.i = i;
    this.r = 0.5;
    this.pos = new THREE.Vector3();
    this.pickTarget();
    this.pos.copy(this.target);
    this.wait = R() * 3;
    this.facing = R() * 6;
    this.workT = R() * 2;
    this.dead = false;
    this.taken = false;
    this.panic = false;
    this.fireT = R();
  }

  pickTarget() {
    if (this.role === 'guard') {
      const [x, z] = GUARD_SPOTS[this.i % 4];
      this.target = new THREE.Vector3(x + (this.R() - 0.5) * 3, 0, z + (this.R() - 0.5) * 3);
      return;
    }
    if (this.panic) { this.target = new THREE.Vector3(11.5 + (this.R() - 0.5) * 7, 0, -5.8 + this.R() * 1.2); return; }
    const z = ZONES[this.role] ?? ZONES.idle;
    this.target = new THREE.Vector3(z[0] + this.R() * (z[2] - z[0]), 0, z[1] + this.R() * (z[3] - z[1]));
  }

  update(dt, world) {
    if (this.taken) return;
    let speed01 = 0;
    if (this.wait > 0) {
      this.wait -= dt;
      this.workT -= dt;
      if (this.workT <= 0 && !this.panic) {
        this.workT = 1.1 + this.R();
        if (this.role === 'woodcutter' || this.role === 'smith') this.model.play('smash', 0.5);
        else if (this.role === 'farmer') this.model.play('cast', 0.6);
      }
      if (this.role === 'guard') this.facing = lerpAngle(this.facing, Math.atan2(this.target.x, this.target.z), Math.min(1, dt * 4));
    } else {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) {
        this.wait = this.panic ? 0.2 : 1.5 + this.R() * 4;
        this.pickTarget();
      } else {
        const sp = this.panic ? 6 : 2.6;
        const ox = this.pos.x, oz = this.pos.z;
        this.pos.x += (dx / d) * sp * dt;
        this.pos.z += (dz / d) * sp * dt;
        world.collide(this.pos, this.r);
        if (Math.hypot(this.pos.x - ox, this.pos.z - oz) < sp * dt * 0.3) { this.wait = 0.3; this.pickTarget(); }
        this.facing = lerpAngle(this.facing, Math.atan2(dx, dz), Math.min(1, dt * 8));
        speed01 = this.panic ? 0.9 : 0.38;
      }
    }
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
    this.model.update(dt, speed01);
  }

  setPanic(on) { if (this.role !== 'guard' && on !== this.panic) { this.panic = on; this.wait = 0; this.pickTarget(); } }

  remove() {
    this.taken = true;
    this.scene.remove(this.model.root);
  }

  dispose() { this.scene.remove(this.model.root); this.model.dispose(); }
}
