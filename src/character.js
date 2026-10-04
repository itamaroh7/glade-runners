import * as THREE from 'three';
import { outlineMat, silMat, paint, merge, gradientMap } from './materials.js';

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Collects primitive parts per animated group, then merges each group into one
 * vertex-coloured mesh (+ one outline mesh) to keep draw calls low on phones.
 */
export class Kit {
  constructor() { this.groups = new Map(); }

  add(group, geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = 1, outline = true } = {}) {
    const g = geo.clone();
    const sc = typeof s === 'number' ? [s, s, s] : s;
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(sc[0], sc[1], sc[2]));
    g.applyMatrix4(_m);
    paint(g, color);
    if (!this.groups.has(group)) this.groups.set(group, []);
    this.groups.get(group).push({ g, outline });
  }

  bake(mat, { thick = 0.035, sil = null, shadow = true } = {}) {
    const meshes = [];
    for (const [group, list] of this.groups) {
      const geo = merge(list.map((x) => x.g));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = shadow;
      mesh.renderOrder = 2;
      group.add(mesh);
      const ol = list.filter((x) => x.outline);
      if (ol.length) {
        const og = ol.length === list.length ? geo : merge(ol.map((x) => x.g));
        const o = new THREE.Mesh(og, outlineMat(thick));
        o.renderOrder = 2;
        mesh.add(o);
      }
      if (sil !== null) {
        const sm = new THREE.Mesh(geo, silMat(sil));
        sm.renderOrder = 1;
        mesh.add(sm);
      }
      meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}

export function charMaterial() {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(), emissive: 0xffffff, emissiveIntensity: 0 });
}

let G;
function geos() {
  if (G) return G;
  G = {
    head: new THREE.SphereGeometry(0.46, 22, 16),
    torso: new THREE.CapsuleGeometry(0.34, 0.3, 6, 14),
    arm: new THREE.CapsuleGeometry(0.115, 0.26, 4, 8),
    leg: new THREE.CapsuleGeometry(0.14, 0.18, 4, 8),
    hand: new THREE.SphereGeometry(0.12, 10, 8),
    shoe: new THREE.SphereGeometry(0.17, 10, 8),
    eye: new THREE.CapsuleGeometry(0.058, 0.1, 3, 8),
    glint: new THREE.SphereGeometry(0.024, 6, 4),
    brow: new THREE.CapsuleGeometry(0.03, 0.12, 2, 6),
    mouth: new THREE.TorusGeometry(0.07, 0.02, 4, 10, Math.PI),
    pack: new THREE.CapsuleGeometry(0.23, 0.2, 4, 10),
    strap: new THREE.TorusGeometry(0.3, 0.035, 4, 14, Math.PI),
    hairCap: new THREE.SphereGeometry(0.5, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
    lock: new THREE.SphereGeometry(0.16, 8, 6),
    ponytail: new THREE.CapsuleGeometry(0.12, 0.3, 4, 8),
    spike: new THREE.ConeGeometry(0.15, 0.36, 7),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.ConeGeometry(1, 1, 8),
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 10, 8),
    dome: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    band: new THREE.TorusGeometry(0.47, 0.06, 5, 18),
    shadow: new THREE.CircleGeometry(0.62, 22).rotateX(-Math.PI / 2),
  };
  for (const g of Object.values(G)) g.userData.shared = true;
  return G;
}

export const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });

function addWeapon(kit, wpn, type) {
  const g = geos();
  switch (type) {
    case 'spear':
      kit.add(wpn, g.cyl, 0x8a5a32, { p: [0, 0.25, 0], s: [0.045, 1.5, 0.045] });
      kit.add(wpn, g.cone, 0xc9d2de, { p: [0, 1.12, 0], s: [0.1, 0.32, 0.1] });
      break;
    case 'machete':
      kit.add(wpn, g.cyl, 0x3a2a22, { p: [0, 0.05, 0], s: [0.05, 0.3, 0.05] });
      kit.add(wpn, g.box, 0xd7dee8, { p: [0, 0.55, 0.04], s: [0.05, 0.75, 0.17] });
      kit.add(wpn, g.box, 0x8a929e, { p: [0, 0.2, 0], s: [0.07, 0.04, 0.26] });
      break;
    case 'club':
      kit.add(wpn, g.cyl, 0x7a4f2c, { p: [0, 0.2, 0], s: [0.07, 0.6, 0.07] });
      kit.add(wpn, g.cyl, 0x8a5a32, { p: [0, 0.75, 0], s: [0.17, 0.6, 0.17] });
      kit.add(wpn, g.cyl, 0x8a929e, { p: [0, 0.62, 0], s: [0.19, 0.07, 0.19] });
      break;
    case 'sling':
      kit.add(wpn, g.cyl, 0x8a5a32, { p: [0, 0.12, 0], s: [0.05, 0.36, 0.05] });
      kit.add(wpn, g.cyl, 0x8a5a32, { p: [0.09, 0.38, 0], r: [0, 0, -0.45], s: [0.04, 0.26, 0.04] });
      kit.add(wpn, g.cyl, 0x8a5a32, { p: [-0.09, 0.38, 0], r: [0, 0, 0.45], s: [0.04, 0.26, 0.04] });
      kit.add(wpn, g.box, 0x6a3a2a, { p: [0, 0.48, 0], s: [0.3, 0.03, 0.03], outline: false });
      break;
    case 'dart':
      kit.add(wpn, g.cyl, 0x2a2a34, { p: [0, 0.05, 0], s: [0.04, 0.22, 0.04] });
      kit.add(wpn, g.cone, 0xdfe6ee, { p: [0, 0.32, 0], s: [0.07, 0.36, 0.07] });
      break;
    case 'axe':
      kit.add(wpn, g.cyl, 0x8a5a32, { p: [0, 0.25, 0], s: [0.045, 0.9, 0.045] });
      kit.add(wpn, g.box, 0xb9c2cf, { p: [0, 0.62, 0.14], s: [0.06, 0.26, 0.26] });
      break;
  }
}

/**
 * Chunky, big-headed glader.
 * look: { skin, hair, hairStyle, shirt, pants, shoes, pack, torso:[sx,sy,sz] }
 * opts: { sil, weapon, accessory }
 */
export function buildGlader(look, { sil = null, weapon = null, accessory = null, pack = true } = {}) {
  const g = geos();
  const root = new THREE.Group();
  const rig = new THREE.Group();
  rig.scale.setScalar(1.15);
  root.add(rig);
  const body = new THREE.Group();
  rig.add(body);
  const head = new THREE.Group();
  head.position.y = 1.55;
  body.add(head);
  const pivot = (x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); body.add(p); return p; };
  const ts = look.torso ?? [1, 1, 1];
  const armL = pivot(-0.44 * ts[0], 1.07), armR = pivot(0.44 * ts[0], 1.07);
  const legL = pivot(-0.17, 0.5), legR = pivot(0.17, 0.5);

  const shadow = new THREE.Mesh(g.shadow, shadowMat);
  shadow.position.y = 0.03;
  shadow.renderOrder = 1;
  rig.add(shadow);

  const kit = new Kit();
  const packC = look.pack ?? 0x6b5536;
  kit.add(body, g.torso, look.shirt, { p: [0, 0.88, 0], s: [ts[0], ts[1], 0.86 * ts[2]] });
  if (pack) {
    kit.add(body, g.pack, packC, { p: [0, 0.95, -0.32 * ts[2]], s: [1, 1, 0.7] });
    kit.add(body, g.strap, packC, { p: [0, 1.05, 0], r: [0, Math.PI / 2, 0], s: [1.05 * ts[2], 0.6, 1.1 * ts[0]], outline: false });
  }

  // Face
  kit.add(head, g.head, look.skin);
  for (const sx of [-1, 1]) {
    kit.add(head, g.eye, look.eyes ?? 0x241a2e, { p: [0.16 * sx, 0.02, 0.405], r: [-0.15, 0, 0], outline: false });
    kit.add(head, g.glint, 0xffffff, { p: [0.16 * sx + 0.02, 0.07, 0.462], outline: false });
    kit.add(head, g.brow, look.hair, { p: [0.16 * sx, 0.2, 0.405], r: [-0.3, 0, Math.PI / 2 + sx * 0.18], outline: false });
  }
  kit.add(head, g.mouth, 0x5a2a2a, { p: [0, -0.15, 0.43], r: [0, 0, Math.PI], outline: false });

  // Hair
  const style = look.hairStyle ?? 'messy';
  const capS = style === 'buzz' ? [0.97, 0.75, 0.97] : [1, 1, 1];
  kit.add(head, g.hairCap, look.hair, { p: [0, 0.03, -0.03], r: [-0.42, 0, 0], s: capS });
  if (style === 'messy' || style === 'spiky') {
    const n = style === 'spiky' ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = style === 'spiky' ? 0.26 : 0.3;
      kit.add(head, g.spike, look.hair, {
        p: [Math.cos(a) * r, 0.42, Math.sin(a) * r - 0.08],
        r: [Math.sin(a) * 0.7 - 0.15, 0, -Math.cos(a) * 0.7],
        s: style === 'spiky' ? [1, 1.35, 1] : 1,
      });
    }
  } else if (style === 'shaggy') {
    for (let i = 0; i < 6; i++) {
      const a = -0.4 + (i / 5) * (Math.PI + 0.8);
      kit.add(head, g.lock, look.hair, { p: [Math.cos(a) * 0.4, 0.22 + Math.sin(i * 2.1) * 0.05, -Math.sin(a) * 0.28 + 0.06], s: [1.1, 1, 1] });
    }
    kit.add(head, g.lock, look.hair, { p: [0.12, 0.38, 0.28], s: [1.3, 0.8, 1] });
  } else if (style === 'long') {
    kit.add(head, g.ponytail, look.hair, { p: [0, -0.25, -0.3], s: [2.6, 1.4, 1.2] });
    kit.add(head, g.lock, look.hair, { p: [-0.2, 0.34, 0.3], s: [1.2, 0.7, 0.8] });
  } else if (style === 'pony') {
    kit.add(head, g.ponytail, look.hair, { p: [0, -0.05, -0.5], r: [0.5, 0, 0] });
  }

  // Accessories by job
  if (accessory === 'farmer') {
    kit.add(head, g.cyl, 0xe8c060, { p: [0, 0.36, -0.02], s: [0.68, 0.05, 0.68] });
    kit.add(head, g.dome, 0xe8c060, { p: [0, 0.37, -0.02], s: [0.38, 0.28, 0.38] });
    kit.add(head, g.cyl, 0xb04a3a, { p: [0, 0.42, -0.02], s: [0.39, 0.06, 0.39], outline: false });
  } else if (accessory === 'medic') {
    kit.add(head, g.band, 0xffffff, { p: [0, 0.16, 0], r: [Math.PI / 2 + 0.2, 0, 0] });
    kit.add(head, g.box, 0xe0393e, { p: [0, 0.2, 0.47], s: [0.05, 0.14, 0.03], outline: false });
    kit.add(head, g.box, 0xe0393e, { p: [0, 0.2, 0.47], s: [0.14, 0.05, 0.03], outline: false });
  } else if (accessory === 'smith') {
    kit.add(body, g.box, 0x5a3a26, { p: [0, 0.75, 0.29 * ts[2]], s: [0.56, 0.62, 0.06] });
  } else if (accessory === 'guard') {
    kit.add(head, g.dome, 0x8a929e, { p: [0, 0.18, -0.02], s: [0.52, 0.5, 0.52] });
  }

  // Limbs
  const sleeve = look.sleeveless ? look.skin : look.shirt;
  for (const arm of [armL, armR]) {
    kit.add(arm, g.arm, sleeve, { p: [0, -0.2, 0] });
    kit.add(arm, g.hand, look.skin, { p: [0, -0.42, 0] });
  }
  for (const leg of [legL, legR]) {
    kit.add(leg, g.leg, look.pants, { p: [0, -0.2, 0] });
    kit.add(leg, g.shoe, look.shoes ?? 0x3b2d28, { p: [0, -0.38, 0.06], s: [1, 0.7, 1.35] });
  }

  let wpn = null;
  const wType = weapon ?? (accessory === 'woodcutter' ? 'axe' : accessory === 'guard' ? 'spear' : null);
  if (wType) {
    wpn = new THREE.Group();
    wpn.position.set(0, -0.42, 0.02);
    wpn.rotation.x = wType === 'dart' || wType === 'sling' ? 1.0 : 1.25;
    armR.add(wpn);
    addWeapon(kit, wpn, wType);
  }

  const mat = charMaterial();
  kit.bake(mat, { sil });

  const anim = { phase: Math.random() * 6, t: 0, act: null, actT: 0, actDur: 0, hurt: 0, flash: 0 };

  function update(dt, speed01) {
    anim.t += dt;
    anim.phase += dt * (5 + 9 * speed01);
    const s = Math.sin(anim.phase) * speed01;
    legL.rotation.x = s * 0.95;
    legR.rotation.x = -s * 0.95;
    armL.rotation.set(-s * 0.85, 0, -0.12);
    armR.rotation.set(s * 0.85, 0, 0.12);
    const breathe = Math.sin(anim.t * 2.4) * 0.02 * (1 - speed01);
    body.position.y = Math.abs(Math.cos(anim.phase)) * 0.11 * speed01 + breathe;
    body.rotation.set(speed01 * 0.16, 0, 0);
    body.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    head.rotation.z = Math.sin(anim.phase * 0.5) * 0.05 * speed01;
    if (wpn) wpn.visible = true;

    if (anim.act) {
      anim.actT += dt;
      const p = Math.min(1, anim.actT / anim.actDur);
      switch (anim.act) {
        case 'throw':
          armR.rotation.x = p < 0.35 ? (p / 0.35) * 2.7 : 2.7 - ((p - 0.35) / 0.65) * 3.6;
          body.rotation.y = Math.sin(p * Math.PI) * 0.35;
          if (wpn && (wType === 'spear')) wpn.visible = p > 0.95;
          break;
        case 'slash':
          armR.rotation.x = -1.45;
          armR.rotation.z = 0.3;
          body.rotation.y = 1.1 - p * 2.3;
          break;
        case 'smash':
          armR.rotation.x = p < 0.4 ? (p / 0.4) * 2.9 : 2.9 - ((p - 0.4) / 0.6) * 4.2;
          armL.rotation.x = armR.rotation.x * 0.6;
          body.rotation.x = p < 0.4 ? -0.15 : 0.35;
          break;
        case 'spin':
          body.rotation.y = p * Math.PI * 2 * 4;
          armR.rotation.set(-1.5, 0, 0.9);
          armL.rotation.set(-1.5, 0, -0.9);
          break;
        case 'slam':
          armR.rotation.x = armL.rotation.x = p < 0.5 ? 3 : 3 - (p - 0.5) * 2 * 3.6;
          body.position.y += p < 0.5 ? p * 1.2 : (1 - p) * 1.2;
          break;
        case 'cast':
          armR.rotation.x = armL.rotation.x = -1.5 * Math.sin(p * Math.PI);
          armR.rotation.z = 0.5; armL.rotation.z = -0.5;
          break;
        case 'cheer':
          armR.rotation.set(Math.PI * 0.95, 0, 0.3 + Math.sin(anim.t * 14) * 0.2);
          armL.rotation.set(Math.PI * 0.95, 0, -0.3 - Math.sin(anim.t * 14) * 0.2);
          body.position.y += Math.abs(Math.sin(anim.t * 7)) * 0.25;
          break;
      }
      if (p >= 1) anim.act = null;
    }

    if (anim.hurt > 0) {
      anim.hurt = Math.max(0, anim.hurt - dt);
      rig.scale.setScalar(1.15 * (1 + Math.sin((anim.hurt / 0.25) * Math.PI) * 0.12));
    }
    if (anim.flash > 0) {
      anim.flash = Math.max(0, anim.flash - dt);
      mat.emissiveIntensity = anim.flash * 4;
    }
  }

  return {
    root, rig, body, head, shadow, wpn, mat,
    update,
    play(act, dur = 0.3) { anim.act = act; anim.actT = 0; anim.actDur = dur; },
    get acting() { return anim.act; },
    hurt() { anim.hurt = 0.25; anim.flash = 0.18; },
    dispose() { root.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); mat.dispose(); },
  };
}
