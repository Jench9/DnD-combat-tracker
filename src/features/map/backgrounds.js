// Battle map background images: files in DATA_DIR/maps/, plus a saved
// list { id, name, file, type } in DATA_DIR/map-backgrounds.json.
// Images are kept out of the realtime state (only the id is broadcast)
// because they can be several MB; browsers load them over HTTP instead.
const fs = require('fs');
const path = require('path');
const { DATA_DIR, MAP_MAX_SIDE } = require('../../config');
const { createJsonStore } = require('../../core/jsonStore');
const { uid } = require('../../core/ids');
const { loadSharp } = require('../../core/sharp');

const DIR = path.join(DATA_DIR, 'maps');
const ID_RE = /^[a-f0-9]{8}$/;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

const store = createJsonStore('map-backgrounds', []);
function load() {
  const saved = store.load();
  return (Array.isArray(saved) ? saved : [])
    .filter((b) => b && ID_RE.test(b.id) && TYPES[b.type] && fs.existsSync(path.join(DIR, b.file || '')));
}
let list = load();

// Read the list again (after a restore).
function reload() {
  list = load();
}

const cleanName = (n) => String(n || '').trim().slice(0, 60) || 'Untitled map';

function all() {
  return list.map(({ id, name }) => ({ id, name }));
}

function find(id) {
  return list.find((b) => b.id === id);
}

function filePath(b) {
  return path.join(DIR, b.file);
}

// Shrinks big images (when sharp is available) so they load fast on every
// device; otherwise keeps the upload as-is. Rejects non-images.
async function prepare(bytes, type) {
  const sharp = loadSharp();
  if (!sharp) {
    if (!TYPES[type]) throw new Error('Unsupported image type.');
    return { bytes, type };
  }
  const img = sharp(bytes, { limitInputPixels: 200e6 }).rotate();
  const meta = await img.metadata(); // throws if it isn't an image
  if (meta.format === 'gif' && (meta.pages || 1) > 1) return { bytes, type: 'image/gif' }; // keep animation
  const out = await img
    .resize(MAP_MAX_SIDE, MAP_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  return { bytes: out, type: 'image/webp' };
}

async function add(name, bytes, type) {
  const prepared = await prepare(bytes, type);
  const id = uid();
  const file = `${id}.${TYPES[prepared.type]}`;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, file), prepared.bytes);
  const entry = { id, name: cleanName(name), file, type: prepared.type };
  list.push(entry);
  store.save(list);
  return entry;
}

function rename(id, name) {
  const b = find(id);
  if (!b) return;
  b.name = cleanName(name);
  store.save(list);
}

function remove(id) {
  const b = find(id);
  if (!b) return false;
  list = list.filter((x) => x.id !== id);
  store.save(list);
  fs.rm(filePath(b), { force: true }, () => {});
  return true;
}

module.exports = { reload, all, find, filePath, add, rename, remove };
