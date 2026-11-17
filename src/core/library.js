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
//   starter entries already present and still `source: 'srd'` are updated
//   in place — keeping their ids, so characters' references stay valid —
//   and missing ones are added. SRD entries are matched by edition + name
//   without the edition suffix, so a renaming between versions (2024 became
//   the plain name, 2014 "Name (2014)") follows the right entry. Entries the
//   table created ('custom') are never touched (a custom entry with an SRD
//   name keeps that SRD entry out). The merged version is remembered in
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
// SRD entry key: edition + name without its " (2014)" / " (2024)" suffix.
const srdKey = (e) => (e.edition ? `${e.edition}:${nameKey(String(e.name || '').replace(/ \((?:2014|2024)\)$/, ''))}` : '');

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

  // Reads the library file (seeding or merging the SRD as described above).
  function load() {
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
        const bySrd = new Map(); // srdKey -> index (SRD entries only)
        const byName = new Map(); // nameKey -> index (any entry)
        entries.forEach((e, i) => {
          if (e.source === 'srd' && srdKey(e) && !bySrd.has(srdKey(e))) bySrd.set(srdKey(e), i);
          if (!byName.has(nameKey(e.name))) byName.set(nameKey(e.name), i);
        });
        const matched = new Set(); // each existing entry is matched at most once
        let updated = 0;
        let added = 0;
        starter.forEach((s) => {
          const free = (i) => (i !== undefined && !matched.has(i) ? i : undefined);
          // Same name: a custom entry (keeps the SRD one out) or an SRD entry
          // saved before editions existed — never an SRD entry of the other edition.
          const sameName = free(byName.get(nameKey(s.name)));
          const nameOk = sameName !== undefined && !(entries[sameName].source === 'srd' && entries[sameName].edition && entries[sameName].edition !== s.edition);
          const i = free(bySrd.get(srdKey(s))) ?? (nameOk ? sameName : undefined);
          if (i === undefined) {
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
    return entries;
  }
  let entries = load();

  return {
    file: store.file,
    // Read the file again (after a restore).
    reload() { entries = load(); },
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
