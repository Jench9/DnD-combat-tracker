// Monster library (newest first), saved to data/monsters.json.
// No WebSocket knowledge here.
const { createJsonStore } = require('../../core/jsonStore');
const { uid } = require('../../core/ids');
const { SRD_MONSTERS } = require('../../srd');

// "1/8" -> 0.125, for sorting by challenge rating.
const crValue = (cr) => (/^1\/\d$/.test(cr) ? 1 / Number(cr.slice(2)) : Number(cr) || 0);
// The SRD creatures, easiest first.
const STARTER_MONSTERS = [...SRD_MONSTERS].sort((a, b) => crValue(a.cr) - crValue(b.cr) || a.name.localeCompare(b.name));
const { ID_RE, blankMonster, sanitizeMonsterPatch } = require('./model');

const store = createJsonStore('monsters', []);

const saved = store.load();
let monsters = (Array.isArray(saved) ? saved : [])
  .filter((m) => m && ID_RE.test(m.id))
  .map((m) => sanitizeMonsterPatch(blankMonster(m.id), m));

function persist() {
  store.save(monsters);
}

// Stat blocks saved before the SRD build put usage on action names
// ("Fire Breath (Recharge 5–6)", "Fireball (3/Day)"; a few names had it in
// the source already). A monster whose notes match the current SRD stat
// block apart from those suffixes (i.e. never edited) gets the new one —
// the Recharge buttons read it.
const USAGE_RE = /^([^:\n]+?) \((?:Recharge [\d–-]+|Recharges after a [^)]*|\d+\/Day)\):/gm;
const withoutUsage = (notes) => notes.replace(USAGE_RE, '$1:');
function refreshStatBlocks() {
  let changed = 0;
  const byName = new Map(SRD_MONSTERS.map((st) => [st.name.toLowerCase(), st]));
  monsters.forEach((m) => {
    const st = byName.get(m.name.trim().toLowerCase());
    if (!st || m.notes === st.notes) return;
    const fresh = sanitizeMonsterPatch(m, { notes: st.notes }).notes;
    if (fresh === m.notes) return;
    if (withoutUsage(m.notes).trim() === withoutUsage(fresh).trim()) {
      m.notes = fresh;
      changed++;
    }
  });
  return changed;
}
if (refreshStatBlocks()) persist();

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

// Add the SRD creatures (5.1 + 5.2), skipping names already in the library
// (any case). New ones go to the top of the list in CR order. A library
// monster with an SRD creature's name whose notes are empty or just the
// one-line "CR · size type" summary gets the full stat block; edited notes
// are left alone. Same-named monsters also get the SRD type/CR/edition if
// they have none (for filtering). Returns { added, upgraded }.
function addStarters() {
  let upgraded = 0;
  const fresh = [];
  STARTER_MONSTERS.forEach((st) => {
    const same = monsters.filter((m) => m.name.trim().toLowerCase() === st.name.toLowerCase());
    if (same.length === 0) {
      fresh.push(sanitizeMonsterPatch(blankMonster(uid()), st));
      return;
    }
    const summary = st.notes.split('\n')[0];
    same.forEach((m) => {
      if (m.notes.trim() === '' || m.notes.trim() === summary) {
        m.notes = sanitizeMonsterPatch(m, { notes: st.notes }).notes;
        upgraded++;
      }
      if (!m.creatureType) Object.assign(m, sanitizeMonsterPatch(m, { creatureType: st.creatureType, cr: st.cr, edition: st.edition }));
    });
  });
  if (fresh.length || upgraded) {
    monsters = [...fresh, ...monsters];
    persist();
  }
  return { added: fresh.length, upgraded };
}

module.exports = { all, find, add, update, remove, addStarters };
