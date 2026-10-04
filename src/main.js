import './style.css';
import './ui2.css';
import * as THREE from 'three';
import { DAY, DEBUG, TILE, GRID, CELLS, GLADE_C0, GLADE_C1, DOOR_CELL, cellToWorld, worldToTile, tileToWorld } from './config.js';
import { generateMaze, rng, themeOrder, inGladeCell } from './maze.js';
import { World } from './world.js';
import { Glade, SITES, ensureGladeState } from './glade.js';
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
import { Popup } from './popup.js';
import { RUNNERS, CODE_WORDS, THEMES, SHRINES, BUILDINGS, ROLES, ROLE_ORDER, BEDS, plotsFor, GROW_TIME, randomLook } from './data.js';
import { newSave, migrateSave, runnerMods, resolveDay, isFinalDay, checkUnlocks, gladerName, buildCost, canAfford, pay, setRole, rescues, lootMul, EAT_PER_HEAD } from './colony.js';
import { t, tn, apply as applyI18n, getLang, setLang } from './i18n.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const ICON = { food: '🍎', wood: '🪵', metal: '⚙️' };

// ---------------- save ----------------
// One stable key from now on; older keys are read once and migrated.
const SAVE_KEY = 'gr.save';
const OLD_SAVE_KEYS = ['gr.save.v3', 'gr.save.v2', 'gr.save.v1'];
function loadSave() {
  try {
    for (const key of [SAVE_KEY, ...OLD_SAVE_KEYS]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const s = migrateSave(JSON.parse(raw));
      if (s) return s;
    }
  } catch {}
  return newSave();
}
let save = loadSave();
const persist = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    for (const k of OLD_SAVE_KEYS) localStorage.removeItem(k);
  } catch {}
};

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
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 240);

const hemi = new THREE.HemisphereLight(0xd2ecff, 0x6d6080, 1.25);
const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
sun.castShadow = true;
const sm = isMobile ? 1024 : 2048;
sun.shadow.mapSize.set(sm, sm);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 100 });
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
let lightF = 0.3;
function applyDaylight(f) {
  lightF = f;
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
let nightOn = false;
let darkK = 0;
function setNight(on) { nightOn = on; }
function finalizeLighting() {
  sun.intensity *= 1 - 0.68 * darkK;
  hemi.intensity *= 1 - 0.62 * darkK;
  const dark = nightOn || darkK > 0.45;
  scene.fog = dark ? nightFog : null;
  scene.background.setHex(dark ? 0x0b0d22 : 0x3b3a4f);
  playerLight.visible = nightOn || darkK > 0.05;
  playerLight.intensity = nightOn ? 16 : 16 * darkK;
}

// ---------------- systems ----------------
const hud = $('#hud');
const input = new Input(hud);
const sfx = new Sfx();
const music = new Music(sfx);
const particles = new Particles(scene, 800);
const pickups = new Pickups(scene);
const projectiles = new Projectiles(scene, particles);
const minimap = new Minimap($('#minimap'), $('#bigmap'));
const fx = new Fx($('#fx'));
const popup = new Popup($('#popup'), sfx);
const player = new Player(scene, save.runner, runnerMods(save));
let npcs = [];
let maze, world, crates, nav, glade;

const shake = (a) => { cam.shake = Math.min(1, Math.max(cam.shake, a)); };
const vibrate = (ms) => { try { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(ms); } catch {} };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const enemies = new Enemies(scene, {
  onAggro(e) {
    if (e.roared) return;
    e.roared = true;
    if (dist(e.pos, player.pos) < 22) sfx.roar();
    if (e.type === 'alpha' && !flags.alphaBanner) { flags.alphaBanner = true; showBanner(t('alpha'), 'danger'); shake(0.4); }
  },
  onWindup(e) { if (dist(e.pos, player.pos) < 16) sfx.windup(); },
  onLunge(e) { if (dist(e.pos, player.pos) < 16) sfx.lunge(); },
  onSlam(e) {
    sfx.boom();
    shake(dist(e.pos, player.pos) < 14 ? 0.6 : 0.2);
    particles.burst(e.pos.x, 0.3, e.pos.z, { n: 26, colors: [0xbdb3a3, 0x958b7c, 0x6b5f50], speed: 8, up: 3, size: 0.35, life: 0.8 });
  },
  onHitTarget(e, target, dir) {
    if (target === player) hurtPlayer(e.dmg, dir);
    else grabGlader(e, target);
  },
  onSpit() { sfx.throw(); },
  onSpitHit(s) { hurtPlayer(s.dmg, { x: s.dx, z: s.dz }); },
  onSpitSplash(s) { particles.burst(s.x, 0.8, s.z, { n: 8, colors: [0x9dff3a, 0x6fcf2a], speed: 3, up: 3, size: 0.18 }); },
  onSpotted(s) {
    sfx.spotted();
    fx.number(s.pos.x, 1.6, s.pos.z, '!', 'hurt');
    enemies.alert(player.pos.x, player.pos.z, 9);
    showBanner(t('spotted'), 'danger', true);
  },
  onDeath(e) { onEnemyKilled(e); },
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
  hitStatic(x, z, radius, dmg) { return hitStatic(x, z, radius, dmg); },
});

const council = new Council({
  save: () => save,
  persist,
  sfx,
  onContinue: () => toMorning(),
  onClose: () => setState('play'),
  onRunnerChanged: () => {
    const ratio = player.hp / player.maxHp;
    player.setRunner(save.runner, runnerMods(save));
    player.hp = player.maxHp * ratio;
    player.ammo = player.ammoMax;
    setupRunnerHud();
  },
  onRolesChanged: () => { rebuildNpcs(true); player.applyMods(runnerMods(save)); },
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

// Ring that marks where you tapped.
const tapMark = (() => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  m.renderOrder = 3;
  scene.add(m);
  return m;
})();

// ---------------- state ----------------
let state = 'menu'; // menu | intro | council | play | pause | map | result
let phase = 'day'; // day | night | siege | escape | hold | won
let dayTime = 0, phaseTime = 0;
let flags = {};
let dayRes = {};
let made = {};
let lastShot = 0;
let combo = 0, comboT = 0;
let spawnCd = 0, packCd = 25;
let rescuesLeft = 0, revealAll = false;
let deathT = 0;
let siege = null;
let holdT = 0;
let resultNext = null;
let takenLines = [];
let stranded = null;
let drop = null;
let alpha = null;
let task = null;
let hazardCd = 0;
let fromPause = false;
const NIGHT_LEN = 60;
const HOLD_LEN = 20;

function disposeDay() {
  if (world) { world.dispose(); crates.dispose(scene); glade.dispose(); }
  for (const n of npcs) n.dispose();
  npcs = [];
  if (stranded) { stranded.npc.dispose(); stranded = null; }
  if (drop?.mesh) scene.remove(drop.mesh);
  drop = null;
  enemies.clear();
  pickups.clear();
  projectiles.clear();
  particles.clear();
  combat.reset();
  fx.clear();
  popup.hide();
}

function rebuildNpcs(keep = false) {
  const old = new Map(npcs.map((n) => [n.glader, n.pos.clone()]));
  for (const n of npcs) n.dispose();
  const R = rng(save.seed + save.day * 13);
  npcs = save.gladers.map((g, i) => {
    const n = new Npc(scene, g, i, R);
    if (keep && old.has(g)) n.pos.copy(old.get(g));
    return n;
  });
}

function assignCrateDrops() {
  const mul = lootMul(save);
  for (const c of crates.items) {
    const R = Math.random;
    const th = world.themeAt(c.x, c.z);
    const m = mul * (th?.loot ?? 1);
    c.drops = c.type === 'wood'
      ? [['wood', Math.round((1 + Math.floor(R() * 2)) * m)], ['food', R() < 0.45 ? Math.round((1 + Math.floor(R() * 2)) * m) : 0]]
      : [['metal', Math.round((1 + Math.floor(R() * 3)) * m)], ['food', R() < 0.25 ? 1 : 0], ['wood', Math.floor(R() * 2)]];
  }
}

function prepareDay() {
  disposeDay();
  ensureGladeState(save);
  const final = isFinalDay(save);
  maze = generateMaze(save.seed + save.day * 7919, themeOrder(save.seed));
  world = new World(scene, maze, { fragment: final ? null : maze.fragment, hole: final ? maze.hole : null, particles, sfx });
  world.onGridChange = (tiles) => minimap.updateTiles(tiles);
  glade = new Glade(scene, world, save, { particles, pickups, fx, sfx, onBuilt, onProduce });
  crates = new Crates(scene, world, maze.crates);
  assignCrateDrops();
  nav = new Nav(world);
  rebuildNpcs();
  player.setRunner(save.runner, runnerMods(save));
  player.reset(0, 5);
  enemies.reset(world, nav, player, save.day);
  minimap.reset(maze, world);
  dayTime = 0;
  phaseTime = 0;
  phase = 'day';
  flags = {};
  dayRes = { food: 0, wood: 0, metal: 0, fragment: false, kills: 0, crates: 0 };
  made = { food: 0, wood: 0, metal: 0 };
  takenLines = [];
  world.setDoors(0);
  applyDaylight(0.06);
  setNight(false);
  darkK = 0;
  rescuesLeft = rescues(save);
  revealAll = false;
  spawnCd = 0;
  packCd = 30;
  deathT = 0;
  siege = null;
  holdT = 0;
  task = null;
  $('#hold').classList.add('hidden');
  alpha = final ? null : enemies.spawnGrinder({ cell: maze.fragment, type: 'alpha', state: 'sleep', offset: [1.8, 0] });
  if (maze.stranded) {
    const R = rng(save.seed + save.day * 3);
    const g = { n: save.nextName, look: randomLook(R), role: 'idle' };
    const n = new Npc(scene, g, 0, R);
    n.pos.set(cellToWorld(maze.stranded[0]), 0, cellToWorld(maze.stranded[1]));
    stranded = { npc: n, following: false, done: false, retarget: 0 };
  }
  drop = { at: DAY.length * (0.36 + Math.random() * 0.2), state: 'pending' };
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
    cam.orbit += dt * 0.06;
    wantPos.set(Math.sin(cam.orbit) * 46, 40, Math.cos(cam.orbit) * 46);
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
    el.querySelector('.n').textContent = save.res[k] + (dayRes[k] ?? 0);
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
let hudMarkers = [];
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function setupRunnerHud() {
  pbar.querySelector('.pname').textContent = tn(player.def.name);
  ammoSlots.forEach((el, i) => el.classList.toggle('hidden', i >= player.ammoMax));
}

function explored(x, z) {
  const tx = worldToTile(x), tz = worldToTile(z);
  return minimap.explored[tz * GRID + tx] === 1;
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

  const outside = !world.inGlade(player.pos.x, player.pos.z);
  let obj = '';
  if (phase === 'day' && outside && left < DAY.warnLeft + DAY.closeDur && !isFinalDay(save)) obj = t('hintBack');
  else if (phase === 'night') obj = t('survive');
  else if (phase === 'escape') obj = t('toHole');
  else if (stranded?.following && !stranded.done) obj = t('strandedHint');
  else if (outside) { const s = world.sectorAt(player.pos.x, player.pos.z); if (s !== 255) obj = t('sector', { n: s + 1, name: tn(THEMES[maze.order[s]].name) }); }
  $('#objective').textContent = obj;

  const bl = Object.entries(player.buffs);
  $('#buffs').innerHTML = bl.map(([k, s]) => `<span class="buff ink">${SHRINES[k].icon} ${Math.ceil(s)}</span>`).join('');

  v3.set(player.pos.x, 2.85, player.pos.z).project(camera);
  const x = (v3.x + 1) / 2 * window.innerWidth, y = (1 - v3.y) / 2 * window.innerHeight;
  pbar.style.transform = `translate(${x - 46}px, ${y - 58}px)`;
  pbar.style.opacity = player.hidden ? 0.55 : 1;
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
  const see = (o) => revealAll || explored(o.x, o.z);
  if (world.fragment && !world.fragment.taken && (tower >= 1 || see(world.fragment))) markers.push({ x: world.fragment.x, z: world.fragment.z, color: '#ffd23f', r: 1.3, edge: true });
  if ((tower >= 2 || revealAll) && crates) for (const c of crates.items) if (c.alive) markers.push({ x: c.x, z: c.z, color: c.type === 'metal' ? '#a8b4c8' : '#c08a50', r: 0.55 });
  if (world.vault && (tower >= 2 || see(world.vault)) && !world.vault.looted) markers.push({ x: world.vault.x, z: world.vault.z, color: '#f2c14e', r: 1.1 });
  for (const l of world.levers) if (tower >= 2 || see(l)) markers.push({ x: l.x, z: l.z, color: l.pulled ? '#5ee05a' : '#ff4040', r: 0.7 });
  for (const s of world.shrines) if (!s.used && (tower >= 2 || see(s))) markers.push({ x: s.x, z: s.z, color: '#' + SHRINES[s.kind].color.toString(16).padStart(6, '0'), r: 0.8 });
  if (stranded && !stranded.done && (stranded.following || see(stranded.npc.pos))) markers.push({ x: stranded.npc.pos.x, z: stranded.npc.pos.z, color: '#7dff8a', r: 0.9, edge: true });
  if (drop && (drop.state === 'falling' || drop.state === 'landed')) markers.push({ x: drop.x, z: drop.z, color: '#ff8a2a', r: 1.2, edge: true });
  if (world.hole) markers.push({ x: world.hole.x, z: world.hole.z, color: '#b07aff', r: 1.5, edge: true });
  if (enemies.xray > 0) for (const e of enemies.list) if (e.alive) markers.push({ x: e.pos.x, z: e.pos.z, color: '#ff3b3b', r: 0.7 });
  hudMarkers = markers;
  minimap.drawSmall(player, player.facing, markers);

  // Off-screen arrows
  let home = null;
  if ((phase === 'day' && outside && left < DAY.warnLeft + DAY.closeDur + 30 && !isFinalDay(save)) || (stranded?.following && !stranded.done)) {
    let bd = 1e9;
    for (const d of world.doors) { const dd = dist(d.center, player.pos); if (dd < bd) { bd = dd; home = d.center; } }
    if (!outside) home = null;
  }
  fx.arrow('home', home, '🏠', '#7fdc5a');
  const showFrag = world.fragment && !world.fragment.taken && (tower >= 1 || revealAll) && phase === 'day';
  fx.arrow('code', showFrag ? world.fragment : null, '⭐', '#ffd23f');
  fx.arrow('drop', drop && (drop.state === 'falling' || drop.state === 'landed') ? drop : null, '📦', '#ff8a2a');
  fx.arrow('vault', world.vault?.open && !world.vault.looted ? world.vault : null, '💰', '#f2c14e');
  fx.arrow('hole', (phase === 'escape' || phase === 'hold') && world.hole ? world.hole : null, '🌀', '#b07aff');
  fx.update(dt, camera, enemies.list);

  popup.update(camera);
  if (popup.open && popup.spec?.key) {
    const con = save.construction[popup.spec.key];
    if (con) popup.setProgress(con.p);
    else if (popup.spec.wasCon) sitePopup(popup.spec.key);
  }
  if (popup.open && popup.spec?.plot) {
    const p = popup.spec.plot;
    if (p.st.s === 'growing') popup.setProgress(p.st.t / GROW_TIME);
    else popup.hide();
  }
  if (popup.open && dist(player.pos, popup.anchor) > 16) popup.hide();
}

// ---------------- the Glade: taps & popups ----------------
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
function screenToGround(sx, sy, plane = groundPlane) {
  const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
}
function mouseAimDir() {
  const hit = screenToGround(input.mouse.x, input.mouse.y, aimPlane);
  if (!hit) return null;
  const dx = hit.x - player.pos.x, dz = hit.z - player.pos.z;
  const l = Math.hypot(dx, dz);
  return l > 0.3 ? { x: dx / l, z: dz / l } : null;
}

function findTarget(x, z) {
  if (!world.inGlade(x, z)) {
    for (const d of world.doors) if (dist(d.center, { x, z }) < 3 && d.open < 0.5 && phase === 'day') return { kind: 'door', obj: d };
    return null;
  }
  let best = null, bd = 1.5;
  for (const n of npcs) { if (n.taken) continue; const d = Math.hypot(n.pos.x - x, n.pos.z - z); if (d < bd) { bd = d; best = { kind: 'npc', obj: n }; } }
  if (best) return best;
  for (const d of world.doors) if (dist(d.center, { x, z }) < 3.4 && d.open < 0.5 && phase === 'day') return { kind: 'door', obj: d };
  return glade.hitTest(x, z);
}

function handleTap(tap) {
  const pt = screenToGround(tap.x, tap.y);
  if (!pt) return false;
  const wasOpen = popup.open;
  popup.hide();
  const target = findTarget(pt.x, pt.z);
  if (target && phase === 'day') {
    interact(target);
    if (tap.mouse) { input.fire = null; flags.mouseBlock = true; }
    return true;
  }
  if (tap.fallbackFire) { tryFire({ auto: true }); return true; }
  if (!tap.mouse && world.inGlade(pt.x, pt.z) && world.inGlade(player.pos.x, player.pos.z) && !wasOpen) {
    player.walkTo(pt.x, pt.z, 0.4);
    markTap(pt.x, pt.z);
    return true;
  }
  return wasOpen && tap.mouse ? (input.fire = null, flags.mouseBlock = true, true) : false;
}

function markTap(x, z) {
  tapMark.position.set(x, 0.06, z);
  tapMark.material.opacity = 0.9;
  tapMark.scale.setScalar(1.3);
}

const effectText = (key, L) => {
  if (key === 'homestead') return t('homesteadE', { n: BEDS[L] });
  if (key === 'fields') return t('fieldsE', { n: plotsFor(L) });
  return t(key + L);
};

function interact(target) {
  const { kind, obj } = target;
  task = null;
  if (kind === 'plot') {
    const p = obj;
    if (p.i >= glade.unlockedPlots) return fieldsPopup();
    if (p.st.s === 'growing') {
      popup.show({ x: p.x, z: p.z, y: 1.5, icon: '🌱', title: t('growing', { p: Math.round((p.st.t / GROW_TIME) * 100) }), progress: p.st.t / GROW_TIME, plot: p });
      return;
    }
    markTap(p.x, p.z);
    player.walkTo(p.x, p.z, 2.3, () => {
      player.facing = Math.atan2(p.x - player.pos.x, p.z - player.pos.z);
      player.model.play('cast', 0.4);
      if (p.st.s === 'ripe') { glade.harvest(p, 'player'); sfx.fanfare(); }
      else if (glade.plant(p)) sfx.pickup(2);
    });
  } else if (kind === 'tree') {
    const tr = obj;
    markTap(tr.x, tr.z);
    player.walkTo(tr.x, tr.z, 1.9, () => { task = { kind: 'chop', tree: tr, t: 0 }; });
  } else if (kind === 'site') {
    sitePopup(obj.key);
  } else if (kind === 'fields') {
    fieldsPopup();
  } else if (kind === 'box') {
    popup.show({ x: 0, z: 0, y: 1.5, icon: '📦', title: t('box'), desc: t('boxDesc'), info: t('eatTonight', { n: (save.gladers.length + 1) * EAT_PER_HEAD }) });
  } else if (kind === 'campfire') {
    popup.show({
      x: obj.x, z: obj.z, y: 2, icon: '🔥', title: t('campfire'), desc: t('campDesc'),
      buttons: [{ label: '🏃 ' + t('btnRunner'), cls: 'blue', onClick: () => openRoster('runner') }, { label: '👥 ' + t('btnGladers'), onClick: () => openRoster('gladers') }],
    });
  } else if (kind === 'door') {
    const d = obj;
    popup.show({
      x: d.center.x, z: d.center.z, y: 4, icon: '🚪', title: t('doorTitle'), desc: t('doorDesc'),
      buttons: [{ label: t('openNow'), onClick: () => { if (flags.doorStart == null) flags.doorStart = dayTime; popup.hide(); } }],
    });
  } else if (kind === 'npc') {
    npcPopup(obj);
  }
}

function npcPopup(n) {
  const g = n.glader;
  popup.show({
    x: n.pos.x, z: n.pos.z, y: 3, icon: ROLES[g.role]?.icon ?? '🙂', title: gladerName(g, getLang()),
    desc: (g.role === 'idle' ? t('idle') : t(g.role)) + ' · ' + t('npcDesc'),
    buttons: ROLE_ORDER.map((r) => ({
      label: ROLES[r].icon, cls: 'role ' + (g.role === r ? 'on blue' : 'grey'),
      disabled: ROLES[r].needs && save.buildings[ROLES[r].needs] < 1,
      onClick: () => {
        setRole(save, g, r);
        persist();
        const pos = n.pos.clone();
        glade.releaseJob(n);
        const i = npcs.indexOf(n);
        n.dispose();
        const nn = new Npc(scene, g, n.i, rng(Date.now() % 9999));
        nn.pos.copy(pos);
        npcs[i] = nn;
        nn.model.play('cheer', 0.6);
        player.applyMods(runnerMods(save));
        npcPopup(nn);
      },
    })),
  });
}

function sitePopup(key) {
  const s = SITES[key];
  const lvl = save.buildings[key];
  const max = BUILDINGS[key].max;
  const con = save.construction[key];
  const spec = { x: s.x, z: s.z, y: key === 'tower' ? 6 : 3.6, icon: BUILDINGS[key].icon, title: t(key), key, wasCon: !!con };
  spec.level = lvl > 0 ? t('lvl', { n: lvl }) : t('siteEmpty');
  if (con) {
    spec.desc = effectText(key, con.to);
    spec.info = t('helpHint');
    spec.progress = con.p;
  } else {
    spec.desc = lvl > 0 ? effectText(key, lvl) : effectText(key, 1);
    const buttons = [];
    if (lvl < max) {
      const cost = buildCost(save, key);
      if (lvl > 0) spec.info = '▶ ' + effectText(key, lvl + 1);
      buttons.push({
        label: lvl > 0 ? t('upgrade') : t('buildBtn'), cost, res: save.res, disabled: !canAfford(save, cost),
        onClick: () => {
          if (!pay(save, cost)) { showBanner(t('notEnough'), 'danger', true); return; }
          glade.startBuild(key);
          sfx.crateHit();
          particles.burst(s.x, 1, s.z, { n: 20, colors: [0xb57a45, 0xffd23f], speed: 4, up: 5, size: 0.25 });
          persist();
          refreshRes();
          sitePopup(key);
        },
      });
    } else spec.info = t('maxed');
    if (key === 'homestead') buttons.push({ label: '👥 ' + t('btnGladers'), cls: 'blue', onClick: () => openRoster('gladers') });
    spec.buttons = buttons;
  }
  popup.show(spec);
}

function fieldsPopup() {
  const lvl = save.buildings.fields, max = BUILDINGS.fields.max;
  const cost = buildCost(save, 'fields');
  const p0 = glade.plotPos(Math.min(11, glade.unlockedPlots));
  popup.show({
    x: p0.x, z: p0.z, y: 1.5, icon: '🌱', title: t('fields'), level: t('lvl', { n: lvl }),
    desc: effectText('fields', lvl), info: lvl < max ? '▶ ' + effectText('fields', lvl + 1) : t('maxed'),
    buttons: lvl < max ? [{
      label: t('expand'), cost, res: save.res, disabled: !canAfford(save, cost),
      onClick: () => {
        if (!pay(save, cost)) return;
        save.buildings.fields++;
        glade.refreshPlots();
        sfx.fanfare();
        persist();
        refreshRes();
        fieldsPopup();
      },
    }] : [],
  });
}

function onBuilt(key) {
  showBanner(t('built', { name: t(key) }), 'warn');
  sfx.fanfare();
  player.applyMods(runnerMods(save));
  setupRunnerHud();
  persist();
}

function onProduce(type, n, x, z) {
  save.res[type] += n;
  made[type] += n;
  fx.number(x, 2.6, z, '+' + n + ICON[type], 'gain');
  refreshRes(type);
}

function openRoster(tab) {
  popup.hide();
  fromPause = state === 'pause';
  setState('council');
  council.open('roster', [], tab);
}

/** Melee/area hits on breakable walls and trees. */
function hitStatic(x, z, radius, dmg) {
  let any = false;
  for (const c of maze.cracks) {
    if (!c.alive || Math.hypot(c.x - x, c.z - z) > radius + 1.3) continue;
    any = true;
    if (world.damageCrack(c, dmg)) { sfx.crateBreak(); shake(0.35); }
    else sfx.wall();
  }
  if (world.inGlade(x, z)) for (const tr of glade.trees) {
    if (!tr.alive || Math.hypot(tr.x - x, tr.z - z) > radius + 0.7) continue;
    any = true;
    glade.chopHit(tr, 'player');
    sfx.crateHit();
  }
  return any;
}

// ---------------- combat glue ----------------
function tryFire(f) {
  if (!player.canFire()) { if (f && !f.held && !player.dead) sfx.click(); return; }
  let dir = null;
  if (f.mouse) dir = mouseAimDir();
  else if (!f.auto) dir = { x: f.x, z: f.z };
  combat.attack(dir);
  lastShot = 0.35;
  task = null;
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
  onWall(x, z, pr) {
    const c = world.crackAt(x + pr.dx * 0.7, z + pr.dz * 0.7);
    if (c && pr.owner === 'player') {
      if (world.damageCrack(c, pr.dmg)) { sfx.crateBreak(); shake(0.35); } else sfx.wall();
      return;
    }
    if (pr.owner === 'player' && world.inGlade(x, z)) {
      const tr = glade.trees.find((tr) => tr.alive && Math.hypot(tr.x - x, tr.z - z) < 1.4);
      if (tr) { glade.chopHit(tr, 'player'); sfx.crateHit(); return; }
    }
    particles.burst(x, 1.1, z, { n: 7, colors: [0xb8b2c8, 0x8a84a0, 0x5bb54c], speed: 3, up: 3, size: 0.17 });
    sfx.wall();
  },
  onCrate(c, pr) { combat.damageCrate(c, pr.dmg); },
  onEnemy(e, pr) { combat.damageEnemy(e, pr.dmg, { x: pr.dx, z: pr.dz }, { knock: pr.owner === 'guard' ? 1 : 2.5 }, pr.owner === 'player'); },
  onLand(pr) { if (pr.type === 'net') combat.netLanded(pr); },
};

function hurtPlayer(dmg, dir) {
  if (!player.damage(dmg)) return;
  task = null;
  fx.number(player.pos.x, 2.8, player.pos.z, '-' + dmg, 'hurt');
  sfx.hurt();
  shake(0.55);
  vibrate(70);
  hurtFlash = 0.9;
  if (dir) { player.pos.x += dir.x * 1.4; player.pos.z += dir.z * 1.4; world.collide(player.pos, player.r); }
}

function onEnemyKilled(e) {
  if (e.kind === 'grinder') {
    const big = e.type === 'alpha';
    sfx.grinderDie();
    shake(big ? 0.8 : e.type === 'crawler' ? 0.15 : 0.5);
    vibrate(big ? 120 : 50);
    particles.burst(e.pos.x, 1.2, e.pos.z, { n: big ? 60 : e.type === 'crawler' ? 12 : 34, colors: [0x6e6480, 0x948aa6, 0xa9b2c2, 0x5a2a6a, 0x3a3f4f], speed: 8, up: 8, size: big ? 0.5 : 0.38, life: 1 });
    if (e.type === 'crawler') { if (Math.random() < 0.4) pickups.spawn('metal', e.pos.x, e.pos.z, 1); }
    else pickups.spawn('metal', e.pos.x, e.pos.z, big ? 9 : 3 + Math.floor(Math.random() * 3));
    if (big) pickups.spawn('food', e.pos.x, e.pos.z, 4);
    else if (Math.random() < 0.35) pickups.spawn('food', e.pos.x, e.pos.z, 1);
    if (e.type !== 'crawler') { save.kills++; save.stats.grinders++; dayRes.kills++; }
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

function onCollect(type, it) {
  if (it?.safe) { save.res[type]++; made[type]++; }
  else dayRes[type]++;
  combo = comboT > 0 ? combo + 1 : 0;
  comboT = 0.7;
  sfx.pickup(combo);
  particles.burst(player.pos.x, 1.4, player.pos.z, { n: 4, colors: [0xfff3a0, 0xffffff], speed: 2, up: 3, size: 0.12, gravity: 4 });
  refreshRes(type);
}

// ---------------- day flow ----------------
function updateDoors() {
  const L = DAY.length;
  const tClose = L - DAY.closeDur;
  const final = isFinalDay(save);
  if (flags.doorStart == null && dayTime >= DAY.openAt) flags.doorStart = dayTime;
  let open = flags.doorStart == null ? 0 : Math.min(1, (dayTime - flags.doorStart) / DAY.openDur);
  if (!final && dayTime >= tClose) open = Math.min(open, Math.max(0, 1 - (dayTime - tClose) / DAY.closeDur));
  world.setDoors(open);

  const once = (k, fn) => { if (!flags[k]) { flags[k] = true; fn(); } };
  if (flags.doorStart != null) once('open', () => {
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
  if (flags.doorStart == null) return;
  const d = save.day;
  if (!flags.spawned) {
    flags.spawned = true;
    for (let i = 0; i < Math.min(4 + Math.floor(d / 2), 9); i++) enemies.spawnScuttler();
  }
  const f = dayTime / DAY.length;
  const base = Math.min(2 + Math.floor(d / 2), 6), extra = Math.min(3 + d, 11);
  const target = f < 0.07 ? 0 : Math.floor(base + extra * f);
  const big = enemies.list.filter((e) => e.alive && e.kind === 'grinder' && (e.type === 'grinder' || e.type === 'spitter')).length;
  spawnCd -= dt;
  if (big < target && spawnCd <= 0) {
    const type = d >= 2 && Math.random() < 0.3 ? 'spitter' : 'grinder';
    if (enemies.spawnGrinder({ min: 6, type }) && !flags.grinderHint) { flags.grinderHint = true; if (d <= 2) showHint(t('hintGrinders'), 5); }
    spawnCd = 4;
  }
  packCd -= dt;
  if (packCd <= 0 && f > 0.1) {
    packCd = Math.max(22, 42 - d * 2);
    if (enemies.list.filter((e) => e.type === 'crawler' && e.alive).length < 9) enemies.spawnPack(3, { min: 6 });
  }
}

function buildDropMesh() {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6).translate(0, 0.8, 0), new THREE.MeshToonMaterial({ color: 0xf2c14e }));
  crate.add(new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.75, 1.75).translate(0, 0.8, 0), new THREE.MeshBasicMaterial({ color: 0x1d1426, side: THREE.BackSide })));
  const chute = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xff7a3d }));
  chute.position.y = 5;
  chute.name = 'chute';
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 40, 12, 1, true).translate(0, 20, 0), new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.name = 'beam';
  g.add(crate, chute, beam);
  return g;
}

function updateMazeFeatures(dt) {
  const inside = world.inGlade(player.pos.x, player.pos.z);
  const sec = world.sectorAt(player.pos.x, player.pos.z);
  if (sec !== flags.sector) {
    flags.sector = sec;
    if (sec !== 255 && !player.dead) {
      const th = THEMES[maze.order[sec]];
      showBanner(t('sector', { n: sec + 1, name: tn(th.name) }), '', true);
    }
  }
  const th = world.themeAt(player.pos.x, player.pos.z);
  darkK += ((th?.dark ? 1 : 0) - darkK) * Math.min(1, dt * 2);

  const fl = world.flagAt(player.pos.x, player.pos.z);
  player.slow = fl & 1 ? 0.62 : 1;
  const moving = Math.hypot(player.vel.x, player.vel.z) > 2;
  if (fl & 1 && moving && Math.random() < 0.35) particles.burst(player.pos.x, 0.2, player.pos.z, { n: 2, colors: [0x9ae0f5, 0xffffff], speed: 1.5, up: 2.5, size: 0.12, life: 0.4 });
  player.hidden = !!(fl & 2) && player.lastAttack > 1.2;

  // Traps hurt everyone — lure Grinders into them!
  hazardCd -= dt;
  const tx = worldToTile(player.pos.x), tz = worldToTile(player.pos.z);
  if (hazardCd <= 0 && !player.dead && world.spikeState(tx, tz) === 'up') { hurtPlayer(550); hazardCd = 0.8; }
  for (const v of world.vents) {
    if (v.state !== 'burst') continue;
    const d = dist(v, player.pos);
    if (d < 1.7 && hazardCd <= 0 && !player.dead) { hurtPlayer(420, { x: (player.pos.x - v.x) / (d || 1), z: (player.pos.z - v.z) / (d || 1) }); hazardCd = 0.8; }
  }
  for (const e of enemies.list) {
    if (!e.alive || e.kind !== 'grinder') continue;
    e.hzCd = (e.hzCd ?? 0) - dt;
    if (e.hzCd > 0) continue;
    if (world.spikeState(worldToTile(e.pos.x), worldToTile(e.pos.z)) === 'up') { combat.damageEnemy(e, 600, null, { stun: 0.4 }, false); e.hzCd = 0.9; continue; }
    for (const v of world.vents) if (v.state === 'burst' && dist(v, e.pos) < 1.8) { combat.damageEnemy(e, 450, null, { stun: 0.3 }, false); e.hzCd = 0.9; break; }
  }

  // Levers open the vault.
  for (const l of world.levers) {
    if (l.pulled || player.dead || dist(l, player.pos) > 1.9) continue;
    world.pullLever(l);
    const n = world.levers.filter((x) => x.pulled).length;
    sfx.click(); sfx.pickup(n * 3);
    showBanner(t('lever', { n }), 'warn');
    if (n === world.levers.length) {
      world.openGate();
      setTimeout(() => { showBanner(t('vaultOpen'), 'warn'); sfx.door(); shake(0.4); }, 600);
    }
  }
  const v = world.vault;
  if (v && !v.open && !flags.vaultHint && dist(v, player.pos) < 9) { flags.vaultHint = true; showHint(t('vaultHint'), 5); }
  if (v && v.open && !v.looted && dist(v, player.pos) < 2.4) {
    v.looted = true;
    const m = lootMul(save);
    pickups.spawn('wood', v.x, v.z, Math.round(7 * m));
    pickups.spawn('metal', v.x, v.z, Math.round(7 * m));
    pickups.spawn('food', v.x, v.z, Math.round(5 * m));
    save.stats.vaults++;
    sfx.fragment(); flash(); shake(0.3);
    particles.burst(v.x, 1.4, v.z, { n: 40, colors: [0xf2c14e, 0xffffff, 0xffe066], speed: 6, up: 7, size: 0.22, life: 1.2 });
  }

  // Shrines
  for (const s of world.shrines) {
    if (s.used || player.dead || dist(s, player.pos) > 1.9) continue;
    world.useShrine(s);
    player.buffs[s.kind] = SHRINES[s.kind].secs;
    showBanner(SHRINES[s.kind].icon + ' ' + t(s.kind), 'warn');
    sfx.superReady();
    particles.burst(s.x, 1.6, s.z, { n: 24, colors: [SHRINES[s.kind].color, 0xffffff], speed: 4, up: 5, size: 0.2, gravity: 2 });
  }

  // Lost glader
  if (stranded && !stranded.done) {
    const n = stranded.npc;
    if (!stranded.following) {
      if (Math.random() < dt * 0.4) n.model.play('cheer', 1.2);
      if (!player.dead && dist(n.pos, player.pos) < 2.4) {
        stranded.following = true;
        n.follower = true;
        showBanner(t('stranded'), 'warn');
        showHint(t('strandedHint'), 4);
        sfx.fanfare();
      }
    } else {
      stranded.retarget -= dt;
      const d = dist(n.pos, player.pos);
      if (d > 18) { n.pos.set(player.pos.x - Math.sin(player.facing) * 1.5, 0, player.pos.z - Math.cos(player.facing) * 1.5); world.collide(n.pos, n.r); }
      if (stranded.retarget <= 0) {
        stranded.retarget = 0.25;
        if (d > 2.4) n.goTo(player.pos.x - (player.pos.x - n.pos.x) / d * 1.6, player.pos.z - (player.pos.z - n.pos.z) / d * 1.6, () => {});
        else n.target = null;
      }
      if (world.inGlade(n.pos.x, n.pos.z)) {
        stranded.done = true;
        n.follower = false;
        n.target = null;
        n.glader.n = save.nextName++;
        save.gladers.push(n.glader);
        save.stats.rescued++;
        n.i = npcs.length;
        npcs.push(n);
        showBanner(t('rescuedG', { name: gladerName(n.glader, getLang()) }), 'warn');
        sfx.fanfare();
        n.model.play('cheer', 1.5);
        persist();
      }
    }
  }

  // Supply drop
  if (drop) {
    if (drop.state === 'pending' && dayTime >= drop.at && phase === 'day' && flags.doorStart != null) {
      const c = enemies.farCell(5, 16);
      if (c) {
        drop = { state: 'falling', x: cellToWorld(c[0]), z: cellToWorld(c[1]), t: 0, mesh: buildDropMesh() };
        scene.add(drop.mesh);
        const s = world.sectorAt(drop.x, drop.z);
        showBanner(t('drop', { n: s + 1 }), 'warn');
        sfx.alarm();
        enemies.spawnPack(3, { cell: c });
      } else drop.at += 10;
    } else if (drop.state === 'falling') {
      drop.t += dt;
      const k = Math.min(1, drop.t / 3);
      drop.mesh.position.set(drop.x, 26 * (1 - k), drop.z);
      drop.mesh.rotation.y = drop.t;
      if (k >= 1) {
        drop.state = 'landed';
        drop.mesh.getObjectByName('chute').visible = false;
        particles.burst(drop.x, 0.4, drop.z, { n: 20, colors: [0xbdb3a3, 0x958b7c], speed: 5, up: 2, size: 0.4, float: true, gravity: 2 });
        if (dist(drop, player.pos) < 20) { shake(0.4); sfx.boom(); }
      }
    } else if (drop.state === 'landed') {
      drop.mesh.getObjectByName('beam').material.opacity = 0.2 + Math.sin(performance.now() / 300) * 0.08;
      if (!player.dead && dist(drop, player.pos) < 2.2) {
        drop.state = 'done';
        scene.remove(drop.mesh);
        const m = lootMul(save);
        pickups.spawn('wood', drop.x, drop.z, Math.round(5 * m));
        pickups.spawn('metal', drop.x, drop.z, Math.round(5 * m));
        pickups.spawn('food', drop.x, drop.z, Math.round(4 * m));
        sfx.fragment(); flash();
        particles.burst(drop.x, 1.2, drop.z, { n: 36, colors: [0xf2c14e, 0xff7a3d, 0xffffff], speed: 6, up: 7, size: 0.25 });
      }
    }
  }

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
    if (alpha?.alive) alpha.wake();
  }
  return inside;
}

function updateTask(dt) {
  if (!task) return;
  const mv = input.readMove();
  if (mv.x || mv.z || player.dead) { task = null; return; }
  if (task.kind === 'chop') {
    const tr = task.tree;
    if (!tr.alive) { task = null; return; }
    player.facing = Math.atan2(tr.x - player.pos.x, tr.z - player.pos.z);
    task.t -= dt;
    if (task.t <= 0) {
      task.t = 0.42;
      player.model.play('throw', 0.3);
      sfx.crateHit();
      shake(0.08);
      if (glade.chopHit(tr, 'player')) task = null;
    }
  }
}

function startNight() {
  phase = 'night';
  phaseTime = 0;
  setNight(true);
  enemies.night = true;
  for (const g of enemies.grinders) { g.speed = 6.9; g.sight = 14; g.alertT = 999; if (g.state === 'patrol') g.state = 'chase'; }
  const n = 3 + Math.min(4, Math.floor(save.day / 2));
  for (let i = 0; i < n; i++) enemies.spawnGrinder({ min: 4, max: 11, alert: 999, type: Math.random() < 0.3 ? 'spitter' : 'grinder' });
  enemies.spawnPack(3, { min: 4, max: 10, alert: 999 });
  showBanner(t('trapped'), 'danger');
  setTimeout(() => { if (phase === 'night') showBanner(t('survive'), 'warn'); }, 2300);
  sfx.boom();
  shake(0.6);
  flags.nightSpawn = 12;
}

const SIEGE_CELLS = [[DOOR_CELL, GLADE_C0 - 1], [DOOR_CELL, GLADE_C1 + 1], [GLADE_C0 - 1, DOOR_CELL], [GLADE_C1 + 1, DOOR_CELL]];

function startSiege() {
  phase = 'siege';
  phaseTime = 0;
  setNight(true);
  enemies.night = true;
  enemies.clear();
  enemies.startSiege(npcs);
  siege = { total: 7 + Math.min(7, Math.floor(save.gladers.length / 2)), spawned: 0, killed: 0, cd: 1 };
  for (const n of npcs) { glade.releaseJob(n); n.setPanic(true); }
  showBanner(t('defend'), 'danger');
  sfx.boom();
}

function updateSiege(dt) {
  siege.cd -= dt;
  if (siege.spawned < siege.total && siege.cd <= 0) {
    const c = SIEGE_CELLS[Math.floor(Math.random() * 4)];
    const g = enemies.spawnGrinder({ cell: c, siege: true, alert: 999, state: 'chase', type: siege.spawned % 4 === 3 ? 'spitter' : 'grinder' });
    if (g) { g.siege = true; siege.spawned++; }
    siege.cd = 2.4;
  }
  for (const n of npcs) {
    if (n.role !== 'guard' || n.taken) continue;
    n.fireT -= dt;
    if (n.fireT > 0) continue;
    let best = null, bd = 13 * 13;
    for (const e of enemies.list) {
      if (!e.alive) continue;
      const d2 = (e.pos.x - n.pos.x) ** 2 + (e.pos.z - n.pos.z) ** 2;
      if (d2 < bd && world.lineOfSight(n.pos.x, n.pos.z, e.pos.x, e.pos.z)) { bd = d2; best = e; }
    }
    n.fireT = 1.2;
    if (!best) continue;
    const dx = best.pos.x - n.pos.x, dz = best.pos.z - n.pos.z, l = Math.hypot(dx, dz);
    n.facing = Math.atan2(dx, dz);
    n.model.play('throw', 0.3);
    projectiles.fire(n.pos.x, n.pos.z, { x: dx / l, z: dz / l }, { type: 'spear', dmg: 420, range: 14, owner: 'guard' });
  }
  if (siege.spawned >= siege.total && siege.killed >= siege.total && !enemies.grinders.some((g) => g.state !== 'carry')) startEscape();
}

function startEscape() {
  phase = 'escape';
  enemies.siegeTargets = null;
  for (const n of npcs) n.setPanic(false);
  showBanner(t('toHole'), 'warn');
  sfx.fanfare();
  for (let i = 0; i < 5; i++) enemies.spawnGrinder({ min: 5, type: i % 3 === 2 ? 'spitter' : 'grinder' });
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
    flags.holdSpawn = 3.2;
    const [hx, hy] = nav.cellOf(world.hole.x, world.hole.z);
    const opts = [];
    for (let y = hy - 4; y <= hy + 4; y++) for (let x = hx - 4; x <= hx + 4; x++) if (x >= 0 && y >= 0 && x < CELLS && y < CELLS && Math.abs(x - hx) + Math.abs(y - hy) >= 3 && !inGladeCell(x, y)) opts.push([x, y]);
    if (opts.length) {
      const c = opts[Math.floor(Math.random() * opts.length)];
      if (Math.random() < 0.3) enemies.spawnPack(3, { cell: c, alert: 999, state: 'chase' });
      else enemies.spawnGrinder({ cell: c, alert: 999, state: 'chase' });
    }
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
    applyDaylight(1.2);
    flags.nightSpawn -= dt;
    if (flags.nightSpawn <= 0) { flags.nightSpawn = 14; enemies.spawnGrinder({ min: 5, max: 10, alert: 999 }); }
  } else if (phase === 'siege') {
    applyDaylight(1.05);
    updateSiege(dt);
  } else if (phase === 'escape' || phase === 'hold') {
    applyDaylight(1.05);
    updateEscape(dt);
  }

  const tap = input.takeTap();
  if (tap) handleTap(tap);
  if (!input.mouse.down) flags.mouseBlock = false;

  const move = player.dead ? { x: 0, z: 0 } : input.readMove();
  if (move.x || move.z) popup.open && dist(player.pos, popup.anchor) > 7 && popup.hide();
  let aimDir = null;
  if (input.aim.active) aimDir = input.aim;
  else if (input.mode === 'mouse' && ((input.mouse.down && !flags.mouseBlock) || lastShot > 0)) aimDir = mouseAimDir();
  doorMercy();
  player.update(dt, move, lastShot > 0 && !aimDir ? { x: Math.sin(player.facing), z: Math.cos(player.facing) } : aimDir, world);
  doorMercy();
  lastShot = Math.max(0, lastShot - dt);
  updateTask(dt);

  if (input.takeSuper()) trySuper();
  const fire = input.takeFire();
  if (fire && !(fire.mouse && flags.mouseBlock)) tryFire(fire);
  else if (input.mode === 'mouse' && input.mouse.down && !flags.mouseBlock && player.canFire()) tryFire({ mouse: true, held: true });

  const guideDir = input.aim.active ? input.aim : (input.mode === 'mouse' && input.mouse.inside && !world.inGlade(player.pos.x, player.pos.z) ? mouseAimDir() : null);
  aimGuide.visible = !!guideDir && !player.dead;
  if (guideDir) {
    const a = player.def.attack;
    aimGuide.position.set(player.pos.x, 0.06, player.pos.z);
    aimGuide.rotation.y = Math.atan2(guideDir.x, guideDir.z);
    aimGuide.scale.set(a.kind === 'slash' ? 2.2 : a.kind === 'spread' ? 1.8 : 1, 1, a.range);
    aimGuide.material.opacity = input.aim.active ? 0.85 : 0.35;
  }
  tapMark.material.opacity = Math.max(0, tapMark.material.opacity - dt * 1.8);
  tapMark.scale.setScalar(Math.max(0.6, tapMark.scale.x - dt));

  combat.update(dt);
  projectiles.update(dt, projectileHooks);
  crates.update(dt);
  enemies.update(dt);
  pickups.update(dt, player, world, onCollect);
  comboT = Math.max(0, comboT - dt);
  minimap.reveal(player.pos.x, player.pos.z, 6 + save.buildings.tower * 2);
  if (stranded && !stranded.done) stranded.npc.update(dt, world);

  const inside = updateMazeFeatures(dt);
  if (phase === 'day' && inside && flags.out && flags.warn && !flags.home) { flags.home = true; showBanner(t('backHome')); sfx.fanfare(); }
  if (!inside) flags.out = true;

  if (save.day === 1 && phase === 'day' && flags.doorStart != null) {
    const since = dayTime - flags.doorStart;
    if (since > 14 && !flags.h1) { flags.h1 = true; showHint(t('hintCrates'), 4); }
    if (since > 36 && !flags.h2) { flags.h2 = true; showHint(t('hintCode'), 5); }
  }
  if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('#hint').classList.remove('show'); }
  bannerBusy = Math.max(0, bannerBusy - dt);

  let mood = inside ? 'glade' : 'maze';
  if (phase === 'night') mood = 'night';
  else if (phase === 'siege' || phase === 'hold') mood = 'siege';
  else if (enemies.list.some((e) => e.kind === 'grinder' && e.alive && e.state !== 'patrol' && e.state !== 'sleep' && dist(e.pos, player.pos) < 20)) mood = 'chase';
  music.setMood(mood);

  if (player.dead) {
    deathT += dt;
    if (deathT === dt) { sfx.sad(); shake(0.8); }
    if (deathT > 1.2) {
      if (rescuesLeft > 0) {
        rescuesLeft--;
        player.revive(0.5);
        deathT = 0;
        sfx.heal();
        showBanner(t('rescued'), 'warn');
        particles.burst(player.pos.x, 1.2, player.pos.z, { n: 20, colors: [0x7dff8a, 0xffffff], speed: 3, up: 5, size: 0.2, gravity: 3 });
      } else endDay('fallen');
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
  if (s !== 'play') popup.hide();
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

// ---------------- mid-day autosave ----------------
const bits = (arr, f) => arr.map((x) => (f(x) ? '1' : '0')).join('');

/** Everything needed to drop the player back into today's maze. */
function snapshot() {
  if (phase !== 'day' || player.dead || !world) return save.midday ?? null;
  return {
    day: save.day,
    t: dayTime,
    doorStart: flags.doorStart ?? null,
    p: [player.pos.x, player.pos.z],
    hp: player.hp / player.maxHp,
    dayRes: { ...dayRes },
    made: { ...made },
    crates: bits(crates.items, (c) => !c.alive),
    cracks: bits(maze.cracks, (c) => !c.alive),
    frag: !!world.fragment?.taken,
    levers: bits(world.levers, (l) => l.pulled),
    looted: !!world.vault?.looted,
    shrines: bits(world.shrines, (s) => s.used),
    stranded: stranded ? (stranded.done ? 'done' : stranded.following ? 'follow' : 'wait') : null,
    drop: drop ? { state: drop.state, at: drop.at, x: drop.x, z: drop.z } : null,
    alphaDead: !!alpha && !alpha.alive,
    rescues: rescuesLeft,
    hints: [!!flags.h1, !!flags.h2, !!flags.vaultHint],
  };
}

let autosaveT = 0;
function autosave() {
  if (!world || !['play', 'pause', 'map', 'council'].includes(state)) return;
  save.midday = snapshot();
  persist();
}

function restoreSnapshot(m) {
  dayTime = m.t;
  flags.doorStart = m.doorStart;
  if (m.doorStart != null) flags.open = true;
  flags.warn = dayTime >= DAY.length - DAY.closeDur - DAY.warnLeft;
  [flags.h1, flags.h2, flags.vaultHint] = m.hints ?? [true, true, true];
  player.pos.set(m.p[0], 0, m.p[1]);
  world.collide(player.pos, player.r);
  player.hp = Math.max(1, player.maxHp * (m.hp ?? 1));
  dayRes = { ...dayRes, ...m.dayRes };
  made = { ...made, ...m.made };
  rescuesLeft = m.rescues ?? rescuesLeft;
  crates.items.forEach((c, i) => { if (m.crates?.[i] === '1') { c.alive = false; c.collider.alive = false; crates.writeMatrix(c); } });
  maze.cracks.forEach((c, i) => { if (m.cracks?.[i] === '1') world.damageCrack(c, 1e9); });
  if (m.frag) world.takeFragment();
  world.levers.forEach((l, i) => { if (m.levers?.[i] === '1') world.pullLever(l); });
  if (world.levers.length && world.levers.every((l) => l.pulled)) world.openGate();
  if (m.looted && world.vault) world.vault.looted = true;
  world.shrines.forEach((s, i) => { if (m.shrines?.[i] === '1') world.useShrine(s); });
  if (stranded && m.stranded !== 'wait') {
    if (m.stranded === 'follow') {
      stranded.following = true;
      stranded.npc.follower = true;
      stranded.npc.pos.set(player.pos.x + 1.2, 0, player.pos.z);
    } else { stranded.npc.dispose(); stranded = null; }
  }
  if (m.drop && drop) {
    if (m.drop.state === 'pending') drop.at = m.drop.at;
    else if (m.drop.state === 'done' || m.drop.state === 'falling' && !m.drop.x) drop.state = 'done';
    else {
      drop = { state: 'landed', x: m.drop.x, z: m.drop.z, t: 3, mesh: buildDropMesh() };
      drop.mesh.position.set(drop.x, 0, drop.z);
      drop.mesh.getObjectByName('chute').visible = false;
      scene.add(drop.mesh);
    }
  }
  if (m.alphaDead && alpha) { alpha.alive = false; alpha.dispose(); }
  applyDaylight(Math.min(1, dayTime / DAY.length));
  cam.look.copy(player.pos);
  cam.pos.copy(player.pos).add(offset);
  refreshRes();
}

function toMorning() {
  const resume = save.midday && save.midday.day === save.day ? save.midday : null;
  prepareDay();
  setState('play');
  if (resume) {
    restoreSnapshot(resume);
    showBanner(t('welcomeBack', { n: save.day }));
    sfx.fanfare();
    music.setMood(world.inGlade(player.pos.x, player.pos.z) ? 'glade' : 'maze');
    return;
  }
  delete save.midday;
  showBanner(isFinalDay(save) ? t('finalMorning') : t('morningBanner', { n: save.day }));
  sfx.fanfare();
  music.setMood('glade');
  showHint(save.day === 1 ? t('morningHint') : t('shifted'), save.day === 1 ? 8 : 3.5);
  // New arrivals climb out of the Box.
  let delay = 600;
  for (const n of npcs) {
    if (!n.glader.fresh) continue;
    delete n.glader.fresh;
    n.pos.set(0, 0, 0);
    setTimeout(() => {
      particles.burst(0, 0.5, 0, { n: 24, colors: [0xffd23f, 0xffffff, 0x6fd6ff], speed: 4, up: 6, size: 0.22 });
      n.model.play('cheer', 1.4);
      showBanner(t('arrived', { name: gladerName(n.glader, getLang()) }), 'warn');
      sfx.fanfare();
    }, delay);
    delay += 2500;
  }
  persist();
}

function endDay(outcome) {
  task = null;
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
  // Settle the day right away so closing the game on this screen loses nothing.
  const lines = [...takenLines, ...resolveDay(save, dayRes, outcome, made)];
  delete save.midday;
  persist();
  resultNext = () => {
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
window.addEventListener('pagehide', () => autosave());
$('#btn-menu').addEventListener('click', () => { sfx.click(); autosave(); prepareDay(); refreshMenu(); setState('menu'); music.setMood('menu'); });
$('#btn-p-gladers').addEventListener('click', () => openRoster('gladers'));
$('#btn-p-runner').addEventListener('click', () => openRoster('runner'));
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
    if (state === 'play') { if (popup.open) popup.hide(); else setState('pause'); }
    else if (state === 'pause' || state === 'map') setState('play');
  } else if (code === 'KeyM') {
    if (state === 'play') openMap();
    else if (state === 'map') setState('play');
  } else if (code === 'Enter' && state === 'menu') startGame();
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    autosave();
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
  if (state === 'play') {
    updatePlay(dt);
    autosaveT += dt;
    if (autosaveT > 5) { autosaveT = 0; autosave(); }
  }
  const live = state === 'play' || state === 'menu' || state === 'council' || state === 'result';
  if (live) {
    const shiftWarn = world.update(dt);
    if (state === 'play' && shiftWarn.length) {
      const near = shiftWarn.some((s) => Math.hypot(tileX(s) - player.pos.x, tileZ(s) - player.pos.z) < 20);
      if (near && (flags.shiftMsgT ?? -99) < dayTime - 20) { flags.shiftMsgT = dayTime; showBanner(t('shiftWarn'), 'warn', true); sfx.door(); }
    }
    glade.update(dt, { player, npcs, active: state === 'play' && phase === 'day' });
    for (const n of npcs) n.update(dt, world);
    particles.update(dt);
    const ch = glade.chimney;
    if (ch && (smokeT -= dt) <= 0) {
      smokeT = 0.35;
      particles.burst(ch.x, ch.y, ch.z, { n: 1, colors: [0x9a96a6, 0x7a7686], speed: 0.4, up: 1.5, size: 0.55, gravity: -0.6, life: 2.2, float: true });
      if (glade.kitchenSteam) particles.burst(glade.kitchenSteam.x, 1.2, glade.kitchenSteam.z, { n: 1, colors: [0xffffff, 0xe8e8f0], speed: 0.3, up: 1.2, size: 0.35, gravity: -0.5, life: 1.4, float: true });
    }
  }
  if (state !== 'play') applyDaylight(state === 'menu' ? 0.3 : lightF);
  if (state !== 'play' && live) {
    if (state !== 'result') player.update(dt, { x: 0, z: 0 }, null, world);
    else player.model.update(dt, 0);
  }
  if (state === 'play') finalizeLighting();
  else { darkK = state === 'menu' ? 0 : darkK; finalizeLighting(); }
  updateCamera(dt);
  if (state === 'play') updateHud(dt);
}
const tileX = (s) => tileToWorld(s.tiles[0][0]);
const tileZ = (s) => tileToWorld(s.tiles[0][1]);

if (DEBUG) {
  window.gr = {
    player, input, scene, sun, hemi, renderer, camera, enemies, combat, popup,
    get save() { return save; }, set save(v) { save = v; },
    get world() { return world; }, get glade() { return glade; }, get crates() { return crates; }, get maze() { return maze; },
    get state() { return state; }, get phase() { return phase; }, get npcs() { return npcs; }, get stranded() { return stranded; }, get drop() { return drop; },
    setTime: (s) => { dayTime = s; },
    openDoors: () => { flags.doorStart = dayTime; },
    tp: (x, z) => { player.pos.set(x, 0, z); },
    tap: (x, z) => { const t2 = findTarget(x, z); if (t2) interact(t2); return t2?.kind; },
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
