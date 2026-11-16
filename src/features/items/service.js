// Item library, saved to data/items.json. On the very first start (no file
// yet) it's filled with the SRD basics from starter.js; after that the
// library is whatever the table made of it. No WebSocket knowledge here.
const fs = require('fs');
const { createJsonStore } = require('../../core/jsonStore');
const { uid } = require('../../core/ids');
const { ID_RE, blankItem, sanitizeItemPatch } = require('./model');
const { STARTER_ITEMS } = require('./starter');

const store = createJsonStore('items', null);

function fromSaved(it) {
  return {
    ...sanitizeItemPatch(blankItem(it.id, it.type), it),
    source: it.source === 'srd' ? 'srd' : 'custom',
    createdBy: typeof it.createdBy === 'string' ? it.createdBy.slice(0, 40) : '',
  };
}

// Seed only when there's no file at all — a damaged file must not be
// silently replaced (it may hold the table's custom items).
let items;
if (!fs.existsSync(store.file)) {
  items = STARTER_ITEMS.map((it) => ({
    ...sanitizeItemPatch(blankItem(uid(), it.type), it), source: 'srd', createdBy: 'dm',
  }));
  store.save(items);
} else {
  const saved = store.load();
  items = (Array.isArray(saved) ? saved : []).filter((it) => it && ID_RE.test(it.id)).map(fromSaved);
}

function all() {
  return items;
}

function find(id) {
  return items.find((it) => it.id === id);
}

// `createdBy` is who made it ('dm' or a character id) — players may edit
// only their own items.
function add(id, patch, createdBy) {
  if (!ID_RE.test(String(id)) || find(id)) return false;
  const type = patch && ['weapon', 'armor', 'gear'].includes(patch.type) ? patch.type : 'gear';
  items.push({ ...sanitizeItemPatch(blankItem(id, type), patch || {}), source: 'custom', createdBy });
  store.save(items);
  return true;
}

function update(id, patch) {
  const idx = items.findIndex((it) => it.id === id);
  if (idx === -1) return;
  items[idx] = sanitizeItemPatch(items[idx], patch);
  store.save(items);
}

function remove(id) {
  items = items.filter((it) => it.id !== id);
  store.save(items);
}

module.exports = { all, find, add, update, remove };
