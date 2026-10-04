// Game content & balance. Names are original, only loosely inspired by the books.

export const RUNNERS = {
  theo: {
    name: { en: 'Theo', he: 'תיאו' },
    look: { skin: 0xf0c49c, hair: 0x5b3a22, hairStyle: 'messy', shirt: 0x7d95b2, pants: 0x8c7a58, pack: 0x6b5536 },
    weapon: 'spear',
    hp: 3200, speed: 7.4,
    attack: { kind: 'throw', proj: 'spear', dmg: 650, range: 11.5, ammo: 3, reload: 1.15, cooldown: 0.26 },
    superKind: 'dash', superCost: 2600,
    unlock: null,
  },
  minjae: {
    name: { en: 'Minjae', he: 'מינג׳ה' },
    look: { skin: 0xe9c29a, hair: 0x15121a, hairStyle: 'spiky', shirt: 0x34495e, pants: 0x2c2c36, pack: 0x4a3a2a, torso: [0.94, 1, 0.9] },
    weapon: 'machete',
    hp: 3000, speed: 8.3,
    attack: { kind: 'slash', dmg: 950, range: 3.4, arc: 1.9, ammo: 3, reload: 0.95, cooldown: 0.3 },
    superKind: 'whirl', superCost: 2800,
    unlock: { day: 2 },
  },
  nate: {
    name: { en: 'Nate', he: 'נייט' },
    look: { skin: 0xf5d2b0, hair: 0xe0be6a, hairStyle: 'shaggy', shirt: 0x6f8f5a, pants: 0x6a5a48, pack: 0x7a5a3a },
    weapon: 'sling',
    hp: 3500, speed: 7.0,
    attack: { kind: 'spread', proj: 'stone', dmg: 340, range: 9.5, count: 3, spread: 0.26, ammo: 3, reload: 1.1, cooldown: 0.3 },
    superKind: 'net', superCost: 2600,
    unlock: { day: 4 },
  },
  garrick: {
    name: { en: 'Garrick', he: 'גאריק' },
    look: { skin: 0xe2b48c, hair: 0x8a6a3a, hairStyle: 'buzz', shirt: 0x9a4a30, pants: 0x4d4238, pack: 0x5a4430, torso: [1.22, 1.05, 1.1] },
    weapon: 'club',
    hp: 5000, speed: 6.7,
    attack: { kind: 'slash', dmg: 1150, range: 2.9, arc: 2.2, ammo: 2, reload: 1.3, cooldown: 0.45, knock: 6 },
    superKind: 'slam', superCost: 3000,
    unlock: { kills: 1 },
  },
  tessa: {
    name: { en: 'Tessa', he: 'טסה' },
    look: { skin: 0xf6dccb, hair: 0x1c1418, hairStyle: 'long', shirt: 0xdbe6f2, pants: 0x394052, pack: 0x5a6070 },
    weapon: 'dart',
    hp: 2800, speed: 7.8,
    attack: { kind: 'burst', proj: 'dart', dmg: 380, range: 12.5, count: 2, ammo: 3, reload: 1.0, cooldown: 0.28 },
    superKind: 'recall', superCost: 2400,
    unlock: { fragments: 3 },
  },
};
export const RUNNER_ORDER = ['theo', 'minjae', 'nate', 'garrick', 'tessa'];

export const ROLES = {
  farmer: { icon: '🌾' },
  woodcutter: { icon: '🪓' },
  builder: { icon: '🔨' },
  smith: { icon: '⚒️', needs: 'forge' },
  medic: { icon: '✚' },
  guard: { icon: '🛡️' },
};
export const ROLE_ORDER = ['farmer', 'woodcutter', 'builder', 'smith', 'medic', 'guard'];

// Every building has a fixed spot in the Glade. Level 0 = an empty building site.
export const BUILDINGS = {
  homestead: { icon: '🏠', max: 3, start: 1, cost: { 2: { wood: 30, metal: 6 }, 3: { wood: 55, metal: 18 } }, work: 1.4 },
  fields: { icon: '🌱', max: 5, start: 1, cost: { 2: { wood: 10 }, 3: { wood: 18 }, 4: { wood: 28, metal: 4 }, 5: { wood: 40, metal: 10 } }, work: 0.5 },
  tower: { icon: '🗼', max: 2, start: 0, cost: { 1: { wood: 20, metal: 6 }, 2: { wood: 36, metal: 16 } }, work: 1 },
  forge: { icon: '⚒️', max: 3, start: 0, cost: { 1: { wood: 16, metal: 10 }, 2: { wood: 30, metal: 20 }, 3: { wood: 45, metal: 34 } }, work: 1.1 },
  kitchen: { icon: '🍲', max: 2, start: 0, cost: { 1: { wood: 18, metal: 4 }, 2: { wood: 32, metal: 12 } }, work: 0.9 },
  infirmary: { icon: '✚', max: 2, start: 0, cost: { 1: { wood: 16, metal: 8 }, 2: { wood: 30, metal: 18 } }, work: 0.9 },
  workshop: { icon: '🧰', max: 2, start: 0, cost: { 1: { wood: 20, metal: 10 }, 2: { wood: 34, metal: 22 } }, work: 1 },
  pen: { icon: '🐔', max: 2, start: 0, cost: { 1: { wood: 22, metal: 4 }, 2: { wood: 36, metal: 10 } }, work: 0.9 },
};
export const BUILD_ORDER = ['homestead', 'fields', 'tower', 'forge', 'kitchen', 'infirmary', 'workshop', 'pen'];
export const BEDS = [0, 8, 12, 16];
export const plotsFor = (fieldsLvl) => 2 + fieldsLvl * 2;

export const GROW_TIME = 110; // seconds for a crop to ripen
export const CHOP_REGROW = 90;

// Maze sectors. The order is shuffled per save, so each save has its own map of sectors.
export const THEMES = [
  {
    id: 'ivy', name: { en: 'Ivy Halls', he: 'אולמות הקיסוס' },
    floor: [0x8f9c80, 0x86947a], wall: { bottom: 0x3f4a3c, top: 0x7f8f78, rim: 0x3f7a35, cap: 0x6db24f }, map: [196, 214, 176],
    ivy: 0.75, bush: 0.2, crack: 0.02, spikes: 0, vents: 0, water: 0, shift: 0.05,
  },
  {
    id: 'ruins', name: { en: 'The Ruins', he: 'החורבות' },
    floor: [0xb8a487, 0xae9a7e], wall: { bottom: 0x6e5a44, top: 0xc9b08c, rim: 0x8a7354, cap: 0xd8c29c }, map: [226, 208, 176],
    ivy: 0.12, bush: 0.03, crack: 0.3, spikes: 0, vents: 0, water: 0, shift: 0.04, rubble: true,
  },
  {
    id: 'glow', name: { en: 'Glowshade', he: 'צל זוהר' },
    floor: [0x4a4766, 0x45425f], wall: { bottom: 0x24203a, top: 0x4e4878, rim: 0x2f2a50, cap: 0x5a4e8f }, map: [150, 140, 196],
    ivy: 0.1, bush: 0.04, crack: 0.03, spikes: 0, vents: 0, water: 0, shift: 0.05, dark: true, shrooms: true,
  },
  {
    id: 'flood', name: { en: 'Floodways', he: 'תעלות ההצפה' },
    floor: [0x7f97a0, 0x77909a], wall: { bottom: 0x3a4a55, top: 0x7f9aa8, rim: 0x3d6a7a, cap: 0x5aa0b0 }, map: [170, 206, 220],
    ivy: 0.3, bush: 0.06, crack: 0.02, spikes: 0, vents: 0, water: 0.32, shift: 0.05,
  },
  {
    id: 'spikes', name: { en: 'Spike Rows', he: 'שורות הדוקרנים' },
    floor: [0x9a8478, 0x917c70], wall: { bottom: 0x4f3530, top: 0x9a6a58, rim: 0x6a3a30, cap: 0xa8584a }, map: [222, 182, 170],
    ivy: 0.1, bush: 0.02, crack: 0.04, spikes: 0.13, vents: 0, water: 0, shift: 0.05,
  },
  {
    id: 'machine', name: { en: 'Machine Yard', he: 'חצר המכונות' },
    floor: [0x8a909c, 0x828894], wall: { bottom: 0x3a3f4a, top: 0x8a94a6, rim: 0x4a5262, cap: 0x9aa6b8 }, map: [190, 198, 214],
    ivy: 0.05, bush: 0, crack: 0.04, spikes: 0, vents: 0.07, water: 0, shift: 0.08, pipes: true, metal: 0.6,
  },
  {
    id: 'bones', name: { en: 'Bone Garden', he: 'גן העצמות' },
    floor: [0xa49a8a, 0x9a9080], wall: { bottom: 0x5a5248, top: 0xcfc6b2, rim: 0x8a8070, cap: 0xe6dcc6 }, map: [226, 218, 200],
    ivy: 0.08, bush: 0.03, crack: 0.05, spikes: 0.03, vents: 0, water: 0, shift: 0.05, bones: true, danger: 1.5, loot: 1.6,
  },
  {
    id: 'shift', name: { en: 'Shifting Halls', he: 'האולמות הזזים' },
    floor: [0x9a97a8, 0x8f8c9f], wall: { bottom: 0x4a4561, top: 0x9b94ad, rim: 0x4d7f3c, cap: 0x74b257 }, map: [214, 208, 226],
    ivy: 0.3, bush: 0.05, crack: 0.03, spikes: 0, vents: 0, water: 0, shift: 0.32,
  },
];

export const SHRINES = {
  swift: { color: 0x6fd6ff, icon: '💨', secs: 40 },
  fury: { color: 0xff6b4a, icon: '🔥', secs: 40 },
  regen: { color: 0x7dff8a, icon: '💚', secs: 40 },
};

export const NAMES = [
  ['Alden', 'אלדן'], ['Skillet', 'סקילט'], ['Chip', 'צ׳יפ'], ['Wendell', 'וונדל'], ['Zeke', 'זיק'],
  ['Clay', 'קליי'], ['Jett', 'ג׳ט'], ['Bram', 'בראם'], ['Rowan', 'רואן'], ['Finch', 'פינץ׳'],
  ['Milo', 'מיילו'], ['Gus', 'גאס'], ['Ollie', 'אולי'], ['Pike', 'פייק'], ['Rudy', 'רודי'],
  ['Sawyer', 'סוייר'], ['Tobin', 'טובין'], ['Wade', 'וייד'], ['Kit', 'קיט'], ['Lenny', 'לני'],
  ['Hank', 'הנק'], ['Nico', 'ניקו'], ['Otis', 'אוטיס'], ['Reed', 'ריד'], ['Sid', 'סיד'],
];

export const CODE_WORDS = [
  ['LEAP', 'זנק'], ['HOLD', 'החזק'], ['RISE', 'קום'], ['BURN', 'בער'], ['SEEK', 'חפש'], ['PUSH', 'דחוף'],
];

const SKINS = [0xf0c49c, 0xd9a27a, 0x8a5a3c, 0xf3d0b0, 0xc68e66, 0xb07850, 0xe8bc94, 0x6e4a32];
const HAIRS = [0x2a1d16, 0xd9b45a, 0x1e1612, 0x8a4a2a, 0x5b3a22, 0x3a2a1e, 0xc08040];
const SHIRTS = [0xc0553a, 0x6fa860, 0xe0c070, 0x9a6ab8, 0x5a8fc0, 0xd08a40, 0x7aa0a8, 0xb85a7a, 0x8a8a5a];
const PANTS = [0x5b5048, 0x6a5a48, 0x4d5a6a, 0x6b5a40, 0x7a6a50, 0x3f4a3a];
const STYLES = ['buzz', 'messy', 'spiky', 'shaggy', 'messy', 'buzz'];

export function randomLook(R) {
  const pick = (a) => a[Math.floor(R() * a.length)];
  return { skin: pick(SKINS), hair: pick(HAIRS), hairStyle: pick(STYLES), shirt: pick(SHIRTS), pants: pick(PANTS) };
}

// Enemy balance; scales with day.
export const ENEMY_TYPES = {
  grinder: { hp: 1, dmg: 1, speed: 1, scale: 1, r: 0.9, wind: 0.55 },
  crawler: { hp: 0.24, dmg: 0.32, speed: 1.3, scale: 0.55, r: 0.55, wind: 0.28 },
  spitter: { hp: 0.7, dmg: 0.65, speed: 0.85, scale: 0.95, r: 0.85, wind: 0.6 },
  alpha: { hp: 3.4, dmg: 1.3, speed: 0.92, scale: 1.55, r: 1.35, wind: 0.6 },
};
export function grinderStats(day, night = false, type = 'grinder') {
  const T = ENEMY_TYPES[type];
  return {
    hp: Math.round((2600 + day * 320) * T.hp / 10) * 10,
    dmg: Math.round((850 + day * 40) * T.dmg / 10) * 10,
    speed: (night ? 6.9 : 5.9) * T.speed,
    patrol: 2.8 * Math.min(1.3, T.speed),
  };
}
