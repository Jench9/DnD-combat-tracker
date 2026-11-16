// Spell shape and validation. Pure functions.
//
// { id, name, level 0–9 (0 = cantrip), school, castingTime, range, components,
//   duration, concentration, ritual, classes: [...],
//   mechanic: 'attack' (spell attack roll) | 'save' (targets save) |
//             'auto' (always hits, e.g. magic missile) | 'heal' | 'none',
//   saveAbility, saveSuccess: 'half' | 'none' (damage on a successful save),
//   dice + damageType (for 'heal' the healing dice), addMod (add the caster's
//   spellcasting modifier to the roll, e.g. cure wounds),
//   extraDice + extraDamageType (a second damage type, e.g. ice storm),
//   higherLevelDice (added per slot level above the spell's level),
//   cantripScaling (dice count ×2/×3/×4 at character levels 5/11/17),
//   description, source: 'srd' | 'custom', createdBy }
const { normaliseDice, DAMAGE_TYPES } = require('../items/model');

const ID_RE = /^[a-z0-9]{1,20}$/;
const SCHOOLS = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation'];
const MECHANICS = ['attack', 'save', 'auto', 'heal', 'none'];
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const CLASSES = ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'];

function blankSpell(id) {
  return {
    id, name: '', level: 1, school: 'evocation', castingTime: '1 action', range: '', components: 'V, S',
    duration: 'Instantaneous', concentration: false, ritual: false, classes: [],
    mechanic: 'none', saveAbility: '', saveSuccess: 'half', dice: '', damageType: '', addMod: false,
    extraDice: '', extraDamageType: '', higherLevelDice: '', cantripScaling: false,
    description: '', source: 'custom', createdBy: '',
  };
}

const str = (v, max) => String(v).slice(0, max);
const dice = (v, current) => (String(v).trim() === '' ? '' : normaliseDice(v) || current);

// `source` and `createdBy` are set by the service, never by clients.
function sanitizeSpellPatch(existing, patch) {
  const next = { ...existing };
  if (typeof patch.name === 'string') next.name = str(patch.name, 60);
  if (patch.level !== undefined) {
    const n = parseInt(patch.level, 10);
    if (Number.isFinite(n)) next.level = Math.max(0, Math.min(9, n));
  }
  if (SCHOOLS.includes(patch.school)) next.school = patch.school;
  ['castingTime', 'range', 'components', 'duration'].forEach((k) => {
    if (typeof patch[k] === 'string') next[k] = str(patch[k], 60);
  });
  ['concentration', 'ritual', 'addMod', 'cantripScaling'].forEach((k) => {
    if (patch[k] !== undefined) next[k] = !!patch[k];
  });
  if (Array.isArray(patch.classes)) next.classes = CLASSES.filter((c) => patch.classes.includes(c));
  if (MECHANICS.includes(patch.mechanic)) next.mechanic = patch.mechanic;
  if (patch.saveAbility === '' || ABILITIES.includes(patch.saveAbility)) next.saveAbility = patch.saveAbility;
  if (['half', 'none'].includes(patch.saveSuccess)) next.saveSuccess = patch.saveSuccess;
  if (patch.dice !== undefined) next.dice = dice(patch.dice, existing.dice);
  if (patch.damageType === '' || DAMAGE_TYPES.includes(patch.damageType)) next.damageType = patch.damageType;
  if (patch.extraDice !== undefined) next.extraDice = dice(patch.extraDice, existing.extraDice);
  if (patch.extraDamageType === '' || DAMAGE_TYPES.includes(patch.extraDamageType)) next.extraDamageType = patch.extraDamageType;
  if (patch.higherLevelDice !== undefined) next.higherLevelDice = dice(patch.higherLevelDice, existing.higherLevelDice);
  if (typeof patch.description === 'string') next.description = str(patch.description, 3000);
  return next;
}

module.exports = { ID_RE, SCHOOLS, MECHANICS, ABILITIES, CLASSES, blankSpell, sanitizeSpellPatch };
