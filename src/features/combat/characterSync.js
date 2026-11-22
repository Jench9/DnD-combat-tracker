// Keeps combatants made from character sheets in step with the sheet
// (familiars with their owner's sheet familiar):
// computed AC (equipping a shield, casting Shield, switching on Haste…),
// current, max and temporary HP (healing on the sheet, a level-up, a D&D
// Beyond sync). The other direction — HP changed in combat written back to
// the sheet — is `writeHpToSheet`, used by `adjustHP` and `setTempHp`.
const combat = require('./service');
const characters = require('../characters/service');
const { withDerived } = require('../characters/derived');

// Returns true if any combatant changed, in any table (campaign).
function syncCombatantsFromSheets() {
  let changed = false;
  combat.forEachTable((state) => state.combatants.forEach((c) => {
    if (c.type === 'familiar') { if (syncFamiliar(c)) changed = true; return; }
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
  }));
  if (changed) combat.save();
  return changed;
}

// A familiar combatant follows its owner's sheet familiar (HP, AC, a new form).
function syncFamiliar(c) {
  const ch = c.ownerId && characters.find(c.ownerId);
  const fam = ch && ch.familiar;
  if (!fam) return false;
  let changed = false;
  if (fam.ac !== c.ac) { c.ac = fam.ac; changed = true; }
  if (fam.hpMax !== c.maxHp) { c.maxHp = fam.hpMax; changed = true; }
  if (fam.hp !== c.hp) { c.hp = Math.min(c.maxHp, fam.hp); changed = true; }
  if (fam.monsterId && fam.monsterId !== c.monsterId) { c.monsterId = fam.monsterId; changed = true; }
  return changed;
}

// A combatant's HP changed in combat: save current and temporary HP on its
// character sheet (a familiar's HP on its owner's sheet). Returns true if a
// sheet changed.
function writeHpToSheet(combatant) {
  if (combatant && combatant.type === 'familiar') {
    const owner = combatant.ownerId && characters.find(combatant.ownerId);
    if (!owner || !owner.familiar || owner.familiar.hp === combatant.hp) return false;
    characters.update(owner.id, { familiar: { hp: combatant.hp } });
    return true;
  }
  if (!combatant || !combatant.characterId) return false;
  const ch = characters.find(combatant.characterId);
  if (!ch || (ch.hpCurrent === combatant.hp && ch.hpTemp === combatant.tempHp)) return false;
  characters.update(ch.id, { hpCurrent: combatant.hp, hpTemp: combatant.tempHp });
  return true;
}

module.exports = { syncCombatantsFromSheets, writeHpToSheet };
