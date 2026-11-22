// Custom content: subclasses, species, backgrounds and feats a DM types in
// from their own books (or homebrew), each tagged with where it comes
// from (`source`, e.g. "Player's Handbook (2024)"). Saved to
// DATA_DIR/content.json (so it's in backups); never part of the code. The
// guided creation and level up use them next to the SRD ones
// (characters/builder/rules.js merges them in). No WebSocket knowledge here.
//
//   { id, kind: 'subclass' | 'species' | 'background' | 'feat', name, source,
//     createdBy (account id, '' in open mode), createdAt, updatedAt, ...per kind }
//   subclass   classKey, summary, desc, features: [{ level, name, desc }]
//   species    size, speed, skillChoice (bool: "choose one skill"), traits: [{ name, desc }]
//   background abilities: [3 of str…cha], skills: [2], tools: [..], featKey,
//              equipment (text), gp (with the equipment; the other option is 50 GP)
//   feat       type: origin | general | fighting-style | epic-boon, desc,
//              minLevel, repeatable, asi: [abilities] (+1 to one of them, max 20)
const { uid } = require('../../core/ids');
const { createJsonStore } = require('../../core/jsonStore');

const KINDS = ['subclass', 'species', 'background', 'feat'];
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const FEAT_TYPES = ['origin', 'general', 'fighting-style', 'epic-boon'];
const SIZES = ['Small', 'Medium', 'Small or Medium', 'Large'];
const SKILL_NAMES = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation',
  'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'];

const store = createJsonStore('content', []);

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, min, max, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const pickList = (list, allowed, max) => [...new Set((Array.isArray(list) ? list : []).filter((x) => allowed.includes(x)))].slice(0, max);
const named = (list, max) => (Array.isArray(list) ? list : [])
  .map((t) => ({ name: text(t && t.name, 80), desc: text(t && t.desc, 6000) }))
  .filter((t) => t.name).slice(0, max);

// One entry, validated: { entry } or { error }.
function clean(raw, base = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const kind = base.kind || r.kind;
  if (!KINDS.includes(kind)) return { error: 'Choose what to add: subclass, species, background or feat.' };
  const name = text(r.name ?? base.name, 60);
  if (!name) return { error: 'Give it a name.' };
  const source = text(r.source ?? base.source, 60);
  if (!source) return { error: "Add where it's from (the source tag), e.g. Player's Handbook (2024) or Homebrew." };
  const e = { id: base.id, kind, name, source, createdBy: base.createdBy || '', createdAt: base.createdAt, updatedAt: new Date().toISOString() };
  if (kind === 'subclass') {
    e.classKey = text(r.classKey, 30);
    if (!/^[a-z-]{2,30}$/.test(e.classKey)) return { error: 'Choose the class it belongs to.' };
    e.summary = text(r.summary, 200);
    e.desc = text(r.desc, 4000);
    e.features = (Array.isArray(r.features) ? r.features : [])
      .map((f) => ({ level: int(f && f.level, 1, 20, 3), name: text(f && f.name, 80), desc: text(f && f.desc, 6000) }))
      .filter((f) => f.name).slice(0, 40).sort((a, b) => a.level - b.level);
  } else if (kind === 'species') {
    e.size = SIZES.includes(r.size) ? r.size : 'Medium';
    e.speed = int(r.speed, 5, 120, 30);
    e.skillChoice = r.skillChoice === true;
    e.traits = named(r.traits, 30);
  } else if (kind === 'background') {
    e.abilities = pickList(r.abilities, ABILITIES, 3);
    if (e.abilities.length !== 3) return { error: 'A background raises three abilities: tick three.' };
    e.skills = pickList(r.skills, SKILL_NAMES, 2);
    if (e.skills.length !== 2) return { error: 'A background gives two skills: choose two.' };
    e.tools = (Array.isArray(r.tools) ? r.tools : String(r.tools || '').split(',')).map((t) => text(t, 60)).filter(Boolean).slice(0, 4);
    e.featKey = text(r.featKey, 60);
    if (!e.featKey) return { error: 'Choose the origin feat it gives.' };
    e.equipment = text(r.equipment, 1000);
    e.gp = int(r.gp, 0, 1000, 0);
  } else {
    e.type = FEAT_TYPES.includes(r.type) ? r.type : 'general';
    e.desc = text(r.desc, 6000);
    e.minLevel = int(r.minLevel, 0, 20, e.type === 'general' ? 4 : 0);
    e.repeatable = r.repeatable === true;
    e.asi = pickList(r.asi, ABILITIES, 6);
  }
  return { entry: e };
}

function load() {
  const saved = store.load();
  return (Array.isArray(saved) ? saved : [])
    .filter((x) => x && typeof x.id === 'string')
    .map((x) => clean(x, { id: x.id, kind: x.kind, createdBy: String(x.createdBy || ''), createdAt: x.createdAt || new Date().toISOString() }))
    .filter((r) => r.entry)
    .map((r) => ({ ...r.entry, updatedAt: r.entry.updatedAt }));
}
let entries = load();
let version = 1; // bumps on every change (the builder's merged rules cache)

function reload() {
  entries = load();
  version += 1;
}
const persist = () => { store.save(entries); version += 1; };

const all = () => entries;
const find = (id) => entries.find((e) => e.id === id) || null;
const getVersion = () => version;

function add(raw, createdBy) {
  const { entry, error } = clean(raw, { id: uid() + uid(), createdBy: String(createdBy || ''), createdAt: new Date().toISOString() });
  if (error) return { error };
  entries.push(entry);
  persist();
  return { entry };
}

function update(id, raw) {
  const old = find(id);
  if (!old) return { error: 'No such entry.' };
  const { entry, error } = clean({ ...old, ...raw }, old);
  if (error) return { error };
  entries = entries.map((e) => (e.id === id ? entry : e));
  persist();
  return { entry };
}

function remove(id) {
  const before = entries.length;
  entries = entries.filter((e) => e.id !== id);
  if (entries.length !== before) persist();
}

module.exports = { KINDS, FEAT_TYPES, SIZES, SKILL_NAMES, reload, all, find, add, update, remove, getVersion };
