// A saved library of entries (items, spells…) seeded from a starter set.
//
//   const lib = createLibrary({ name: 'items', blank, sanitize, starter });
//   lib.all() / find(id) / add(id, patch, createdBy) / update(id, patch) / remove(id)
//
// Entries carry `source` ('srd' | 'custom') and `createdBy` ('dm' or a
// character id), set here — never by clients. On the very first start (no
// <name>.json yet) the starter set is loaded; after that the library is
// whatever the table made of it. A damaged file is never replaced, since
// it may hold the table's custom entries.
const fs = require('fs');
const { createJsonStore } = require('./jsonStore');
const { uid } = require('./ids');

const ID_RE = /^[a-z0-9]{1,20}$/;

// blank(id, patch) -> a default entry (may look at the patch, e.g. item type);
// sanitize(existing, patch) -> the entry with the patch applied safely.
function createLibrary({ name, blank, sanitize, starter }) {
  const store = createJsonStore(name, null);
  const make = (id, patch, source, createdBy) => ({ ...sanitize(blank(id, patch), patch), source, createdBy });

  let entries;
  if (!fs.existsSync(store.file)) {
    entries = starter.map((e) => make(uid(), e, 'srd', 'dm'));
    store.save(entries);
  } else {
    const saved = store.load();
    entries = (Array.isArray(saved) ? saved : []).filter((e) => e && ID_RE.test(e.id)).map((e) => make(
      e.id, e, e.source === 'srd' ? 'srd' : 'custom', typeof e.createdBy === 'string' ? e.createdBy.slice(0, 40) : '',
    ));
  }

  return {
    file: store.file,
    all: () => entries,
    find: (id) => entries.find((e) => e.id === id),
    add(id, patch, createdBy) {
      if (!ID_RE.test(String(id)) || entries.some((e) => e.id === id)) return false;
      entries.push(make(id, patch || {}, 'custom', createdBy));
      store.save(entries);
      return true;
    },
    update(id, patch) {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return;
      entries[idx] = sanitize(entries[idx], patch);
      store.save(entries);
    },
    remove(id) {
      entries = entries.filter((e) => e.id !== id);
      store.save(entries);
    },
  };
}

module.exports = { createLibrary };
