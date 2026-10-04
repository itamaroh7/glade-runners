import * as THREE from 'three';
import { Kit, charMaterial, shadowMat } from './character.js';
import { CELLS } from './config.js';
import { inGladeCell } from './maze.js';
import { grinderStats } from './data.js';

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
  };
  for (const g of Object.values(G)) g.userData.shared = true;
  return G;
}

// Cylinder segment from a to b, as Kit transform options.
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

function buildGrinderModel() {
  const g = geos();
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const body = new THREE.Group();
  body.position.y = 1.15;
  rig.add(body);
  const kit = new Kit();
  const skin = 0x6e6480, belly = 0x948aa6, metal = 0xa9b2c2, dark = 0x2a1e2e;
  kit.add(body, g.body, skin, { s: [1, 0.82, 1] });
  kit.add(body, g.sphere, belly, { p: [0, -0.32, 0.1], s: [0.62, 0.38, 1.05], outline: false });
  for (let i = 0; i < 4; i++) kit.add(body, g.cone, metal, { p: [0, 0.62, 0.55 - i * 0.42], r: [-0.35, 0, 0], s: [0.16, 0.42, 0.16] });
  kit.add(body, g.sphere, dark, { p: [0, -0.05, 1.12], s: [0.45, 0.4, 0.3] });
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    kit.add(body, g.cone, 0xf2efe6, { p: [Math.sin(a) * 0.36, -0.22 + Math.abs(a) * 0.08, 1.24], r: [Math.PI, 0, 0], s: [0.06, 0.18, 0.06], outline: false });
  }
  // spots
  for (const [x, y, z, s] of [[0.42, 0.35, 0.2, 0.16], [-0.38, 0.4, -0.35, 0.13], [0.3, 0.42, -0.75, 0.12], [-0.45, 0.2, 0.55, 0.11]])
    kit.add(body, g.sphere, 0x554c66, { p: [x, y, z], s: [s, s * 0.5, s], outline: false });

  const tail = new THREE.Group();
  tail.position.set(0, 0.25, -1.15);
  body.add(tail);
  let prev = new THREE.Vector3(0, 0, 0);
  const pts = [[0, 0.35, -0.35], [0, 0.85, -0.45], [0, 1.25, -0.2], [0, 1.4, 0.15]];
  pts.forEach(([x, y, z], i) => {
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
      legs.push({ piv, side, off: (side > 0 ? 0 : Math.PI) + (z > 0 ? 0 : z < 0 ? 0 : Math.PI) });
    }

  const mat = charMaterial();
  const meshes = kit.bake(mat, { thick: 0.045 });
  const sils = [];
  for (const m of meshes) {
    const s = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: false, opacity: 0.6, depthWrite: false, depthFunc: THREE.GreaterDepth, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
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

  return { root, rig, body, tail, legs, eye, mat, tele, sils };
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

const tmpV = new THREE.Vector3();
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

class Grinder {
  constructor(E, cx, cy, opts = {}) {
    this.kind = 'grinder';
    this.E = E;
    const st = grinderStats(E.day, E.night);
    this.maxHp = this.hp = st.hp;
    this.dmg = st.dmg;
    this.speed = st.speed;
    this.patrolSpeed = st.patrol;
    this.r = 0.9;
    this.m = buildGrinderModel();
    E.scene.add(this.m.root);
    this.pos = new THREE.Vector3();
    E.nav.center(cx, cy, this.pos);
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.facing = Math.random() * 6;
    this.state = opts.state ?? 'patrol';
    this.t = 0;
    this.goal = this.pos.clone();
    this.cell = [cx, cy];
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
    this.m.root.scale.setScalar(0.01);
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  hit(dmg, dir, { knock = 2.5, stun = 0 } = {}) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.m.mat.emissiveIntensity = 0.9;
    if (dir) this.knock.set(dir.x * knock, 0, dir.z * knock);
    if (stun) this.stun = Math.max(this.stun, stun);
    if (this.state === 'patrol') { this.state = 'chase'; this.alertT = 6; this.E.hooks.onAggro?.(this); }
    if (this.state === 'windup' && stun) { this.state = 'chase'; this.m.tele.visible = false; }
    if (this.hp <= 0) { this.die(); return true; }
    return false;
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
      const canSee = !target.dead && d < this.sight && E.world.lineOfSight(this.pos.x, this.pos.z, tp.x, tp.z);
      this.canSee = canSee;
      if (canSee) {
        this.lastSeen = 0;
        if (this.state === 'patrol') { this.state = 'chase'; E.hooks.onAggro?.(this); }
      }
    }
    this.lastSeen += dt;
    this.alertT -= dt;
    this.stun = Math.max(0, this.stun - dt);
    this.m.mat.emissiveIntensity = Math.max(0, this.m.mat.emissiveIntensity - dt * 5);

    let speed = 0, want = null;
    const st = this.state;
    if (this.stun > 0) {
      this.m.tele.visible = false;
      if (st === 'windup' || st === 'lunge') this.state = 'chase';
    } else if (st === 'patrol') {
      speed = this.patrolSpeed;
      if (dist2(this.pos, this.goal) < 0.5) this.pickPatrolGoal(nav);
      want = this.goal;
    } else if (st === 'chase') {
      speed = this.speed;
      if (this.canSee && d < 2.6 && !target.dead && !target.invuln) {
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
          const field = E.fieldFor(this, target);
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
      const wt = E.night ? 0.42 : 0.55;
      if (this.t < wt * 0.7) this.lungeDir.set(dx / (d || 1), 0, dz / (d || 1));
      const k = Math.min(1, this.t / wt);
      this.m.tele.scale.set(1.9, 1, 3.4 * k);
      this.m.tele.rotation.y = Math.atan2(this.lungeDir.x, this.lungeDir.z);
      this.m.tele.material.opacity = 0.2 + k * 0.3;
      this.facing = lerpAngle(this.facing, Math.atan2(this.lungeDir.x, this.lungeDir.z), Math.min(1, dt * 12));
      if (this.t >= wt) { this.state = 'lunge'; this.t = 0; this.hitDone = false; this.m.tele.visible = false; E.hooks.onLunge?.(this); }
    } else if (st === 'lunge') {
      this.t += dt;
      this.vel.set(this.lungeDir.x * 15, 0, this.lungeDir.z * 15);
      if (!this.hitDone) {
        const tx = tp.x - this.pos.x, tz = tp.z - this.pos.z;
        if (Math.hypot(tx, tz) < 1.75 && !target.dead) { this.hitDone = true; E.hooks.onHitTarget?.(this, target, this.lungeDir); }
      }
      if (this.t > 0.2) { this.state = 'recover'; this.t = 0; }
    } else if (st === 'recover') {
      this.t += dt;
      speed = 0;
      if (this.t > 0.75) this.state = 'chase';
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
        this.vel.x += ((wx / wl) * speed - this.vel.x) * acc;
        this.vel.z += ((wz / wl) * speed - this.vel.z) * acc;
        this.facing = lerpAngle(this.facing, Math.atan2(wx, wz), Math.min(1, dt * 7));
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

    // animate
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
    if (this.state === 'windup') rearX = -0.35 * Math.min(1, this.t / 0.3);
    else if (this.state === 'lunge') rearX = 0.25;
    m.body.rotation.x += (rearX - m.body.rotation.x) * Math.min(1, dt * 14);
    m.body.position.y = 1.15 + Math.sin(this.phase * 2) * 0.05 * moving + (this.stun > 0 ? -0.15 : 0);
    m.tail.rotation.x = -0.15 + Math.sin(this.phase * 0.7) * 0.12 + (this.state === 'windup' ? -0.4 : 0);
    const glow = this.state === 'windup' ? 1.6 : this.state === 'chase' ? 1.15 : 0.9;
    m.eye.scale.setScalar(0.17 * glow * (this.stun > 0 ? 0.6 : 1));
    m.eye.material.color.setHex(this.stun > 0 ? 0x8888ff : this.state === 'patrol' ? 0xff6677 : 0xff2233);
    m.rig.rotation.z = this.stun > 0 ? Math.sin(this.phase * 6) * 0.05 : 0;
  }
}

class Scuttler {
  constructor(E, cx, cy) {
    this.kind = 'scuttler';
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
  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

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
      if (this.cool <= 0 && !p.dead && d < 6.8) {
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

function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

/**
 * Owns every maze creature. hooks: { onAggro, onDeath, onWindup, onLunge, onHitTarget, onSpotted, onEscape }
 */
export class Enemies {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.list = [];
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
  }

  get grinders() { return this.list.filter((e) => e.kind === 'grinder' && e.alive); }

  /** Random maze cell at least minCells (BFS steps) from the player and far in world units. */
  farCell(minCells = 6, maxCells = 99) {
    const [pcx, pcy] = this.nav.cellOf(this.player.pos.x, this.player.pos.z);
    const field = this.nav.flow(pcx, pcy, new Int16Array(CELLS * CELLS), false);
    const fromGlade = inGladeCell(pcx, pcy);
    const opts = [];
    for (let cy = 0; cy < CELLS; cy++)
      for (let cx = 0; cx < CELLS; cx++) {
        if (inGladeCell(cx, cy)) continue;
        const d = fromGlade ? Math.max(Math.abs(cx - 12), Math.abs(cy - 12)) * 1.5 : field[cy * CELLS + cx];
        if (d >= minCells && d <= maxCells) opts.push([cx, cy]);
      }
    return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
  }

  spawnGrinder(opts = {}) {
    const c = opts.cell ?? this.farCell(opts.min ?? 6, opts.max ?? 99);
    if (!c) return null;
    const g = new Grinder(this, c[0], c[1], opts);
    this.list.push(g);
    return g;
  }

  spawnScuttler() {
    const c = this.farCell(5);
    if (!c) return null;
    const s = new Scuttler(this, c[0], c[1]);
    this.list.push(s);
    return s;
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

  fieldFor(g, target) {
    if (this.siegeTargets && !this.world.inGlade(g.pos.x, g.pos.z)) return this.gladeField;
    return this.playerField;
  }

  startSiege(targets) {
    this.siegeTargets = targets;
    this.nav.flow(12, 12, this.gladeField, true);
  }

  update(dt) {
    this.fieldT -= dt;
    if (this.fieldT <= 0) {
      this.fieldT = 0.3;
      const [cx, cy] = this.nav.cellOf(this.player.pos.x, this.player.pos.z);
      this.nav.flow(cx, cy, this.playerField, !!this.siegeTargets);
      if (this.siegeTargets) this.nav.flow(12, 12, this.gladeField, true);
    }
    this.xray = Math.max(0, this.xray - dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.alive) e.update(dt);
      if (e.kind === 'grinder' && e.alive) for (const s of e.m.sils) s.visible = this.xray > 0;
      if (!e.alive) this.list.splice(i, 1);
    }
  }
}
