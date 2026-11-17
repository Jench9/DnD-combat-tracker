// Pure mapping: D&D Beyond API payload -> our character patch.
const { ABILITY_KEYS } = require('../../characters/model');
const {
  DDB_ALIGNMENTS, DDB_STAT_NAMES, DDB_ABILITY_SHORT, DDB_SKILL_BY_SUBTYPE,
} = require('./constants');
const { detectEdition } = require('./modifiers');

function extractDdbCharacterId(input) {
  const s = String(input || '').trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/characters\/(\d+)/);
  return m ? m[1] : null;
}

// Ability score modifiers from every source D&D Beyond keeps them in:
// species/race, class, background, feats (ASIs, half-feats) and magic
// items — an item's only while equipped (and attuned, if it needs
// attunement); D&D Beyond ties an item's modifiers to it by
// `componentId` = definition id.
//
// 2024 rules: when the background gives the ability increases (+2/+1),
// the species' own increases are ignored. D&D Beyond still lists both — a
// 2024 character's species can carry an "Ability Score Increases" trait,
// and legacy races keep their fixed bonuses — so race bonuses only count
// when the background gives none. The background's increases come either
// as `modifiers.background` or as a feat named "<Background> Ability Score
// Improvements" (e.g. "Scribe Ability Score Improvements").
const isScoreBonus = (m) => m && m.type === 'bonus' && /-score$/.test(String(m.subType || ''));

function backgroundGivesScores(groups, data) {
  if ((Array.isArray(groups.background) ? groups.background : []).some(isScoreBonus)) return true;
  const feats = Array.isArray(data.feats) ? data.feats : [];
  const asiFeatIds = new Set(feats
    .filter((f) => /ability score improvements$/i.test(String(f && f.definition && f.definition.name)))
    .map((f) => f.definition.id));
  return (Array.isArray(groups.feat) ? groups.feat : []).some((m) => isScoreBonus(m) && asiFeatIds.has(m.componentId));
}

function abilityModifiers(data) {
  const groups = data.modifiers && typeof data.modifiers === 'object' ? data.modifiers : {};
  const list = (g) => (Array.isArray(groups[g]) ? groups[g] : []);
  const activeItems = new Set((Array.isArray(data.inventory) ? data.inventory : [])
    .filter((i) => i && i.equipped && i.definition && (!i.definition.canAttune || i.isAttuned))
    .map((i) => i.definition.id));
  const out = [];
  const skipRaceScores = backgroundGivesScores(groups, data);
  list('race').forEach((m) => { if (!(skipRaceScores && isScoreBonus(m))) out.push(m); });
  ['class', 'background', 'feat'].forEach((g) => out.push(...list(g)));
  list('item').forEach((m) => { if (m && activeItems.has(m.componentId)) out.push(m); });
  return out.filter(Boolean);
}

function ddbStatValue(data, statId, mods = abilityModifiers(data)) {
  const base = (data.stats || []).find((s) => s.id === statId);
  const bonus = (data.bonusStats || []).find((s) => s.id === statId);
  const override = (data.overrideStats || []).find((s) => s.id === statId);

  if (override && typeof override.value === 'number') {
    return override.value;
  }

  const baseVal = base && typeof base.value === 'number' ? base.value : 10;
  const bonusVal = bonus && typeof bonus.value === 'number' ? bonus.value : 0;
  const subType = `${DDB_STAT_NAMES[statId]}-score`;

  const modBonus = mods
    .filter((m) => m.type === 'bonus' && m.subType === subType)
    .reduce((sum, m) => sum + (Number(m.value) || 0), 0);
  // "Your score becomes N" (Gauntlets of Ogre Power, Headband of Intellect…).
  const setTo = mods
    .filter((m) => m.type === 'set' && m.subType === subType)
    .reduce((max, m) => Math.max(max, Number(m.value) || 0), 0);

  return Math.max(baseVal + bonusVal + modBonus, setTo);
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
  const weaponProf = { simple: false, martial: false };
  modifierGroups.forEach((m) => {
    if (!m || m.type !== 'proficiency') return;
    const subType = String(m.subType || '');
    if (subType.endsWith('-saving-throws')) {
      const short = DDB_ABILITY_SHORT[subType.replace('-saving-throws', '')];
      if (short) saveProf[short] = true;
    } else if (DDB_SKILL_BY_SUBTYPE[subType]) {
      skillProf[DDB_SKILL_BY_SUBTYPE[subType]] = true;
    } else if (subType === 'simple-weapons') {
      weaponProf.simple = true;
    } else if (subType === 'martial-weapons') {
      weaponProf.martial = true;
    }
  });
  return { saveProf, skillProf, weaponProf };
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

// D&D Beyond's baseHitPoints is only the rolled/fixed hit-die total;
// the Constitution modifier (per level) and per-level bonuses such as
// the Tough feat are applied client-side. overrideHitPoints wins outright.
function computeMaxHitPoints(data, abilities, level) {
  if (typeof data.overrideHitPoints === 'number') return data.overrideHitPoints;
  const conMod = Math.floor((abilities.con - 10) / 2);
  const perLevelBonus = (data.modifiers && typeof data.modifiers === 'object'
    ? Object.values(data.modifiers).flat()
    : [])
    .filter((m) => m && m.type === 'bonus' && m.subType === 'hit-points-per-level')
    .reduce((sum, m) => sum + (Number(m.value) || 0), 0);
  return Math.max(1, (data.baseHitPoints || 0) + (data.bonusHitPoints || 0) + (conMod + perLevelBonus) * level);
}

// Hit Dice per class: "3d10 + 2d6", and how many of each size are spent.
function mapHitDice(classes) {
  const total = new Map();
  const used = { d6: 0, d8: 0, d10: 0, d12: 0 };
  classes.forEach((c) => {
    const size = (c.definition && c.definition.hitDice) || 8;
    total.set(size, (total.get(size) || 0) + (c.level || 0));
    if (`d${size}` in used) used[`d${size}`] += parseInt(c.hitDiceUsed, 10) || 0;
  });
  const text = [...total.entries()].sort((a, b) => b[0] - a[0]).filter(([, n]) => n > 0).map(([s, n]) => `${n}d${s}`).join(' + ');
  return { text, used };
}

// D&D Beyond conditions: [{ id, level }]; id 4 is Exhaustion.
function ddbExhaustion(data) {
  const ex = (Array.isArray(data.conditions) ? data.conditions : []).find((c) => c && c.id === 4);
  return ex ? Math.max(0, Math.min(6, parseInt(ex.level, 10) || 0)) : 0;
}

function ddbCurrency(data) {
  const c = data.currencies && typeof data.currencies === 'object' ? data.currencies : {};
  const n = (v) => Math.max(0, parseInt(v, 10) || 0);
  return { cp: n(c.cp), sp: n(c.sp), ep: n(c.ep), gp: n(c.gp), pp: n(c.pp) };
}

function mapDndBeyondData(data, ddbId) {
  const abilities = {};
  const mods = abilityModifiers(data);
  ABILITY_KEYS.forEach((key, i) => {
    abilities[key] = ddbStatValue(data, i + 1, mods);
  });

  const classes = Array.isArray(data.classes) ? data.classes : [];
  const level = classes.reduce((sum, c) => sum + (c.level || 0), 0) || 1;
  const classText = classes
    .map((c) => `${(c.definition && c.definition.name) || 'Class'} ${c.level || ''}`.trim())
    .join(' / ');

  const { saveProf, skillProf, weaponProf } = mapProficiencies(data);
  const ac = estimateArmorClass(data, abilities);
  const hpMax = computeMaxHitPoints(data, abilities, level);

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

  // v5 payloads keep it under decorations; older ones at the top level.
  const avatarUrl = (data.decorations && data.decorations.avatarUrl) || data.avatarUrl || '';

  return {
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : '',
    patch: {
      name: data.name || '',
      race: (data.race && (data.race.fullName || data.race.baseRaceName)) || '',
      class: classText,
      level,
      background: (data.background && data.background.definition && data.background.definition.name) || '',
      alignment: DDB_ALIGNMENTS[data.alignmentId] || '',
      ac,
      speed: (data.race && data.race.weightSpeeds && data.race.weightSpeeds.normal && data.race.weightSpeeds.normal.walk) || 30,
      hitDice: mapHitDice(classes).text,
      hitDiceUsed: mapHitDice(classes).used,
      rulesEdition: detectEdition(data),
      inspiration: !!data.inspiration,
      exhaustion: ddbExhaustion(data),
      currency: ddbCurrency(data),
      abilities,
      hpMax,
      hpCurrent: Math.max(0, hpMax - (data.removedHitPoints || 0)),
      hpTemp: data.temporaryHitPoints || 0,
      saveProf,
      weaponProf,
      skillProf,
      equipment: equipmentText,
      features: features.join('\n'),
      ddbId: String(ddbId || data.id || ''),
    },
    notesPrefix: 'Imported from D&D Beyond. AC and proficiencies are best-effort — please double-check them.',
  };
}

module.exports = { extractDdbCharacterId, ddbStatValue, mapDndBeyondData };
