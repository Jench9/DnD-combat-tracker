// Shared pieces of character creation and level up (2024 rules). Pure
// functions over a character and the rules data (builder/rules.js); they
// return values or patch fragments, never touch storage.
const path = require('path');
const { mod, ABILITY_KEYS } = require('../model');
const { PUBLIC_DIR } = require('../../../config');

const PRESETS = require(path.join(PUBLIC_DIR, 'js/core/modifier-presets.json'));
const PRESET_KEYS = new Set(PRESETS.map((p) => p.key));
const PRESET_BY_KEY = new Map(PRESETS.map((p) => [p.key, p]));

const SKILLS = {
  Acrobatics: 'dex', 'Animal Handling': 'wis', Arcana: 'int', Athletics: 'str', Deception: 'cha',
  History: 'int', Insight: 'wis', Intimidation: 'cha', Investigation: 'int', Medicine: 'wis',
  Nature: 'int', Perception: 'wis', Performance: 'cha', Persuasion: 'cha', Religion: 'int',
  'Sleight of Hand': 'dex', Stealth: 'dex', Survival: 'wis',
};
const SKILL_NAMES = Object.keys(SKILLS);
const ABILITY_LABEL = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

// ---------------------------------------------------------------- classes

// The character's classes with levels: [{ key, name, level, subclass, subclassName }].
// The class text ("Fighter 5 / Wizard 2", or "Fighter" + level) is the
// source of truth for levels — a D&D Beyond sync or a hand edit changes it —
// and `ch.classes` adds the subclass. Names that aren't SRD classes keep
// a key from their name (no rules for them).
function classesOf(ch, rules) {
  const stored = new Map((ch.classes || []).map((c) => [c.key, c]));
  const byName = new Map(rules.classes.map((c) => [c.name.toLowerCase(), c]));
  const text = String(ch.class || '').trim();
  const found = [];
  for (const m of text.matchAll(/([A-Za-z][A-Za-z' -]*?)\s+(\d{1,2})\b/g)) found.push([m[1].trim(), parseInt(m[2], 10)]);
  if (!found.length && text) found.push([text, parseInt(ch.level, 10) || 1]);
  if (!found.length) return (ch.classes || []).map((c) => ({ ...c }));
  return found.map(([name, level]) => {
    const def = byName.get(name.toLowerCase());
    const key = def ? def.key : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class';
    const s = stored.get(key) || {};
    return { key, name: def ? def.name : name, level: Math.max(1, Math.min(20, level)), subclass: s.subclass || '', subclassName: s.subclassName || '' };
  });
}

const classText = (classes) => classes.map((c) => `${c.name} ${c.level}`).join(' / ');
const totalLevel = (classes) => classes.reduce((n, c) => n + c.level, 0);

// "3d10 + 2d6", biggest dice first.
function hitDiceText(classes, rules) {
  const pool = {};
  classes.forEach((c) => {
    const def = rules.classByKey.get(c.key);
    if (def) pool[def.hitDie] = (pool[def.hitDie] || 0) + c.level;
  });
  return Object.keys(pool).map(Number).sort((a, b) => b - a).map((d) => `${pool[d]}d${d}`).join(' + ');
}

const levelRow = (def, level) => def.levels.find((l) => l.level === level) || null;

// The class as a spellcaster: itself if it casts spells; a non-caster class
// whose subclass casts spells (a custom one-third caster like the Eldritch
// Knight) becomes a caster with the subclass's spell rows, ability and list.
// Otherwise the class unchanged.
function casterDef(def, subclassKey) {
  if (!def || def.caster || !subclassKey) return def;
  const sub = def.subclasses.find((s) => s.key === subclassKey);
  const sc = sub && sub.spellcasting;
  if (!sc || !sc.rows) return def;
  return {
    ...def,
    caster: sc.type,
    spellAbility: sc.ability,
    spellList: sc.list,
    levels: def.levels.map((l) => ({ ...l, spells: sc.rows[l.level - 1] || null })),
  };
}
const spellListOf = (def) => def.spellList || def.key;

// ---------------------------------------------------------------- spells

// Spell slots for these classes: one spellcasting class uses its own table;
// several use the multiclass table (full-caster table at the combined level,
// Paladin/Ranger levels halved, rounded up). Warlock Pact Magic is separate
// and its slots are added to the same level's pips (as the sheet stores them).
// Returns { spellSlots maxes [9], pactMagic { level, count } }.
function slotTable(classes, rules) {
  const casters = classes.map((c) => ({ c, def: casterDef(rules.classByKey.get(c.key), c.subclass) })).filter((x) => x.def && x.def.caster);
  const slots = Array(9).fill(0);
  const regular = casters.filter((x) => x.def.caster !== 'pact');
  if (regular.length === 1) {
    const row = levelRow(regular[0].def, regular[0].c.level);
    if (row && row.spells) row.spells.slots.forEach((n, i) => { slots[i] = n; });
  } else if (regular.length > 1) {
    // Multiclass: full casters count all levels, half casters half (up),
    // one-third casters a third (down).
    const share = (x) => (x.def.caster === 'full' ? x.c.level : x.def.caster === 'third' ? Math.floor(x.c.level / 3) : Math.ceil(x.c.level / 2));
    const casterLevel = regular.reduce((n, x) => n + share(x), 0);
    const full = rules.classByKey.get('wizard');
    const row = levelRow(full, Math.min(20, casterLevel));
    if (row && row.spells) row.spells.slots.forEach((n, i) => { slots[i] = n; });
  }
  let pactMagic = { level: 0, count: 0 };
  const pact = casters.find((x) => x.def.caster === 'pact');
  if (pact) {
    const row = levelRow(pact.def, pact.c.level);
    const lvl = row && row.spells ? row.spells.slots.findIndex((n) => n > 0) : -1;
    if (lvl >= 0) {
      pactMagic = { level: lvl + 1, count: row.spells.slots[lvl] };
      slots[lvl] += pactMagic.count;
    }
  }
  return { slots, pactMagic };
}

// New maxes, keeping how many are spent (capped).
function applySlots(ch, classes, rules) {
  const { slots, pactMagic } = slotTable(classes, rules);
  const old = Array.isArray(ch.spellSlots) ? ch.spellSlots : [];
  return {
    spellSlots: slots.map((max, i) => ({ max, used: Math.min(max, (old[i] && old[i].used) || 0) })),
    pactMagic,
  };
}

// Highest spell level a class can learn at a class level (its own table).
function maxSpellLevel(def, level) {
  const row = levelRow(def, level);
  if (!row || !row.spells) return 0;
  let max = 0;
  row.spells.slots.forEach((n, i) => { if (n > 0) max = i + 1; });
  return max;
}

// How many cantrips / spells a class level adds: { cantrips, spells, maxLevel }.
// Wizards add two spells to their spellbook each level (six at level 1).
function spellPicks(def, level) {
  const row = levelRow(def, level);
  if (!row || !row.spells) return { cantrips: 0, spells: 0, maxLevel: 0 };
  const prev = level > 1 ? levelRow(def, level - 1) : null;
  const before = prev && prev.spells ? prev.spells : { cantrips: 0, prepared: 0 };
  const spells = def.key === 'wizard' ? (level === 1 ? 6 : 2) : Math.max(0, row.spells.prepared - before.prepared);
  return { cantrips: Math.max(0, row.spells.cantrips - before.cantrips), spells, maxLevel: maxSpellLevel(def, level) };
}

// Is this library spell one `listKey` ('wizard', 'cleric'…) can take at up
// to `maxLevel` (0 = cantrip only)? Custom spells without a class list are allowed.
function spellFits(spell, listKey, { cantrip, maxLevel }) {
  if (!spell) return false;
  const lvl = parseInt(spell.level, 10) || 0;
  if (cantrip ? lvl !== 0 : lvl < 1 || lvl > maxLevel) return false;
  const classes = Array.isArray(spell.classes) ? spell.classes : [];
  return !classes.length || classes.includes(listKey);
}

// ---------------------------------------------------------------- resources

// Class counters as sheet resources, for every class the character has.
function classResources(classes, abilities) {
  const out = [];
  const add = (name, max, recharge) => { if (max > 0) out.push({ name, max, recharge }); };
  classes.forEach(({ key, level, counters }) => {
    const cs = counters || {};
    if (key === 'barbarian') add('Rage', cs.rage_count, 'long');
    if (key === 'bard') add('Bardic Inspiration', Math.max(1, mod(abilities.cha)), level >= 5 ? 'short' : 'long');
    if (key === 'cleric' || key === 'paladin') add('Channel Divinity', cs.channel_divinity_charges, 'short');
    if (key === 'druid') add('Wild Shape', cs.wild_shape_uses, 'short');
    if (key === 'fighter') {
      add('Second Wind', cs.second_wind_uses, 'short');
      add('Action Surge', level >= 17 ? 2 : level >= 2 ? 1 : 0, 'short');
      add('Indomitable', level >= 17 ? 3 : level >= 13 ? 2 : level >= 9 ? 1 : 0, 'long');
    }
    if (key === 'monk') add('Focus Points', cs.focus_points, 'short');
    if (key === 'paladin') add('Lay on Hands (HP)', 5 * level, 'long');
    if (key === 'ranger') add("Hunter's Mark (free casts)", cs.favored_enemies, 'long');
    if (key === 'sorcerer') add('Sorcery Points', cs.sorcery_points, 'long');
    if (key === 'wizard') add('Arcane Recovery', 1, 'long');
  });
  return out;
}

// Merge class resources into the sheet's list by name: raise/lower the max,
// keep what's spent (capped), keep the player's own resources.
function mergeResources(existing, wanted, newId) {
  const list = (existing || []).map((r) => ({ ...r }));
  wanted.forEach((w) => {
    const r = list.find((x) => x.name.toLowerCase() === w.name.toLowerCase());
    if (r) { r.max = w.max; r.used = Math.min(r.used || 0, w.max); r.recharge = w.recharge; } else list.push({ id: newId(), name: w.name, max: w.max, used: 0, recharge: w.recharge });
  });
  return list;
}

// A custom subclass's resources at a class level (and total level, for the
// proficiency bonus): [{ name, max, recharge }].
function subclassResources(classes, rules) {
  const total = totalLevel(classes);
  const pb = Math.floor((Math.max(1, total) - 1) / 4) + 2;
  const out = [];
  classes.forEach((c) => {
    const def = rules.classByKey.get(c.key);
    const sub = def && c.subclass ? def.subclasses.find((s) => s.key === c.subclass) : null;
    (sub && sub.resources || []).forEach((r) => {
      const max = r.pb ? pb : (r.uses || []).filter((u) => u.level <= c.level).reduce((m, u) => u.max, 0);
      if (max > 0) out.push({ name: r.name, max, recharge: r.recharge });
    });
  });
  return out;
}

// Resources for these classes at their levels (counters from the rules,
// plus a custom subclass's own resources).
function resourcesFor(ch, classes, abilities, rules, newId) {
  const withCounters = classes.map((c) => {
    const def = rules.classByKey.get(c.key);
    const row = def && levelRow(def, c.level);
    return { ...c, counters: row ? row.counters : {} };
  });
  return mergeResources(ch.resources, [...classResources(withCounters, abilities), ...subclassResources(classes, rules)], newId);
}

// ---------------------------------------------------------------- modifiers

// Modifier presets (public/js/core/modifier-presets.json) that a class,
// subclass or feat switches on, by the level it's gained at.
const CLASS_PRESETS = {
  barbarian: { 1: ['rage', 'unarmored-defense-barbarian', 'weapon-mastery'] },
  fighter: { 1: ['weapon-mastery'] },
  monk: { 1: ['martial-arts-2024', 'unarmored-defense-monk'] },
  paladin: { 1: ['weapon-mastery'], 11: ['radiant-strikes-2024'] },
  ranger: { 1: ['weapon-mastery', 'hunters-mark-2024'] },
  rogue: { 1: ['sneak-attack', 'weapon-mastery'] },
  champion: { 3: ['improved-critical'], 15: ['superior-critical'] },
  'draconic-sorcery': { 3: ['draconic-resilience-2024'] },
  evoker: { 10: ['empowered-evocation'] },
};
const FEAT_PRESETS = { archery: 'archery', defense: 'defense', 'great-weapon-fighting': 'gwf-2024', 'savage-attacker': 'savage-attacker' };

// Situational switches start off; always-on ones (and Sneak Attack, like
// the D&D Beyond import) start on.
const startsOn = (key) => key === 'sneak-attack' || !(PRESET_BY_KEY.get(key) || {}).toggle;

function addPresets(modifiers, keys, newId) {
  const list = (modifiers || []).map((m) => ({ ...m }));
  keys.forEach((key) => {
    if (!PRESET_KEYS.has(key) || list.some((m) => m.preset === key)) return;
    list.push({ id: newId(), preset: key, active: startsOn(key), only: '', custom: null });
  });
  return list;
}

const presetsAt = (key, level) => ((CLASS_PRESETS[key] || {})[level] || []);

// ---------------------------------------------------------------- text

const MAX_DESC = 1800; // a very long feature is cut in the sheet's Features text
const clip = (s) => (s.length > MAX_DESC ? s.slice(0, MAX_DESC).replace(/\s+\S*$/, '') + ' …' : s);
const featureBlock = (title, desc) => `◆ ${title}${desc ? '\n' + clip(desc.trim()) : ''}`;

// Append blocks to the Features text (newest last).
function appendFeatures(features, blocks) {
  const add = blocks.filter(Boolean).join('\n\n');
  if (!add) return features || '';
  return features && features.trim() ? `${features.trim()}\n\n${add}` : add;
}

// ---------------------------------------------------------------- feats

// May this character take this feat now? { ok, why }.
function featAllowed(feat, ch, { level, hasFightingStyle }) {
  if (!feat) return { ok: false, why: 'Unknown feat.' };
  if (!feat.repeatable && (ch.feats || []).includes(feat.key)) return { ok: false, why: 'Already taken.' };
  const pre = feat.prereq || {};
  if (pre.minLevel && level < pre.minLevel) return { ok: false, why: `Level ${pre.minLevel}+.` };
  if (pre.feature === 'Fighting Style' && !hasFightingStyle) return { ok: false, why: 'Needs the Fighting Style feature.' };
  if (pre.feature === 'Spellcasting' && !(ch.spellAbility)) return { ok: false, why: 'Needs Spellcasting.' };
  if (pre.any && pre.any.length && !pre.any.some((p) => (ch.abilities[p.ability] || 0) >= p.min)) {
    return { ok: false, why: pre.any.map((p) => `${ABILITY_LABEL[p.ability]} ${p.min}+`).join(' or ') + '.' };
  }
  return { ok: true, why: '' };
}

// Ability increases: `plus` { str: 2 } or { str: 1, dex: 1 }, checked
// against what the feat allows. Returns the new abilities or null.
function applyIncrease(abilities, plus, { total, perAbility, allowed, max }) {
  if (!plus || typeof plus !== 'object') return null;
  const entries = Object.entries(plus).filter(([, v]) => v);
  const sum = entries.reduce((n, [, v]) => n + v, 0);
  if (sum !== total) return null;
  const next = { ...abilities };
  for (const [k, v] of entries) {
    if (!ABILITY_KEYS.includes(k) || !allowed.includes(k) || !Number.isInteger(v) || v < 1 || v > perAbility) return null;
    if (next[k] + v > max) return null;
    next[k] += v;
  }
  return next;
}

module.exports = {
  SKILLS, SKILL_NAMES, ABILITY_LABEL, PRESET_KEYS, CLASS_PRESETS, FEAT_PRESETS,
  classesOf, classText, totalLevel, hitDiceText, levelRow,
  slotTable, applySlots, maxSpellLevel, spellPicks, spellFits, casterDef, spellListOf, subclassResources,
  classResources, mergeResources, resourcesFor,
  addPresets, presetsAt, featureBlock, appendFeatures, featAllowed, applyIncrease,
};
