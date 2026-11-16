// Item shape and validation. Pure functions.
//
// Common:  { id, name, type: 'weapon' | 'armor' | 'gear', cost, weight, notes,
//            source: 'srd' | 'custom', createdBy: 'dm' | '<characterId>' | '',
//            edition: '2014' | '2024' | '' (SRD 5.1 / 5.2; '' for custom) }
// Weapon:  weaponCategory 'simple'|'martial', attackType 'melee'|'ranged',
//          damage dice + damageType, versatileDamage (dice when used two-handed),
//          range 'normal/long' ft, properties [...], magicBonus (+to hit and damage),
//          extraDamage + extraDamageType (e.g. a flame tongue's 2d6 fire)
// Armor:   armorType 'light'|'medium'|'heavy'|'shield', baseAc (shield: the bonus),
//          maxDex (null = no limit), strengthReq, stealthDisadvantage
// Gear:    effectDice (e.g. a healing potion's 2d4+2), effect label
// The to-hit number isn't stored: it depends on who uses the item
// (ability modifier + proficiency + magicBonus).

const ID_RE = /^[a-z0-9]{1,20}$/;
const TYPES = ['weapon', 'armor', 'gear'];
const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const PROPERTIES = ['ammunition', 'finesse', 'heavy', 'light', 'loading', 'reach', 'special', 'thrown', 'two-handed'];
const ARMOR_TYPES = ['light', 'medium', 'heavy', 'shield'];
// "1d8", "2d6+2", "1d4 - 1", or a flat "1". Normalised to "2d6+2".
const DICE_RE = /^\s*(?:(\d{1,2})\s*d\s*(4|6|8|10|12|20|100)(?:\s*([+-])\s*(\d{1,3}))?|(\d{1,3}))\s*$/i;
const RANGE_RE = /^\s*(\d{1,4})\s*\/\s*(\d{1,4})\s*$/;

function normaliseDice(v) {
  const m = DICE_RE.exec(String(v || ''));
  if (!m) return null;
  if (m[5] !== undefined) return String(parseInt(m[5], 10));
  const count = parseInt(m[1], 10);
  if (count < 1) return null;
  const mod = m[3] && parseInt(m[4], 10) ? `${m[3]}${parseInt(m[4], 10)}` : '';
  return `${count}d${m[2]}${mod}`;
}

function blankItem(id, type = 'gear') {
  return {
    id, name: '', type, cost: '', weight: 0, notes: '', source: 'custom', createdBy: '', edition: '',
    weaponCategory: 'simple', attackType: 'melee', damage: '1d4', damageType: 'bludgeoning',
    versatileDamage: '', range: '', properties: [], magicBonus: 0, extraDamage: '', extraDamageType: '',
    armorType: 'light', baseAc: 11, maxDex: null, strengthReq: 0, stealthDisadvantage: false,
    effectDice: '', effect: '',
  };
}

const int = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const str = (v, max) => String(v).slice(0, max);
// '' clears a dice field; invalid dice keep the old value.
const dice = (v, current, allowEmpty) => {
  if (allowEmpty && String(v).trim() === '') return '';
  return normaliseDice(v) || current;
};

// Merge a patch onto an item. `source` and `createdBy` are set by the
// service, never by clients.
function sanitizeItemPatch(existing, patch) {
  const next = { ...existing };
  if (typeof patch.name === 'string') next.name = str(patch.name, 60);
  if (TYPES.includes(patch.type)) next.type = patch.type;
  if (typeof patch.cost === 'string') next.cost = str(patch.cost, 20);
  if (patch.weight !== undefined) {
    const w = Number(patch.weight);
    if (Number.isFinite(w)) next.weight = Math.max(0, Math.min(9999, Math.round(w * 100) / 100));
  }
  if (typeof patch.notes === 'string') next.notes = str(patch.notes, 8000);
  if (['2014', '2024', ''].includes(patch.edition)) next.edition = patch.edition;

  if (['simple', 'martial'].includes(patch.weaponCategory)) next.weaponCategory = patch.weaponCategory;
  if (['melee', 'ranged'].includes(patch.attackType)) next.attackType = patch.attackType;
  if (patch.damage !== undefined) next.damage = dice(patch.damage, existing.damage, false);
  if (DAMAGE_TYPES.includes(patch.damageType)) next.damageType = patch.damageType;
  if (patch.versatileDamage !== undefined) next.versatileDamage = dice(patch.versatileDamage, existing.versatileDamage, true);
  if (patch.range !== undefined) {
    const m = RANGE_RE.exec(String(patch.range));
    if (String(patch.range).trim() === '') next.range = '';
    else if (m && +m[1] <= +m[2]) next.range = `${+m[1]}/${+m[2]}`;
  }
  if (Array.isArray(patch.properties)) {
    next.properties = PROPERTIES.filter((p) => patch.properties.includes(p));
  }
  if (patch.magicBonus !== undefined) next.magicBonus = int(patch.magicBonus, 0, 5, existing.magicBonus);
  if (patch.extraDamage !== undefined) next.extraDamage = dice(patch.extraDamage, existing.extraDamage, true);
  if (patch.extraDamageType === '' || DAMAGE_TYPES.includes(patch.extraDamageType)) next.extraDamageType = patch.extraDamageType;

  if (ARMOR_TYPES.includes(patch.armorType)) next.armorType = patch.armorType;
  if (patch.baseAc !== undefined) next.baseAc = int(patch.baseAc, 0, 30, existing.baseAc);
  if (patch.maxDex === null || patch.maxDex === '') next.maxDex = null;
  else if (patch.maxDex !== undefined) next.maxDex = int(patch.maxDex, 0, 10, existing.maxDex);
  if (patch.strengthReq !== undefined) next.strengthReq = int(patch.strengthReq, 0, 30, existing.strengthReq);
  if (patch.stealthDisadvantage !== undefined) next.stealthDisadvantage = !!patch.stealthDisadvantage;

  if (patch.effectDice !== undefined) next.effectDice = dice(patch.effectDice, existing.effectDice, true);
  if (typeof patch.effect === 'string') next.effect = str(patch.effect, 60);
  return next;
}

module.exports = {
  ID_RE, TYPES, DAMAGE_TYPES, PROPERTIES, ARMOR_TYPES, normaliseDice, blankItem, sanitizeItemPatch,
};
