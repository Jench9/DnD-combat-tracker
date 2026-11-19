// Familiars (2024 rules): which forms a character may choose, and the sheet
// familiar built from a monster library stat block. Pure apart from reading
// the monster library.
//
// Find Familiar (SRD 5.2): Bat, Cat, Frog, Hawk, Lizard, Octopus, Owl, Rat,
// Raven, Spider, Weasel, or another Beast of Challenge Rating 0; the
// familiar is a Celestial, Fey or Fiend instead of a Beast.
// Pact of the Chain (Warlock invocation): also Imp, Pseudodragon, Quasit,
// Skeleton, Slaad Tadpole, Sphinx of Wonder, Sprite or Venomous Snake.
//
// The stat blocks: a monster library entry with that name if there is one
// (so the map token gets its icon), else the bundled SRD data — the library
// only holds the SRD creatures once the DM has added them. 2024 first; the
// 2014 one when that's all there is (the SRD 5.2 has no Octopus).
const monsters = require('../monsters/service');
const { SRD_MONSTERS } = require('../../srd');
const { FAMILIAR_TYPES } = require('./model');

const SPELL_FORMS = ['Bat', 'Cat', 'Frog', 'Hawk', 'Lizard', 'Octopus', 'Owl', 'Rat', 'Raven', 'Spider', 'Weasel'];
const PACT_FORMS = ['Imp', 'Pseudodragon', 'Quasit', 'Skeleton', 'Slaad Tadpole', 'Sphinx of Wonder', 'Sprite', 'Venomous Snake'];

const baseName = (n) => String(n || '').replace(/\s*\((?:2014|2024)\)\s*$/, '').trim().toLowerCase();

// Library entries (with an id) and SRD entries (without), as candidates.
const candidates = (list) => [...list, ...SRD_MONSTERS.map((m) => ({ ...m, id: '' }))];

// The stat block for a form name: 2024 (library before SRD), then a custom
// entry, then 2014.
function monsterFor(name, all) {
  const want = name.toLowerCase();
  const rank = (m) => (m.edition === '2024' ? 0 : !m.edition ? 2 : 4) + (m.id ? 0 : 1);
  return all.filter((m) => baseName(m.name) === want).sort((a, b) => rank(a) - rank(b))[0] || null;
}
const slug = (m) => `srd-${m.edition || 'x'}-${baseName(m.name).replace(/[^a-z0-9]+/g, '-')}`;

const isBeast = (m) => /^beast\b/i.test(String(m.creatureType || '').trim());
const crZero = (m) => String(m.cr).trim() === '0';
// Second line of a stat block: "AC 11 · HP 1 (1d4 - 1) · Speed 5 ft, fly 60 ft"
const speedOf = (notes) => ((/Speed ([^\n]*)/.exec(notes || '') || [])[1] || '').trim();

function formEntry(m, kind) {
  return {
    key: m.id || slug(m),
    name: String(m.name).replace(/\s*\((?:2014|2024)\)\s*$/, '').trim(),
    kind, // 'spell' | 'beast' (another CR 0 Beast) | 'pact'
    monsterId: m.id, // '' = from the SRD data, not in the library
    edition: m.edition || '',
    ac: m.ac,
    hpMax: m.hpMax,
    initBonus: m.initBonus,
    speed: speedOf(m.notes),
    creatureType: m.creatureType || '',
    notes: m.notes || '',
  };
}

// Every form, grouped by kind. The listed forms first, then other CR 0
// Beasts (2024 stat blocks), then the Pact of the Chain forms.
function familiarForms(list = monsters.all()) {
  const all = candidates(list);
  const out = [];
  const seen = new Set();
  const add = (m, kind) => {
    if (!m || seen.has(baseName(m.name))) return;
    seen.add(baseName(m.name));
    out.push(formEntry(m, kind));
  };
  SPELL_FORMS.forEach((n) => add(monsterFor(n, all), 'spell'));
  [...new Set(all.filter((m) => isBeast(m) && crZero(m) && m.edition !== '2014').map((m) => baseName(m.name)))]
    .sort()
    .forEach((n) => add(monsterFor(n, all), 'beast'));
  PACT_FORMS.forEach((n) => add(monsterFor(n, all), 'pact'));
  return out;
}

// The sheet familiar for a form, or { error }. Keeps the current familiar's
// name when changing form (the spell: "it adopts a new eligible form").
function buildFamiliar({ formKey, name, creatureType }, existing, list = monsters.all()) {
  const form = familiarForms(list).find((f) => f.key === formKey);
  if (!form) return { error: 'Choose a form for the familiar.' };
  const type = FAMILIAR_TYPES.includes(creatureType) ? creatureType : (existing && existing.creatureType) || 'fey';
  return {
    familiar: {
      name: String(name ?? (existing && existing.name) ?? '').trim().slice(0, 40),
      form: form.name,
      monsterId: form.monsterId,
      creatureType: type,
      pact: form.kind === 'pact',
      ac: form.ac,
      hpMax: form.hpMax,
      hp: form.hpMax, // a new casting: full HP
      initBonus: form.initBonus,
      notes: form.notes,
    },
  };
}

module.exports = { SPELL_FORMS, PACT_FORMS, familiarForms, buildFamiliar };
