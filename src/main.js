import './style.css';
import './ui2.css';
import * as THREE from 'three';
import { DAY, DEBUG, TILE, GLADE_HALF } from './config.js';
import { generateMaze, rng } from './maze.js';
import { World } from './world.js';
import { Player, Npc } from './actors.js';
import { Crates } from './crates.js';
import { Pickups } from './pickups.js';
import { Projectiles } from './projectiles.js';
import { Particles } from './particles.js';
import { Input } from './input.js';
import { Minimap } from './minimap.js';
import { Sfx } from './audio.js';
import { Music } from './music.js';
import { Nav } from './nav.js';
import { Enemies } from './enemies.js';
import { Combat } from './combat.js';
import { Fx } from './fx.js';
import { Council } from './council.js';
import { RUNNERS, CODE_WORDS } from './data.js';
import { newSave, SAVE_VERSION, runnerMods, resolveDay, isFinalDay, roleCount, checkUnlocks, gladerName } from './colony.js';
import { t, tn, apply as applyI18n, getLang, setLang } from './i18n.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---------------- save ----------------
const SAVE_KEY = 'gr.save.v2';
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.v === SAVE_VERSION) return s;
  } catch {}
  return newSave();
}
let save = loadSave();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} };

// ---------------- renderer ----------------
const isMobile = matchMedia('(pointer: coarse)').matches;
const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const maxPR = Math.min(window.devicePixelRatio || 1, 2);
let pr = Math.min(maxPR, isMobile ? 1.5 : 2);
renderer.setPixelRatio(pr);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3b3a4f);
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 220);

const hemi = new THREE.HemisphereLight(0xd2ecff, 0x6d6080, 1.25);
const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
sun.castShadow = true;
const sm = isMobile ? 1024 : 2048;
sun.shadow.mapSize.set(sm, sm);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 100 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(hemi, sun, sun.target);
const playerLight = new THREE.PointLight(0xffc98a, 16, 13, 1.6);
playerLight.visible = false;
scene.add(playerLight);
const nightFog = new THREE.Fog(0x0b0d22, 22, 42);

const KEYS = [
  [0.0, { sun: 0xffb27a, si: 1.7, hs: 0xffd2b0, hg: 0x5b4a6e, hi: 1.0 }],
  [0.1, { sun: 0xfff2dc, si: 2.6, hs: 0xd2ecff, hg: 0x6d6080, hi: 1.25 }],
  [0.78, { sun: 0xfff2dc, si: 2.6, hs: 0xd2ecff, hg: 0x6d6080, hi: 1.25 }],
  [0.93, { sun: 0xff8a50, si: 1.9, hs: 0xffa888, hg: 0x4a3060, hi: 1.0 }],
  [1.0, { sun: 0x8090ff, si: 0.8, hs: 0x5864a8, hg: 0x1c1a36, hi: 0.75 }],
  [1.2, { sun: 0x4a58b8, si: 0.25, hs: 0x2c3570, hg: 0x0c0c18, hi: 0.35 }],
];
const cA = new THREE.Color(), cB = new THREE.Color();
const sunDir = new THREE.Vector3(-0.5, 1.5, 0.75).normalize();
function applyDaylight(f) {
  let i = 0;
  while (i < KEYS.length - 2 && f > KEYS[i + 1][0]) i++;
  const [f0, a] = KEYS[i], [f1, b] = KEYS[i + 1];
  const k = Math.min(1, Math.max(0, (f - f0) / (f1 - f0)));
  sun.color.copy(cA.set(a.sun).lerp(cB.set(b.sun), k));
  sun.intensity = a.si + (b.si - a.si) * k;
  hemi.color.copy(cA.set(a.hs).lerp(cB.set(b.hs), k));
  hemi.groundColor.copy(cA.set(a.hg).lerp(cB.set(b.hg), k));
  hemi.intensity = a.hi + (b.hi - a.hi) * k;
  sunDir.set(-0.9 + Math.min(1, f) * 1.8, 1.5, 0.75).normalize();
}
function setNight(on) {
  scene.fog = on ? nightFog : null;
  playerLight.visible = on;
  scene.background.setHex(on ? 0x0b0d22 : 0x3b3a4f);
}

// ---------------- systems ----------------
const hud = $('#hud');
const input = new Input(hud);
const sfx = new Sfx();
const music = new Music(sfx);
const particles = new Particles(scene);
const pickups = new Pickups(scene);
const projectiles = new Projectiles(scene, particles);
const minimap = new Minimap($('#minimap'), $('#bigmap'));
const fx = new Fx($('#fx'));
const player = new Player(scene, save.runner, runnerMods(save));
let npcs = [];
let maze, world, crates, nav;

const shake = (a) => { cam.shake = Math.min(1, Math.max(cam.shake, a)); };
const vibrate = (ms) => { try { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(ms); } catch {} };

const enemies = new Enemies(scene, {
  onAggro(e) { if (e.kind === 'grinder' && e.roarCd !== true) { e.roarCd = true; if (dist(e.pos, player.pos) < 22) sfx.roar(); } },
  onWindup(e) { if (dist(e.pos, player.pos) < 16) sfx.windup(); },
  onLunge(e) { if (dist(e.pos, player.pos) < 16) sfx.lunge(); },
  onHitTarget(e, target, dir) {
    if (target === player) hurtPlayer(e.dmg, dir);
    else grabGlader(e, target);
  },
  onSpotted(s) {
    sfx.spotted();
    fx.number(s.pos.x, 1.6, s.pos.z, '!', 'hurt');
    enemies.alert(player.pos.x, player.pos.z, 9);
    showBanner(t('spotted'), 'danger', true);
  },
  onDeath(e) { onEnemyKilled(e); },
  onEscape() {},
});

const combat = new Combat({
  scene,
  get player() { return player; },
  get world() { return world; },
  get crates() { return crates; },
  enemies, projectiles, particles, pickups, sfx, fx, minimap,
  shake, vibrate,
  onKill() {},
  onCrateBroken(c) {
    for (const [type, n] of c.drops) if (n) pickups.spawn(type, c.x, c.z, n);
    save.stats.crates++;
    dayRes.crates++;
  },
  onSuperReady() {
    sfx.superReady();
    showBanner(t('superReady'), 'warn', true);
    if (!save.seenSuperHint) { save.seenSuperHint = true; showHint(t('hintSuper'), 4); }
  },
  revealAll() { revealAll = true; minimap.reveal(player.pos.x, player.pos.z, 30); },
});

const council = new Council({
  save: () => save,
  persist,
  sfx,
  onOpenDoors: () => openDoors(),
  onContinue: () => toMorning(),
  onRunnerChanged: () => { player.setRunner(save.runner, runnerMods(save)); player.reset(0, 4.5); setupRunnerHud(); },
  onRolesChanged: () => { player.setRunner(save.runner, runnerMods(save)); player.reset(0, 4.5); rebuildNpcs(); },
  onBuilt: () => { rebuildWorldKeepDay(); },
});

// Aim guide on the ground.
const aimGuide = (() => {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 256;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0.75)');
  x.fillStyle = g;
  x.beginPath();
  x.roundRect(8, 4, 48, 248, 24);
  x.fill();
  const tex = new THREE.CanvasTexture(cv);
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 }));
  m.renderOrder = 3;
  m.visible = false;
  scene.add(m);
  return m;
})();

// ---------------- state ----------------
let state = 'menu'; // menu | intro | council | play | pause | map | result
let phase = 'day'; // day | night | siege | escape | hold
let dayTime = 0, phaseTime = 0;
let flags = {};
let dayRes = {};
let lastShot = 0;
let combo = 0, comboT = 0;
let spawnCd = 0;
let rescueUsed = false, revealAll = false;
let deathT = 0;
let siege = null;
let holdT = 0;
let resultNext = null;
let takenLines = [];
const NIGHT_LEN = 60;
const HOLD_LEN = 20;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function disposeDay() {
  if (world) { world.dispose(); crates.dispose(scene); }
  for (const n of npcs) n.dispose();
  npcs = [];
  enemies.clear();
  pickups.clear();
  projectiles.clear();
  particles.clear();
  combat.reset();
  fx.clear();
}

function rebuildNpcs() {
  for (const n of npcs) n.dispose();
  const R = rng(save.seed + save.day * 13);
  npcs = save.gladers.map((g, i) => new Npc(scene, g, i, R));
}

function buildWorld() {
  const final = isFinalDay(save);
  world = new World(scene, maze, save.buildings, { fragment: final ? null : maze.fragment, hole: final ? maze.hole : null });
  crates = new Crates(scene, world, maze.crates);
  for (const c of crates.items) c.drops = null;
  nav = new Nav(world);
}

function rebuildWorldKeepDay() {
  world.dispose();
  crates.dispose(scene);
  buildWorld();
  assignCrateDrops();
  enemies.reset(world, nav, player, save.day);
  minimap.reset(maze);
  world.setDoors(0);
  player.reset(0, 4.5);
  rebuildNpcs();
}

function assignCrateDrops() {
  // Decide drops up-front so they are stable per crate.
  for (const c of crates.items) {
    const R = Math.random;
    c.drops = c.type === 'wood'
      ? [['wood', 1 + Math.floor(R() * 2)], ['food', R() < 0.45 ? 1 + Math.floor(R() * 2) : 0]]
      : [['metal', 1 + Math.floor(R() * 3)], ['food', R() < 0.25 ? 1 : 0], ['wood', Math.floor(R() * 2)]];
  }
}

function prepareDay() {
  disposeDay();
  maze = generateMaze(save.seed + save.day * 7919);
  buildWorld();
  assignCrateDrops();
  rebuildNpcs();
  player.setRunner(save.runner, runnerMods(save));
  player.reset(0, 4.5);
  enemies.reset(world, nav, player, save.day);
  minimap.reset(maze);
  dayTime = 0;
  phaseTime = 0;
  phase = 'day';
  flags = {};
  dayRes = { food: 0, wood: 0, metal: 0, fragment: false, kills: 0, crates: 0 };
  takenLines = [];
  world.setDoors(0);
  applyDaylight(0.06);
  setNight(false);
  rescueUsed = false;
  revealAll = false;
  spawnCd = 0;
  deathT = 0;
  siege = null;
  holdT = 0;
  $('#hold').classList.add('hidden');
  refreshRes();
  setupRunnerHud();
}

// ---------------- camera ----------------
const cam = { look: new THREE.Vector3(), pos: new THREE.Vector3(30, 30, 30), shake: 0, orbit: 0 };
function camOffset() {
  const aspect = window.innerWidth / window.innerHeight;
  let d = 29;
  if (aspect < 1.3) d *= Math.min(1.75, Math.pow(1.3 / aspect, 0.85));
  return new THREE.Vector3(0, d * 0.84, d * 0.54);
}
let offset = camOffset();

function updateCamera(dt) {
  const want = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  if (state === 'menu') {
    cam.orbit += dt * 0.07;
    wantPos.set(Math.sin(cam.orbit) * 34, 30, Math.cos(cam.orbit) * 34);
  } else {
    want.copy(player.pos).addScaledVector(player.vel, 0.12);
    want.x += Math.sin(player.facing) * 1.2;
    want.z += Math.cos(player.facing) * 1.2;
    wantPos.copy(want).add(offset);
  }
  const k = 1 - Math.exp(-dt * (state === 'menu' ? 2 : 7));
  cam.look.lerp(want, k);
  cam.pos.lerp(wantPos, k);
  camera.position.copy(cam.pos);
  if (cam.shake > 0) {
    const s = cam.shake * cam.shake * 0.9;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
    cam.shake = Math.max(0, cam.shake - dt * 2.2);
  }
  camera.lookAt(cam.look);
  sun.target.position.copy(cam.look);
  sun.position.copy(cam.look).addScaledVector(sunDir, 45);
  playerLight.position.set(player.pos.x, 3.2, player.pos.z);
}

// ---------------- HUD ----------------
const banner = $('#banner');
let bannerBusy = 0;
function showBanner(text, cls = '', minor = false) {
  if (minor && bannerBusy > 0) return;
  banner.textContent = text;
  banner.className = 'ink ' + cls;
  void banner.offsetWidth;
  banner.classList.add('show');
  bannerBusy = minor ? 0.8 : 2.2;
}
let hintTimer = 0;
function showHint(text, secs = 5) {
  const h = $('#hint');
  h.textContent = text;
  h.classList.add('show');
  hintTimer = secs;
}
function refreshRes(bump) {
  for (const k of ['food', 'wood', 'metal']) {
    const el = document.querySelector(`.res[data-r="${k}"]`);
    el.querySelector('.n').textContent = save.res[k] + dayRes[k];
    if (bump === k) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
}
const pbar = $('#pbar');
const hpFill = pbar.querySelector('.hp-fill');
const hpText = pbar.querySelector('.hp-text');
const ammoSlots = [...pbar.querySelectorAll('.ammo i')];
const ammoBars = [...pbar.querySelectorAll('.ammo b')];
const superBtn = $('#btn-super');
const vignette = $('#vignette');
const v3 = new THREE.Vector3();
let hurtFlash = 0;
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function setupRunnerHud() {
  pbar.querySelector('.pname').textContent = tn(player.def.name);
  ammoSlots.forEach((el, i) => el.classList.toggle('hidden', i >= player.ammoMax));
}

function updateHud(dt) {
  let f, label;
  if (phase === 'night') {
    f = phaseTime / NIGHT_LEN;
    label = '🌙 ' + fmtTime(NIGHT_LEN - phaseTime);
  } else if (phase === 'siege') {
    f = 1;
    label = t('defend') + ' ' + Math.max(0, siege.total - siege.killed);
  } else {
    f = Math.min(1, dayTime / DAY.length);
    label = t('day', { n: save.day }) + '  ·  ' + fmtTime(DAY.length - dayTime);
  }
  $('#clock-sun').style.left = f * 100 + '%';
  $('#day-label').textContent = label;
  const left = DAY.length - dayTime;
  $('#clock').classList.toggle('warn', phase === 'night' || (phase === 'day' && left < DAY.warnLeft + DAY.closeDur));

  let obj = '';
  if (phase === 'day' && !world.inGlade(player.pos.x, player.pos.z) && left < DAY.warnLeft + DAY.closeDur && !isFinalDay(save)) obj = t('hintBack');
  else if (phase === 'night') obj = t('survive');
  else if (phase === 'escape') obj = t('toHole');
  $('#objective').textContent = obj;

  v3.set(player.pos.x, 2.85, player.pos.z).project(camera);
  const x = (v3.x + 1) / 2 * window.innerWidth, y = (1 - v3.y) / 2 * window.innerHeight;
  pbar.style.transform = `translate(${x - 46}px, ${y - 58}px)`;
  hpFill.style.transform = `scaleX(${player.hp / player.maxHp})`;
  hpText.textContent = Math.ceil(player.hp);
  const af = player.ammoFrac;
  ammoBars.forEach((b, i) => { b.style.transform = `scaleX(${Math.min(1, Math.max(0, af - i))})`; });

  superBtn.style.setProperty('--c', player.superCharge);
  superBtn.classList.toggle('ready', player.superCharge >= 1);

  hurtFlash = Math.max(0, hurtFlash - dt * 2.5);
  const low = player.hp / player.maxHp < 0.35 && !player.dead ? 0.45 + Math.sin(performance.now() / 180) * 0.15 : 0;
  vignette.style.opacity = Math.max(low, hurtFlash);

  // Minimap markers
  const markers = [];
  for (const d of world.doors) markers.push({ x: d.center.x, z: d.center.z, color: d.open > 0.5 ? '#7fdc5a' : '#ff6b5b', r: 0.9 });
  const tower = save.buildings.tower;
  if (world.fragment && !world.fragment.taken && (tower >= 1 || revealAll)) markers.push({ x: world.fragment.x, z: world.fragment.z, color: '#ffd23f', r: 1.3, edge: true });
  if ((tower >= 2 || revealAll) && crates) for (const c of crates.items) if (c.alive) markers.push({ x: c.x, z: c.z, color: c.type === 'metal' ? '#a8b4c8' : '#c08a50', r: 0.55 });
  if (world.hole) markers.push({ x: world.hole.x, z: world.hole.z, color: '#b07aff', r: 1.5, edge: true });
  if (enemies.xray > 0) for (const e of enemies.list) if (e.alive) markers.push({ x: e.pos.x, z: e.pos.z, color: '#ff3b3b', r: 0.7 });
  hudMarkers = markers;
  minimap.drawSmall(player, player.facing, markers);

  // Off-screen arrows
  const outside = !world.inGlade(player.pos.x, player.pos.z);
  let home = null;
  if (phase === 'day' && outside && left < DAY.warnLeft + DAY.closeDur + 30 && !isFinalDay(save)) {
    let bd = 1e9;
    for (const d of world.doors) { const dd = dist(d.center, player.pos); if (dd < bd) { bd = dd; home = d.center; } }
  }
  fx.arrow('home', home, '🏠', '#7fdc5a');
  const showFrag = world.fragment && !world.fragment.taken && (tower >= 1 || revealAll) && phase === 'day';
  fx.arrow('code', showFrag ? world.fragment : null, '⭐', '#ffd23f');
  fx.arrow('hole', (phase === 'escape' || phase === 'hold') && world.hole ? world.hole : null, '🌀', '#b07aff');
  fx.update(dt, camera, enemies.list);
}
let hudMarkers = [];

// ---------------- gameplay ----------------
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
function mouseAimDir() {
  const ndc = new THREE.Vector2((input.mouse.x / window.innerWidth) * 2 - 1, -(input.mouse.y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
  const dx = hit.x - player.pos.x, dz = hit.z - player.pos.z;
  const l = Math.hypot(dx, dz);
  return l > 0.3 ? { x: dx / l, z: dz / l } : null;
}

function tryFire(f) {
  if (!player.canFire()) { if (f && !f.held && !player.dead) sfx.click(); return; }
  let dir = null;
  if (f.mouse) dir = mouseAimDir();
  else if (!f.auto) dir = { x: f.x, z: f.z };
  combat.attack(dir);
  lastShot = 0.35;
}

function trySuper() {
  if (player.superCharge < 1 || player.dead) return;
  let dir = null;
  if (input.aim.active) dir = { x: input.aim.x, z: input.aim.z };
  else if (input.mode === 'mouse' && input.mouse.inside) dir = mouseAimDir();
  combat.useSuper(dir);
  lastShot = 0.35;
}

const projectileHooks = {
  get world() { return world; },
  get crates() { return crates; },
  get enemies() { return enemies.list; },
  onWall(x, z) {
    particles.burst(x, 1.1, z, { n: 7, colors: [0xb8b2c8, 0x8a84a0, 0x5bb54c], speed: 3, up: 3, size: 0.17 });
    sfx.wall();
  },
  onCrate(c, pr) { combat.damageCrate(c, pr.dmg); },
  onEnemy(e, pr) { combat.damageEnemy(e, pr.dmg, { x: pr.dx, z: pr.dz }, { knock: pr.owner === 'guard' ? 1 : 2.5 }, pr.owner === 'player'); },
  onLand(pr) { if (pr.type === 'net') combat.netLanded(pr); },
};

function hurtPlayer(dmg, dir) {
  if (!player.damage(dmg)) return;
  fx.number(player.pos.x, 2.8, player.pos.z, '-' + dmg, 'hurt');
  sfx.hurt();
  shake(0.55);
  vibrate(70);
  hurtFlash = 0.9;
  if (dir) { player.pos.x += dir.x * 1.4; player.pos.z += dir.z * 1.4; world.collide(player.pos, player.r); }
}

function onEnemyKilled(e) {
  if (e.kind === 'grinder') {
    sfx.grinderDie();
    shake(0.5);
    vibrate(60);
    particles.burst(e.pos.x, 1.2, e.pos.z, { n: 34, colors: [0x6e6480, 0x948aa6, 0xa9b2c2, 0x5a2a6a, 0x3a3f4f], speed: 8, up: 8, size: 0.38, life: 1 });
    pickups.spawn('metal', e.pos.x, e.pos.z, 3 + Math.floor(Math.random() * 3));
    if (Math.random() < 0.4) pickups.spawn('food', e.pos.x, e.pos.z, 1);
    save.kills++;
    save.stats.grinders++;
    dayRes.kills++;
    if (siege && e.siege && !e.counted) siege.killed++;
    for (const id of checkUnlocks(save)) showBanner(t('rUnlocked', { name: tn(RUNNERS[id].name) }), 'warn');
    persist();
  } else {
    sfx.crateBreak();
    particles.burst(e.pos.x, 0.5, e.pos.z, { n: 14, colors: [0x3a3f4f, 0x596178, 0xc8463c], speed: 5, up: 5, size: 0.2 });
    pickups.spawn('metal', e.pos.x, e.pos.z, 1);
  }
}

function grabGlader(g, npc) {
  if (npc.taken) return;
  npc.remove();
  const idx = save.gladers.indexOf(npc.glader);
  if (idx >= 0) save.gladers.splice(idx, 1);
  save.stats.taken++;
  takenLines.push({ icon: '💔', key: 'rTaken', vars: { gname: gladerName(npc.glader, getLang()) }, tone: 'bad' });
  sfx.grab();
  showBanner(t('rTaken', { name: gladerName(npc.glader, getLang()) }), 'danger');
  g.state = 'carry';
  g.siege = true;
  g.counted = true;
  let best = null, bd = 1e9;
  for (const d of world.doors) { const dd = dist(d.center, g.pos); if (dd < bd) { bd = dd; best = d; } }
  g.goal.set(best.center.x + best.out[0] * 8, 0, best.center.z + best.out[1] * 8);
  if (siege) siege.killed++;
}

function onCollect(type) {
  dayRes[type]++;
  combo = comboT > 0 ? combo + 1 : 0;
  comboT = 0.7;
  sfx.pickup(combo);
  particles.burst(player.pos.x, 1.4, player.pos.z, { n: 4, colors: [0xfff3a0, 0xffffff], speed: 2, up: 3, size: 0.12, gravity: 4 });
  refreshRes(type);
}

function updateDoors() {
  const L = DAY.length;
  const tClose = L - DAY.closeDur;
  const final = isFinalDay(save);
  let open;
  if (dayTime < DAY.openAt) open = 0;
  else if (dayTime < DAY.openAt + DAY.openDur) open = (dayTime - DAY.openAt) / DAY.openDur;
  else if (dayTime < tClose || final) open = 1;
  else open = Math.max(0, 1 - (dayTime - tClose) / DAY.closeDur);
  world.setDoors(open);

  const once = (k, fn) => { if (!flags[k]) { flags[k] = true; fn(); } };
  if (dayTime >= DAY.openAt) once('open', () => {
    sfx.door(); shake(0.45); vibrate(80);
    showBanner(t('doorsOpen'));
    for (const d of world.doors) particles.burst(d.center.x, 0.5, d.center.z, { n: 18, colors: [0xbdb3a3, 0x958b7c], speed: 3, up: 2, size: 0.4, float: true, gravity: 2, life: 1.4 });
  });
  if (final) {
    if (dayTime >= tClose) once('noclose', () => { sfx.alarm(); showBanner(t('doorsStayOpen'), 'danger'); });
    return;
  }
  if (dayTime >= tClose - DAY.warnLeft) once('warn', () => { sfx.alarm(); showBanner(t('doorsWarn', { s: Math.round(L - dayTime) }), 'warn'); });
  if (dayTime >= tClose) once('closing', () => { sfx.door(); sfx.alarm(); shake(0.4); vibrate(120); showBanner(t('doorsClosing'), 'danger'); });
  const secLeft = Math.ceil(L - dayTime);
  if (dayTime > tClose && secLeft <= 10 && flags.lastBeep !== secLeft) { flags.lastBeep = secLeft; sfx.click(); }
}

function doorMercy() {
  if (phase !== 'day') return;
  const d = world.doorAt(player.pos.x, player.pos.z);
  if (!d || d.open >= 0.8) return;
  const push = TILE / 2 + player.r + 0.05;
  if (d.out[0]) player.pos.x = d.center.x - d.out[0] * push;
  else player.pos.z = d.center.z - d.out[1] * push;
}

function updateSpawns(dt) {
  const d = save.day;
  if (!flags.spawned) {
    flags.spawned = true;
    for (let i = 0; i < Math.min(2 + Math.floor(d / 2), 6); i++) enemies.spawnScuttler();
    if (world.fragment && d >= 2) enemies.spawnGrinder({ cell: maze.fragment });
  }
  const f = dayTime / DAY.length;
  const base = Math.min(1 + Math.floor(d / 2), 4), extra = Math.min(1 + d, 7);
  const target = f < 0.08 ? 0 : Math.floor(base + extra * f);
  spawnCd -= dt;
  if (enemies.grinders.length < target && spawnCd <= 0) {
    if (enemies.spawnGrinder({ min: 6 }) && !flags.grinderHint) { flags.grinderHint = true; if (d <= 2) showHint(t('hintGrinders'), 5); }
    spawnCd = 5;
  }
}

function startNight() {
  phase = 'night';
  phaseTime = 0;
  setNight(true);
  applyDaylight(1.2);
  enemies.night = true;
  for (const g of enemies.grinders) { g.speed = 6.9; g.sight = 14; g.alertT = 999; if (g.state === 'patrol') g.state = 'chase'; }
  const n = 3 + Math.min(4, Math.floor(save.day / 2));
  for (let i = 0; i < n; i++) enemies.spawnGrinder({ min: 4, max: 11, alert: 999 });
  showBanner(t('trapped'), 'danger');
  setTimeout(() => { if (phase === 'night') showBanner(t('survive'), 'warn'); }, 2300);
  sfx.boom();
  shake(0.6);
  flags.nightSpawn = 12;
}

function startSiege() {
  phase = 'siege';
  phaseTime = 0;
  applyDaylight(1.0);
  setNight(true);
  enemies.night = true;
  enemies.clear();
  enemies.startSiege(npcs);
  siege = { total: 6 + Math.min(6, Math.floor(save.gladers.length / 2)), spawned: 0, killed: 0, cd: 1 };
  for (const n of npcs) n.setPanic(true);
  showBanner(t('defend'), 'danger');
  sfx.boom();
}

function updateSiege(dt) {
  siege.cd -= dt;
  if (siege.spawned < siege.total && siege.cd <= 0) {
    const cells = [[12, 8], [12, 16], [8, 12], [16, 12]];
    const c = cells[Math.floor(Math.random() * 4)];
    const g = enemies.spawnGrinder({ cell: c, siege: true, alert: 999, state: 'chase' });
    if (g) { g.siege = true; siege.spawned++; }
    siege.cd = 2.6;
  }
  // Guards fight back.
  for (const n of npcs) {
    if (n.role !== 'guard' || n.taken) continue;
    n.fireT -= dt;
    if (n.fireT > 0) continue;
    let best = null, bd = 12 * 12;
    for (const e of enemies.list) {
      if (!e.alive) continue;
      const d2 = (e.pos.x - n.pos.x) ** 2 + (e.pos.z - n.pos.z) ** 2;
      if (d2 < bd && world.lineOfSight(n.pos.x, n.pos.z, e.pos.x, e.pos.z)) { bd = d2; best = e; }
    }
    n.fireT = 1.3;
    if (!best) continue;
    const dx = best.pos.x - n.pos.x, dz = best.pos.z - n.pos.z, l = Math.hypot(dx, dz);
    n.facing = Math.atan2(dx, dz);
    n.model.play('throw', 0.3);
    projectiles.fire(n.pos.x, n.pos.z, { x: dx / l, z: dz / l }, { type: 'spear', dmg: 380, range: 13, owner: 'guard' });
  }
  if (siege.spawned >= siege.total && siege.killed >= siege.total && !enemies.grinders.some((g) => g.state !== 'carry')) startEscape();
}

function startEscape() {
  phase = 'escape';
  enemies.siegeTargets = null;
  for (const n of npcs) n.setPanic(false);
  showBanner(t('toHole'), 'warn');
  sfx.fanfare();
  music.setMood('chase');
  for (let i = 0; i < 4; i++) enemies.spawnGrinder({ min: 5 });
}

function updateEscape(dt) {
  const d = dist(player.pos, world.hole);
  if (phase === 'escape') {
    if (d < 2.6) {
      phase = 'hold';
      holdT = 0;
      $('#hold').classList.remove('hidden');
      showBanner(t('enterCode'), 'warn');
      flags.holdSpawn = 2;
    }
    return;
  }
  if (d < 4.5) holdT += dt;
  $('#hold .bar i').style.transform = `scaleX(${Math.min(1, holdT / HOLD_LEN)})`;
  flags.holdSpawn -= dt;
  if (flags.holdSpawn <= 0) {
    flags.holdSpawn = 3.4;
    const [hx, hy] = nav.cellOf(world.hole.x, world.hole.z);
    const opts = [];
    for (let y = hy - 4; y <= hy + 4; y++) for (let x = hx - 4; x <= hx + 4; x++) if (x >= 0 && y >= 0 && x < 25 && y < 25 && Math.abs(x - hx) + Math.abs(y - hy) >= 3 && !(x >= 9 && x <= 15 && y >= 9 && y <= 15)) opts.push([x, y]);
    if (opts.length) enemies.spawnGrinder({ cell: opts[Math.floor(Math.random() * opts.length)], alert: 999, state: 'chase' });
  }
  particles.burst(world.hole.x, 0.3, world.hole.z, { n: 1, colors: [0xb07aff, 0xffffff], speed: 0.5, up: 4, size: 0.2, gravity: -2, life: 1.5 });
  if (holdT >= HOLD_LEN) victory();
}

function updatePlay(dt) {
  phaseTime += dt;
  if (phase === 'day') {
    dayTime += dt;
    applyDaylight(Math.min(1, dayTime / DAY.length));
    updateDoors();
    updateSpawns(dt);
  } else if (phase === 'night') {
    flags.nightSpawn -= dt;
    if (flags.nightSpawn <= 0) { flags.nightSpawn = 14; enemies.spawnGrinder({ min: 5, max: 10, alert: 999 }); }
  } else if (phase === 'siege') {
    updateSiege(dt);
  } else if (phase === 'escape' || phase === 'hold') {
    updateEscape(dt);
  }

  const move = player.dead ? { x: 0, z: 0 } : input.readMove();
  let aimDir = null;
  if (input.aim.active) aimDir = input.aim;
  else if (input.mode === 'mouse' && (input.mouse.down || lastShot > 0)) aimDir = mouseAimDir();
  doorMercy();
  player.update(dt, move, lastShot > 0 && !aimDir ? { x: Math.sin(player.facing), z: Math.cos(player.facing) } : aimDir, world);
  doorMercy();
  lastShot = Math.max(0, lastShot - dt);

  if (input.takeSuper()) trySuper();
  const fire = input.takeFire();
  if (fire) tryFire(fire);
  else if (input.mode === 'mouse' && input.mouse.down && player.canFire()) tryFire({ mouse: true, held: true });

  const guideDir = input.aim.active ? input.aim : (input.mode === 'mouse' && input.mouse.inside ? mouseAimDir() : null);
  aimGuide.visible = !!guideDir && !player.dead;
  if (guideDir) {
    const a = player.def.attack;
    aimGuide.position.set(player.pos.x, 0.06, player.pos.z);
    aimGuide.rotation.y = Math.atan2(guideDir.x, guideDir.z);
    aimGuide.scale.set(a.kind === 'slash' ? 2.2 : a.kind === 'spread' ? 1.8 : 1, 1, a.range);
    aimGuide.material.opacity = input.aim.active ? 0.85 : 0.35;
  }

  combat.update(dt);
  projectiles.update(dt, projectileHooks);
  crates.update(dt);
  enemies.update(dt);
  pickups.update(dt, player, world, onCollect);
  comboT = Math.max(0, comboT - dt);
  minimap.reveal(player.pos.x, player.pos.z, 6 + save.buildings.tower * 2);

  // Code piece
  if (world.fragment && !world.fragment.taken && dist(player.pos, world.fragment) < 1.7 && !player.dead) {
    world.takeFragment();
    dayRes.fragment = true;
    const w = CODE_WORDS[Math.min(save.fragments, CODE_WORDS.length - 1)][getLang() === 'he' ? 1 : 0];
    showBanner(t('codePiece', { w, n: save.fragments + 1 }), 'warn');
    sfx.fragment();
    shake(0.3);
    flash();
    particles.burst(world.fragment.x, 1.5, world.fragment.z, { n: 30, colors: [0xffd23f, 0xfff6b0, 0xffffff], speed: 5, up: 6, size: 0.2, gravity: 6 });
  }

  const inside = world.inGlade(player.pos.x, player.pos.z);
  if (!inside) flags.out = true;
  if (phase === 'day' && inside && flags.out && flags.warn && !flags.home) { flags.home = true; showBanner(t('backHome')); sfx.fanfare(); }

  // Day-1 coaching
  if (save.day === 1 && phase === 'day') {
    if (dayTime > 14 && !flags.h1) { flags.h1 = true; showHint(t('hintCrates'), 4); }
    if (dayTime > 34 && !flags.h2) { flags.h2 = true; showHint(t('hintCode'), 5); }
  }
  if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('#hint').classList.remove('show'); }
  bannerBusy = Math.max(0, bannerBusy - dt);

  // Music follows the danger.
  let mood = inside ? 'glade' : 'maze';
  if (phase === 'night') mood = 'night';
  else if (phase === 'siege' || phase === 'hold') mood = 'siege';
  else if (enemies.list.some((e) => e.kind === 'grinder' && e.alive && e.state !== 'patrol' && dist(e.pos, player.pos) < 20)) mood = 'chase';
  music.setMood(mood);

  // Death
  if (player.dead) {
    deathT += dt;
    if (deathT === dt) { sfx.sad(); shake(0.8); }
    if (deathT > 1.2) {
      if (!rescueUsed && roleCount(save, 'medic') > 0) {
        rescueUsed = true;
        player.revive(0.5);
        deathT = 0;
        sfx.heal();
        showBanner(t('rescued'), 'warn');
        particles.burst(player.pos.x, 1.2, player.pos.z, { n: 20, colors: [0x7dff8a, 0xffffff], speed: 3, up: 5, size: 0.2, gravity: 3 });
      } else {
        endDay('fallen');
      }
    }
    return;
  }

  if (phase === 'day' && dayTime >= DAY.length) {
    if (isFinalDay(save)) startSiege();
    else if (inside) endDay('home');
    else startNight();
  } else if (phase === 'night' && phaseTime >= NIGHT_LEN) {
    endDay('night');
  }
}

// ---------------- screens / flow ----------------
const screens = ['menu', 'intro', 'council', 'pause', 'result', 'map'];
function setState(s) {
  state = s;
  input.enabled = s === 'play';
  if (s !== 'play') input.reset();
  for (const k of screens) $('#screen-' + k).classList.toggle('hidden', k !== s);
  hud.classList.toggle('hidden', !['play', 'pause', 'map'].includes(s));
  $('#fx').classList.toggle('hidden', !['play', 'pause', 'map'].includes(s));
  if (s !== 'play' && s !== 'pause' && s !== 'map') vignette.style.opacity = 0;
}

function refreshMenu() {
  $('#play-label').textContent = save.day > 1 ? t('continueDay', { n: save.day }) : t('play');
  $('#btn-new').classList.toggle('hidden', save.day <= 1);
  $('#btn-music').textContent = '🎵 ' + t('music');
  $('#btn-sound').textContent = '🔊 ' + t('sound');
  $('#btn-music').classList.toggle('off', !save.settings.music);
  $('#btn-sound').classList.toggle('off', !save.settings.sfx);
}

function applySettings() {
  sfx.muted = !save.settings.sfx;
  music.setEnabled(save.settings.music);
}

function toMorning() {
  prepareDay();
  setState('council');
  council.open('morning');
  music.setMood('glade');
}

function openDoors() {
  setState('play');
  dayTime = 0;
  refreshRes();
  showBanner(isFinalDay(save) ? t('finalMorning') : t('day', { n: save.day }));
  sfx.fanfare();
  if (save.day === 1) showHint(t(input.mode === 'touch' ? 'ctrlTouch' : 'ctrlDesk'), 7);
  else if (!isFinalDay(save)) showHint(t('shifted'), 3.5);
}

function endDay(outcome) {
  const stats = $('#end-stats');
  stats.innerHTML = '';
  const add = (v, k) => {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<span class="v ink">${v}</span><span class="k">${k}</span>`;
    stats.appendChild(d);
  };
  $('#end-sub').textContent = '';
  if (outcome === 'fallen') {
    $('#end-title').textContent = t('fallen');
    $('#end-sub').textContent = t('fallenSub');
  } else {
    $('#end-title').textContent = outcome === 'night' ? t('nightWin') : t('daySurvived', { n: save.day });
    add('🍎 ' + dayRes.food, t('food'));
    add('🪵 ' + dayRes.wood, t('wood'));
    add('⚙️ ' + dayRes.metal, t('metal'));
    add(minimap.percent + '%', t('mapped'));
    if (dayRes.kills) add('💀 ' + dayRes.kills, t('kills'));
    sfx.fanfare();
  }
  if (outcome === 'night') { setNight(false); applyDaylight(0.02); }
  $('#btn-end').textContent = t('cont');
  resultNext = () => {
    const lines = [...takenLines, ...resolveDay(save, dayRes, outcome)];
    persist();
    setState('council');
    council.open('evening', lines);
  };
  setState('result');
  music.setMood(outcome === 'fallen' ? 'quiet' : 'glade');
}

function victory() {
  phase = 'won';
  $('#hold').classList.add('hidden');
  save.won = true;
  const days = save.day;
  const stats = $('#end-stats');
  stats.innerHTML = '';
  for (const [v, k] of [[days, t('days')], [save.stats.crates, t('crates')], [save.stats.grinders, t('kills')], [save.gladers.length + 1, t('saved')]]) {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<span class="v ink">${v}</span><span class="k">${k}</span>`;
    stats.appendChild(d);
  }
  $('#end-title').textContent = t('victory');
  $('#end-sub').textContent = t('victorySub', { n: days }) + ' — ' + t('theEnd');
  $('#btn-end').textContent = t('playAgain');
  enemies.clear();
  setNight(false);
  applyDaylight(0.04);
  particles.burst(player.pos.x, 2, player.pos.z, { n: 60, colors: [0xffd23f, 0x6fd6ff, 0xff7a3d, 0x7fdc5a, 0xffffff], speed: 7, up: 9, size: 0.22, gravity: 7, life: 1.6 });
  player.model.play('cheer', 6);
  for (const n of npcs) n.model.play('cheer', 6);
  music.setMood('win');
  sfx.fanfare();
  flash();
  resultNext = () => {
    save = newSave(save.settings);
    save.seenIntro = true;
    persist();
    refreshMenu();
    prepareDay();
    setState('menu');
    music.setMood('menu');
  };
  setTimeout(() => setState('result'), 1800);
}

function flash() {
  $('#flash').animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' });
}

function startGame() {
  sfx.init();
  music.start();
  applySettings();
  if (isMobile) {
    const el = document.documentElement;
    const p = el.requestFullscreen?.({ navigationUI: 'hide' });
    p?.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  }
  if (!save.seenIntro) { setState('intro'); return; }
  toMorning();
}

$('#btn-play').addEventListener('click', () => { sfx.init(); sfx.click(); startGame(); });
$('#btn-new').addEventListener('click', () => {
  sfx.init(); sfx.click();
  if (!confirm(t('confirmNew'))) return;
  save = newSave(save.settings);
  save.seenIntro = true;
  persist();
  refreshMenu();
  startGame();
});
$('#btn-intro-go').addEventListener('click', () => { sfx.click(); save.seenIntro = true; persist(); toMorning(); });
$('#btn-pause').addEventListener('click', () => { sfx.init(); sfx.click(); if (state === 'play') setState('pause'); });
$('#btn-resume').addEventListener('click', () => { sfx.click(); setState('play'); });
$('#btn-menu').addEventListener('click', () => { sfx.click(); prepareDay(); refreshMenu(); setState('menu'); music.setMood('menu'); });
$('#btn-end').addEventListener('click', () => { sfx.click(); const fn = resultNext; resultNext = null; fn?.(); });
$('#btn-music').addEventListener('click', () => { save.settings.music = !save.settings.music; persist(); applySettings(); refreshMenu(); sfx.click(); });
$('#btn-sound').addEventListener('click', () => { save.settings.sfx = !save.settings.sfx; persist(); applySettings(); refreshMenu(); sfx.click(); });
$('#minimap-wrap').addEventListener('click', () => { if (state === 'play') openMap(); });
$('#screen-map').addEventListener('click', () => { if (state === 'map') setState('play'); });
superBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (state === 'play') trySuper(); });
$$('.btn-lang').forEach((b) => b.addEventListener('click', () => {
  sfx.init(); sfx.click();
  setLang(getLang() === 'he' ? 'en' : 'he');
  refreshMenu();
  setupRunnerHud();
  if (state === 'council') council.render();
}));

function openMap() {
  setState('map');
  requestAnimationFrame(() => minimap.drawBig(player, player.facing, hudMarkers));
}

input.onKey = (code) => {
  if (code === 'Escape' || code === 'KeyP') {
    if (state === 'play') setState('pause');
    else if (state === 'pause' || state === 'map') setState('play');
  } else if (code === 'KeyM') {
    if (state === 'play') openMap();
    else if (state === 'map') setState('play');
  } else if (code === 'Enter' && state === 'menu') startGame();
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === 'play') setState('pause');
    sfx.ctx?.suspend();
  } else if (sfx.ctx && state !== 'menu') sfx.ctx.resume();
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 1 ? 46 : 38;
  camera.updateProjectionMatrix();
  offset = camOffset();
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
resize();

// ---------------- main loop ----------------
const clock = new THREE.Clock();
let perfAcc = 0, perfN = 0, upgradeCredit = 0, smokeT = 0;
const fpsEl = $('#fps');
if (DEBUG) fpsEl.classList.remove('hidden');

function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta();
  tick(Math.min(raw, 0.05));
  renderer.render(scene, camera);

  if (raw > 0.25 || state !== 'play') { perfAcc = perfN = 0; return; }
  perfAcc += raw; perfN++;
  if (perfAcc > 2) {
    const avg = perfAcc / perfN;
    if (avg > 1 / 45 && pr > 1) { pr = Math.max(1, pr - 0.25); renderer.setPixelRatio(pr); resize(); upgradeCredit = 0; }
    else if (avg < 1 / 57 && pr < maxPR && ++upgradeCredit > 4) { pr = Math.min(maxPR, pr + 0.25); renderer.setPixelRatio(pr); resize(); upgradeCredit = 0; }
    if (DEBUG) fpsEl.textContent = `${Math.round(1 / avg)} fps · pr ${pr} · calls ${renderer.info.render.calls} · tris ${renderer.info.render.triangles}`;
    perfAcc = perfN = 0;
  }
}

function tick(dt) {
  if (state === 'play') updatePlay(dt);
  const live = state === 'play' || state === 'menu' || state === 'council' || state === 'result';
  if (live) {
    world.update(dt);
    for (const n of npcs) n.update(dt, world);
    particles.update(dt);
    if (world.chimney && (smokeT -= dt) <= 0) {
      smokeT = 0.35;
      particles.burst(world.chimney.x, world.chimney.y, world.chimney.z, { n: 1, colors: [0x9a96a6, 0x7a7686], speed: 0.4, up: 1.5, size: 0.55, gravity: -0.6, life: 2.2, float: true });
    }
  }
  if (state !== 'play' && live) {
    if (state === 'menu') applyDaylight(0.3);
    if (state !== 'result') player.update(dt, { x: 0, z: 0 }, null, world);
    else player.model.update(dt, 0);
  }
  updateCamera(dt);
  if (state === 'play') updateHud(dt);
}

if (DEBUG) {
  window.gr = {
    player, input, scene, sun, hemi, renderer, camera, enemies, combat,
    get save() { return save; }, set save(v) { save = v; },
    get world() { return world; }, get crates() { return crates; }, get state() { return state; }, get phase() { return phase; }, get npcs() { return npcs; },
    setTime: (s) => { dayTime = s; },
    tp: (x, z) => { player.pos.set(x, 0, z); },
    advance: (secs) => { for (let i = 0; i < secs * 60; i++) tick(1 / 60); renderer.render(scene, camera); },
    persist, toMorning,
  };
}

applyI18n();
prepareDay();
refreshMenu();
setState('menu');
applySettings();
frame();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
