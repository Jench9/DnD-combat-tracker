// Attack modifiers: feats, fighting styles, class features, weapon mastery…
// A character's `modifiers` list holds catalog references ({ preset }) or
// custom definitions ({ custom }); this module resolves them and works out
// what they add to a weapon attack or a spell.
//
//   PRESETS                         the catalog (both editions, labelled),
//                                   loaded from modifier-presets.json
//   resolveModifiers(character)     -> [{ entry, def }]
//   effectsFor(attack, env)         what they add to one attack or spell
//   unarmedOverride(env)            Martial Arts die for the unarmed strike
//
// A definition (preset or custom) may have:
//   when: { kind: 'weapon' | 'spell' | 'any' | 'unarmed',
//           range: 'melee' | 'ranged', props: [...] all required,
//           oneHanded / twoHandedGrip, finesseOrRanged, strBased,
//           attackRoll (spells: only spell attack rolls), school, damaging }
//   toHit (number), damage (number | 'PROF' | 'STR'… | { class, table }),
//   dice ('1d6' | { class, every, die } -> ceil(classLevel / every) dice),
//   diceType ('' = same as the weapon/spell), reroll ('gwf-2014' |
//   'gwf-2024' | 'ea'), critRange, critExtraDice ({ class, table }),
//   unarmed ({ class, table, dex }), mastery (show the weapon's mastery),
//   note (template: {MOD} {PROF} {DC} {TYPE} are filled in), toggle.
//   ac ({ bonus, requiresArmor } or an unarmored base { base, add: ['DEX', …],
//   noShield }) — applied by the server's Auto AC (characters/derived.js).
// `entry.only` (comma-separated) limits a modifier to weapons/spells with
// those names, or to damage of those types.

import { d20Penalty } from './exhaustion.js';

export const MASTERY_NOTES = {
  cleave: 'Cleave — on a hit, make a melee attack against a second creature within 5 ft of the first and within your reach; on a hit it takes the weapon damage without your ability modifier (unless negative). Once per turn.',
  graze: 'Graze — if the attack misses, deal {MOD} {TYPE} damage anyway.',
  nick: 'Nick — make the Light property extra attack as part of the Attack action instead of a bonus action (once per turn).',
  push: 'Push — on a hit, push a Large or smaller creature up to 10 ft away from you.',
  sap: 'Sap — on a hit, the target has disadvantage on its next attack roll before the start of your next turn.',
  slow: 'Slow — on a hit that deals damage, reduce its speed by 10 ft until the start of your next turn (doesn\'t stack).',
  topple: 'Topple — on a hit, the target makes a DC {DC} CON save or falls Prone.',
  vex: 'Vex — on a hit that deals damage, you have advantage on your next attack against it before the end of your next turn.',
};

// The catalog is shared with the server (which computes AC from it), so
// it lives in a JSON file both sides read.
export const PRESETS = await (await fetch(new URL('./modifier-presets.json', import.meta.url))).json();

const PRESET_BY_KEY = new Map(PRESETS.map((p) => [p.key, p]));
export const presetByKey = (key) => PRESET_BY_KEY.get(key);

const ABILITY_TOKENS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

// "Fighter 5 / Rogue 3" -> { fighter: 5, rogue: 3 }; a single class without
// a number gets the character level.
export function classLevels(ch) {
  const out = {};
  const text = String(ch.class || '');
  for (const m of text.matchAll(/([A-Za-z][A-Za-z' -]*?)\s+(\d{1,2})\b/g)) {
    out[m[1].trim().toLowerCase()] = parseInt(m[2], 10);
  }
  if (!Object.keys(out).length && text.trim()) out[text.trim().toLowerCase()] = parseInt(ch.level, 10) || 1;
  return out;
}

const tableValue = (table, level) => table.reduce((v, [min, val]) => (level >= min ? val : v), null);

// A custom modifier stored on the character -> a definition.
function customDef(c) {
  const when = { kind: c.appliesTo === 'any' ? 'any' : c.appliesTo };
  if (c.range !== 'any') when.range = c.range;
  return {
    ac: c.ac ? { bonus: c.ac } : undefined,
    name: c.name, category: 'Custom', edition: '', toggle: c.toggle,
    when, toHit: c.toHit || 0,
    damage: /^\d+$|^-\d+$/.test(c.damage) ? Number(c.damage) : c.damage,
    dice: c.dice || '', diceType: c.diceType || '', note: c.note ? `${c.name}: ${c.note}` : '',
  };
}

export function resolveModifiers(ch) {
  return (ch.modifiers || []).map((entry) => {
    const def = entry.preset ? presetByKey(entry.preset) : entry.custom && customDef(entry.custom);
    return def ? { entry, def } : null;
  }).filter(Boolean);
}

const isOn = ({ entry, def }) => !def.toggle || entry.active;

// `only`: names (weapon/item/spell) or damage types, comma-separated.
function onlyMatches(entry, def, { name, damageType }) {
  const only = String(entry.only || def.defaultOnly || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!only.length) return true;
  const n = String(name || '').toLowerCase().replace(/\s*\(2024\)$/, '');
  return only.some((o) => o === n || o === String(name || '').toLowerCase() || o === String(damageType || '').toLowerCase());
}

function matchesWhen(w = {}, a) {
  if (w.kind === 'weapon' && a.kind !== 'weapon') return false;
  if (w.kind === 'spell' && a.kind !== 'spell') return false;
  if (w.kind === 'unarmed' && a.kind !== 'unarmed') return false;
  if (w.weaponOrUnarmed && a.kind === 'spell') return false;
  if (w.range && a.range !== w.range) return false;
  if (w.props && !w.props.every((p) => (a.props || []).includes(p))) return false;
  if (w.oneHanded && (a.twoHandedGrip || (a.props || []).includes('two-handed'))) return false;
  if (w.twoHandedGrip && !a.twoHandedGrip) return false;
  if (w.finesseOrRanged && !(a.range === 'ranged' || (a.props || []).includes('finesse'))) return false;
  if (w.strBased && a.ability !== 'str') return false;
  if (w.attackRoll && !a.attackRoll) return false;
  if (w.school && a.school !== w.school) return false;
  if (w.damaging && !a.damaging) return false;
  return true;
}

// Number for a flat damage value ("PROF", "CHA", a class table, a number).
function flatValue(v, { abilityMods, prof, levels }) {
  if (typeof v === 'number') return v;
  if (v === 'PROF') return prof;
  if (ABILITY_TOKENS.includes(v)) return abilityMods[v.toLowerCase()] || 0;
  if (v && v.table) return tableValue(v.table, levels[v.class] || 0) || 0;
  return 0;
}

function diceValue(d, levels) {
  if (!d) return '';
  if (typeof d === 'string') return d;
  const lvl = levels[d.class] || 0;
  return lvl ? `${Math.ceil(lvl / d.every)}${d.die}` : '';
}

function fillNote(note, vars) {
  return note.replace(/\{(MOD|PROF|DC|TYPE)\}/g, (_, k) => vars[k]);
}

// What the character's modifiers do to one attack/spell.
// `a`: { kind, name, range, props, twoHandedGrip, ability, attackRoll,
//        school, damaging, damageType, mastery }
// `env`: { ch, abilityMods, prof }
// Returns { toHit, toHitDice, flat, parts: [{ dice, type, label }], reroll,
//           critRange, critExtraDice, notes, applied: [names] }
export function effectsFor(a, env) {
  const levels = classLevels(env.ch);
  const out = { toHit: 0, toHitDice: [], flat: 0, parts: [], reroll: '', critRange: 20, critExtraDice: 0, notes: [], applied: [] };
  const abilityMod = a.ability ? env.abilityMods[a.ability] || 0 : 0;
  const vars = { MOD: abilityMod, PROF: env.prof, DC: 8 + abilityMod + env.prof, TYPE: a.damageType || '' };

  resolveModifiers(env.ch).forEach((m) => {
    const { entry, def } = m;
    if (!def.when) return; // AC-only (Defense, Shield…): handled by the server's Auto AC
    if (!isOn(m) || !matchesWhen(def.when, a) || !onlyMatches(entry, def, { name: a.name, damageType: a.damageType })) return;
    let used = false;
    if (def.toHit) { out.toHit += def.toHit; used = true; }
    if (def.toHitDice) { out.toHitDice.push({ dice: def.toHitDice, label: def.name }); used = true; }
    const flat = def.damage !== undefined && a.damaging !== false ? flatValue(def.damage, { abilityMods: env.abilityMods, prof: env.prof, levels }) : 0;
    if (flat) { out.flat += flat; used = true; }
    const dice = a.damaging !== false ? diceValue(def.dice, levels) : '';
    if (dice) { out.parts.push({ dice, type: def.diceType || a.damageType || '', label: def.name.replace(/\s*\(.*\)$/, '') }); used = true; }
    if (def.reroll) { out.reroll = def.reroll; used = true; }
    if (def.critRange && def.critRange < out.critRange) { out.critRange = def.critRange; used = true; }
    if (def.critExtraDice) {
      const n = tableValue(def.critExtraDice.table, levels[def.critExtraDice.class] || 0) || 0;
      if (n) { out.critExtraDice += n; used = true; }
    }
    if (def.mastery && a.mastery) { out.notes.push(fillNote(MASTERY_NOTES[a.mastery], vars)); used = true; }
    if (def.note && !def.mastery) { out.notes.push(fillNote(def.note, vars)); used = true; }
    if (used || def.toggle) out.applied.push(def.name);
  });
  // 2024 Exhaustion: −2 per level on d20 Tests (core/exhaustion.js).
  const exh = a.attackRoll ? d20Penalty(env.ch) : 0;
  if (exh) {
    out.toHit += exh;
    out.applied.push(`Exhaustion −${Math.abs(exh)}`);
  }
  return out;
}

// Martial Arts: the unarmed strike's die and whether DEX may be used.
export function unarmedOverride(env) {
  const levels = classLevels(env.ch);
  let best = null;
  resolveModifiers(env.ch).forEach((m) => {
    if (!isOn(m) || !m.def.unarmed) return;
    const die = tableValue(m.def.unarmed.table, levels[m.def.unarmed.class] || 0);
    if (die) best = { die, dex: !!m.def.unarmed.dex };
  });
  return best;
}
