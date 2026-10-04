import * as THREE from 'three';
import { Kit, charMaterial, shadowMat } from './character.js';
import { CELLS, DOOR_CELL } from './config.js';
import { inGladeCell } from './maze.js';
import { grinderStats, ENEMY_TYPES } from './data.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

let G;
function geos() {
  if (G) return G;
  G = {
    body: new THREE.CapsuleGeometry(0.75, 1.3, 6, 14).rotateX(Math.PI / 2),
    sphere: new THREE.SphereGeometry(1, 12, 10),
    cone: new THREE.ConeGeometry(1, 1, 7),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
    box: new THREE.BoxGeometry(1, 1, 1),
    shadow: new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
    plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
    ring: new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2),
    disc: new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
  };
  for (const g of Object.values(G)) g.userData.shared = true;
  return G;
}

function seg(a, b, r) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  _q.setFromUnitVectors(UP, dir.normalize());
  _e.setFromQuaternion(_q);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return { p: mid.toArray(), r: [_e.x, _e.y, _e.z], s: [r, len, r] };
}

const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
const teleMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.35, depthWrite: false });
const coneMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
const spitMat = new THREE.MeshBasicMaterial({ color: 0x9dff3a });

const PALETTE = {
  grinder: { skin: 0x6e6480, belly: 0x948aa6, metal: 0xa9b2c2, spot: 0x554c66 },
  crawler: { skin: 0x4a4258, belly: 0x6a6078, metal: 0xc85050, spot: 0x342e40 },
  spitter: { skin: 0x5f7a52, belly: 0x8aa67a, metal: 0xb8c49a, spot: 0x45603c },
  alpha: { skin: 0x6a3a50, belly: 0x8a5a6a, metal: 0xf2c14e, spot: 0x4a2238 },
};

function buildGrinderModel(type) {
  const g = geos();
  const pal = PALETTE[type];
  const root = new THREE.Group();
  const rig = new THREE.Group();
  rig.scale.setScalar(ENEMY_TYPES[type].scale);
  root.add(rig);
  const body = new THREE.Group();
  body.position.y = 1.15;
  rig.add(body);
  const kit = new Kit();
  const { skin, belly, metal } = pal, dark = 0x2a1e2e;
  kit.add(body, g.body, skin, { s: [1, 0.82, 1] });
  kit.add(body, g.sphere, belly, { p: [0, -0.32, 0.1], s: [0.62, 0.38, 1.05], outline: false });
  const spikes = type === 'alpha' ? 6 : 4;
  for (let i = 0; i < spikes; i++) kit.add(body, g.cone, metal, { p: [0, 0.62, 0.65 - i * (1.6 / spikes)], r: [-0.35, 0, 0], s: [0.16, type === 'alpha' ? 0.6 : 0.42, 0.16] });
  if (type === 'alpha') for (const sx of [-1, 1]) kit.add(body, g.cone, metal, { p: [sx * 0.45, 0.55, 0.9], r: [-0.6, 0, sx * 0.6], s: [0.12, 0.5, 0.12] });
  kit.add(body, g.sphere, dark, { p: [0, -0.05, 1.12], s: [0.45, 0.4, 0.3] });
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    kit.add(body, g.cone, 0xf2efe6, { p: [Math.sin(a) * 0.36, -0.22 + Math.abs(a) * 0.08, 1.24], r: [Math.PI, 0, 0], s: [0.06, 0.18, 0.06], outline: false });
  }
  for (const [x, y, z, s] of [[0.42, 0.35, 0.2, 0.16], [-0.38, 0.4, -0.35, 0.13], [0.3, 0.42, -0.75, 0.12], [-0.45, 0.2, 0.55, 0.11]])
    kit.add(body, g.sphere, pal.spot, { p: [x, y, z], s: [s, s * 0.5, s], outline: false });
  if (type === 'spitter') kit.add(body, g.sphere, 0xb8ff6a, { p: [0, 0.75, -0.35], s: [0.5, 0.42, 0.55] });

  const tail = new THREE.Group();
  tail.position.set(0, 0.25, -1.15);
  body.add(tail);
  let prev = new THREE.Vector3(0, 0, 0);
  [[0, 0.35, -0.35], [0, 0.85, -0.45], [0, 1.25, -0.2], [0, 1.4, 0.15]].forEach(([x, y, z], i) => {
    const p = new THREE.Vector3(x, y, z);
    kit.add(tail, g.sphere, i % 2 ? skin : metal, { p: p.toArray(), s: 0.24 - i * 0.03 });
    kit.add(tail, g.cyl, metal, seg(prev, p, 0.08));
    prev = p;
  });
  kit.add(tail, g.cone, 0xd7dee8, { p: [0, 1.38, 0.42], r: [Math.PI / 2 + 0.3, 0, 0], s: [0.1, 0.42, 0.1] });

  const legs = [];
  for (const side of [-1, 1])
    for (const z of [0.6, 0, -0.6]) {
      const piv = new THREE.Group();
      piv.position.set(side * 0.55, 1.05, z);
      rig.add(piv);
      const hip = new THREE.Vector3(0, 0, 0);
      const knee = new THREE.Vector3(side * 0.95, 0.65, z * 0.25);
      const foot = new THREE.Vector3(side * 1.45, -1.02, z * 0.4);
      kit.add(piv, g.cyl, metal, seg(hip, knee, 0.08));
      kit.add(piv, g.cyl, 0x7d8698, seg(knee, foot, 0.065));
      kit.add(piv, g.sphere, 0x5d6578, { p: knee.toArray(), s: 0.13 });
      kit.add(piv, g.cone, 0x3a3f4f, { p: [foot.x, foot.y + 0.1, foot.z], r: [Math.PI, 0, 0], s: [0.08, 0.25, 0.08], outline: false });
      legs.push({ piv, side, off: (side > 0 ? 0 : Math.PI) + (z === 0 ? Math.PI : 0) });
    }

  const mat = charMaterial();
  const meshes = kit.bake(mat, { thick: 0.045 });
  const sils = [];
  for (const m of meshes) {
    const s = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0xff5050, opacity: 0.6, depthWrite: false, depthFunc: THREE.GreaterDepth, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    s.renderOrder = 1;
    s.visible = false;
    m.add(s);
    sils.push(s);
  }
  const eye = new THREE.Mesh(g.sphere, eyeMat.clone());
  eye.scale.setScalar(0.17);
  eye.position.set(0, 0.42, 0.98);
  body.add(eye);
  const shadow = new THREE.Mesh(g.shadow, shadowMat);
  shadow.scale.setScalar(1.5);
  shadow.position.y = 0.03;
  rig.add(shadow);
  const tele = new THREE.Mesh(g.plane, teleMat.clone());
  tele.position.y = 0.06;
  tele.visible = false;
  tele.renderOrder = 3;
  root.add(tele);
  const ring = new THREE.Mesh(g.disc, teleMat.clone());
  ring.position.y = 0.07;
  ring.visible = false;
  ring.renderOrder = 3;
  root.add(ring);
  return { root, rig, body, tail, legs, eye, mat, tele, ring, sils };
}

function buildScuttlerModel() {
  const g = geos();
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.35;
  root.add(body);
  const kit = new Kit();
  kit.add(body, g.sphere, 0x3a3f4f, { s: [0.42, 0.24, 0.55] });
  kit.add(body, g.sphere, 0x596178, { p: [0, 0.12, -0.05], s: [0.36, 0.16, 0.45] });
  kit.add(body, g.box, 0xc8463c, { p: [0, 0.27, -0.05], s: [0.08, 0.02, 0.6], outline: false });
  for (const side of [-1, 1])
    for (const z of [0.25, 0, -0.25])
      kit.add(body, g.cyl, 0x22252f, { p: [side * 0.45, -0.18, z], r: [0, 0, side * 0.9], s: [0.03, 0.4, 0.03], outline: false });
  const mat = charMaterial();
  kit.bake(mat, { thick: 0.03 });
  const eye = new THREE.Mesh(g.sphere, eyeMat);
  eye.scale.setScalar(0.09);
  eye.position.set(0, 0.06, 0.52);
  body.add(eye);
  const cone = new THREE.Mesh(new THREE.CircleGeometry(1, 18, Math.PI / 2 - 0.55, 1.1).rotateX(-Math.PI / 2), coneMat.clone());
  cone.position.y = 0.05;
  cone.renderOrder = 3;
  root.add(cone);
  const shadow = new THREE.Mesh(g.shadow, shadowMat);
  shadow.scale.setScalar(0.55);
  shadow.position.y = 0.02;
  root.add(shadow);
  return { root, body, mat, cone };
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

class Grinder {
  constructor(E, cx, cy, opts = {}) {
    this.E = E;
    this.type = opts.type ?? 'grinder';
    this.kind = 'grinder';
    const T = ENEMY_TYPES[this.type];
    const st = grinderStats(E.day, E.night, this.type);
    this.maxHp = this.hp = st.hp;
    this.dmg = st.dmg;
    this.speed = st.speed;
    this.patrolSpeed = st.patrol;
    this.wind = T.wind;
    this.r = T.r;
    this.m = buildGrinderModel(this.type);
    E.scene.add(this.m.root);
    this.pos = new THREE.Vector3();
    E.nav.center(cx, cy, this.pos);
    if (opts.offset) { this.pos.x += opts.offset[0]; this.pos.z += opts.offset[1]; }
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.facing = Math.random() * 6;
    this.state = opts.state ?? 'patrol';
    this.t = 0;
    this.goal = this.pos.clone();
    this.prevCell = null;
    this.think = Math.random() * 0.2;
    this.lastSeen = 99;
    this.alertT = opts.alert ?? 0;
    this.stun = 0;
    this.phase = Math.random() * 6;
    this.alive = true;
    this.sight = E.night ? 14 : 10;
    this.siege = !!opts.siege;
    this.spawnT = 0.6;
    this.attackCd = 0;
    this.home = this.pos.clone();
    this.m.root.scale.setScalar(0.01);
  }

  hit(dmg, dir, { knock = 2.5, stun = 0 } = {}) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.m.mat.emissiveIntensity = 0.9;
    const kmul = this.type === 'alpha' ? 0.25 : this.type === 'crawler' ? 1.6 : 1;
    if (dir) this.knock.set(dir.x * knock * kmul, 0, dir.z * knock * kmul);
    if (stun) this.stun = Math.max(this.stun, this.type === 'alpha' ? stun * 0.4 : stun);
    if (this.state === 'patrol' || this.state === 'sleep') { this.wake(); this.alertT = 6; }
    if ((this.state === 'windup' || this.state === 'slamwind' || this.state === 'spitwind') && stun) { this.state = 'chase'; this.m.tele.visible = this.m.ring.visible = false; }
    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  wake() {
    if (this.state !== 'patrol' && this.state !== 'sleep') return;
    this.state = 'chase';
    this.E.hooks.onAggro?.(this);
  }

  die() {
    this.alive = false;
    this.E.hooks.onDeath?.(this);
    this.dispose();
  }

  dispose() {
    this.E.scene.remove(this.m.root);
    this.m.root.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }

  pickPatrolGoal(nav) {
    const [cx, cy] = nav.cellOf(this.pos.x, this.pos.z);
    let opts = nav.neighbours(cx, cy, this.siege);
    if (opts.length > 1 && this.prevCell) opts = opts.filter(([x, y]) => x !== this.prevCell[0] || y !== this.prevCell[1]);
    if (!opts.length) return;
    const [nx, ny] = opts[Math.floor(Math.random() * opts.length)];
    this.prevCell = [cx, cy];
    nav.center(nx, ny, this.goal);
  }

  update(dt) {
    const E = this.E, nav = E.nav;
    if (this.spawnT > 0) {
      this.spawnT = Math.max(0, this.spawnT - dt);
      this.m.root.scale.setScalar(1 - this.spawnT / 0.6);
    }
    const target = E.targetFor(this);
    const tp = target.pos;
    const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z;
    const d = Math.hypot(dx, dz);

    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.12 + Math.random() * 0.1;
      const sight = target.hidden ? 3 : this.state === 'sleep' ? 8 : this.sight;
      const canSee = !target.dead && d < sight && E.world.lineOfSight(this.pos.x, this.pos.z, tp.x, tp.z);
      this.canSee = canSee;
      if (canSee) {
        this.lastSeen = 0;
        this.wake();
      }
    }
    this.lastSeen += dt;
    this.alertT -= dt;
    this.attackCd -= dt;
    this.stun = Math.max(0, this.stun - dt);
    this.m.mat.emissiveIntensity = Math.max(0, this.m.mat.emissiveIntensity - dt * 5);
    const water = E.world.flagAt(this.pos.x, this.pos.z) & 1 ? 0.6 : 1;

    let speed = 0, want = null;
    const st = this.state;
    if (this.stun > 0) {
      this.m.tele.visible = this.m.ring.visible = false;
      if (st === 'windup' || st === 'lunge' || st === 'slamwind' || st === 'spitwind') this.state = 'chase';
    } else if (st === 'sleep') {
      // Guards a spot until woken.
    } else if (st === 'patrol') {
      speed = this.patrolSpeed;
      if (dist2(this.pos, this.goal) < 0.5) this.pickPatrolGoal(nav);
      want = this.goal;
    } else if (st === 'chase') {
      speed = this.speed;
      const can = this.canSee && !target.dead && !target.invuln;
      if (this.type === 'spitter' && can && d < 11 && this.attackCd <= 0 && d > 3) {
        this.state = 'spitwind';
        this.t = 0;
        this.m.tele.visible = true;
        E.hooks.onWindup?.(this);
      } else if (this.type === 'spitter' && can && d < 5.5) {
        want = { x: this.pos.x - dx, z: this.pos.z - dz }; // keep distance
        speed *= 0.8;
      } else if (this.type === 'alpha' && can && d < 3.6 && this.attackCd <= 0 && Math.random() < 0.5) {
        this.state = 'slamwind';
        this.t = 0;
        this.m.ring.visible = true;
        E.hooks.onWindup?.(this);
      } else if (this.type !== 'spitter' && can && d < 2.6 * (this.type === 'alpha' ? 1.4 : this.type === 'crawler' ? 0.8 : 1)) {
        this.state = 'windup';
        this.t = 0;
        this.lungeDir = new THREE.Vector3(dx / d, 0, dz / d);
        this.m.tele.visible = true;
        E.hooks.onWindup?.(this);
      } else if (this.canSee && d < 7) {
        want = tp;
      } else if (this.lastSeen < 6 || this.alertT > 0 || E.night || this.siege) {
        this.repath = (this.repath ?? 0) - dt;
        if (dist2(this.pos, this.goal) < 0.6 || this.repath <= 0 || !this.followingFlow) {
          this.repath = 0.5;
          const field = E.fieldFor(this);
          const [cx, cy] = nav.cellOf(this.pos.x, this.pos.z);
          const nxt = field && nav.downhill(cx, cy, field, this.siege);
          if (nxt) nav.center(nxt[0], nxt[1], this.goal);
          else this.goal.set(tp.x, 0, tp.z);
          this.followingFlow = true;
        }
        want = this.goal;
      } else {
        this.state = 'patrol';
        this.followingFlow = false;
        this.pickPatrolGoal(nav);
      }
    } else if (st === 'windup') {
      this.t += dt;
      const wt = E.night ? this.wind * 0.8 : this.wind;
      if (this.t < wt * 0.7) this.lungeDir.set(dx / (d || 1), 0, dz / (d || 1));
      const k = Math.min(1, this.t / wt);
      const reach = this.type === 'crawler' ? 2.2 : this.type === 'alpha' ? 4.6 : 3.4;
      this.m.tele.scale.set(this.type === 'alpha' ? 2.8 : 1.9, 1, reach * k);
      this.m.tele.rotation.y = Math.atan2(this.lungeDir.x, this.lungeDir.z);
      this.m.tele.material.opacity = 0.2 + k * 0.3;
      this.facing = lerpAngle(this.facing, Math.atan2(this.lungeDir.x, this.lungeDir.z), Math.min(1, dt * 12));
      if (this.t >= wt) { this.state = 'lunge'; this.t = 0; this.hitDone = false; this.m.tele.visible = false; E.hooks.onLunge?.(this); }
    } else if (st === 'lunge') {
      this.t += dt;
      const ls = this.type === 'crawler' ? 12 : 15;
      this.vel.set(this.lungeDir.x * ls, 0, this.lungeDir.z * ls);
      if (!this.hitDone) {
        const tx = tp.x - this.pos.x, tz = tp.z - this.pos.z;
        if (Math.hypot(tx, tz) < this.r + 0.85 && !target.dead) { this.hitDone = true; E.hooks.onHitTarget?.(this, target, this.lungeDir); }
      }
      if (this.t > (this.type === 'crawler' ? 0.15 : 0.2)) { this.state = 'recover'; this.t = 0; }
    } else if (st === 'slamwind') {
      this.t += dt;
      const k = Math.min(1, this.t / 0.9);
      this.m.ring.scale.setScalar(4 * k);
      this.m.ring.material.opacity = 0.15 + k * 0.3;
      if (this.t >= 0.9) {
        this.m.ring.visible = false;
        this.state = 'recover';
        this.t = -0.3;
        this.attackCd = 3;
        E.hooks.onSlam?.(this);
        if (!target.dead && d < 4 + 0.5) E.hooks.onHitTarget?.(this, target, { x: dx / (d || 1), z: dz / (d || 1) });
      }
    } else if (st === 'spitwind') {
      this.t += dt;
      const k = Math.min(1, this.t / this.wind);
      this.facing = lerpAngle(this.facing, Math.atan2(dx, dz), Math.min(1, dt * 12));
      this.m.tele.scale.set(0.5, 1, 11 * k);
      this.m.tele.rotation.y = this.facing;
      this.m.tele.material.opacity = 0.15 + k * 0.3;
      if (this.t >= this.wind) {
        this.m.tele.visible = false;
        this.state = 'recover';
        this.t = 0.2;
        this.attackCd = 2.4;
        E.spit(this, { x: Math.sin(this.facing), z: Math.cos(this.facing) });
      }
    } else if (st === 'recover') {
      this.t += dt;
      if (this.t > (this.type === 'crawler' ? 0.45 : 0.75)) this.state = 'chase';
    } else if (st === 'carry') {
      speed = this.patrolSpeed * 1.4;
      want = this.goal;
      if (dist2(this.pos, this.goal) < 1.2) { this.alive = false; this.dispose(); E.hooks.onEscape?.(this); return; }
    }

    if (want && st !== 'lunge') {
      const wx = want.x - this.pos.x, wz = want.z - this.pos.z;
      const wl = Math.hypot(wx, wz);
      if (wl > 0.05) {
        const acc = Math.min(1, dt * 8);
        this.vel.x += ((wx / wl) * speed * water - this.vel.x) * acc;
        this.vel.z += ((wz / wl) * speed * water - this.vel.z) * acc;
        if (this.type !== 'spitter' || this.state !== 'chase' || d > 5.5) this.facing = lerpAngle(this.facing, Math.atan2(wx, wz), Math.min(1, dt * 7));
        else this.facing = lerpAngle(this.facing, Math.atan2(dx, dz), Math.min(1, dt * 7));
      }
    } else if (st !== 'lunge') {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 10));
    }
    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
    E.world.collide(this.pos, this.r, !this.siege);
    for (const o of E.list) {
      if (o === this || !o.alive) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const md = this.r + o.r * 0.8, dd = ox * ox + oz * oz;
      if (dd < md * md && dd > 1e-6) { const l = Math.sqrt(dd); this.pos.x += (ox / l) * (md - l) * 0.5; this.pos.z += (oz / l) * (md - l) * 0.5; }
    }

    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.phase += dt * (3 + sp * 1.6);
    const m = this.m;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.facing;
    const moving = Math.min(1, sp / 3);
    for (const l of m.legs) {
      const s = Math.sin(this.phase + l.off);
      l.piv.rotation.y = s * 0.35 * moving;
      l.piv.rotation.z = Math.max(0, Math.cos(this.phase + l.off)) * 0.22 * moving * l.side;
    }
    let rearX = 0;
    if (this.state === 'windup' || this.state === 'slamwind') rearX = -0.35 * Math.min(1, this.t / 0.3);
    else if (this.state === 'lunge') rearX = 0.25;
    else if (this.state === 'spitwind') rearX = -0.2;
    m.body.rotation.x += (rearX - m.body.rotation.x) * Math.min(1, dt * 14);
    const sleeping = this.state === 'sleep';
    m.body.position.y = 1.15 + Math.sin(this.phase * 2) * 0.05 * moving + (this.stun > 0 || sleeping ? -0.2 : 0) + (sleeping ? Math.sin(this.phase * 0.6) * 0.04 : 0);
    if (sleeping) this.phase += dt;
    m.tail.rotation.x = -0.15 + Math.sin(this.phase * 0.7) * 0.12 + (this.state === 'windup' || this.state === 'slamwind' ? -0.4 : 0);
    const glow = this.state === 'windup' || this.state === 'slamwind' || this.state === 'spitwind' ? 1.6 : this.state === 'chase' ? 1.15 : 0.9;
    m.eye.scale.setScalar(0.17 * glow * (this.stun > 0 || sleeping ? 0.5 : 1));
    m.eye.material.color.setHex(this.stun > 0 ? 0x8888ff : sleeping ? 0x803040 : this.state === 'patrol' ? 0xff6677 : this.type === 'spitter' ? 0x9dff3a : 0xff2233);
    m.rig.rotation.z = this.stun > 0 ? Math.sin(this.phase * 6) * 0.05 : 0;
  }
}

class Scuttler {
  constructor(E, cx, cy) {
    this.kind = 'scuttler';
    this.type = 'scuttler';
    this.E = E;
    this.maxHp = this.hp = 400;
    this.r = 0.5;
    this.m = buildScuttlerModel();
    E.scene.add(this.m.root);
    this.pos = new THREE.Vector3();
    E.nav.center(cx, cy, this.pos);
    this.goal = this.pos.clone();
    this.prevCell = null;
    this.facing = Math.random() * 6;
    this.t = Math.random() * 10;
    this.alive = true;
    this.cool = 0;
    this.follow = 0;
    this.vel = new THREE.Vector3();
    this.stun = 0;
  }

  hit(dmg, dir, { stun = 0 } = {}) {
    if (!this.alive) return false;
    this.hp -= dmg;
    if (stun) this.stun = stun;
    if (this.hp <= 0) { this.alive = false; this.E.hooks.onDeath?.(this); this.E.scene.remove(this.m.root); return true; }
    return false;
  }

  update(dt) {
    const E = this.E, nav = E.nav, p = E.player;
    this.t += dt;
    this.cool -= dt;
    this.stun = Math.max(0, this.stun - dt);
    let speed = 4.4, want = this.goal;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const scan = this.facing + Math.sin(this.t * 2.2) * 0.45;
    if (this.stun > 0) speed = 0;
    else if (this.follow > 0) {
      this.follow -= dt;
      speed = d > 4 ? 5.5 : 0;
      want = p.pos;
    } else {
      if (dist2(this.pos, this.goal) < 0.4) {
        const [cx, cy] = nav.cellOf(this.pos.x, this.pos.z);
        let opts = nav.neighbours(cx, cy);
        if (opts.length > 1 && this.prevCell) opts = opts.filter(([x, y]) => x !== this.prevCell[0] || y !== this.prevCell[1]);
        if (opts.length) { const [nx, ny] = opts[Math.floor(Math.random() * opts.length)]; this.prevCell = [cx, cy]; nav.center(nx, ny, this.goal); }
      }
      if (this.cool <= 0 && !p.dead && !p.hidden && d < 6.8) {
        let da = Math.atan2(dx, dz) - scan;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < 0.6 && E.world.lineOfSight(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) {
          this.cool = 8;
          this.follow = 3.5;
          E.hooks.onSpotted?.(this);
        }
      }
    }
    const wx = want.x - this.pos.x, wz = want.z - this.pos.z, wl = Math.hypot(wx, wz);
    if (wl > 0.05 && speed > 0) {
      this.vel.set((wx / wl) * speed, 0, (wz / wl) * speed);
      this.facing = lerpAngle(this.facing, Math.atan2(wx, wz), Math.min(1, dt * 9));
    } else this.vel.set(0, 0, 0);
    this.pos.addScaledVector(this.vel, dt);
    E.world.collide(this.pos, this.r, true);
    const m = this.m;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.facing;
    m.body.position.y = 0.35 + Math.abs(Math.sin(this.t * 22)) * 0.04 * (speed > 0 ? 1 : 0);
    m.cone.rotation.y = scan - this.facing;
    m.cone.scale.setScalar(6.8);
    m.cone.material.opacity = this.follow > 0 ? 0.32 : 0.15;
    m.cone.visible = this.stun <= 0;
  }
}

/**
 * Owns every maze creature. hooks: { onAggro, onDeath, onWindup, onLunge, onSlam, onHitTarget, onSpitHit, onSpotted, onEscape }
 */
export class Enemies {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.list = [];
    this.spits = [];
    this.playerField = new Int16Array(CELLS * CELLS);
    this.gladeField = new Int16Array(CELLS * CELLS);
    this.fieldT = 0;
    this.xray = 0;
  }

  reset(world, nav, player, day) {
    this.clear();
    this.world = world;
    this.nav = nav;
    this.player = player;
    this.day = day;
    this.night = false;
    this.siegeTargets = null;
    this.fieldT = 0;
    this.playerField.fill(-1);
  }

  clear() {
    for (const e of this.list) if (e.alive) { e.kind === 'grinder' ? e.dispose() : this.scene.remove(e.m.root); }
    this.list.length = 0;
    for (const s of this.spits) this.scene.remove(s.mesh);
    this.spits.length = 0;
  }

  get grinders() { return this.list.filter((e) => e.kind === 'grinder' && e.alive); }

  farCell(minCells = 6, maxCells = 999) {
    const [pcx, pcy] = this.nav.cellOf(this.player.pos.x, this.player.pos.z);
    const fromGlade = inGladeCell(pcx, pcy);
    const field = fromGlade ? null : this.nav.flow(pcx, pcy, new Int16Array(CELLS * CELLS), false);
    const opts = [];
    for (let cy = 0; cy < CELLS; cy++)
      for (let cx = 0; cx < CELLS; cx++) {
        if (inGladeCell(cx, cy)) continue;
        const d = fromGlade ? (Math.max(Math.abs(cx - DOOR_CELL), Math.abs(cy - DOOR_CELL)) - 5) * 1.5 : field[cy * CELLS + cx];
        if (d >= minCells && d <= maxCells) opts.push([cx, cy]);
      }
    return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
  }

  spawnGrinder(opts = {}) {
    const c = opts.cell ?? this.farCell(opts.min ?? 6, opts.max ?? 999);
    if (!c) return null;
    const g = new Grinder(this, c[0], c[1], opts);
    this.list.push(g);
    return g;
  }

  spawnPack(n = 3, opts = {}) {
    const c = opts.cell ?? this.farCell(opts.min ?? 6, opts.max ?? 999);
    if (!c) return [];
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.spawnGrinder({ ...opts, cell: c, type: 'crawler', offset: [(i - 1) * 0.9, (i % 2) * 0.8 - 0.4] }));
    return out;
  }

  spawnScuttler() {
    const c = this.farCell(5);
    if (!c) return null;
    const s = new Scuttler(this, c[0], c[1]);
    this.list.push(s);
    return s;
  }

  spit(g, dir) {
    const mesh = new THREE.Mesh(geos().sphere, spitMat);
    mesh.scale.setScalar(0.28);
    this.scene.add(mesh);
    this.spits.push({ mesh, x: g.pos.x + dir.x * 1.2, z: g.pos.z + dir.z * 1.2, dx: dir.x, dz: dir.z, dist: 0, dmg: g.dmg });
    this.hooks.onSpit?.(g);
  }

  alert(x, z, secs = 8, radius = 36) {
    for (const e of this.list) {
      if (e.kind !== 'grinder' || !e.alive) continue;
      if ((e.pos.x - x) ** 2 + (e.pos.z - z) ** 2 < radius * radius) {
        e.alertT = Math.max(e.alertT, secs);
        if (e.state === 'patrol') e.state = 'chase';
      }
    }
  }

  targetFor(g) {
    if (!this.siegeTargets) return this.player;
    let best = this.player, bd = this.player.dead ? 1e9 : dist2(g.pos, this.player.pos) * 0.8;
    for (const t of this.siegeTargets) {
      if (t.dead || t.taken) continue;
      const d = dist2(g.pos, t.pos);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  fieldFor(g) {
    if (this.siegeTargets && !this.world.inGlade(g.pos.x, g.pos.z)) return this.gladeField;
    return this.playerField;
  }

  startSiege(targets) {
    this.siegeTargets = targets;
    this.nav.flow(DOOR_CELL, DOOR_CELL, this.gladeField, true);
  }

  update(dt) {
    this.fieldT -= dt;
    if (this.fieldT <= 0) {
      this.fieldT = 0.3;
      const [cx, cy] = this.nav.cellOf(this.player.pos.x, this.player.pos.z);
      this.nav.flow(cx, cy, this.playerField, !!this.siegeTargets);
      if (this.siegeTargets) this.nav.flow(DOOR_CELL, DOOR_CELL, this.gladeField, true);
    }
    this.xray = Math.max(0, this.xray - dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.alive) e.update(dt);
      if (e.kind === 'grinder' && e.alive) for (const s of e.m.sils) s.visible = this.xray > 0;
      if (!e.alive) this.list.splice(i, 1);
    }
    const p = this.player;
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      const step = 14 * dt;
      s.x += s.dx * step; s.z += s.dz * step; s.dist += step;
      s.mesh.position.set(s.x, 1.2 - (s.dist / 12) * 0.6, s.z);
      let done = s.dist > 12 || this.world.blocks(s.x, s.z);
      if (!done && !p.dead && Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 0.9) { done = true; this.hooks.onSpitHit?.(s); }
      if (done) { this.hooks.onSpitSplash?.(s); this.scene.remove(s.mesh); this.spits.splice(i, 1); }
    }
  }
}
