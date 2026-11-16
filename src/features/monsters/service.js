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
// case). New ones go to the top of the list in CR order. A library monster
// with a starter's name whose notes are empty or still the old one-line
// summary gets the full stat-block notes; edited notes are left alone.
// Returns { added, upgraded }.
function addStarters() {
  let upgraded = 0;
  const fresh = [];
  STARTER_MONSTERS.forEach((st) => {
    const same = monsters.filter((m) => m.name.trim().toLowerCase() === st.name.toLowerCase());
    if (same.length === 0) {
      fresh.push(sanitizeMonsterPatch(blankMonster(uid()), st));
      return;
    }
    same.forEach((m) => {
      if (m.notes.trim() === '' || m.notes.trim() === st.summary) {
        m.notes = sanitizeMonsterPatch(m, { notes: st.notes }).notes;
        upgraded++;
      }
    });
  });
  if (fresh.length || upgraded) {
    monsters = [...fresh, ...monsters];
    persist();
  }
  return { added: fresh.length, upgraded };
}

module.exports = { all, find, add, update, remove, addStarters };
