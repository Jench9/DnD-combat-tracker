// Pure mapping: D&D Beyond API payload -> our character patch.
const { ABILITY_KEYS } = require('../../characters/model');
const {
  DDB_ALIGNMENTS, DDB_STAT_NAMES, DDB_ABILITY_SHORT, DDB_SKILL_BY_SUBTYPE,
} = require('./constants');

function extractDdbCharacterId(input) {
  const s = String(input || '').trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/characters\/(\d+)/);
  return m ? m[1] : null;
}

function ddbStatValue(data, statId) {
  const base = (data.stats || []).find((s) => s.id === statId);
  const bonus = (data.bonusStats || []).find((s) => s.id === statId);
  const override = (data.overrideStats || []).find((s) => s.id === statId);

  if (override && typeof override.value === 'number') {
    return override.value;
  }

  const baseVal = base && typeof base.value === 'number' ? base.value : 10;
  const bonusVal = bonus && typeof bonus.value === 'number' ? bonus.value : 0;

  const abilityName = DDB_STAT_NAMES[statId];

  const featBonus = (data.modifiers?.feat || [])
    .filter((m) => m.type === 'bonus' && m.subType === `${abilityName}-score`)
    .reduce((sum, m) => sum + (Number(m.value) || 0), 0);

  return baseVal + bonusVal + featBonus;
}

// Proficiencies live scattered across several modifier arrays
// (race/class/background/feat/item). We scan all of them for
// 'proficiency' entries tied to a skill or to saving throws.
function mapProficiencies(data) {
  const modifierGroups = data.modifiers && typeof data.modifiers === 'object'
    ? Object.values(data.modifiers).flat()
    : [];
  const saveProf = {};
  const skillProf = {};
  modifierGroups.forEach((m) => {
    if (!m || m.type !== 'proficiency') return;
    const subType = String(m.subType || '');
    if (subType.endsWith('-saving-throws')) {
      const short = DDB_ABILITY_SHORT[subType.replace('-saving-throws', '')];
      if (short) saveProf[short] = true;
    } else if (DDB_SKILL_BY_SUBTYPE[subType]) {
      skillProf[DDB_SKILL_BY_SUBTYPE[subType]] = true;
    }
  });
  return { saveProf, skillProf };
}

// AC has no single source field in the raw data — D&D Beyond
// computes it client-side from equipped armor/shield/feats. This is
// a best-effort approximation from equipped armor only; it will be
// wrong for characters with AC-affecting feats or unarmored
// defense builds, so it's always worth double-checking in the app.
function estimateArmorClass(data, abilities) {
  const dexMod = Math.floor((abilities.dex - 10) / 2);
  let ac = 10 + dexMod;
  const inventory = Array.isArray(data.inventory) ? data.inventory : [];
  const equippedArmor = inventory.find(
    (i) => i.equipped && i.definition && i.definition.filterType === 'Armor' && i.definition.armorTypeId !== 4
  );
  const equippedShield = inventory.find(
    (i) => i.equipped && i.definition && i.definition.armorTypeId === 4
  );
  if (equippedArmor && equippedArmor.definition.armorClass) {
    const maxDex = equippedArmor.definition.armorTypeId === 1 ? dexMod : Math.min(dexMod, 2);
    ac = equippedArmor.definition.armorClass + (equippedArmor.definition.armorTypeId === 3 ? 0 : maxDex);
  }
  if (equippedShield && equippedShield.definition.armorClass) {
    ac += equippedShield.definition.armorClass;
  }
  return ac;
}

function mapDndBeyondData(data) {
  const abilities = {};
  ABILITY_KEYS.forEach((key, i) => {
    abilities[key] = ddbStatValue(data, i + 1);
  });

  const classes = Array.isArray(data.classes) ? data.classes : [];
  const level = classes.reduce((sum, c) => sum + (c.level || 0), 0) || 1;
  const classText = classes
    .map((c) => `${(c.definition && c.definition.name) || 'Class'} ${c.level || ''}`.trim())
    .join(' / ');

  const { saveProf, skillProf } = mapProficiencies(data);
  const ac = estimateArmorClass(data, abilities);

  const inventory = Array.isArray(data.inventory) ? data.inventory : [];
  const equipmentText = inventory
    .map((i) => `${(i.definition && i.definition.name) || 'Item'}${i.quantity > 1 ? ` x${i.quantity}` : ''}`)
    .join('\n');

  const features = [];
  (data.classes || []).forEach((c) => {
    ((c.classFeatures) || []).forEach((f) => {
      if (f.definition && f.definition.name) features.push(f.definition.name);
    });
  });
  (data.feats || []).forEach((f) => {
    if (f.definition && f.definition.name) features.push(f.definition.name);
  });

  return {
    patch: {
      name: data.name || '',
      race: (data.race && (data.race.fullName || data.race.baseRaceName)) || '',
      class: classText,
      level,
      background: (data.background && data.background.definition && data.background.definition.name) || '',
      alignment: DDB_ALIGNMENTS[data.alignmentId] || '',
      ac,
      speed: (data.race && data.race.weightSpeeds && data.race.weightSpeeds.normal && data.race.weightSpeeds.normal.walk) || 30,
      hitDice: classes[0] ? `${level}d${(classes[0].definition && classes[0].definition.hitDice) || 8}` : '',
      abilities,
      hpMax: (data.baseHitPoints || 0) + (data.bonusHitPoints || 0),
      hpCurrent: Math.max(0, (data.baseHitPoints || 0) + (data.bonusHitPoints || 0) - (data.removedHitPoints || 0)),
      hpTemp: data.temporaryHitPoints || 0,
      saveProf,
      skillProf,
      equipment: equipmentText,
      features: features.join('\n'),
    },
    notesPrefix: 'Imported from D&D Beyond. AC and proficiencies are best-effort — please double-check them.',
  };
}

module.exports = { extractDdbCharacterId, ddbStatValue, mapDndBeyondData };
