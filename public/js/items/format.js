// One-line summaries of items, shared by every page that lists them.

const signed = (n) => (n >= 0 ? '+' : '') + n;

// e.g. "1d8+1 slashing + 2d6 fire · versatile (1d10+1) · martial melee"
export function weaponSummary(it) {
  const bonus = it.magicBonus ? signed(it.magicBonus) : '';
  const parts = [`${it.damage}${bonus} ${it.damageType}` + (it.extraDamage ? ` + ${it.extraDamage} ${it.extraDamageType || ''}`.trimEnd() : '')];
  if (it.versatileDamage) parts.push(`versatile (${it.versatileDamage}${bonus})`);
  if (it.range) parts.push(`range ${it.range} ft`);
  if (it.properties.length) parts.push(it.properties.join(', '));
  parts.push(`${it.weaponCategory} ${it.attackType}`);
  if (it.mastery) parts.push(`mastery: ${it.mastery}`);
  if (it.magicBonus) parts.push(`${signed(it.magicBonus)} to hit`);
  return parts.join(' · ');
}

// e.g. "AC 14 + DEX (max 2) · stealth disadvantage"
export function armorSummary(it) {
  const magic = it.magicBonus || 0;
  if (it.armorType === 'shield') return `${signed(it.baseAc + magic)} AC · shield`;
  const dex = it.maxDex === 0 ? '' : it.maxDex === null ? ' + DEX' : ` + DEX (max ${it.maxDex})`;
  const parts = [`AC ${it.baseAc + magic}${dex}`, `${it.armorType} armor`];
  if (it.strengthReq) parts.push(`STR ${it.strengthReq}`);
  if (it.stealthDisadvantage) parts.push('stealth disadvantage');
  return parts.join(' · ');
}

export function gearSummary(it) {
  return it.effectDice ? `${it.effectDice} ${it.effect || ''}`.trim() : '';
}

export function itemSummary(it) {
  if (it.type === 'weapon') return weaponSummary(it);
  if (it.type === 'armor') return armorSummary(it);
  return gearSummary(it);
}
