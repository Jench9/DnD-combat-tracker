// Keeps combatants made from character sheets in step with the sheet:
// computed AC (equipping a shield, casting Shield, switching on Haste…),
// current, max and temporary HP (healing on the sheet, a level-up, a D&D
// Beyond sync). The other direction — HP changed in combat written back to
// the sheet — is `writeHpToSheet`, used by `adjustHP` and `setTempHp`.
const combat = require('./service');
const characters = require('../characters/service');
const { withDerived } = require('../characters/derived');

// Returns true if any combatant changed.
function syncCombatantsFromSheets() {
  let changed = false;
  combat.getState().combatants.forEach((c) => {
    if (!c.characterId) return;
    const ch = characters.find(c.characterId);
    if (!ch) return;
    const { ac } = withDerived(ch);
    if (typeof ac === 'number' && ac !== c.ac) { c.ac = ac; changed = true; }
    const maxHp = Math.max(1, ch.hpMax || 1);
    const hp = Math.max(0, Math.min(maxHp, ch.hpCurrent));
    if (maxHp !== c.maxHp) { c.maxHp = maxHp; changed = true; }
    const tempHp = Math.max(0, ch.hpTemp || 0);
    if (tempHp !== c.tempHp) { c.tempHp = tempHp; changed = true; }
    if (Number.isFinite(hp) && hp !== c.hp) {
      c.hp = hp;
      if (hp > 0) { c.deathSuccess = 0; c.deathFail = 0; } // back on their feet
      changed = true;
    }
  });
  return changed;
}

// A combatant's HP changed in combat: save current and temporary HP on its
// character sheet. Returns true if a sheet changed.
function writeHpToSheet(combatant) {
  if (!combatant || !combatant.characterId) return false;
  const ch = characters.find(combatant.characterId);
  if (!ch || (ch.hpCurrent === combatant.hp && ch.hpTemp === combatant.tempHp)) return false;
  characters.update(ch.id, { hpCurrent: combatant.hp, hpTemp: combatant.tempHp });
  return true;
}

module.exports = { syncCombatantsFromSheets, writeHpToSheet };
