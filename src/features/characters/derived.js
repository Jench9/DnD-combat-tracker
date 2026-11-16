// Values computed from a character plus the item library, rather than
// stored: currently the armor class. The characters slice is sent with
// these filled in, and combat uses them when adding a character.
const items = require('../items/service');
const { mod } = require('./model');

// 5e rules: no armor = 10 + DEX; light = base + DEX; medium = base + DEX
// (max +2, or the item's maxDex); heavy = base, no DEX. A shield adds its
// bonus. Magic armor/shields add their magicBonus. Uses the first equipped
// body armor and the first equipped shield.
function computeAc(ch) {
  const dex = mod(ch.abilities && ch.abilities.dex);
  const equipped = (ch.inventory || []).filter((e) => e.equipped && e.qty > 0)
    .map((e) => items.find(e.itemId)).filter((it) => it && it.type === 'armor');
  const armor = equipped.find((it) => it.armorType !== 'shield');
  const shield = equipped.find((it) => it.armorType === 'shield');

  let ac;
  if (!armor) {
    ac = 10 + dex;
  } else {
    const dexPart = armor.maxDex === 0 ? 0 : armor.maxDex === null ? dex : Math.min(dex, armor.maxDex);
    ac = armor.baseAc + dexPart + (armor.magicBonus || 0);
  }
  if (shield) ac += shield.baseAc + (shield.magicBonus || 0);
  return ac;
}

// The character as clients and combat see it.
function withDerived(ch) {
  return ch.acAuto ? { ...ch, ac: computeAc(ch) } : ch;
}

module.exports = { computeAc, withDerived };
