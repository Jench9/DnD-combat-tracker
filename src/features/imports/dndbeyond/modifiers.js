// Recognises feats, class features, fighting styles and invocations in a
// D&D Beyond character and maps them to modifier presets (the catalog in
// public/js/core/modifiers.js — keys must match it; a test checks this).
// Pure. D&D Beyond's character JSON is unofficial; read defensively.

// Normalised feature name -> preset key; `{ 2014, 2024 }` where they differ.
const BY_NAME = {
  archery: 'archery',
  defense: 'defense',
  'unarmored defense:barbarian': 'unarmored-defense-barbarian',
  'unarmored defense:monk': 'unarmored-defense-monk',
  'draconic resilience': { 2014: 'draconic-resilience-2014', 2024: 'draconic-resilience-2024' },
  dueling: 'dueling',
  'great weapon fighting': { 2014: 'gwf-2014', 2024: 'gwf-2024' },
  'thrown weapon fighting': 'thrown-weapon-fighting',
  'great weapon master': { 2014: 'gwm-2014', 2024: 'gwm-2024' },
  sharpshooter: { 2014: 'ss-2014', 2024: 'ss-2024' },
  'savage attacker': 'savage-attacker',
  'elemental adept': 'elemental-adept',
  rage: 'rage',
  'brutal critical': { 2014: 'brutal-critical-2014' },
  'sneak attack': 'sneak-attack',
  'divine smite': { 2014: 'divine-smite-2014' }, // a spell in 2024 (imported as one)
  'improved divine smite': { 2014: 'improved-divine-smite-2014' },
  'radiant strikes': { 2024: 'radiant-strikes-2024' },
  'improved critical': 'improved-critical',
  'superior critical': 'superior-critical',
  'martial arts': { 2014: 'martial-arts-2014', 2024: 'martial-arts-2024' },
  'agonizing blast': 'agonizing-blast',
  'empowered evocation': 'empowered-evocation',
  'weapon mastery': 'weapon-mastery',
};
// Switched off until they apply; Sneak Attack starts on (most turns it does).
const START_OFF = new Set(['rage', 'gwm-2014', 'ss-2014', 'divine-smite-2014', 'thrown-weapon-fighting']);

const norm = (s) => String(s || '').toLowerCase().replace(/^fighting style:\s*/, '').replace(/\s+/g, ' ').trim();
const nameOf = (x) => x && x.definition && x.definition.name;

// Every feature-ish name on the character.
function featureNames(data) {
  const names = [];
  (Array.isArray(data.feats) ? data.feats : []).forEach((f) => names.push(nameOf(f)));
  (Array.isArray(data.classes) ? data.classes : []).forEach((c) => {
    const level = parseInt(c.level, 10) || 0;
    const feats = [...(c.classFeatures || []), ...((c.subclassDefinition && c.subclassDefinition.classFeatures) || [])];
    const cls = norm(c.definition && c.definition.name);
    feats.forEach((f) => {
      const req = f && f.definition && (f.definition.requiredLevel || 0);
      if (req > level) return;
      names.push(nameOf(f));
      // Same name, different rules per class.
      if (norm(nameOf(f)) === 'unarmored defense') names.push(`unarmored defense:${cls}`);
    });
  });
  const options = data.options && typeof data.options === 'object' ? data.options : {};
  Object.values(options).forEach((list) => (Array.isArray(list) ? list : []).forEach((o) => names.push(nameOf(o))));
  ((data.race && data.race.racialTraits) || []).forEach((t) => names.push(nameOf(t)));
  return names.filter(Boolean).map(norm);
}

// -> preset keys, deduplicated, in catalog-ish order.
// 2024 rules if the character has Weapon Mastery (2024 martial classes).
// A 2024 character without it (e.g. a wizard) reads as 2014 — fixable on the sheet.
function detectEdition(data) {
  return new Set(featureNames(data)).has('weapon mastery') ? '2024' : '2014';
}

function detectPresets(data) {
  const names = new Set(featureNames(data));
  const edition = names.has('weapon mastery') ? '2024' : '2014';
  const keys = [];
  Object.entries(BY_NAME).forEach(([name, key]) => {
    if (!names.has(name)) return;
    const k = typeof key === 'string' ? key : key[edition];
    if (k && !keys.includes(k)) keys.push(k);
  });
  return keys;
}

// Adds detected presets the character doesn't have yet; keeps everything
// already there (including custom ones and on/off states).
function mergeModifiers(existing, data, newId) {
  const list = Array.isArray(existing) ? [...existing] : [];
  detectPresets(data).forEach((key) => {
    if (list.some((m) => m.preset === key)) return;
    list.push({ id: newId(), preset: key, active: !START_OFF.has(key), only: '' });
  });
  return list;
}

module.exports = { detectPresets, detectEdition, mergeModifiers, BY_NAME };
