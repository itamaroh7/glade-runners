import { BUILDINGS, BEDS, NAMES, randomLook, RUNNERS, RUNNER_ORDER } from './data.js';
import { rng } from './maze.js';

export const SAVE_VERSION = 2;
export const FRAGMENTS_NEEDED = 6;

export function newSave(settings) {
  const seed = Math.floor(Math.random() * 1e6);
  const R = rng(seed);
  const roles = ['farmer', 'farmer', 'woodcutter', 'medic', 'guard'];
  return {
    v: SAVE_VERSION,
    day: 1,
    seed,
    res: { food: 12, wood: 8, metal: 2 },
    gladers: roles.map((role, n) => ({ n, look: randomLook(R), role })),
    nextName: roles.length,
    buildings: { fields: 2, homestead: 1, tower: 0, forge: 0 },
    runner: 'theo',
    unlocked: ['theo'],
    fragments: 0,
    kills: 0,
    stats: { crates: 0, grinders: 0, nights: 0, falls: 0, taken: 0 },
    hungry: false,
    seenIntro: false,
    won: false,
    settings: settings ?? { music: true, sfx: true },
  };
}

export const gladerName = (g, lang) => NAMES[g.n % NAMES.length][lang === 'he' ? 1 : 0];
export const beds = (s) => BEDS[s.buildings.homestead];
export const fieldSlots = (s) => s.buildings.fields * 2;
export const roleCount = (s, role) => s.gladers.filter((g) => g.role === role).length;
export const isFinalDay = (s) => s.fragments >= FRAGMENTS_NEEDED;

export function forecast(s) {
  const farmers = roleCount(s, 'farmer');
  const slots = fieldSlots(s);
  const half = s.hungry ? 0.5 : 1;
  const food = Math.floor((Math.min(farmers, slots) * 3 + Math.max(0, farmers - slots)) * half);
  const wood = Math.floor(roleCount(s, 'woodcutter') * 2 * half);
  const metal = s.buildings.forge > 0 ? Math.floor(roleCount(s, 'smith') * half) : 0;
  const eat = s.gladers.length + 1;
  return { food, wood, metal, eat };
}

export function runnerMods(s) {
  const f = s.buildings.forge;
  return {
    dmgMul: f >= 1 ? 1.2 : 1,
    reloadMul: f >= 2 ? 0.8 : 1,
    ammoBonus: f >= 3 ? 1 : 0,
    hpMul: 1 + Math.min(3, roleCount(s, 'medic')) * 0.1 - (s.hungry ? 0.15 : 0),
  };
}

export function buildCost(s, key) {
  const lvl = s.buildings[key];
  return BUILDINGS[key].cost[lvl + 1] ?? null;
}

export function canAfford(s, cost) {
  return !!cost && Object.entries(cost).every(([k, v]) => s.res[k] >= v);
}

export function build(s, key) {
  const cost = buildCost(s, key);
  if (!canAfford(s, cost)) return false;
  for (const [k, v] of Object.entries(cost)) s.res[k] -= v;
  s.buildings[key]++;
  return true;
}

export function setRole(s, role, delta) {
  if (delta > 0) {
    if (role === 'smith' && s.buildings.forge < 1) return false;
    const idle = s.gladers.find((g) => g.role === 'idle');
    if (!idle) return false;
    idle.role = role;
  } else {
    const g = [...s.gladers].reverse().find((x) => x.role === role);
    if (!g) return false;
    g.role = 'idle';
  }
  return true;
}

export function checkUnlocks(s) {
  const fresh = [];
  for (const id of RUNNER_ORDER) {
    if (s.unlocked.includes(id)) continue;
    const u = RUNNERS[id].unlock;
    if (!u) continue;
    if ((u.day && s.day >= u.day) || (u.kills && s.kills >= u.kills) || (u.fragments && s.fragments >= u.fragments)) {
      s.unlocked.push(id);
      fresh.push(id);
    }
  }
  return fresh;
}

/**
 * End-of-day bookkeeping. outcome: 'home' | 'night' | 'fallen'.
 * Returns report lines: { icon, key, vars, tone } for the UI to translate.
 */
export function resolveDay(s, dayRes, outcome) {
  const lines = [];
  const R = rng(s.seed + s.day * 31);
  if (outcome === 'fallen') {
    s.stats.falls++;
    if (dayRes.food + dayRes.wood + dayRes.metal > 0 || dayRes.fragment) lines.push({ icon: '💀', key: 'rLost', tone: 'bad' });
  } else {
    for (const k of ['food', 'wood', 'metal']) s.res[k] += dayRes[k];
    if (dayRes.fragment) s.fragments++;
    if (outcome === 'night') {
      s.stats.nights++;
      s.res.metal += 6;
      lines.push({ icon: '🌙', key: 'rNight', vars: { m: 6 }, tone: 'good' });
    }
  }

  const f = forecast(s);
  if (f.food) lines.push({ icon: '🌾', key: 'rFarm', vars: { n: f.food }, tone: 'good' });
  if (f.wood) lines.push({ icon: '🪓', key: 'rWood', vars: { n: f.wood }, tone: 'good' });
  if (f.metal) lines.push({ icon: '🔨', key: 'rSmith', vars: { n: f.metal }, tone: 'good' });
  s.res.food += f.food;
  s.res.wood += f.wood;
  s.res.metal += f.metal;

  // The Box: supplies every third day, a new glader every second day.
  const next = s.day + 1;
  if (next % 3 === 0) {
    s.res.food += 5;
    s.res.wood += 3;
    lines.push({ icon: '📦', key: 'rSupplies', tone: 'good' });
  }

  if (s.res.food >= f.eat) {
    s.res.food -= f.eat;
    s.hungry = false;
    lines.push({ icon: '🍲', key: 'rAte', vars: { n: f.eat }, tone: '' });
  } else {
    s.res.food = 0;
    s.hungry = true;
    lines.push({ icon: '⚠️', key: 'rHungry', tone: 'bad' });
  }

  if (next % 2 === 0 && s.gladers.length < beds(s)) {
    const g = { n: s.nextName++, look: randomLook(R), role: 'idle' };
    s.gladers.push(g);
    lines.push({ icon: '🆕', key: 'rNewGlader', vars: { glader: g }, tone: 'good' });
  } else if (next % 2 === 0) {
    lines.push({ icon: '🛏️', key: 'rNoBeds', tone: 'bad' });
  }

  s.day = next;
  for (const id of checkUnlocks(s)) lines.push({ icon: '⭐', key: 'rUnlocked', vars: { runner: id }, tone: 'good' });
  if (isFinalDay(s) && outcome !== 'fallen' && dayRes.fragment) lines.push({ icon: '🔓', key: 'rCodeDone', tone: 'good' });
  return lines;
}
