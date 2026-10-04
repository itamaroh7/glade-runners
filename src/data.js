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
  smith: { icon: '🔨', needs: 'forge' },
  medic: { icon: '✚' },
  guard: { icon: '🛡️' },
};
export const ROLE_ORDER = ['farmer', 'woodcutter', 'smith', 'medic', 'guard'];

export const BUILDINGS = {
  fields: { icon: '🌱', max: 4, cost: { 3: { wood: 20 }, 4: { wood: 34, metal: 8 } } },
  homestead: { icon: '🏠', max: 3, cost: { 2: { wood: 24, metal: 5 }, 3: { wood: 42, metal: 14 } } },
  tower: { icon: '🗼', max: 2, cost: { 1: { wood: 18, metal: 6 }, 2: { wood: 32, metal: 16 } } },
  forge: { icon: '⚒️', max: 3, cost: { 1: { wood: 14, metal: 8 }, 2: { wood: 26, metal: 18 }, 3: { wood: 40, metal: 30 } } },
};
export const BUILD_ORDER = ['fields', 'homestead', 'tower', 'forge'];
export const BEDS = [0, 8, 12, 16];

export const NAMES = [
  ['Alden', 'אלדן'], ['Skillet', 'סקילט'], ['Chip', 'צ׳יפ'], ['Wendell', 'וונדל'], ['Zeke', 'זיק'],
  ['Clay', 'קליי'], ['Jett', 'ג׳ט'], ['Bram', 'בראם'], ['Rowan', 'רואן'], ['Finch', 'פינץ׳'],
  ['Milo', 'מיילו'], ['Gus', 'גאס'], ['Ollie', 'אולי'], ['Pike', 'פייק'], ['Rudy', 'רודי'],
  ['Sawyer', 'סוייר'], ['Tobin', 'טובין'], ['Wade', 'וייד'], ['Kit', 'קיט'], ['Lenny', 'לני'],
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
export function grinderStats(day, night = false) {
  return {
    hp: 2600 + day * 320,
    dmg: 850 + day * 40,
    speed: night ? 6.9 : 5.9,
    patrol: 2.8,
  };
}
