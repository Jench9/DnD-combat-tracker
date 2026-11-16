// Maps a D&D Beyond character's spells, spell slots and spellcasting
// ability. Pure: takes the D&D Beyond payload and the spell library.
//
//   planSpells(data, library, newId) -> {
//     spells:       [{ id, spellId, name, prepared }]   for the character
//     newSpells:    [{ id, patch }]   spells not in the library yet
//     spellSlots:   9 × { max, used }  (max from the 5e caster tables)
//     spellAbility: '' | 'int' | 'wis' | 'cha' | …
//   }
//
// D&D Beyond's character JSON is unofficial; fields are read defensively.

const ABILITY_BY_ID = { 1: 'str', 2: 'dex', 3: 'con', 4: 'int', 5: 'wis', 6: 'cha' };
const CLASS_ABILITY = { bard: 'cha', cleric: 'wis', druid: 'wis', paladin: 'cha', ranger: 'wis', sorcerer: 'cha', warlock: 'cha', wizard: 'int', artificer: 'int' };
const FULL = ['bard', 'cleric', 'druid', 'sorcerer', 'wizard'];
const HALF = ['paladin', 'ranger', 'artificer'];
const THIRD_SUBCLASSES = ['eldritch knight', 'arcane trickster'];
// Classes that know their spells rather than preparing them each day.
const KNOWN_CASTERS = ['bard', 'ranger', 'sorcerer', 'warlock'];

// Spell slots per caster level (PHB multiclass spellcaster table), 1st–9th.
const SLOT_TABLE = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const lower = (s) => String(s || '').trim().toLowerCase();

function classInfo(data) {
  return (Array.isArray(data.classes) ? data.classes : []).map((c) => ({
    id: c.id,
    name: lower(c.definition && c.definition.name),
    subclass: lower(c.subclassDefinition && c.subclassDefinition.name),
    level: parseInt(c.level, 10) || 0,
    abilityId: c.definition && c.definition.spellCastingAbilityId,
  }));
}

// Caster level for the slot table. One class uses its own progression
// (half casters from 2nd level, rounding up; third casters from 3rd);
// several classes use the multiclass rule (rounding down).
function casterLevel(classes) {
  const casters = classes.filter((c) => FULL.includes(c.name) || HALF.includes(c.name) || THIRD_SUBCLASSES.includes(c.subclass));
  if (casters.length === 1) {
    const c = casters[0];
    if (FULL.includes(c.name)) return c.level;
    if (HALF.includes(c.name)) return c.name === 'artificer' ? Math.ceil(c.level / 2) : (c.level >= 2 ? Math.ceil(c.level / 2) : 0);
    return c.level >= 3 ? Math.ceil(c.level / 3) : 0;
  }
  return casters.reduce((sum, c) => {
    if (FULL.includes(c.name)) return sum + c.level;
    if (HALF.includes(c.name)) return sum + (c.name === 'artificer' ? Math.ceil(c.level / 2) : Math.floor(c.level / 2));
    return sum + Math.floor(c.level / 3);
  }, 0);
}

// Warlock pact magic: [number of slots, slot level].
function pactSlots(level) {
  if (level < 1) return [0, 0];
  const count = level >= 17 ? 4 : level >= 11 ? 3 : level >= 2 ? 2 : 1;
  return [count, Math.min(5, Math.ceil(level / 2))];
}

// Which slots come back on a short rest: { level, count } (level 0 = none).
function pactMagicOf(classes) {
  const warlock = classes.find((c) => c.name === 'warlock');
  const [count, level] = pactSlots(warlock ? warlock.level : 0);
  return { level, count };
}

function computeSlots(data, classes) {
  const row = SLOT_TABLE[Math.min(20, casterLevel(classes))] || [];
  const slots = Array.from({ length: 9 }, (_, i) => ({ max: row[i] || 0, used: 0 }));
  const warlock = classes.find((c) => c.name === 'warlock');
  const [pactCount, pactLevel] = pactSlots(warlock ? warlock.level : 0);
  if (pactCount) slots[pactLevel - 1].max += pactCount; // pact slots folded in at their level
  // Used counts as recorded on D&D Beyond.
  (Array.isArray(data.spellSlots) ? data.spellSlots : []).forEach((s) => {
    const i = (parseInt(s.level, 10) || 0) - 1;
    if (slots[i]) slots[i].used += parseInt(s.used, 10) || 0;
  });
  (Array.isArray(data.pactMagic) ? data.pactMagic : []).forEach((s) => {
    const i = (parseInt(s.level, 10) || 0) - 1;
    if (slots[i]) slots[i].used += parseInt(s.used, 10) || 0;
  });
  slots.forEach((s) => { s.max = Math.min(9, s.max); s.used = Math.min(s.max, s.used); });
  return slots;
}

function spellAbilityOf(classes) {
  const casters = classes.filter((c) => ABILITY_BY_ID[c.abilityId] || CLASS_ABILITY[c.name]).sort((a, b) => b.level - a.level);
  const main = casters[0];
  return main ? (ABILITY_BY_ID[main.abilityId] || CLASS_ABILITY[main.name]) : '';
}

// ---- spell definitions -> library spells
const ACTIVATION = { 1: 'action', 3: 'bonus action', 4: 'reaction', 6: 'minute', 7: 'hour' };
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/\s+/g, ' ').trim();
const diceOf = (die) => (die && (die.diceString || (die.fixedValue ? String(die.fixedValue) : ''))) || '';
const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;

function castingTimeOf(def) {
  const a = def.activation || {};
  const unit = ACTIVATION[a.activationType];
  if (!unit) return '';
  const n = parseInt(a.activationTime, 10) || 1;
  return unit === 'action' || unit === 'bonus action' || unit === 'reaction' ? `${n} ${unit}` : plural(n, unit);
}

function rangeOf(def) {
  const r = def.range || {};
  const aoe = r.aoeValue && r.aoeType ? ` (${r.aoeValue}-ft ${lower(r.aoeType)})` : '';
  if (r.origin === 'Self') return 'Self' + aoe;
  if (r.origin === 'Touch') return 'Touch';
  if (r.rangeValue) return `${r.rangeValue} ft${aoe}`;
  return String(r.origin || '');
}

function durationOf(def) {
  const d = def.duration || {};
  const amount = d.durationInterval && d.durationUnit ? plural(d.durationInterval, lower(d.durationUnit)) : '';
  if (d.durationType === 'Instantaneous') return 'Instantaneous';
  if (d.durationType === 'Concentration') return amount ? `Up to ${amount}` : 'Concentration';
  return amount || String(d.durationType || '');
}

function spellFromDefinition(def) {
  const mods = Array.isArray(def.modifiers) ? def.modifiers : [];
  const damage = mods.filter((m) => m && m.type === 'damage' && diceOf(m.die));
  const heal = mods.find((m) => m && m.type === 'bonus' && m.subType === 'hit-points' && diceOf(m.die));
  const main = damage[0] || heal;
  const extra = damage.find((m) => m !== main && m.subType !== (main && main.subType));
  const higher = main && main.atHigherLevels;
  const defs = (higher && Array.isArray(higher.higherLevelDefinitions)) ? higher.higherLevelDefinitions : [];
  const level = parseInt(def.level, 10) || 0;

  let mechanic = 'none';
  if (def.requiresAttackRoll) mechanic = 'attack';
  else if (def.requiresSavingThrow) mechanic = 'save';
  else if (heal && !damage.length) mechanic = 'heal';
  else if (damage.length) mechanic = 'auto';

  const components = (Array.isArray(def.components) ? def.components : []).map((c) => ({ 1: 'V', 2: 'S', 3: 'M' }[c])).filter(Boolean);
  return {
    name: def.name,
    level,
    school: lower(def.school),
    castingTime: castingTimeOf(def),
    range: rangeOf(def),
    components: components.join(', '),
    duration: durationOf(def),
    concentration: !!def.concentration,
    ritual: !!def.ritual,
    mechanic,
    saveAbility: ABILITY_BY_ID[def.saveDcAbilityId] || '',
    saveSuccess: /half as much damage/i.test(stripHtml(def.description)) ? 'half' : 'none',
    dice: main ? diceOf(main.die) : '',
    damageType: damage.length ? lower(main.subType) : '',
    addMod: !!(main && main.usePrimaryStat),
    extraDice: extra ? diceOf(extra.die) : '',
    extraDamageType: extra ? lower(extra.subType) : '',
    higherLevelDice: level > 0 && higher && higher.scaleType === 'spellscale' && defs[0] ? diceOf(defs[0].dice) : '',
    cantripScaling: level === 0 && !!higher && higher.scaleType === 'characterlevel',
    description: stripHtml(def.description).slice(0, 3000),
  };
}

// Every spell entry from every source D&D Beyond lists.
function allSpellEntries(data, classes) {
  const out = [];
  (Array.isArray(data.classSpells) ? data.classSpells : []).forEach((cs) => {
    const cls = classes.find((c) => c.id === cs.characterClassId);
    (Array.isArray(cs.spells) ? cs.spells : []).forEach((sp) => out.push({ sp, cls }));
  });
  const other = data.spells && typeof data.spells === 'object' ? data.spells : {};
  Object.values(other).forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((sp) => out.push({ sp, cls: null }));
  });
  return out;
}

function planSpells(data, library, newId) {
  const classes = classInfo(data);
  const byName = new Map(library.map((sp) => [lower(sp.name), sp]));
  const spells = [];
  const newSpells = [];
  const seen = new Set();

  allSpellEntries(data, classes).forEach(({ sp, cls }) => {
    const def = sp && sp.definition;
    if (!def || !def.name) return;
    const key = lower(def.name);
    // Cantrips, always-prepared spells, known-spell classes and spells from
    // race/feats/items are always ready; otherwise D&D Beyond's flag.
    const prepared = !!(sp.prepared || sp.alwaysPrepared || (parseInt(def.level, 10) || 0) === 0
      || !cls || KNOWN_CASTERS.includes(cls.name));
    if (seen.has(key)) {
      if (prepared) spells.find((s) => s.key === key).prepared = true;
      return;
    }
    seen.add(key);
    let lib = byName.get(key);
    if (!lib) {
      const id = newId();
      const patch = spellFromDefinition(def);
      newSpells.push({ id, patch });
      lib = { id, name: def.name };
      byName.set(key, lib);
    }
    spells.push({ key, id: newId(), spellId: lib.id, name: lib.name, prepared });
  });

  return {
    spells: spells.map(({ key, ...rest }) => rest),
    newSpells,
    spellSlots: computeSlots(data, classes),
    spellAbility: spellAbilityOf(classes),
    pactMagic: pactMagicOf(classes),
  };
}

module.exports = { planSpells, spellFromDefinition, casterLevel, SLOT_TABLE };
