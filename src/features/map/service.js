// Battle map: grid size, where each combatant's token is, and which
// background image is shown. Saved to DATA_DIR/map.json (debounced), like
// combat state; the background library has its own file (backgrounds.js).
// A token covers size × size cells (combatant.size) from its top-left
// corner `positions[id]`; tokens never overlap.
// No WebSocket knowledge here.
const combat = require('../combat/service');
const backgrounds = require('./backgrounds');
const { createJsonStore } = require('../../core/jsonStore');

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
let state = restore(store.load());

// Call after changing the state (the map actions do it for you).
function save() {
  store.save(state);
}

function reset() {
  state = freshState();
}

const sizeOf = (id) => {
  const c = combat.findCombatant(id);
  return c ? combat.clampTokenSize(c.size) : 1;
};

// Forget tokens whose combatant was removed (or the fight cleared).
function prune() {
  Object.keys(state.positions).forEach((id) => {
    if (!combat.findCombatant(id)) delete state.positions[id];
  });
}

function snapshot() {
  prune();
  if (state.backgroundId && !backgrounds.find(state.backgroundId)) state.backgroundId = '';
  // The DM also gets the list of maps to choose from.
  return { ...state, backgrounds: backgrounds.all() };
}

// Players don't see tokens of hidden combatants.
function playerView() {
  prune();
  const positions = {};
  Object.entries(state.positions).forEach(([id, p]) => {
    const c = combat.findCombatant(id);
    if (c && combat.visibleToPlayers(c)) positions[id] = p;
  });
  const backgroundId = backgrounds.find(state.backgroundId) ? state.backgroundId : '';
  return { cols: state.cols, rows: state.rows, positions, backgroundId };
}

// Does a token of `size` cells fit at x, y (top-left) on the grid?
function inBounds(x, y, size = 1) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0
    && x + size <= state.cols && y + size <= state.rows;
}

// Would token `id` at x, y overlap any other token?
function overlaps(id, x, y, size) {
  return Object.entries(state.positions).some(([other, p]) => {
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
  state.positions[id] = { x, y };
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
  const p = state.positions[id];
  if (!p || (inBounds(p.x, p.y, c.size) && !overlaps(id, p.x, p.y, c.size))) return true;
  delete state.positions[id];
  const spot = nearestFreeSpot(id, p.x, p.y, c.size);
  if (spot) state.positions[id] = spot;
  return true;
}

function nearestFreeSpot(id, x0, y0, size) {
  let best = null;
  for (let y = 0; y + size <= state.rows; y++) {
    for (let x = 0; x + size <= state.cols; x++) {
      if (overlaps(id, x, y, size)) continue;
      const d = Math.max(Math.abs(x - x0), Math.abs(y - y0));
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best && best.d <= 3 ? { x: best.x, y: best.y } : null;
}

function remove(id) {
  delete state.positions[id];
}

// Tokens that no longer fit go back to the tray.
function resize(cols, rows) {
  state.cols = clampSize(cols, state.cols);
  state.rows = clampSize(rows, state.rows);
  Object.keys(state.positions).forEach((id) => {
    const p = state.positions[id];
    if (!inBounds(p.x, p.y, sizeOf(id))) delete state.positions[id];
  });
}

function clear() {
  state.positions = {};
}

function setBackground(id) {
  if (id === '' || backgrounds.find(id)) state.backgroundId = id;
}

function deleteBackground(id) {
  if (backgrounds.remove(id) && state.backgroundId === id) state.backgroundId = '';
}

module.exports = {
  MIN_SIZE, MAX_SIZE, save, reset, snapshot, playerView, setBackground, deleteBackground, place, remove, resize, clear, setTokenSize,
};
