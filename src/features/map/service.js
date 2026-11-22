// Battle map: grid size, where each combatant's token is, and which
// background image is shown. Saved to DATA_DIR/map.json (debounced), like
// combat state; the background library has its own file (backgrounds.js).
// A token covers size × size cells (combatant.size) from its top-left
// corner `positions[id]`; tokens never overlap.
// No WebSocket knowledge here.
const combat = require('../combat/service');
const backgrounds = require('./backgrounds');
const { createJsonStore } = require('../../core/jsonStore');
const { currentTable } = require('../../core/table');

const MIN_SIZE = 5;
const MAX_SIZE = 50;

function freshState() {
  // positions: { [combatantId]: { x, y } }; backgroundId: '' = plain grid
  return { cols: 20, rows: 15, positions: {}, backgroundId: '' };
}

const clampSize = (n, fallback) => (Number.isFinite(n) ? Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n))) : fallback);

function restore(saved) {
  const s = freshState();
  if (!saved || typeof saved !== 'object') return s;
  s.cols = clampSize(saved.cols, s.cols);
  s.rows = clampSize(saved.rows, s.rows);
  if (typeof saved.backgroundId === 'string') s.backgroundId = saved.backgroundId;
  if (saved.positions && typeof saved.positions === 'object') {
    Object.entries(saved.positions).forEach(([id, p]) => {
      if (p && Number.isInteger(p.x) && Number.isInteger(p.y)) s.positions[id] = { x: p.x, y: p.y };
    });
  }
  return s;
}

const store = createJsonStore('map', null);

// One map per table (core/table.js), like combat: { [campaignId]: state },
// saved as { tables }; a file from before tables becomes the '' table.
function restoreTables(saved) {
  const out = {};
  if (saved && typeof saved === 'object' && saved.tables && typeof saved.tables === 'object') {
    Object.entries(saved.tables).forEach(([id, t]) => { if (/^[a-z0-9]{0,20}$/.test(id)) out[id] = restore(t); });
  } else if (saved && typeof saved === 'object' && saved.positions) {
    out[''] = restore(saved);
  }
  return out;
}
let tables = restoreTables(store.load());

function S() {
  const id = currentTable();
  if (id === null) return freshState();
  if (!tables[id]) tables[id] = freshState();
  return tables[id];
}

// Read the file again (after a restore).
function reload() {
  tables = restoreTables(store.load());
}

// Call after changing the state (the map actions do it for you).
function save() {
  store.save({ tables });
}

function reset() {
  tables = {};
}

// A campaign was deleted: its map goes too.
function dropTable(id) {
  if (tables[id]) { delete tables[id]; save(); }
}

const sizeOf = (id) => {
  const c = combat.findCombatant(id);
  return c ? combat.clampTokenSize(c.size) : 1;
};

// Forget tokens whose combatant was removed (or the fight cleared).
function prune() {
  Object.keys(S().positions).forEach((id) => {
    if (!combat.findCombatant(id)) delete S().positions[id];
  });
}

function snapshot() {
  prune();
  if (S().backgroundId && !backgrounds.find(S().backgroundId)) S().backgroundId = '';
  // The DM also gets the list of maps to choose from.
  return { ...S(), backgrounds: backgrounds.all() };
}

// Players don't see tokens of hidden combatants.
function playerView() {
  prune();
  const positions = {};
  Object.entries(S().positions).forEach(([id, p]) => {
    const c = combat.findCombatant(id);
    if (c && combat.visibleToPlayers(c)) positions[id] = p;
  });
  const backgroundId = backgrounds.find(S().backgroundId) ? S().backgroundId : '';
  return { cols: S().cols, rows: S().rows, positions, backgroundId };
}

// Does a token of `size` cells fit at x, y (top-left) on the grid?
function inBounds(x, y, size = 1) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0
    && x + size <= S().cols && y + size <= S().rows;
}

// Would token `id` at x, y overlap any other token?
function overlaps(id, x, y, size) {
  return Object.entries(S().positions).some(([other, p]) => {
    if (other === id) return false;
    const s = sizeOf(other);
    return x < p.x + s && p.x < x + size && y < p.y + s && p.y < y + size;
  });
}

// Place or move a token; it must fit on the grid and not overlap another
// token. Returns true if it moved.
function place(id, x, y) {
  if (!combat.findCombatant(id)) return false;
  const size = sizeOf(id);
  if (!inBounds(x, y, size)) return false;
  prune();
  if (overlaps(id, x, y, size)) return false;
  S().positions[id] = { x, y };
  return true;
}

// Change how many cells a combatant's token covers (1–4). A token on the
// map stays put if it still fits, otherwise it moves to the nearest free
// spot it fits in, or back to the tray if there's none.
function setTokenSize(id, size) {
  const c = combat.findCombatant(id);
  if (!c || !Number.isInteger(size)) return false;
  c.size = combat.clampTokenSize(size);
  combat.save();
  const p = S().positions[id];
  if (!p || (inBounds(p.x, p.y, c.size) && !overlaps(id, p.x, p.y, c.size))) return true;
  delete S().positions[id];
  const spot = nearestFreeSpot(id, p.x, p.y, c.size);
  if (spot) S().positions[id] = spot;
  return true;
}

function nearestFreeSpot(id, x0, y0, size) {
  let best = null;
  for (let y = 0; y + size <= S().rows; y++) {
    for (let x = 0; x + size <= S().cols; x++) {
      if (overlaps(id, x, y, size)) continue;
      const d = Math.max(Math.abs(x - x0), Math.abs(y - y0));
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best && best.d <= 3 ? { x: best.x, y: best.y } : null;
}

function remove(id) {
  delete S().positions[id];
}

// Tokens that no longer fit go back to the tray.
function resize(cols, rows) {
  S().cols = clampSize(cols, S().cols);
  S().rows = clampSize(rows, S().rows);
  Object.keys(S().positions).forEach((id) => {
    const p = S().positions[id];
    if (!inBounds(p.x, p.y, sizeOf(id))) delete S().positions[id];
  });
}

function clear() {
  S().positions = {};
}

function setBackground(id) {
  if (id === '' || backgrounds.find(id)) S().backgroundId = id;
}

// Backgrounds are shared by every table: clear it wherever it's shown.
function deleteBackground(id) {
  if (!backgrounds.remove(id)) return;
  Object.values(tables).forEach((t) => { if (t.backgroundId === id) t.backgroundId = ''; });
}

module.exports = {
  reload,
  MIN_SIZE, MAX_SIZE, save, reset, dropTable, snapshot, playerView, setBackground, deleteBackground, place, remove, resize, clear, setTokenSize,
};
