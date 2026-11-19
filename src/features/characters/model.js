// Character shape, validation and small rules helpers. Pure functions.
//
// { id, portrait (data URL), name, race, class, level, background, alignment,
//   ac, speed, hitDice ("5d10", or "3d10 + 2d6" when multiclassed),
//   hitDiceUsed: { d6, d8, d10, d12 } — spent Hit Dice (see rest.js),
//   abilities: { str, dex, con, int, wis, cha },
//   hpMax, hpCurrent, hpTemp,
//   saveProf: { str: bool, ... }, skillProf: { 'Stealth': bool, ... },
//   equipment, features, notes,
//   ddbId (D&D Beyond character id, '' if not linked),
//   campaignId ('' = no campaign),
//   inventory: [{ id, itemId, name, qty, equipped }] — items from the item
//     library (`name` is a copy, shown if the library item is deleted),
//   acAuto: true = AC is computed from equipped armor (see derived.js),
//   weaponProf: { simple, martial } — adds proficiency to weapon attacks,
//   spellAbility: '' | 'int' | 'wis' | 'cha' | … (spell attack + save DC),
//   spellSlots: 9 × { max, used } for slot levels 1–9,
//   pactMagic: { level 0–9 (0 = none), count } — Warlock slots, part of
//     spellSlots, that come back on a short rest,
//   resources: [{ id, name, max, used, recharge: 'short'|'long'|'none' }] —
//     limited-use features (Second Wind, Ki, Rage, Channel Divinity…),
//   inspiration: bool (Heroic Inspiration), exhaustion: 0–6,
//   currency: { cp, sp, ep, gp, pp },
//   rulesEdition: '2014' | '2024' — rest rules (Hit Dice back on a long rest),
//   spells: [{ id, spellId, name, prepared }] — from the spell library
//     (cantrips are always ready; leveled spells need `prepared`),
//   modifiers: [{ id, preset, active, only, custom }] — feats, fighting
//     styles, class features, weapon mastery… that change attacks. `preset`
//     names an entry of the client catalog (public/js/core/modifiers.js);
//     otherwise `custom` holds the definition. `active` switches situational
//     ones (Rage, Hex…); `only` limits it to named weapons/spells/damage types. }

const { MAX_PORTRAIT_CHARS, sanitizeImage } = require('../../core/images');

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

function blankCharacter(id) {
  return {
    id,
    portrait: '',
    name: '', race: '', class: '', level: 1, background: '', alignment: '',
    ac: 10, speed: 30, hitDice: '1d8',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    hpMax: 10, hpCurrent: 10, hpTemp: 0,
    saveProf: {}, skillProf: {},
    equipment: '', features: '', notes: '',
    ddbId: '',
    campaignId: '',
    inventory: [],
    acAuto: true,
    weaponProf: { simple: true, martial: false },
    spellAbility: '',
    spellSlots: Array.from({ length: 9 }, () => ({ max: 0, used: 0 })),
    spells: [],
    modifiers: [],
    hitDiceUsed: { d6: 0, d8: 0, d10: 0, d12: 0 },
    pactMagic: { level: 0, count: 0 },
    resources: [],
    rulesEdition: '2024',
    inspiration: false,
    exhaustion: 0,
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    // Builder / level up (characters/builder/): class levels, Expertise
    // skills, and feats taken (keys or custom names, for repeat checks).
    classes: [],
    skillExpert: {},
    feats: [],
    // Find Familiar / Pact of the Chain (characters/familiars.js), or null.
    familiar: null,
  };
}

// The character's familiar: a stat block copied from the monster library
// when it's created (POST /api/familiars), then name, creature type and HP
// change through updateCharacter. { name, form, monsterId, creatureType,
// pact, ac, hpMax, hp, initBonus, notes }.
const FAMILIAR_TYPES = ['celestial', 'fey', 'fiend'];
function sanitizeFamiliar(existing, patch) {
  if (patch === null) return null;
  if (!patch || typeof patch !== 'object') return existing || null;
  const base = existing || {};
  const hpMax = clampInt(patch.hpMax ?? base.hpMax, 1, 999) || 1;
  return {
    name: String(patch.name ?? base.name ?? '').slice(0, 40),
    form: String(patch.form ?? base.form ?? '').slice(0, 60),
    monsterId: /^[a-z0-9]{1,20}$/.test(String(patch.monsterId ?? base.monsterId ?? '')) ? String(patch.monsterId ?? base.monsterId) : '',
    creatureType: pick(patch.creatureType, FAMILIAR_TYPES, '') || pick(base.creatureType, FAMILIAR_TYPES, 'fey'),
    pact: !!(patch.pact ?? base.pact),
    ac: clampInt(patch.ac ?? base.ac, 1, 40) || 10,
    hpMax,
    hp: Math.min(hpMax, clampInt(patch.hp ?? base.hp ?? hpMax, 0, 999)),
    initBonus: clampInt(patch.initBonus ?? base.initBonus, -10, 20),
    notes: String(patch.notes ?? base.notes ?? '').slice(0, 6000),
  };
}

const MAX_FEATURES_CHARS = 30000;
const CLASS_KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_CLASSES = 12;
const MAX_FEATS = 40;

// [{ key, name, level, subclass, subclassName }]: one entry per class, levels 1–20.
function sanitizeClasses(list) {
  const seen = new Set();
  const out = [];
  list.slice(0, MAX_CLASSES).forEach((c) => {
    if (!c || !CLASS_KEY_RE.test(String(c.key)) || seen.has(c.key)) return;
    seen.add(c.key);
    out.push({
      key: c.key,
      name: String(c.name || c.key).slice(0, 40),
      level: Math.max(1, Math.min(20, parseInt(c.level, 10) || 1)),
      subclass: CLASS_KEY_RE.test(String(c.subclass || '')) ? c.subclass : '',
      subclassName: String(c.subclassName || '').slice(0, 60),
    });
  });
  return out;
}

const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'];
const MAX_COINS = 9999999;

const INV_ID_RE = /^[a-z0-9]{1,20}$/;
const MAX_INVENTORY = 200;

// Keeps well-formed entries only: unique ids, a library item id, a
// quantity 0–9999, and an equipped flag.
function sanitizeInventory(list) {
  const seen = new Set();
  const out = [];
  list.slice(0, MAX_INVENTORY).forEach((e) => {
    if (!e || !INV_ID_RE.test(String(e.id)) || !INV_ID_RE.test(String(e.itemId)) || seen.has(e.id)) return;
    seen.add(e.id);
    const qty = parseInt(e.qty, 10);
    out.push({
      id: e.id,
      itemId: e.itemId,
      name: typeof e.name === 'string' ? e.name.slice(0, 60) : '',
      qty: Number.isFinite(qty) ? Math.max(0, Math.min(9999, qty)) : 1,
      equipped: !!e.equipped,
    });
  });
  return out;
}

const MAX_SPELLS = 300;

function sanitizeSlots(list) {
  return Array.from({ length: 9 }, (_, i) => {
    const s = list[i] || {};
    const max = Math.max(0, Math.min(9, parseInt(s.max, 10) || 0));
    return { max, used: Math.max(0, Math.min(max, parseInt(s.used, 10) || 0)) };
  });
}

function sanitizeSpells(list) {
  const seen = new Set();
  const out = [];
  list.slice(0, MAX_SPELLS).forEach((e) => {
    if (!e || !INV_ID_RE.test(String(e.id)) || !INV_ID_RE.test(String(e.spellId)) || seen.has(e.id)) return;
    seen.add(e.id);
    out.push({
      id: e.id, spellId: e.spellId, name: typeof e.name === 'string' ? e.name.slice(0, 60) : '', prepared: !!e.prepared,
    });
  });
  return out;
}

const MAX_MODIFIERS = 50;
const PRESET_RE = /^[a-z0-9-]{1,40}$/;
const DAMAGE_TOKENS = ['PROF', 'STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const DAMAGE_TYPES = ['', 'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const DICE_RE = /^\d{1,2}d(4|6|8|10|12)$/;

const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const clampInt = (v, min, max) => Math.max(min, Math.min(max, parseInt(v, 10) || 0));

function sanitizeCustomModifier(c) {
  if (!c || typeof c !== 'object') return null;
  const damage = String(c.damage ?? '').trim().toUpperCase();
  return {
    name: String(c.name || 'Custom modifier').slice(0, 40),
    toHit: clampInt(c.toHit, -20, 20),
    damage: DAMAGE_TOKENS.includes(damage) ? damage : String(clampInt(damage, -20, 50)),
    dice: DICE_RE.test(String(c.dice || '')) ? c.dice : '',
    diceType: pick(c.diceType, DAMAGE_TYPES, ''),
    appliesTo: pick(c.appliesTo, ['weapon', 'spell', 'any'], 'weapon'),
    range: pick(c.range, ['melee', 'ranged', 'any'], 'any'),
    toggle: !!c.toggle,
    note: String(c.note || '').slice(0, 300),
    ac: clampInt(c.ac, -10, 10), // AC bonus (with Auto AC)
  };
}

function sanitizeModifiers(list) {
  const seen = new Set();
  const out = [];
  list.slice(0, MAX_MODIFIERS).forEach((m) => {
    if (!m || !INV_ID_RE.test(String(m.id)) || seen.has(m.id)) return;
    const preset = PRESET_RE.test(String(m.preset || '')) ? m.preset : '';
    const custom = preset ? null : sanitizeCustomModifier(m.custom);
    if (!preset && !custom) return;
    seen.add(m.id);
    out.push({ id: m.id, preset, active: !!m.active, only: String(m.only || '').slice(0, 100), custom });
  });
  return out;
}

const MAX_RESOURCES = 30;
const RECHARGES = ['short', 'long', 'none'];

function sanitizeResources(list) {
  const seen = new Set();
  const out = [];
  list.slice(0, MAX_RESOURCES).forEach((r) => {
    if (!r || !INV_ID_RE.test(String(r.id)) || seen.has(r.id)) return;
    seen.add(r.id);
    const max = clampInt(r.max, 0, 999);
    out.push({
      id: r.id,
      name: String(r.name || '').slice(0, 40),
      max,
      used: clampInt(r.used, 0, max),
      recharge: pick(r.recharge, RECHARGES, 'long'),
    });
  });
  return out;
}

function sanitizeHitDiceUsed(v) {
  return { d6: clampInt(v.d6, 0, 99), d8: clampInt(v.d8, 0, 99), d10: clampInt(v.d10, 0, 99), d12: clampInt(v.d12, 0, 99) };
}

function mod(score) {
  return Math.floor(((parseInt(score, 10) || 10) - 10) / 2);
}

// Merge an incoming patch onto an existing character, keeping the
// shape sane. Only known fields are copied over; everything is
// coerced/clamped so a malformed client message can't corrupt state
// for everyone else at the table.
function sanitizeCharacterPatch(existing, patch) {
  const next = { ...existing };

  // Portrait: a small base64 image data URL (the client downsizes to
  // ~256px before sending), or '' to remove it. Anything else is ignored.
  if (patch.portrait !== undefined) next.portrait = sanitizeImage(patch.portrait, existing.portrait);

  if (typeof patch.name === 'string') next.name = patch.name.slice(0, 60);
  if (typeof patch.race === 'string') next.race = patch.race.slice(0, 40);
  if (typeof patch.class === 'string') next.class = patch.class.slice(0, 80);
  if (patch.level !== undefined) {
    next.level = Math.max(1, Math.min(20, parseInt(patch.level, 10) || 1));
  }
  if (typeof patch.background === 'string') next.background = patch.background.slice(0, 60);
  if (typeof patch.alignment === 'string') next.alignment = patch.alignment.slice(0, 40);
  if (patch.ac !== undefined) next.ac = parseInt(patch.ac, 10) || 10;
  if (patch.speed !== undefined) next.speed = parseInt(patch.speed, 10) || 30;
  if (typeof patch.hitDice === 'string') next.hitDice = patch.hitDice.slice(0, 40);
  if (patch.hitDiceUsed && typeof patch.hitDiceUsed === 'object') next.hitDiceUsed = sanitizeHitDiceUsed(patch.hitDiceUsed);
  if (patch.pactMagic && typeof patch.pactMagic === 'object') {
    next.pactMagic = { level: clampInt(patch.pactMagic.level, 0, 9), count: clampInt(patch.pactMagic.count, 0, 9) };
  }
  if (Array.isArray(patch.resources)) next.resources = sanitizeResources(patch.resources);
  if (patch.rulesEdition === '2014' || patch.rulesEdition === '2024') next.rulesEdition = patch.rulesEdition;
  if (patch.inspiration !== undefined) next.inspiration = !!patch.inspiration;
  if (patch.exhaustion !== undefined) next.exhaustion = clampInt(patch.exhaustion, 0, 6);
  if (patch.currency && typeof patch.currency === 'object') {
    next.currency = { ...(existing.currency || {}) };
    COINS.forEach((k) => {
      if (patch.currency[k] !== undefined) next.currency[k] = clampInt(patch.currency[k], 0, MAX_COINS);
      else next.currency[k] = clampInt(next.currency[k], 0, MAX_COINS);
    });
  }
  if (patch.hpMax !== undefined) next.hpMax = Math.max(1, parseInt(patch.hpMax, 10) || 1);
  if (patch.hpCurrent !== undefined) next.hpCurrent = Math.max(0, parseInt(patch.hpCurrent, 10) || 0);
  if (patch.hpTemp !== undefined) next.hpTemp = Math.max(0, parseInt(patch.hpTemp, 10) || 0);
  if (typeof patch.equipment === 'string') next.equipment = patch.equipment.slice(0, 4000);
  if (typeof patch.features === 'string') next.features = patch.features.slice(0, MAX_FEATURES_CHARS);
  if (Array.isArray(patch.classes)) next.classes = sanitizeClasses(patch.classes);
  if (patch.familiar !== undefined) next.familiar = sanitizeFamiliar(existing.familiar, patch.familiar);
  if (Array.isArray(patch.feats)) {
    next.feats = [...new Set(patch.feats.filter((f) => typeof f === 'string' && f.trim()).map((f) => f.trim().slice(0, 60)))].slice(0, MAX_FEATS);
  }
  if (typeof patch.notes === 'string') next.notes = patch.notes.slice(0, 4000);
  if (Array.isArray(patch.inventory)) next.inventory = sanitizeInventory(patch.inventory);
  if (patch.acAuto !== undefined) next.acAuto = !!patch.acAuto;
  if (patch.spellAbility === '' || ABILITY_KEYS.includes(patch.spellAbility)) next.spellAbility = patch.spellAbility;
  if (Array.isArray(patch.spellSlots)) next.spellSlots = sanitizeSlots(patch.spellSlots);
  if (Array.isArray(patch.spells)) next.spells = sanitizeSpells(patch.spells);
  if (Array.isArray(patch.modifiers)) next.modifiers = sanitizeModifiers(patch.modifiers);
  if (patch.weaponProf && typeof patch.weaponProf === 'object') {
    next.weaponProf = { ...existing.weaponProf };
    ['simple', 'martial'].forEach((k) => {
      if (patch.weaponProf[k] !== undefined) next.weaponProf[k] = !!patch.weaponProf[k];
    });
  }
  if (typeof patch.campaignId === 'string' && /^[a-z0-9]{0,20}$/.test(patch.campaignId)) next.campaignId = patch.campaignId;
  if (typeof patch.ddbId === 'string' && /^\d{0,20}$/.test(patch.ddbId)) next.ddbId = patch.ddbId;

  if (patch.abilities && typeof patch.abilities === 'object') {
    next.abilities = { ...existing.abilities };
    ABILITY_KEYS.forEach((k) => {
      if (patch.abilities[k] !== undefined) {
        next.abilities[k] = Math.max(1, Math.min(30, parseInt(patch.abilities[k], 10) || 10));
      }
    });
  }
  if (patch.saveProf && typeof patch.saveProf === 'object') {
    next.saveProf = { ...existing.saveProf };
    ABILITY_KEYS.forEach((k) => {
      if (patch.saveProf[k] !== undefined) next.saveProf[k] = !!patch.saveProf[k];
    });
  }
  if (patch.skillExpert && typeof patch.skillExpert === 'object') {
    next.skillExpert = { ...existing.skillExpert };
    Object.keys(patch.skillExpert).slice(0, 40).forEach((k) => {
      next.skillExpert[String(k).slice(0, 40)] = !!patch.skillExpert[k];
    });
  }
  if (patch.skillProf && typeof patch.skillProf === 'object') {
    next.skillProf = { ...existing.skillProf };
    Object.keys(patch.skillProf).forEach((k) => {
      next.skillProf[String(k).slice(0, 40)] = !!patch.skillProf[k];
    });
  }

  return next;
}

module.exports = { FAMILIAR_TYPES, MAX_PORTRAIT_CHARS, MAX_FEATURES_CHARS, ABILITY_KEYS, COINS, blankCharacter, mod, sanitizeCharacterPatch };
