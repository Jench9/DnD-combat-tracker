// Keeps combatants made from character sheets in step with the sheet's
// computed AC (equipping a shield, casting Shield, switching on Haste…).
// Returns true if any combatant changed.
const combat = require('./service');
const characters = require('../characters/service');
const { withDerived } = require('../characters/derived');

function syncCombatantAcs() {
  let changed = false;
  combat.getState().combatants.forEach((c) => {
    if (!c.characterId) return;
    const ch = characters.find(c.characterId);
    if (!ch) return;
    const { ac } = withDerived(ch);
    if (typeof ac === 'number' && ac !== c.ac) { c.ac = ac; changed = true; }
  });
  return changed;
}

module.exports = { syncCombatantAcs };
