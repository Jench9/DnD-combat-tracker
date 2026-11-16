// Battle map: grid size, where each combatant's token is, and which
// background image is shown. Memory only, like combat state (the
// background library itself is saved, see backgrounds.js).
// No WebSocket knowledge here.
const combat = require('../combat/service');
const backgrounds = require('./backgrounds');

const MIN_SIZE = 5;
const MAX_SIZE = 50;

function freshState() {
  // positions: { [combatantId]: { x, y } }; backgroundId: '' = plain grid
  return { cols: 20, rows: 15, positions: {}, backgroundId: '' };
}

let state = freshState();

function reset() {
  state = freshState();
}

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

function inBounds(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < state.cols && y < state.rows;
}

function occupant(x, y) {
  return Object.keys(state.positions).find((id) => state.positions[id].x === x && state.positions[id].y === y);
}

// Place or move a token. One token per cell. Returns true if it moved.
function place(id, x, y) {
  if (!combat.findCombatant(id) || !inBounds(x, y)) return false;
  prune();
  const other = occupant(x, y);
  if (other && other !== id) return false;
  state.positions[id] = { x, y };
  return true;
}

function remove(id) {
  delete state.positions[id];
}

const clampSize = (n, fallback) => (Number.isFinite(n) ? Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n))) : fallback);

// Tokens that no longer fit go back to the tray.
function resize(cols, rows) {
  state.cols = clampSize(cols, state.cols);
  state.rows = clampSize(rows, state.rows);
  Object.keys(state.positions).forEach((id) => {
    const p = state.positions[id];
    if (!inBounds(p.x, p.y)) delete state.positions[id];
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

module.exports = { MIN_SIZE, MAX_SIZE, reset, snapshot, playerView, setBackground, deleteBackground, place, remove, resize, clear };
