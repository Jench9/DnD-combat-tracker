#!/usr/bin/env node
// Builds the character-builder rules (src/srd/rules-2024.json) from the open
// 5e-bits "5e-database" JSON (https://github.com/5e-bits/5e-database, MIT),
// SRD 5.2 by Wizards of the Coast, licensed CC-BY-4.0 (see NOTICE.md).
//
//   node scripts/build-rules.js <dir>
//
// <dir> holds the downloaded source files, named 2024-<File>.json, from
// src/2024/en/5e-SRD-<File>.json in that repository:
//   Classes Levels Features Subclasses Species Subspecies Traits Backgrounds Feats
//
// Separate from build-srd.js: these aren't library entries (nothing to merge
// or edit), just reference data the builder reads (characters/builder/).
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/build-rules.js <dir with 2024-Classes.json, …>');
  process.exit(1);
}
const read = (file) => JSON.parse(fs.readFileSync(path.join(dir, `2024-${file}.json`), 'utf8'));
const OUT = path.join(__dirname, '..', 'src', 'srd', 'rules-2024.json');

const ABILITY_NAMES = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const text = (v) => (Array.isArray(v) ? v.join('\n') : String(v || ''))
  .replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n')
  .replace(/(\w)- (\w)/g, '$1$2') // "profi- ciency" (PDF hyphenation)
  .trim();
const skillName = (p) => String(p.name || '').replace(/^Skill:\s*/, '');
const isSkill = (p) => /^skill-/.test(p.index) || /^Skill:/.test(p.name);

// Starting equipment option → { items: [{ name, count }], gp, other: [text] }
function equipmentOption(opt) {
  const out = { items: [], gp: 0, other: [] };
  const add = (o) => {
    if (!o) return;
    if (o.option_type === 'multiple') o.items.forEach(add);
    else if (o.option_type === 'counted_reference') {
      const note = o.of.note ? ` (${o.of.note})` : '';
      if (/equipment-categories/.test(o.of.url || '')) out.other.push(`${o.count > 1 ? o.count + ' ' : ''}${o.of.name}${note} (your choice)`);
      else out.items.push({ name: o.of.name, count: o.count, ...(note ? { note: o.of.note } : {}) });
    } else if (o.option_type === 'money') {
      out.gp += o.unit === 'gp' ? o.count : o.unit === 'sp' ? o.count / 10 : o.unit === 'cp' ? o.count / 100 : 0;
    } else if (o.option_type === 'choice') out.other.push(`${o.choice.desc} (your choice)`);
  };
  add(opt);
  return out;
}
const equipmentOptions = (list) => (list || []).map((set) => ({
  desc: set.desc || '',
  options: set.from.options.map(equipmentOption),
}));

function choiceFrom(pc) {
  if (!pc) return null;
  const opts = pc.from.options.map((o) => o.item || (o.choice && null)).filter(Boolean);
  return { choose: pc.choose, desc: pc.desc || '', from: opts.map((p) => (isSkill(p) ? skillName(p) : p.name.replace(/^Tool:\s*/, ''))), skills: opts.every(isSkill) };
}

// ---------------------------------------------------------------- classes
const featuresSrc = read('Features');
const levelsSrc = read('Levels');
const subclassesSrc = read('Subclasses');

const features = {};
featuresSrc.filter((f) => !f.subclass).forEach((f) => { features[f.index] = { name: f.name, desc: text(f.description) }; });

const CASTER = { bard: 'full', cleric: 'full', druid: 'full', sorcerer: 'full', wizard: 'full', paladin: 'half', ranger: 'half', warlock: 'pact' };

function slotsOf(sc) {
  if (!sc) return null;
  return {
    cantrips: sc.cantrips_known || 0,
    prepared: sc.prepared_spells || 0,
    slots: Array.from({ length: 9 }, (_, i) => sc[`spell_slots_level_${i + 1}`] || 0),
  };
}

// "Strength or Dexterity" when the source has no ability list.
function primaryOf(pa) {
  const listed = (pa.ability_scores || []).map((a) => a.index);
  if (listed.length) return listed;
  return Object.entries(ABILITY_NAMES).filter(([n]) => new RegExp(`\\b${n}\\b`, 'i').test(pa.desc || '')).map(([, k]) => k);
}

const classes = read('Classes').map((c) => {
  const profs = c.proficiencies || [];
  const saves = (c.saving_throws || []).map((s) => s.index);
  const nonSave = profs.filter((p) => !/^saving-throw/.test(p.index));
  const choices = (c.proficiency_choices || []).map(choiceFrom);
  const mc = c.multi_classing || {};
  const prereq = mc.prerequisites
    ? { all: mc.prerequisites.map((p) => ({ ability: p.ability_score.index, min: p.minimum_score })) }
    : mc.prerequisite_options
      ? { any: mc.prerequisite_options.from.options.map((p) => ({ ability: p.ability_score.index, min: p.minimum_score })) }
      : { all: [] };
  const levels = levelsSrc.filter((l) => l.class.index === c.index && !l.subclass)
    .sort((a, b) => a.level - b.level)
    .map((l) => ({
      level: l.level,
      prof: l.prof_bonus,
      features: l.features.map((f) => f.index),
      spells: slotsOf(l.spellcasting),
      counters: l.class_specific || {},
    }));
  const subclasses = subclassesSrc.filter((s) => s.class.index === c.index).map((s) => ({
    key: s.index,
    name: s.name,
    summary: s.summary || '',
    desc: text(s.description),
    features: (s.features || []).map((f) => ({ level: f.level, name: f.name, desc: text(f.description) })),
  }));
  const subclassLevel = (levels.find((l) => l.features.includes(`${c.index}-subclass`)) || { level: 3 }).level;
  return {
    key: c.index,
    name: c.name,
    hitDie: c.hit_die,
    primary: primaryOf(c.primary_ability),
    primaryDesc: c.primary_ability.desc || '',
    saves,
    skills: choices.find((ch) => ch.skills) || { choose: 0, from: [] },
    otherChoices: choices.filter((ch) => !ch.skills).map((ch) => ch.desc || `Choose ${ch.choose}: ${ch.from.join(', ')}`),
    proficiencies: nonSave.map((p) => p.name.replace(/^Tool:\s*/, '')),
    weapons: {
      simple: nonSave.some((p) => p.index === 'simple-weapons'),
      martial: nonSave.some((p) => p.index === 'martial-weapons'),
    },
    equipment: equipmentOptions(c.starting_equipment_options),
    spellAbility: c.spellcasting ? c.spellcasting.spellcasting_ability.index : '',
    caster: CASTER[c.index] || '',
    multiclass: {
      prereq,
      proficiencies: (mc.proficiencies || []).map((p) => p.name.replace(/^Tool:\s*/, '')),
      weapons: { martial: (mc.proficiencies || []).some((p) => p.index === 'martial-weapons') },
      skills: (mc.proficiency_choices || []).map(choiceFrom).find((ch) => ch && ch.skills) || null,
    },
    subclassLevel,
    levels,
    subclasses,
  };
});

// ---------------------------------------------------------------- species
const traits = Object.fromEntries(read('Traits').map((t) => [t.index, t]));
const traitOut = (ref) => {
  const t = traits[ref.index] || {};
  const choice = t.proficiency_choices ? choiceFrom(t.proficiency_choices) : null;
  return { name: ref.name, desc: text(t.description), ...(choice ? { skillChoice: choice } : {}) };
};
const subspecies = Object.fromEntries(read('Subspecies').map((s) => [s.index, s]));
const species = read('Species').map((s) => ({
  key: s.index,
  name: s.name,
  size: s.size || 'Medium or Small',
  speed: s.speed || 30,
  traits: s.traits.map(traitOut),
  subspecies: (s.subspecies || []).map((ref) => {
    const sub = subspecies[ref.index] || {};
    return { key: ref.index, name: ref.name, traits: (sub.traits || []).map(traitOut) };
  }),
}));

// ---------------------------------------------------------------- backgrounds
// Magic Initiate's spell list when the source leaves it out (SRD 5.2:
// Acolyte → Cleric, Sage → Wizard).
const FEAT_NOTE = { acolyte: 'Cleric', sage: 'Wizard' };
const backgrounds = read('Backgrounds').map((b) => ({
  key: b.index,
  name: b.name,
  abilities: b.ability_scores.map((a) => a.index),
  feat: { key: b.feat.index, name: b.feat.name, note: b.feat.note || FEAT_NOTE[b.index] || '' },
  skills: b.proficiencies.filter(isSkill).map(skillName),
  tools: b.proficiencies.filter((p) => !isSkill(p)).map((p) => p.name.replace(/^Tool:\s*/, '')),
  equipment: equipmentOptions(b.equipment_options),
}));

// ---------------------------------------------------------------- feats
// "**Ability Score Increase.** Increase your Strength or Dexterity score by 1,
// to a maximum of 20." → { abilities: ['str', 'dex'], max: 20 }
function featAsi(desc) {
  const m = /Ability Score Increase\.?\**\s*Increase ([^.]*?) by 1, to a maximum of (\d+)/i.exec(desc);
  if (!m) return null;
  const named = Object.entries(ABILITY_NAMES).filter(([n]) => new RegExp(`\\b${n}\\b`, 'i').test(m[1])).map(([, k]) => k);
  return { abilities: named.length ? named : Object.values(ABILITY_NAMES), max: parseInt(m[2], 10) };
}
const feats = read('Feats').map((f) => {
  const pre = f.prerequisites || {};
  const desc = text(f.description);
  return {
    key: f.index,
    name: f.name,
    type: f.type,
    desc,
    prereq: {
      minLevel: pre.minimum_level || 0,
      feature: pre.feature_named || '',
      any: f.prerequisite_options ? f.prerequisite_options.from.options.map((p) => ({ ability: p.ability_score.index, min: p.minimum_score })) : [],
    },
    repeatable: !!f.repeatable,
    asi: featAsi(desc),
  };
});

const out = {
  edition: '2024',
  source: 'SRD 5.2 (CC-BY-4.0) via 5e-bits/5e-database',
  built: new Date().toISOString().slice(0, 10),
  classes, features, species, backgrounds, feats,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`rules-2024.json: ${classes.length} classes, ${Object.keys(features).length} features, ${species.length} species, `
  + `${backgrounds.length} backgrounds, ${feats.length} feats (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
