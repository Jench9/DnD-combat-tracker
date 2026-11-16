// Combat state + the small operations on it. No WebSocket knowledge here.
const { uid } = require('../../core/ids');

function freshState() {
  return {
    round: 1,
    activeIndex: 0,
    // { id, name, init, ac, hp, maxHp, type, conditions: [], deathSuccess, deathFail,
    //   characterId ('' unless added from a character sheet),
    //   monsterId ('' unless added from the monster library),
    //   DM-only: hidden (not shown to players at all), alias (name players
    //   see instead, '' = real name), dmNotes }
    combatants: [],
  };
}

let state = freshState();

function getState() {
  return state;
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
function addCombatant({ name, init, ac, hp, maxHp, type, characterId = '', monsterId = '', hidden = false }) {
  state.combatants.push({
    id: uid(),
    characterId,
    monsterId,
    name,
    init,
    ac,
    hp,
    maxHp,
    type,
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
      characterId: c.characterId, monsterId: c.monsterId,
    };
    if (c.type !== 'monster') {
      return { ...base, ac: c.ac, hp: c.hp, maxHp: c.maxHp, deathSuccess: c.deathSuccess, deathFail: c.deathFail };
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
  getState, reset, findCombatant, sortByInitiative, addCombatant, healthWord, visibleToPlayers, playerView,
};
