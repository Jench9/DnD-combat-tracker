// Values computed from a character plus the item library and the modifier
// catalog, rather than stored: currently the armor class. The characters
// slice is sent with these filled in, and combat uses them.
const path = require('path');
const items = require('../items/service');
const { mod } = require('./model');
const { PUBLIC_DIR } = require('../../config');

// The modifier catalog is shared with the browser (which uses it for
// attacks); here only its AC rules matter.
const PRESETS = require(path.join(PUBLIC_DIR, 'js/core/modifier-presets.json'));
const PRESET_BY_KEY = new Map(PRESETS.map((p) => [p.key, p]));

const signed = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
const shortName = (name) => name.replace(/\s*\(.*\)$/, '');

// The character's active AC rules: { name, bonus, requiresArmor } or an
// unarmored base { name, base, add: ['DEX', …], noShield }.
function acRules(ch) {
  return (ch.modifiers || []).map((m) => {
    const def = m.preset ? PRESET_BY_KEY.get(m.preset)
      : m.custom && m.custom.ac ? { name: m.custom.name, toggle: m.custom.toggle, ac: { bonus: m.custom.ac } } : null;
    if (!def || !def.ac || (def.toggle && !m.active)) return null;
    return { name: shortName(def.name), ...def.ac };
  }).filter(Boolean);
}

// 5e rules: no armor = 10 + DEX; light = base + DEX; medium = base + DEX
// (max +2, or the item's maxDex); heavy = base, no DEX; magic armor adds
// its bonus. Without body armor, unarmored formulas from modifiers
// (Unarmored Defense, Mage Armor, Draconic Resilience) compete and the
// best one wins. Then a shield adds its bonus (unless the chosen formula
// forbids shields), and bonuses (Defense with armor, Shield, Haste…) add
// on top. Returns { ac, breakdown }.
function computeAc(ch) {
  const abil = (k) => mod(ch.abilities && ch.abilities[k.toLowerCase()]);
  const dex = abil('dex');
  const equipped = (ch.inventory || []).filter((e) => e.equipped && e.qty > 0)
    .map((e) => items.find(e.itemId)).filter((it) => it && it.type === 'armor');
  const armor = equipped.find((it) => it.armorType !== 'shield');
  const shield = equipped.find((it) => it.armorType === 'shield');
  const rules = acRules(ch);

  const candidates = [];
  if (armor) {
    const dexPart = armor.maxDex === 0 ? 0 : armor.maxDex === null ? dex : Math.min(dex, armor.maxDex);
    const magic = armor.magicBonus || 0;
    candidates.push({
      total: armor.baseAc + dexPart + magic,
      parts: [`${armor.name} ${armor.baseAc}`, ...(dexPart ? [`DEX ${signed(dexPart)}`] : []), ...(magic ? [`magic ${signed(magic)}`] : [])],
    });
  } else {
    candidates.push({ total: 10 + dex, parts: ['10', `DEX ${signed(dex)}`] });
    rules.filter((r) => r.base !== undefined && !(r.noShield && shield)).forEach((r) => {
      const adds = (r.add || []).map((k) => [k, abil(k)]);
      candidates.push({
        total: r.base + adds.reduce((s, [, v]) => s + v, 0),
        parts: [`${r.name} ${r.base}`, ...adds.map(([k, v]) => `${k} ${signed(v)}`)],
        noShield: r.noShield,
      });
    });
  }
  const best = candidates.reduce((a, b) => (b.total > a.total ? b : a));
  let ac = best.total;
  const parts = [...best.parts];
  if (shield && !best.noShield) {
    const s = shield.baseAc + (shield.magicBonus || 0);
    ac += s;
    parts.push(`${shield.name} ${signed(s)}`);
  }
  rules.filter((r) => r.bonus && (!r.requiresArmor || armor)).forEach((r) => {
    ac += r.bonus;
    parts.push(`${r.name} ${signed(r.bonus)}`);
  });
  return { ac, breakdown: parts.join(' ') };
}

// The character as clients and combat see it.
function withDerived(ch) {
  if (!ch.acAuto) return ch;
  const { ac, breakdown } = computeAc(ch);
  return { ...ch, ac, acBreakdown: breakdown };
}

module.exports = { computeAc, withDerived };
