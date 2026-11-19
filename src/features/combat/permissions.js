// What players may do in combat (the DM may do everything; see the hub).
// A player controls only the combatant made from their own character, and
// that character's familiar (`ownerId`).
const svc = require('./service');
const { owns } = require('../../core/identity');

const controller = (c) => (c && (c.characterId || c.ownerId)) || '';

function ownsCombatant(payload, identity) {
  const c = svc.findCombatant(payload.id);
  return !!controller(c) && owns(identity, controller(c));
}

// Effects: whoever controls the target, or the caster (named in the
// payload when adding; the effect's own caster when removing).
function ownsTargetOrCaster(payload, identity) {
  return ownsCombatant(payload, identity)
    || (typeof payload.casterId === 'string' && ownsCombatant({ id: payload.casterId }, identity));
}
function ownsTargetOrEffectCaster(payload, identity) {
  if (ownsCombatant(payload, identity)) return true;
  const t = svc.findCombatant(payload.id);
  const e = t && t.effects.find((x) => x.id === payload.effectId);
  return !!e && !!e.casterId && ownsCombatant({ id: e.casterId }, identity);
}

module.exports = {
  addCharacterToCombat: (payload, identity) => owns(identity, payload.characterId),
  addFamiliarToCombat: (payload, identity) => owns(identity, payload.characterId),
  adjustHP: ownsCombatant,
  setTempHp: ownsCombatant,
  addCondition: ownsCombatant,
  removeCondition: ownsCombatant,
  toggleDeathSave: ownsCombatant,
  setConcentration: ownsCombatant,
  endConcentration: ownsCombatant,
  resolveConcentration: ownsCombatant,
  addEffect: ownsTargetOrCaster,
  removeEffect: ownsTargetOrEffectCaster,
  setInitiative: ownsCombatant,
  renameCombatant: ownsCombatant,
  removeCombatant: ownsCombatant,
  // A player can end their own turn.
  nextTurn: (payload, identity) => {
    const st = svc.getState();
    const active = st.combatants[st.activeIndex];
    return !!controller(active) && owns(identity, controller(active));
  },
};
