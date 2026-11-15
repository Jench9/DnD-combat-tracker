// Combat state + the small operations on it. No WebSocket knowledge here.
const { uid } = require('../../core/ids');

function freshState() {
  return {
    round: 1,
    activeIndex: 0,
    // { id, name, init, ac, hp, maxHp, type, conditions: [], deathSuccess, deathFail,
    //   characterId ('' unless added from a character sheet) }
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
function addCombatant({ name, init, ac, hp, maxHp, type, characterId = '' }) {
  state.combatants.push({
    id: uid(),
    characterId,
    name,
    init,
    ac,
    hp,
    maxHp,
    type,
    conditions: [],
    deathSuccess: 0,
    deathFail: 0,
  });
  sortByInitiative();
}

module.exports = { getState, reset, findCombatant, sortByInitiative, addCombatant };
