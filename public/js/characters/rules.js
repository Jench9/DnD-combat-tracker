// D&D 5e rules data + pure helpers (no DOM, no state).
export const ABILITIES = [
  ['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'],
  ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma'],
];

export const SKILLS = [
  ['Acrobatics', 'dex'], ['Animal Handling', 'wis'], ['Arcana', 'int'],
  ['Athletics', 'str'], ['Deception', 'cha'], ['History', 'int'],
  ['Insight', 'wis'], ['Intimidation', 'cha'], ['Investigation', 'int'],
  ['Medicine', 'wis'], ['Nature', 'int'], ['Perception', 'wis'],
  ['Performance', 'cha'], ['Persuasion', 'cha'], ['Religion', 'int'],
  ['Sleight of Hand', 'dex'], ['Stealth', 'dex'], ['Survival', 'wis'],
];

export function abilityMod(score) {
  return Math.floor(((parseInt(score, 10) || 10) - 10) / 2);
}

export function fmtMod(n) {
  return (n >= 0 ? '+' : '') + n;
}

export function profBonusForLevel(level) {
  const lvl = parseInt(level, 10) || 1;
  if (lvl >= 17) return 6;
  if (lvl >= 13) return 5;
  if (lvl >= 9) return 4;
  if (lvl >= 5) return 3;
  return 2;
}

// CSS class suffix for an HP bar at `pct` percent.
export function hpClass(pct) {
  return pct <= 25 ? ' low' : pct <= 55 ? ' mid' : '';
}
