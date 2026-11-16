// A saved library of entries (items, spells…) seeded from a starter set.
//
//   const lib = createLibrary({ name: 'items', blank, sanitize, starter, starterVersion });
//   lib.all() / find(id) / add(id, patch, createdBy) / update(id, patch) / remove(id)
//
// Entries carry `source` ('srd' | 'custom') and `createdBy` ('dm' or a
// character id), set here — never by clients.
//
// Starter content:
// - First start (no <name>.json yet): the starter set is loaded.
// - When `starterVersion` changes (new SRD data), it is merged in once:
//   starter entries already present (same name) and still `source: 'srd'`
//   are updated in place — keeping their ids, so characters' references
//   stay valid — and missing ones are added. Entries the table created
//   ('custom') are never touched. The merged version is remembered in
//   <name>.srd-version, so entries deleted afterwards don't come back.
// - A damaged library file is never replaced (it may hold custom entries).
const fs = require('fs');
const path = require('path');
const { createJsonStore } = require('./jsonStore');
const { uid } = require('./ids');

const ID_RE = /^[a-z0-9]{1,20}$/;

// Name key for matching starter entries to existing ones: case, punctuation,
// "feet"/"ft" and a trailing "armor" don't matter.
const nameKey = (n) => String(n || '').toLowerCase().replace(/\bfeet\b/g, 'ft').replace(/[^a-z0-9]+/g, '').replace(/armor$/, '');

// blank(id, patch) -> a default entry (may look at the patch, e.g. item type);
// sanitize(existing, patch) -> the entry with the patch applied safely.
function createLibrary({ name, blank, sanitize, starter, starterVersion = '' }) {
  const store = createJsonStore(name, null);
  const versionFile = path.join(path.dirname(store.file), `${name}.srd-version`);
  const make = (id, patch, source, createdBy) => ({ ...sanitize(blank(id, patch), patch), source, createdBy });

  function rememberVersion() {
    if (!starterVersion) return;
    store.flush(); // the merged library is on disk before we say it's merged
    try { fs.writeFileSync(versionFile, starterVersion); } catch (err) { console.error(`Could not write ${versionFile}:`, err.message); }
  }

  let entries;
  if (!fs.existsSync(store.file)) {
    entries = starter.map((e) => make(uid(), e, 'srd', 'dm'));
    store.save(entries);
    rememberVersion();
  } else {
    const saved = store.load();
    entries = (Array.isArray(saved) ? saved : []).filter((e) => e && ID_RE.test(e.id)).map((e) => make(
      e.id, e, e.source === 'srd' ? 'srd' : 'custom', typeof e.createdBy === 'string' ? e.createdBy.slice(0, 40) : '',
    ));
    let merged = '';
    try { merged = fs.readFileSync(versionFile, 'utf8').trim(); } catch { /* never merged */ }
    if (starterVersion && merged !== starterVersion && Array.isArray(saved)) {
      const byKey = new Map(entries.map((e, i) => [nameKey(e.name), i]));
      const matched = new Set(); // each existing entry is matched at most once
      let updated = 0;
      let added = 0;
      starter.forEach((s) => {
        const i = byKey.get(nameKey(s.name));
        // e.g. "Half Plate Armor" (2014) and "Half-Plate Armor" (2024) share a
        // key: the first updates the old entry, the other is added as new.
        if (i === undefined || matched.has(i)) {
          entries.push(make(uid(), s, 'srd', 'dm'));
          added++;
        } else {
          matched.add(i);
          if (entries[i].source === 'srd') {
            entries[i] = make(entries[i].id, s, 'srd', 'dm');
            updated++;
          }
        }
      });
      store.save(entries);
      rememberVersion();
      console.log(`${name}: merged SRD content ${starterVersion} (${updated} updated, ${added} added)`);
    }
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

module.exports = { createLibrary, nameKey };
