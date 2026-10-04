import { BUILDINGS, BEDS, NAMES, ROLES, randomLook, RUNNERS, RUNNER_ORDER } from './data.js';
import { rng } from './maze.js';
import { ensureGladeState, overnightGlade } from './glade.js';

export const SAVE_VERSION = 3;
export const FRAGMENTS_NEEDED = 6;
export const EAT_PER_HEAD = 2;

export function newSave(settings) {
  const seed = Math.floor(Math.random() * 1e6);
  const R = rng(seed);
  const roles = ['farmer', 'farmer', 'woodcutter', 'builder', 'medic'];
  const s = {
    v: SAVE_VERSION,
    day: 1,
    seed,
    res: { food: 22, wood: 14, metal: 4 },
    gladers: roles.map((role, n) => ({ n, look: randomLook(R), role })),
    nextName: roles.length,
    runner: 'theo',
    unlocked: ['theo'],
    fragments: 0,
    kills: 0,
    stats: { crates: 0, grinders: 0, nights: 0, falls: 0, taken: 0, rescued: 0, vaults: 0 },
    hungry: false,
    seenIntro: false,
    won: false,
    settings: settings ?? { music: true, sfx: true },
  };
  ensureGladeState(s);
  return s;
}

/**
 * Bring any older save up to date instead of throwing it away: keep what the
 * player earned and fill anything new with defaults.
 */
export function migrateSave(s) {
  if (!s || typeof s !== 'object' || !s.seed) return null;
  const base = newSave(s.settings);
  const out = { ...base, ...s };
  for (const k of ['res', 'stats', 'settings']) out[k] = { ...base[k], ...(s[k] ?? {}) };
  for (const k of ['food', 'wood', 'metal']) out.res[k] = Math.max(0, Math.floor(Number(out.res[k]) || 0));
  out.day = Math.max(1, Math.floor(Number(out.day) || 1));
  if (!Array.isArray(out.gladers) || !out.gladers.length) out.gladers = base.gladers;
  out.gladers = out.gladers.filter((g) => g && g.look).map((g) => ({ ...g, role: ROLES[g.role] ? g.role : 'idle' }));
  out.nextName = Math.max(out.nextName ?? 0, ...out.gladers.map((g) => (g.n ?? 0) + 1));
  if (!Array.isArray(out.unlocked)) out.unlocked = ['theo'];
  out.unlocked = out.unlocked.filter((id) => RUNNERS[id]);
  if (!out.unlocked.includes('theo')) out.unlocked.unshift('theo');
  if (!out.unlocked.includes(out.runner)) out.runner = 'theo';
  out.fragments = Math.min(FRAGMENTS_NEEDED, Math.max(0, Number(out.fragments) || 0));
  ensureGladeState(out);
  for (const [k, def] of Object.entries(BUILDINGS)) out.buildings[k] = Math.min(def.max, Math.max(def.start, Math.floor(Number(out.buildings[k]) || 0)));
  for (const k of Object.keys(out.construction)) if (!BUILDINGS[k]) delete out.construction[k];
  out.v = SAVE_VERSION;
  return out;
}

export const gladerName = (g, lang) => NAMES[g.n % NAMES.length][lang === 'he' ? 1 : 0];
export const beds = (s) => BEDS[s.buildings.homestead];
export const roleCount = (s, role) => s.gladers.filter((g) => g.role === role).length;
export const isFinalDay = (s) => s.fragments >= FRAGMENTS_NEEDED;
export const rescues = (s) => (roleCount(s, 'medic') > 0 ? 1 : 0) + s.buildings.infirmary;

export function runnerMods(s) {
  const b = s.buildings;
  return {
    dmgMul: b.forge >= 1 ? 1.2 : 1,
    reloadMul: b.forge >= 2 ? 0.8 : 1,
    ammoBonus: b.forge >= 3 ? 1 : 0,
    hpMul: 1 + Math.min(3, roleCount(s, 'medic')) * 0.1 - (s.hungry ? 0.15 : 0),
    regenMul: b.infirmary >= 1 ? 1.6 : 1,
    superMul: b.workshop >= 2 ? 1.35 : 1,
  };
}

export const lootMul = (s) => (s.buildings.workshop >= 1 ? 1.5 : 1);

export function buildCost(s, key) {
  return BUILDINGS[key].cost[s.buildings[key] + 1] ?? null;
}

export function canAfford(s, cost) {
  return !!cost && Object.entries(cost).every(([k, v]) => s.res[k] >= v);
}

export function pay(s, cost) {
  if (!canAfford(s, cost)) return false;
  for (const [k, v] of Object.entries(cost)) s.res[k] -= v;
  return true;
}

export function setRole(s, glader, role) {
  if (role === 'smith' && s.buildings.forge < 1) return false;
  glader.role = role;
  return true;
}

export function shiftRole(s, role, delta) {
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
 * End-of-day bookkeeping. outcome: 'home' | 'night' | 'fallen'. made: what the Glade produced today.
 * Returns report lines: { icon, key, vars, tone } for the UI to translate.
 */
export function resolveDay(s, dayRes, outcome, made) {
  const lines = [];
  const R = rng(s.seed + s.day * 31);
  if (outcome === 'fallen') {
    s.stats.falls++;
    if (dayRes.food + dayRes.wood + dayRes.metal > 0 || dayRes.fragment) lines.push({ icon: '💀', key: 'rLost', tone: 'bad' });
  } else {
    for (const k of ['food', 'wood', 'metal']) s.res[k] += dayRes[k];
    if (dayRes.fragment) s.fragments++;
    if (dayRes.food + dayRes.wood + dayRes.metal > 0) lines.push({ icon: '🎒', key: 'rBrought', vars: { f: dayRes.food, w: dayRes.wood, m: dayRes.metal }, tone: 'good' });
    if (outcome === 'night') {
      s.stats.nights++;
      s.res.metal += 6;
      lines.push({ icon: '🌙', key: 'rNight', vars: { m: 6 }, tone: 'good' });
    }
  }
  if (made.food + made.wood + made.metal > 0) lines.push({ icon: '🏡', key: 'rMade', vars: { f: made.food, w: made.wood, m: made.metal }, tone: 'good' });

  const next = s.day + 1;
  if (next % 3 === 0) {
    s.res.food += 5;
    s.res.wood += 4;
    lines.push({ icon: '📦', key: 'rSupplies', tone: 'good' });
  }

  const eat = (s.gladers.length + 1) * EAT_PER_HEAD;
  if (s.res.food >= eat) {
    s.res.food -= eat;
    s.hungry = false;
    lines.push({ icon: '🍲', key: 'rAte', vars: { n: eat }, tone: '' });
  } else {
    s.res.food = 0;
    s.hungry = true;
    lines.push({ icon: '⚠️', key: 'rHungry', tone: 'bad' });
  }

  if (next % 2 === 0 && s.gladers.length < beds(s)) {
    const g = { n: s.nextName++, look: randomLook(R), role: 'idle', fresh: true };
    s.gladers.push(g);
    lines.push({ icon: '🆕', key: 'rNewGlader', vars: { glader: g }, tone: 'good' });
  } else if (next % 2 === 0) {
    lines.push({ icon: '🛏️', key: 'rNoBeds', tone: 'bad' });
  }

  overnightGlade(s);
  s.day = next;
  for (const id of checkUnlocks(s)) lines.push({ icon: '⭐', key: 'rUnlocked', vars: { runner: id }, tone: 'good' });
  if (isFinalDay(s) && outcome !== 'fallen' && dayRes.fragment) lines.push({ icon: '🔓', key: 'rCodeDone', tone: 'good' });
  return lines;
}
