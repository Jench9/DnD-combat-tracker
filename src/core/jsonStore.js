// Tiny JSON-file persistence: one file per store under DATA_DIR.
//
//   const store = createJsonStore('characters', []);
//   let data = store.load();   // file contents, or the fallback
//   store.save(data);          // debounced; call after every change
//
// Writes go to a temp file and are renamed into place, so a crash
// mid-write never leaves a half-written file. flushAllStores() forces
// pending writes out (used on shutdown).
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const SAVE_DELAY_MS = 500;
const stores = new Set();

function createJsonStore(name, fallback) {
  const file = path.join(DATA_DIR, `${name}.json`);
  let pending = null; // latest data waiting to be written
  let timer = null;

  function load() {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') console.error(`Could not read ${file}, starting empty:`, err.message);
      return fallback;
    }
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    if (pending === null) return;
    const data = pending;
    pending = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file);
    } catch (err) {
      console.error(`Could not save ${file}:`, err.message);
    }
  }

  function save(data) {
    pending = data;
    if (!timer) timer = setTimeout(flush, SAVE_DELAY_MS);
  }

  const store = { file, load, save, flush };
  stores.add(store);
  return store;
}

function flushAllStores() {
  stores.forEach((s) => s.flush());
}

module.exports = { createJsonStore, flushAllStores };
