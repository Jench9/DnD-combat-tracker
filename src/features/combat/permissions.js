// What players may do in combat (the DM may do everything; see the hub).
// A player controls only the combatant made from their own character.
const svc = require('./service');
const { owns } = require('../../core/identity');

function ownsCombatant(payload, identity) {
  const c = svc.findCombatant(payload.id);
  return !!c && !!c.characterId && owns(identity, c.characterId);
}

module.exports = {
  addCharacterToCombat: (payload, identity) => owns(identity, payload.characterId),
  adjustHP: ownsCombatant,
  addCondition: ownsCombatant,
  removeCondition: ownsCombatant,
  toggleDeathSave: ownsCombatant,
  setInitiative: ownsCombatant,
  renameCombatant: ownsCombatant,
  removeCombatant: ownsCombatant,
  // A player can end their own turn.
  nextTurn: (payload, identity) => {
    const st = svc.getState();
    const active = st.combatants[st.activeIndex];
    return !!active && !!active.characterId && owns(identity, active.characterId);
  },
};
