// Attack modifiers: feats, fighting styles, class features, weapon mastery…
// A character's `modifiers` list holds catalog references ({ preset }) or
// custom definitions ({ custom }); this module resolves them and works out
// what they add to a weapon attack or a spell.
//
//   PRESETS                         the catalog (both editions, labelled)
//   resolveModifiers(character)     -> [{ entry, def }]
//   weaponEffects(ctx), spellEffects(ctx), unarmedEffects(ctx)
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
// `entry.only` (comma-separated) limits a modifier to weapons/spells with
// those names, or to damage of those types.

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

const P = (key, name, category, edition, def) => ({ key, name, category, edition, ...def });

export const PRESETS = [
  // ---- Fighting styles
  P('archery', 'Archery', 'Fighting style', '', {
    when: { kind: 'weapon', range: 'ranged' }, toHit: 2,
  }),
  P('dueling', 'Dueling', 'Fighting style', '', {
    when: { kind: 'weapon', range: 'melee', oneHanded: true }, damage: 2,
    note: 'Dueling: +2 damage while holding the weapon in one hand and no other weapon.',
  }),
  P('gwf-2014', 'Great Weapon Fighting (2014)', 'Fighting style', '2014', {
    when: { kind: 'weapon', range: 'melee', twoHandedGrip: true }, reroll: 'gwf-2014',
    note: 'Great Weapon Fighting: 1s and 2s on the weapon\'s damage dice are rerolled once.',
  }),
  P('gwf-2024', 'Great Weapon Fighting (2024)', 'Fighting style', '2024', {
    when: { kind: 'weapon', range: 'melee', twoHandedGrip: true }, reroll: 'gwf-2024',
    note: 'Great Weapon Fighting: 1s and 2s on the weapon\'s damage dice count as 3.',
  }),
  P('thrown-weapon-fighting', 'Thrown Weapon Fighting (when throwing)', 'Fighting style', '', {
    when: { kind: 'weapon', props: ['thrown'] }, damage: 2, toggle: true,
  }),

  // ---- Feats
  P('gwm-2014', 'Great Weapon Master (2014) −5/+10', 'Feat', '2014', {
    when: { kind: 'weapon', range: 'melee', props: ['heavy'] }, toHit: -5, damage: 10, toggle: true,
    note: 'Great Weapon Master: also a bonus-action attack after a critical hit or dropping a creature to 0 HP.',
  }),
  P('gwm-2024', 'Great Weapon Master (2024)', 'Feat', '2024', {
    when: { kind: 'weapon', props: ['heavy'] }, damage: 'PROF',
    note: 'Great Weapon Master: +PB damage on a hit as part of the Attack action; Hew — bonus-action attack after a critical hit or dropping a creature to 0 HP.',
  }),
  P('ss-2014', 'Sharpshooter (2014) −5/+10', 'Feat', '2014', {
    when: { kind: 'weapon', range: 'ranged' }, toHit: -5, damage: 10, toggle: true,
    note: 'Sharpshooter: no disadvantage at long range; ignore half and three-quarters cover.',
  }),
  P('ss-2024', 'Sharpshooter (2024)', 'Feat', '2024', {
    when: { kind: 'weapon', range: 'ranged' },
    note: 'Sharpshooter: ignore half and three-quarters cover; no disadvantage at long range or with an enemy within 5 ft.',
  }),
  P('savage-attacker', 'Savage Attacker', 'Feat', '', {
    when: { kind: 'weapon' },
    note: 'Savage Attacker: once per turn, roll the weapon\'s damage dice twice and use either total.',
  }),
  P('elemental-adept', "Elemental Adept (set the type in 'only for')", 'Feat', '', {
    when: { kind: 'spell', damaging: true }, reroll: 'ea',
    note: 'Elemental Adept: ignores resistance to this damage type; 1s on the damage dice count as 2.',
  }),

  // ---- Class features
  P('rage', 'Rage (Barbarian)', 'Class feature', '', {
    when: { kind: 'any', range: 'melee', strBased: true },
    damage: { class: 'barbarian', table: [[1, 2], [9, 3], [16, 4]] }, toggle: true,
    note: 'Rage: advantage on STR checks and saves; resistance to bludgeoning, piercing and slashing damage.',
  }),
  P('brutal-critical-2014', 'Brutal Critical (2014)', 'Class feature', '2014', {
    when: { kind: 'weapon', range: 'melee' }, critExtraDice: { class: 'barbarian', table: [[9, 1], [13, 2], [17, 3]] },
  }),
  P('sneak-attack', 'Sneak Attack (Rogue)', 'Class feature', '', {
    when: { kind: 'weapon', finesseOrRanged: true }, dice: { class: 'rogue', every: 2, die: 'd6' }, toggle: true,
    note: 'Sneak Attack: once per turn, with advantage or an ally within 5 ft of the target.',
  }),
  P('divine-smite-2014', 'Divine Smite (2014) — 1st-level slot', 'Class feature', '2014', {
    when: { kind: 'weapon', range: 'melee' }, dice: '2d8', diceType: 'radiant', toggle: true,
    note: 'Divine Smite: spend a slot (mark it used); +1d8 per slot level above 1st (max 5d8), +1d8 against undead or fiends.',
  }),
  P('improved-divine-smite-2014', 'Improved Divine Smite (2014)', 'Class feature', '2014', {
    when: { kind: 'weapon', range: 'melee' }, dice: '1d8', diceType: 'radiant',
  }),
  P('radiant-strikes-2024', 'Radiant Strikes (2024 Paladin)', 'Class feature', '2024', {
    when: { kind: 'any', range: 'melee', weaponOrUnarmed: true }, dice: '1d8', diceType: 'radiant',
  }),
  P('improved-critical', 'Improved Critical (crit on 19–20)', 'Class feature', '', {
    when: { kind: 'weapon' }, critRange: 19,
  }),
  P('superior-critical', 'Superior Critical (crit on 18–20)', 'Class feature', '', {
    when: { kind: 'weapon' }, critRange: 18,
  }),
  P('martial-arts-2014', 'Martial Arts (2014 Monk)', 'Class feature', '2014', {
    when: { kind: 'unarmed' }, unarmed: { class: 'monk', table: [[1, '1d4'], [5, '1d6'], [11, '1d8'], [17, '1d10']], dex: true },
  }),
  P('martial-arts-2024', 'Martial Arts (2024 Monk)', 'Class feature', '2024', {
    when: { kind: 'unarmed' }, unarmed: { class: 'monk', table: [[1, '1d6'], [5, '1d8'], [11, '1d10'], [17, '1d12']], dex: true },
  }),
  P('agonizing-blast', 'Agonizing Blast (Warlock)', 'Class feature', '', {
    when: { kind: 'spell', damaging: true }, damage: 'CHA', defaultOnly: 'Eldritch Blast',
  }),
  P('empowered-evocation', 'Empowered Evocation (Wizard)', 'Class feature', '', {
    when: { kind: 'spell', school: 'evocation', damaging: true }, damage: 'INT',
    note: 'Empowered Evocation: adds INT to one damage roll of a wizard evocation spell.',
  }),
  P('weapon-mastery', 'Weapon Mastery (2024)', 'Class feature', '2024', {
    when: { kind: 'weapon' }, mastery: true,
    note: "Weapon Mastery: limit it to the weapon kinds you've chosen with 'only for' (e.g. Longsword, Shortbow).",
  }),

  // ---- Spells that boost attacks
  P('hex', 'Hex (target cursed)', 'Spell effect', '', {
    when: { kind: 'any', attackRoll: true }, dice: '1d6', diceType: 'necrotic', toggle: true,
  }),
  P('hunters-mark-2014', "Hunter's Mark (2014, target marked)", 'Spell effect', '2014', {
    when: { kind: 'weapon' }, dice: '1d6', toggle: true,
  }),
  P('hunters-mark-2024', "Hunter's Mark (2024, target marked)", 'Spell effect', '2024', {
    when: { kind: 'any', attackRoll: true }, dice: '1d6', diceType: 'force', toggle: true,
  }),
  P('bless', 'Bless (+1d4 to attacks)', 'Spell effect', '', {
    when: { kind: 'any', attackRoll: true }, toHitDice: '1d4', toggle: true,
  }),
];

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
