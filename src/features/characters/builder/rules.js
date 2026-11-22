// The builder's rules data: src/srd/rules-2024.json (made by
// scripts/build-rules.js from SRD 5.2) plus the custom content DMs added
// (features/content — subclasses, species, backgrounds, feats), merged in
// the same shapes so the guided creation and level up treat them alike.
// Every subclass, species, background and feat carries `source`
// ("SRD 5.2" or the tag the DM typed). Rebuilt when the content changes.
const path = require('path');
const fs = require('fs');
const content = require('../../content/service');

const FILE = path.join(__dirname, '..', '..', '..', 'srd', 'rules-2024.json');
const SRD_SOURCE = 'SRD 5.2';
const ALL_SKILLS = content.SKILL_NAMES;
let srdText = null;
let cache = null; // { version, rules, client }

const customKey = (e) => `c-${e.id}`;

function subclassFrom(e) {
  return { key: customKey(e), name: e.name, summary: e.summary, desc: e.desc, features: e.features, source: e.source, custom: true };
}
function speciesFrom(e) {
  const traits = [...e.traits];
  if (e.skillChoice) traits.push({ name: 'Skill choice', desc: 'You gain proficiency in one skill of your choice.', skillChoice: { choose: 1, desc: 'Choose any skill.', from: ALL_SKILLS, skills: false } });
  return { key: customKey(e), name: e.name, size: e.size, speed: e.speed, traits, subspecies: [], source: e.source, custom: true };
}
function backgroundFrom(e, featByKey) {
  const feat = featByKey.get(e.featKey);
  const pack = e.equipment ? `${e.equipment}${e.gp ? `, ${e.gp} GP` : ''}` : `${e.gp} GP`;
  return {
    key: customKey(e),
    name: e.name,
    abilities: e.abilities,
    feat: { key: feat ? feat.key : e.featKey, name: feat ? feat.name : e.featKey, note: '' },
    skills: e.skills,
    tools: e.tools,
    equipment: [{
      desc: `Choose A or B: (A) ${pack}; or (B) 50 GP`,
      options: [{ items: [], gp: e.gp, other: e.equipment ? [e.equipment] : [] }, { items: [], gp: 50, other: [] }],
    }],
    source: e.source,
    custom: true,
  };
}
function featFrom(e) {
  return {
    key: customKey(e),
    name: e.name,
    type: e.type,
    desc: e.desc,
    prereq: { minLevel: e.minLevel, feature: '', any: [] },
    repeatable: e.repeatable,
    asi: e.asi.length ? { abilities: e.asi, max: 20 } : null,
    source: e.source,
    custom: true,
  };
}

function build() {
  if (!srdText) srdText = fs.readFileSync(FILE, 'utf8');
  const rules = JSON.parse(srdText); // a fresh copy each time
  rules.classes.forEach((c) => c.subclasses.forEach((s) => { s.source = SRD_SOURCE; }));
  ['species', 'backgrounds', 'feats'].forEach((k) => rules[k].forEach((x) => { x.source = SRD_SOURCE; }));
  const custom = content.all();
  custom.filter((e) => e.kind === 'feat').forEach((e) => rules.feats.push(featFrom(e)));
  const featByKey = new Map(rules.feats.map((f) => [f.key, f]));
  custom.filter((e) => e.kind === 'species').forEach((e) => rules.species.push(speciesFrom(e)));
  custom.filter((e) => e.kind === 'background').forEach((e) => rules.backgrounds.push(backgroundFrom(e, featByKey)));
  custom.filter((e) => e.kind === 'subclass').forEach((e) => {
    const cls = rules.classes.find((c) => c.key === e.classKey);
    if (cls) cls.subclasses.push(subclassFrom(e));
  });
  const client = JSON.stringify(rules); // what the browser gets (no lookup maps)
  rules.classByKey = new Map(rules.classes.map((c) => [c.key, c]));
  rules.featByKey = featByKey;
  rules.speciesByKey = new Map(rules.species.map((s) => [s.key, s]));
  rules.backgroundByKey = new Map(rules.backgrounds.map((b) => [b.key, b]));
  return { version: content.getVersion(), rules, client };
}

function current() {
  if (!cache || cache.version !== content.getVersion()) cache = build();
  return cache;
}

const getRules = () => current().rules;
// The merged rules as JSON text for the browser.
const rulesJson = () => current().client;

module.exports = { getRules, rulesJson, SRD_SOURCE };
