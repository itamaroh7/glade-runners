import * as THREE from 'three';
import { CRATE_TYPES } from './crates.js';

const arcMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });

/**
 * Player attacks & supers. G is a live view of the game:
 * { scene, player, world, crates, enemies, projectiles, particles, pickups, sfx, fx, minimap,
 *   shake(a), vibrate(ms), onKill(e), onCrateBroken(c), onSuperReady(), revealAll() }
 */
export class Combat {
  constructor(G) {
    this.G = G;
    this.queue = [];
    this.vfx = [];
  }

  reset() {
    this.queue.length = 0;
    for (const v of this.vfx) this.G.scene.remove(v.mesh);
    this.vfx.length = 0;
  }

  get p() { return this.G.player; }

  chargeSuper(amount) {
    const p = this.p;
    if (p.superCharge >= 1) return;
    p.superCharge = Math.min(1, p.superCharge + amount / p.def.superCost);
    if (p.superCharge >= 1) this.G.onSuperReady();
  }

  damageEnemy(e, dmg, dir, opts = {}, fromPlayer = true) {
    const G = this.G;
    dmg = Math.round(dmg);
    const killed = e.hit(dmg, dir, opts);
    G.fx.number(e.pos.x, 2.4, e.pos.z, dmg, fromPlayer ? '' : 'ally');
    G.particles.burst(e.pos.x, 1.2, e.pos.z, { n: 6, colors: [0x8a7aa6, 0xc9c2d6, 0x6e6480], speed: 3, up: 3, size: 0.16 });
    G.sfx.grinderHit();
    if (fromPlayer) this.chargeSuper(dmg);
    if (killed) G.onKill(e);
    return killed;
  }

  damageCrate(c, dmg) {
    const G = this.G;
    const broke = G.crates.hit(c, dmg);
    const ty = CRATE_TYPES[c.type];
    G.particles.burst(c.x, 0.9, c.z, { n: broke ? 26 : 8, colors: ty.colors, speed: broke ? 6 : 3, up: broke ? 7 : 4, size: broke ? 0.34 : 0.2 });
    this.chargeSuper(dmg * 0.35);
    if (broke) {
      G.sfx.crateBreak();
      G.shake(0.3);
      G.vibrate(25);
      G.onCrateBroken(c);
    } else {
      G.sfx.crateHit();
      G.shake(0.12);
    }
  }

  /** Best auto-aim direction: enemies first, then crates. */
  autoDir(range) {
    const G = this.G, p = this.p;
    let best = null, bd = (range + 1.5) ** 2;
    for (const e of G.enemies.list) {
      if (!e.alive) continue;
      const d = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
      if (d < bd && G.world.lineOfSight(p.pos.x, p.pos.z, e.pos.x, e.pos.z)) { bd = d; best = e.pos; }
    }
    if (!best) {
      const c = G.crates.nearestAlive(p.pos.x, p.pos.z, range + 0.5, G.world);
      if (c) best = c;
    }
    if (!best) return { x: Math.sin(p.facing), z: Math.cos(p.facing) };
    const dx = best.x - p.pos.x, dz = best.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }

  attack(dir) {
    const p = this.p, a = p.def.attack, G = this.G;
    if (!dir) dir = this.autoDir(a.range);
    p.facing = Math.atan2(dir.x, dir.z);
    p.consumeShot();
    const dmg = a.dmg * p.dmgMul;
    const ox = p.pos.x + dir.x * 0.5, oz = p.pos.z + dir.z * 0.5;
    switch (a.kind) {
      case 'throw':
        p.model.play('throw', 0.3);
        G.projectiles.fire(ox, oz, dir, { type: a.proj, dmg, range: a.range });
        G.sfx.throw();
        break;
      case 'spread':
        p.model.play('throw', 0.28);
        for (let i = 0; i < a.count; i++) {
          const ang = (i - (a.count - 1) / 2) * a.spread;
          const c = Math.cos(ang), s = Math.sin(ang);
          G.projectiles.fire(ox, oz, { x: dir.x * c - dir.z * s, z: dir.x * s + dir.z * c }, { type: a.proj, dmg, range: a.range, speed: 24 });
        }
        G.sfx.throw();
        break;
      case 'burst':
        p.model.play('throw', 0.22);
        G.projectiles.fire(ox, oz, dir, { type: a.proj, dmg, range: a.range, speed: 30 });
        this.queue.push({ t: 0.13, fn: () => { p.model.play('throw', 0.2); G.projectiles.fire(p.pos.x + dir.x * 0.5, p.pos.z + dir.z * 0.5, dir, { type: a.proj, dmg, range: a.range, speed: 30 }); G.sfx.throw(); } });
        G.sfx.throw();
        break;
      case 'slash':
        p.model.play(p.def.weapon === 'club' ? 'smash' : 'slash', p.def.weapon === 'club' ? 0.35 : 0.25);
        G.sfx.slash();
        this.queue.push({ t: p.def.weapon === 'club' ? 0.14 : 0.05, fn: () => this.meleeArc(dir, a.range, a.arc, dmg, a.knock ?? 3) });
        break;
    }
    G.shake(0.1);
  }

  meleeArc(dir, range, arc, dmg, knock) {
    const G = this.G, p = this.p;
    const face = Math.atan2(dir.x, dir.z);
    let hitAny = false;
    for (const e of G.enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > range + e.r) continue;
      let da = Math.atan2(dx, dz) - face;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > arc / 2 && d > e.r + 0.4) continue;
      this.damageEnemy(e, dmg, { x: dx / (d || 1), z: dz / (d || 1) }, { knock });
      hitAny = true;
    }
    for (const c of G.crates.items) {
      if (!c.alive) continue;
      const dx = c.x - p.pos.x, dz = c.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > range + 0.7) continue;
      let da = Math.atan2(dx, dz) - face;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) <= arc / 2) { this.damageCrate(c, dmg); hitAny = true; }
    }
    this.arcVfx(face, range, arc, p.def.weapon === 'club' ? 0xffd27a : 0xffffff);
    if (hitAny) G.shake(0.2);
  }

  arcVfx(face, range, arc, color) {
    const p = this.p;
    const geo = new THREE.RingGeometry(range * 0.35, range, 24, 1, -arc / 2, arc);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, arcMat.clone());
    m.material.color.setHex(color);
    m.position.set(p.pos.x, 0.9, p.pos.z);
    m.rotation.y = face - Math.PI / 2;
    m.renderOrder = 4;
    this.G.scene.add(m);
    this.vfx.push({ mesh: m, t: 0, dur: 0.2, kind: 'fade' });
  }

  ringVfx(x, z, radius, color = 0xffe08a, dur = 0.45) {
    const geo = new THREE.RingGeometry(0.8, 1, 40);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, ringMat.clone());
    m.material.color.setHex(color);
    m.position.set(x, 0.12, z);
    m.renderOrder = 4;
    this.G.scene.add(m);
    this.vfx.push({ mesh: m, t: 0, dur, kind: 'ring', radius });
  }

  useSuper(dir) {
    const p = this.p, G = this.G;
    if (p.superCharge < 1 || p.dead) return false;
    p.superCharge = 0;
    p.lastAttack = 0;
    G.sfx.superUse();
    G.vibrate(40);
    const mul = p.dmgMul;
    switch (p.def.superKind) {
      case 'dash': {
        if (!dir) dir = this.autoDir(9);
        p.facing = Math.atan2(dir.x, dir.z);
        p.dash = { dx: dir.x, dz: dir.z, speed: 30, t: 0.27, hit: new Set() };
        p.invuln = 0.45;
        p.model.play('throw', 0.27);
        this.dashDmg = 950 * mul;
        G.shake(0.25);
        break;
      }
      case 'whirl':
        p.spin = 1.8;
        p.model.play('spin', 1.8);
        for (let i = 0; i < 8; i++) this.queue.push({ t: 0.05 + i * 0.22, fn: () => this.radial(3.7, 430 * mul, 3.5, 0, 0xffffff) });
        break;
      case 'net': {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
        G.sfx.heal();
        G.fx.number(p.pos.x, 2.8, p.pos.z, '+' + Math.round(p.maxHp * 0.35), 'heal');
        G.particles.burst(p.pos.x, 1.2, p.pos.z, { n: 16, colors: [0x7dff8a, 0xd8ffd8], speed: 2.5, up: 4, size: 0.18, gravity: 3 });
        if (!dir) dir = this.autoDir(8);
        p.model.play('cast', 0.35);
        G.projectiles.fire(p.pos.x, p.pos.z, dir, { type: 'net', dmg: 300 * mul, range: 7, speed: 18, lob: true });
        break;
      }
      case 'slam':
        p.model.play('slam', 0.5);
        this.queue.push({ t: 0.3, fn: () => {
          this.radial(5.6, 1300 * mul, 10, 1.7, 0xffd27a);
          G.shake(0.7);
          G.vibrate(120);
          G.sfx.boom();
          G.particles.burst(p.pos.x, 0.3, p.pos.z, { n: 30, colors: [0xbdb3a3, 0x958b7c, 0x6b5f50], speed: 9, up: 3, size: 0.35, life: 0.8 });
        } });
        break;
      case 'recall':
        p.model.play('cast', 0.5);
        G.revealAll();
        G.enemies.xray = 12;
        G.particles.burst(p.pos.x, 1.6, p.pos.z, { n: 24, colors: [0x6fd6ff, 0xffffff, 0x9a7aff], speed: 4, up: 3, size: 0.16, gravity: 0 });
        this.ringVfx(p.pos.x, p.pos.z, 14, 0x6fd6ff, 0.8);
        break;
    }
    return true;
  }

  radial(radius, dmg, knock, stun, color) {
    const G = this.G, p = this.p;
    for (const e of G.enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < radius + e.r) this.damageEnemy(e, dmg, { x: dx / (d || 1), z: dz / (d || 1) }, { knock, stun });
    }
    for (const c of G.crates.items) {
      if (c.alive && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < radius + 0.6) this.damageCrate(c, dmg);
    }
    this.ringVfx(p.pos.x, p.pos.z, radius, color, 0.35);
  }

  netLanded(pr) {
    const G = this.G;
    for (const e of G.enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - pr.x, dz = e.pos.z - pr.z, d = Math.hypot(dx, dz);
      if (d < 3.6 + e.r) this.damageEnemy(e, pr.dmg, { x: dx / (d || 1), z: dz / (d || 1) }, { knock: 0.5, stun: 3.2 });
    }
    this.ringVfx(pr.x, pr.z, 3.6, 0xc9b27a, 0.5);
    G.particles.burst(pr.x, 0.4, pr.z, { n: 14, colors: [0xc9b27a, 0x6b5536], speed: 4, up: 2, size: 0.15 });
    G.sfx.crateHit();
  }

  update(dt) {
    const G = this.G, p = this.p;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.t -= dt;
      if (q.t <= 0) { this.queue.splice(i, 1); if (!p.dead) q.fn(); }
    }
    if (p.dash) {
      for (const e of G.enemies.list) {
        if (!e.alive || p.dash.hit.has(e)) continue;
        if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < e.r + 1.2) {
          p.dash.hit.add(e);
          this.damageEnemy(e, this.dashDmg, { x: p.dash.dx, z: p.dash.dz }, { knock: 9, stun: 0.6 });
        }
      }
      for (const c of G.crates.items) {
        if (c.alive && !p.dash.hit.has(c) && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 1.6) { p.dash.hit.add(c); this.damageCrate(c, this.dashDmg); }
      }
      G.particles.burst(p.pos.x, 0.6, p.pos.z, { n: 2, colors: [0x6fd6ff, 0xffffff], speed: 1, up: 1, size: 0.2, gravity: 0, life: 0.3 });
    }
    for (let i = this.vfx.length - 1; i >= 0; i--) {
      const v = this.vfx[i];
      v.t += dt;
      const k = v.t / v.dur;
      if (k >= 1) { G.scene.remove(v.mesh); v.mesh.geometry.dispose(); v.mesh.material.dispose(); this.vfx.splice(i, 1); continue; }
      v.mesh.material.opacity = 0.8 * (1 - k);
      if (v.kind === 'ring') v.mesh.scale.setScalar(0.3 + k * v.radius);
      else v.mesh.scale.setScalar(1 + k * 0.15);
    }
  }
}
