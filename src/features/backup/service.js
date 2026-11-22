// Backup / restore of everything the app saves in DATA_DIR: the JSON
// stores (characters, campaigns, monsters, items, spells, map backgrounds,
// combat, map), the SRD merge markers (*.srd-version) and the background
// images in maps/. No WebSocket knowledge here.
//
//   createBackup()          -> { format, version, createdAt, files }
//   restoreBackup(bundle)   -> { files, safetyCopy }  (throws BackupError)
//
// A bundle is one JSON document: `files` maps a data path to its content —
// parsed JSON for *.json, text for *.srd-version, base64 for images. Before
// a restore the current data is saved to DATA_DIR/backups/ (the newest
// KEEP_SAFETY_COPIES are kept), pending writes are flushed, the bundle's
// files replace the current ones (data files missing from it are removed),
// and every service reloads from disk.
const fs = require('fs');
const path = require('path');
const { DATA_DIR, MAX_MAP_BYTES } = require('../../config');
const { flushAllStores } = require('../../core/jsonStore');

const FORMAT = 'adventurers-kit-backup';
const VERSION = 1;
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_SAFETY_COPIES = 5;

const JSON_RE = /^[a-z][a-z-]{0,40}\.json$/;
const MARKER_RE = /^[a-z][a-z-]{0,40}\.srd-version$/;
const IMAGE_RE = /^maps\/[a-f0-9]{8}\.(?:webp|jpg|png|gif)$/;
// Logins are never in a backup (no password hashes in a downloaded file)
// and a restore never replaces them (it can't lock anyone out).
const AUTH_FILES = new Set(['accounts.json', 'invites.json', 'sessions.json']);
const isDataPath = (p) => !AUTH_FILES.has(p) && (JSON_RE.test(p) || MARKER_RE.test(p) || IMAGE_RE.test(p));

class BackupError extends Error {}

// Every data file currently on disk, as relative paths ("maps/ab12cd34.webp").
function dataFiles() {
  const out = [];
  const list = (dir) => { try { return fs.readdirSync(dir); } catch { return []; } };
  list(DATA_DIR).forEach((f) => { if (isDataPath(f)) out.push(f); });
  list(path.join(DATA_DIR, 'maps')).forEach((f) => { if (IMAGE_RE.test('maps/' + f)) out.push('maps/' + f); });
  return out.sort();
}

function createBackup() {
  flushAllStores(); // what's on disk is the current state
  const files = {};
  dataFiles().forEach((rel) => {
    const abs = path.join(DATA_DIR, rel);
    try {
      if (IMAGE_RE.test(rel)) files[rel] = fs.readFileSync(abs).toString('base64');
      else if (MARKER_RE.test(rel)) files[rel] = fs.readFileSync(abs, 'utf8').trim();
      else files[rel] = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      console.error(`Backup: skipped ${rel}:`, err.message); // a damaged file isn't worth failing the whole backup
    }
  });
  return { format: FORMAT, version: VERSION, createdAt: new Date().toISOString(), files };
}

// Checks a bundle and turns it into [{ rel, data: Buffer }]; throws on anything off.
function validate(bundle) {
  if (!bundle || typeof bundle !== 'object' || bundle.format !== FORMAT) {
    throw new BackupError("That isn't an Adventurer's Kit backup file.");
  }
  if (bundle.version !== VERSION) throw new BackupError(`Unsupported backup version (${bundle.version}).`);
  if (!bundle.files || typeof bundle.files !== 'object' || Array.isArray(bundle.files)) throw new BackupError('The backup has no files.');
  const out = [];
  Object.entries(bundle.files).forEach(([rel, content]) => {
    if (!isDataPath(rel)) throw new BackupError(`Unexpected file in the backup: ${String(rel).slice(0, 60)}`);
    if (IMAGE_RE.test(rel)) {
      if (typeof content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new BackupError(`${rel} is not a valid image.`);
      const data = Buffer.from(content, 'base64');
      if (data.length > MAX_MAP_BYTES * 2) throw new BackupError(`${rel} is too large.`);
      out.push({ rel, data });
    } else if (MARKER_RE.test(rel)) {
      if (typeof content !== 'string' || content.length > 100) throw new BackupError(`${rel} is not valid.`);
      out.push({ rel, data: Buffer.from(content) });
    } else {
      if (content === null || typeof content !== 'object') throw new BackupError(`${rel} is not valid JSON data.`);
      out.push({ rel, data: Buffer.from(JSON.stringify(content)) });
    }
  });
  if (!out.some((f) => JSON_RE.test(f.rel))) throw new BackupError('The backup has no data files.');
  return out;
}

function writeAtomic(abs, data) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = abs + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, abs);
}

// The current data, saved before a restore replaces it.
function saveSafetyCopy() {
  const name = `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeAtomic(path.join(BACKUP_DIR, name), JSON.stringify(createBackup()));
  const old = fs.readdirSync(BACKUP_DIR).filter((f) => /^before-restore-.*\.json$/.test(f)).sort().reverse();
  old.slice(KEEP_SAFETY_COPIES).forEach((f) => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch { /* gone already */ } });
  return name;
}

// Every service reads its file again (combat before map: the map prunes
// tokens of combatants that no longer exist).
function reloadAll() {
  require('../campaigns/service').reload();
  require('../characters/service').reload();
  require('../items/service').reload();
  require('../spells/service').reload();
  require('../monsters/service').reload();
  require('../map/backgrounds').reload();
  require('../combat/service').reload();
  require('../map/service').reload();
}

function restoreBackup(bundle) {
  const files = validate(bundle);
  const safetyCopy = saveSafetyCopy(); // also flushes pending writes
  const keep = new Set(files.map((f) => f.rel));
  dataFiles().forEach((rel) => {
    if (!keep.has(rel)) fs.unlinkSync(path.join(DATA_DIR, rel));
  });
  files.forEach(({ rel, data }) => writeAtomic(path.join(DATA_DIR, rel), data));
  reloadAll();
  return { files: files.length, safetyCopy };
}

module.exports = { FORMAT, VERSION, BackupError, createBackup, restoreBackup, dataFiles };
