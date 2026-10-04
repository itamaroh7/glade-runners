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
    this.buffs = {};
    this.setRunner(id, mods);
  }

  setRunner(id, mods = {}) {
    if (this.model) { this.scene.remove(this.model.root); this.model.dispose(); }
    this.id = id;
    this.def = RUNNERS[id];
    this.model = buildGlader(this.def.look, { sil: 0x6fd6ff, weapon: this.def.weapon });
    this.scene.add(this.model.root);
    this.applyMods(mods, true);
    this.model.root.position.copy(this.pos);
  }

  /** Update stat modifiers without resetting the run (keeps the health ratio). */
  applyMods(mods = {}, fresh = false) {
    const ratio = !fresh && this.maxHp ? this.hp / this.maxHp : 1;
    this.mods = { dmgMul: 1, reloadMul: 1, ammoBonus: 0, hpMul: 1, superMul: 1, ...mods };
    const a = this.def.attack;
    this.maxHp = Math.round(this.def.hp * this.mods.hpMul / 100) * 100;
    this.ammoMax = a.ammo + this.mods.ammoBonus;
    this.reloadTime = a.reload * this.mods.reloadMul;
    this.speed = this.def.speed;
    if (!fresh) this.hp = this.maxHp * ratio;
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
    this.buffs = {};
    this.auto = null;
    this.hidden = false;
    this.slow = 1;
    this.model.root.visible = true;
    this.model.root.rotation.set(0, 0, 0);
    this.model.root.position.copy(this.pos);
  }

  get dmgMul() { return this.mods.dmgMul * (this.buffs.fury > 0 ? 1.4 : 1); }

  /** Walk to a point by itself (tap-to-interact). */
  walkTo(x, z, range, onArrive) { this.auto = { x, z, range, onArrive, stuck: 0, last: Infinity }; }

  update(dt, move, aimDir, world) {
    this.lastHurt += dt;
    this.lastAttack += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    for (const k of Object.keys(this.buffs)) { this.buffs[k] -= dt; if (this.buffs[k] <= 0) delete this.buffs[k]; }
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
      if ((move.x || move.z) && this.auto) this.auto = null;
      let mx = move.x, mz = move.z;
      if (this.auto) {
        const dx = this.auto.x - this.pos.x, dz = this.auto.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d <= this.auto.range) {
          const cb = this.auto.onArrive;
          this.auto = null;
          cb?.();
        } else {
          mx = dx / d; mz = dz / d;
          this.auto.stuck = d > this.auto.last - 0.01 ? this.auto.stuck + dt : 0;
          this.auto.last = d;
          if (this.auto.stuck > 0.6) this.auto = null;
        }
      }
      const sp = this.speed * (this.spin > 0 ? 1.2 : 1) * (this.buffs.swift > 0 ? 1.3 : 1) * this.slow;
      const acc = Math.min(1, dt * 16);
      this.vel.x += (mx * sp - this.vel.x) * acc;
      this.vel.z += (mz * sp - this.vel.z) * acc;
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
    const regen = this.buffs.regen > 0 ? 0.3 : 0.13 * (this.mods.regenMul ?? 1);
    if ((this.lastHurt > 3 && this.lastAttack > 2.5 || this.buffs.regen > 0) && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * regen * dt);

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

/** A glader. The Glade hands out jobs via goTo()/work(). */
export class Npc {
  constructor(scene, glader, i, R) {
    this.scene = scene;
    this.glader = glader;
    this.role = glader.role;
    this.model = buildGlader(glader.look, { accessory: ['idle', 'builder'].includes(glader.role) ? (glader.role === 'builder' ? 'smith' : null) : glader.role, pack: false, weapon: glader.role === 'builder' ? 'club' : null });
    scene.add(this.model.root);
    this.R = R;
    this.i = i;
    this.r = 0.5;
    this.pos = new THREE.Vector3((R() - 0.5) * 12, 0, 4 + (R() - 0.5) * 10);
    this.target = null;
    this.wait = R() * 2;
    this.facing = R() * 6;
    this.dead = false;
    this.taken = false;
    this.panic = false;
    this.fireT = R();
    this.job = null;
    this.busy = 0;
  }

  goTo(x, z, onArrive) { this.target = { x, z, onArrive, stuck: 0 }; }
  face(o) { this.facing = Math.atan2(o.x - this.pos.x, o.z - this.pos.z); }
  work(secs, anim, done) {
    this.busy = secs;
    this.workDone = done;
    this.model.play(anim, Math.min(secs, 0.5));
    this.animT = 0;
    this.anim = anim;
  }

  update(dt, world) {
    if (this.taken) return;
    let speed01 = 0;
    if (this.busy > 0) {
      this.busy -= dt;
      this.animT += dt;
      if (this.animT > 0.55) { this.animT = 0; this.model.play(this.anim, 0.5); }
      if (this.busy <= 0) { const cb = this.workDone; this.workDone = null; cb?.(); }
    } else if (this.wait > 0) {
      this.wait -= dt;
    } else if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        const cb = this.target.onArrive;
        this.target = null;
        cb?.();
      } else {
        const sp = this.panic ? 6 : this.follower ? 6.5 : 3;
        const ox = this.pos.x, oz = this.pos.z;
        this.pos.x += (dx / d) * sp * dt;
        this.pos.z += (dz / d) * sp * dt;
        world.collide(this.pos, this.r);
        const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
        this.target.stuck = moved < sp * dt * 0.3 ? this.target.stuck + dt : 0;
        if (this.target.stuck > 0.8) {
          // Give up on unreachable spots.
          this.target = null;
          if (this.job?.obj) this.job.obj.reserved = null;
          this.job = null;
          this.wait = 0.5;
        }
        this.facing = lerpAngle(this.facing, Math.atan2(dx, dz), Math.min(1, dt * 8));
        speed01 = this.panic || this.follower ? 0.9 : 0.42;
      }
    }
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
    this.model.update(dt, speed01);
  }

  setPanic(on) {
    if (this.role === 'guard' || on === this.panic) return;
    this.panic = on;
    if (this.job?.obj) this.job.obj.reserved = null;
    this.job = on ? { kind: 'panic' } : null;
    this.busy = 0;
    if (on) this.goTo(16 + (this.R() - 0.5) * 8, -11 + this.R() * 1.5, () => {});
  }

  remove() {
    this.taken = true;
    this.scene.remove(this.model.root);
  }

  dispose() { this.scene.remove(this.model.root); this.model.dispose(); }
}
