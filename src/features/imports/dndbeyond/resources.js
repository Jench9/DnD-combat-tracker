// Limited-use features (Second Wind, Rage, Ki, Channel Divinity, racial
// breath weapons…) from a D&D Beyond character -> sheet `resources`.
// Pure. Reads `data.actions.{race,class,feat}[].limitedUse`; D&D Beyond's
// JSON is unofficial, so everything is read defensively and the counts are
// best-effort (the player can fix them on the sheet).
const { mod } = require('../../characters/model');

const ABILITY_BY_ID = { 1: 'str', 2: 'dex', 3: 'con', 4: 'int', 5: 'wis', 6: 'cha' };
// D&D Beyond resetType: 1 short rest, 2 long rest, 3 dawn (≈ long rest), other = manual.
const RECHARGE = { 1: 'short', 2: 'long', 3: 'long' };

const keyOf = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const profBonus = (level) => 2 + Math.floor((Math.max(1, level) - 1) / 4);

function maxUsesOf(lu, { level, abilities }) {
  let uses = parseInt(lu.maxUses, 10) || 0;
  const stat = ABILITY_BY_ID[lu.statModifierUsesId];
  if (stat) uses += mod(abilities && abilities[stat]);
  if (lu.useProficiencyBonus) {
    uses = lu.proficiencyBonusOperator === 2 ? Math.max(1, uses) * profBonus(level) : uses + profBonus(level);
  }
  return Math.max(1, Math.min(999, uses));
}

// -> [{ id, name, max, used, recharge }]
function planResources(data, { level = 1, abilities = {} } = {}, newId) {
  const actions = data && data.actions && typeof data.actions === 'object' ? data.actions : {};
  const out = [];
  const seen = new Set();
  ['class', 'race', 'feat'].forEach((source) => {
    (Array.isArray(actions[source]) ? actions[source] : []).forEach((a) => {
      const lu = a && a.limitedUse;
      const name = a && (a.name || (a.definition && a.definition.name));
      if (!lu || !name || seen.has(keyOf(name))) return;
      seen.add(keyOf(name));
      const max = maxUsesOf(lu, { level, abilities });
      out.push({
        id: newId(),
        name: String(name).slice(0, 40),
        max,
        used: Math.max(0, Math.min(max, parseInt(lu.numberUsed, 10) || 0)),
        recharge: RECHARGE[lu.resetType] || 'none',
      });
    });
  });
  return out.slice(0, 30);
}

// Sync: D&D Beyond decides which features exist, their max and recharge;
// the table's used counts are kept (matched by name), and resources added
// by hand on the sheet stay.
function mergeResources(existing, planned) {
  const byKey = new Map((Array.isArray(existing) ? existing : []).map((r) => [keyOf(r.name), r]));
  const merged = planned.map((p) => {
    const old = byKey.get(keyOf(p.name));
    if (!old) return p;
    byKey.delete(keyOf(p.name));
    return { ...p, id: old.id, used: Math.min(p.max, old.used || 0) };
  });
  return [...merged, ...byKey.values()].slice(0, 30);
}

module.exports = { planResources, mergeResources };
