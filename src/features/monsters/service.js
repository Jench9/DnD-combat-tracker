// Monster library (newest first), saved to data/monsters.json.
// No WebSocket knowledge here.
const { createJsonStore } = require('../../core/jsonStore');
const { uid } = require('../../core/ids');
const { STARTER_MONSTERS } = require('./starter');
const { ID_RE, blankMonster, sanitizeMonsterPatch } = require('./model');

const store = createJsonStore('monsters', []);

const saved = store.load();
let monsters = (Array.isArray(saved) ? saved : [])
  .filter((m) => m && ID_RE.test(m.id))
  .map((m) => sanitizeMonsterPatch(blankMonster(m.id), m));

function persist() {
  store.save(monsters);
}

function all() {
  return monsters;
}

function find(id) {
  return monsters.find((m) => m.id === id);
}

// Client picks the id so it can open the editor immediately.
function add(id, patch) {
  if (!ID_RE.test(String(id)) || find(id)) return false;
  monsters.unshift(sanitizeMonsterPatch(blankMonster(id), patch || {}));
  persist();
  return true;
}

function update(id, patch) {
  const idx = monsters.findIndex((m) => m.id === id);
  if (idx === -1) return;
  monsters[idx] = sanitizeMonsterPatch(monsters[idx], patch);
  persist();
}

function remove(id) {
  monsters = monsters.filter((m) => m.id !== id);
  persist();
}

// Add the SRD starter set, skipping names already in the library (any
// case). They end up in CR order at the top of the list. Returns how many
// were added.
function addStarters() {
  const have = new Set(monsters.map((m) => m.name.trim().toLowerCase()));
  const fresh = STARTER_MONSTERS
    .filter((m) => !have.has(m.name.toLowerCase()))
    .map((m) => sanitizeMonsterPatch(blankMonster(uid()), m));
  if (fresh.length) {
    monsters = [...fresh, ...monsters];
    persist();
  }
  return fresh.length;
}

module.exports = { all, find, add, update, remove, addStarters };
