// Combat state + the small operations on it. No WebSocket knowledge here.
// Saved to DATA_DIR/combat.json (debounced) so a restart or a container
// rebuild in the middle of a fight doesn't lose it.
const { uid } = require('../../core/ids');
const { createJsonStore } = require('../../core/jsonStore');

function freshState() {
  return {
    round: 1,
    activeIndex: 0,
    // { id, name, init, ac, hp, maxHp, tempHp, type, conditions: [], deathSuccess, deathFail,
    //   characterId ('' unless added from a character sheet),
    //   monsterId ('' unless added from the monster library),
    //   size (token footprint on the map in cells: 1 = Medium or smaller,
    //   2 = Large, 3 = Huge, 4 = Gargantuan),
    //   DM-only: hidden (not shown to players at all), alias (name players
    //   see instead, '' = real name), dmNotes }
    combatants: [],
  };
}

const MAX_TOKEN_SIZE = 4;
const clampTokenSize = (n) => (Number.isInteger(n) ? Math.max(1, Math.min(MAX_TOKEN_SIZE, n)) : 1);

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// A saved combatant, re-checked on load (the file could be old or edited).
function restoreCombatant(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id) return null;
  const maxHp = Math.max(1, num(c.maxHp, 1));
  return {
    id: c.id.slice(0, 40),
    characterId: str(c.characterId, 40),
    monsterId: str(c.monsterId, 40),
    name: str(c.name, 30) || 'Unnamed',
    init: num(c.init, 0),
    ac: num(c.ac, 10),
    hp: Math.max(0, Math.min(maxHp, num(c.hp, maxHp))),
    maxHp,
    tempHp: Math.max(0, num(c.tempHp, 0)),
    type: c.type === 'monster' ? 'monster' : 'pc',
    size: clampTokenSize(c.size),
    conditions: Array.isArray(c.conditions) ? c.conditions.filter((x) => typeof x === 'string').slice(0, 30) : [],
    deathSuccess: Math.max(0, Math.min(3, num(c.deathSuccess, 0))),
    deathFail: Math.max(0, Math.min(3, num(c.deathFail, 0))),
    hidden: c.hidden === true,
    alias: str(c.alias, 30),
    dmNotes: str(c.dmNotes, 2000),
  };
}

function restore(saved) {
  const s = freshState();
  if (!saved || typeof saved !== 'object' || !Array.isArray(saved.combatants)) return s;
  s.combatants = saved.combatants.map(restoreCombatant).filter(Boolean);
  s.round = Math.max(1, Math.round(num(saved.round, 1)));
  const idx = Math.round(num(saved.activeIndex, 0));
  s.activeIndex = idx >= 0 && idx < s.combatants.length ? idx : 0;
  return s;
}

const store = createJsonStore('combat', null);
let state = restore(store.load());

function getState() {
  return state;
}

// Call after changing the state (the combat actions do it for you).
function save() {
  store.save(state);
}

function reset() {
  state = freshState();
}

function findCombatant(id) {
  return state.combatants.find((c) => c.id === id);
}

// Keeps the active combatant active even if sorting moves them.
function sortByInitiative() {
  const activeId = state.combatants[state.activeIndex]
    ? state.combatants[state.activeIndex].id
    : null;
  state.combatants.sort((a, b) => b.init - a.init);
  if (activeId) {
    const newIdx = state.combatants.findIndex((c) => c.id === activeId);
    if (newIdx !== -1) state.activeIndex = newIdx;
  }
}

// Builds the canonical combatant shape. Callers do their own input
// validation/defaulting (the combat form and "send character" differ).
function addCombatant({ name, init, ac, hp, maxHp, tempHp = 0, type, characterId = '', monsterId = '', hidden = false, size = 1 }) {
  state.combatants.push({
    id: uid(),
    characterId,
    monsterId,
    name,
    init,
    ac,
    hp,
    maxHp,
    tempHp,
    type,
    size: clampTokenSize(size),
    conditions: [],
    deathSuccess: 0,
    deathFail: 0,
    hidden: !!hidden,
    alias: '',
    dmNotes: '',
  });
  sortByInitiative();
}

// How hurt a monster looks, for players who don't get its HP.
function healthWord(hp, maxHp) {
  if (hp <= 0) return 'Down';
  if (hp >= maxHp) return 'Unhurt';
  const pct = hp / maxHp;
  if (pct > 0.5) return 'Hurt';
  if (pct > 0.25) return 'Bloodied';
  return 'Near death';
}

const visibleToPlayers = (c) => !c.hidden;

// The combat state as players see it: no hidden combatants, no DM fields,
// and monsters show an alias (if set) and a health word instead of their
// HP and AC. `activeIndex` is -1 while a hidden combatant has the turn.
function playerView() {
  const visible = state.combatants.filter(visibleToPlayers);
  const active = state.combatants[state.activeIndex];
  const combatants = visible.map((c) => {
    const base = {
      id: c.id, name: c.name, init: c.init, type: c.type, conditions: c.conditions,
      characterId: c.characterId, monsterId: c.monsterId, size: c.size,
    };
    if (c.type !== 'monster') {
      return { ...base, ac: c.ac, hp: c.hp, maxHp: c.maxHp, tempHp: c.tempHp, deathSuccess: c.deathSuccess, deathFail: c.deathFail };
    }
    return {
      ...base,
      name: c.alias || c.name,
      monsterId: c.alias ? '' : c.monsterId, // its icon could give the disguise away
      health: healthWord(c.hp, c.maxHp),
    };
  });
  return {
    round: state.round,
    activeIndex: active && visibleToPlayers(active) ? visible.indexOf(active) : -1,
    combatants,
  };
}

module.exports = {
  MAX_TOKEN_SIZE, clampTokenSize, getState, save, reset, findCombatant, sortByInitiative, addCombatant, healthWord, visibleToPlayers, playerView,
};
