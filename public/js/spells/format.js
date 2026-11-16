// Spell text helpers shared by the spells page, the sheet and actions.
const ORD = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export const levelLabel = (level) => (level === 0 ? 'Cantrip' : `${ORD[level]} level`);
export const slotLabel = (level) => `${ORD[level]}`;

// e.g. "DEX save · 8d6 fire (half on success) · +1d6 per slot level"
// (caster-independent: no attack bonus or DC numbers).
export function spellSummary(sp) {
  const dmg = sp.dice ? `${sp.dice}${sp.addMod ? ' + mod' : ''} ${sp.mechanic === 'heal' ? 'healing' : sp.damageType}`.trim() : '';
  const extra = sp.extraDice ? ` + ${sp.extraDice} ${sp.extraDamageType}` : '';
  const parts = [];
  if (sp.mechanic === 'attack') parts.push('spell attack');
  if (sp.mechanic === 'save') parts.push(`${sp.saveAbility.toUpperCase()} save`);
  if (sp.mechanic === 'auto') parts.push('auto-hit');
  if (dmg) parts.push(dmg + extra + (sp.mechanic === 'save' ? (sp.saveSuccess === 'half' ? ' (half on success)' : '') : ''));
  if (sp.higherLevelDice) parts.push(`+${sp.higherLevelDice} per slot level`);
  if (sp.cantripScaling) parts.push('scales at 5th/11th/17th');
  return parts.join(' · ');
}

// e.g. "3rd level evocation · 1 action · 150 ft · concentration · ritual"
export function spellHeader(sp) {
  return [
    sp.level === 0 ? `${sp.school} cantrip` : `${ORD[sp.level]}-level ${sp.school}`,
    sp.castingTime, sp.range, sp.concentration ? 'concentration' : '', sp.ritual ? 'ritual' : '',
  ].filter(Boolean).join(' · ');
}
