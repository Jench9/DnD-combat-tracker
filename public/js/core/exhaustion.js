// Exhaustion (levels 0–6), 2024 rules first (the table's baseline), 2014 as
// the legacy option (`rulesEdition` on the character).
//
//   exhaustionText(level, edition)   -> what it does, for tooltips/cards
//   d20Penalty(character)            -> 2024: −2 × level on every d20 Test
//                                       (attack rolls, saves, checks); 2014: 0
//   effectiveSpeed(character)        -> speed after exhaustion
export const MAX_EXHAUSTION = 6;

const RULES_2014 = [
  '',
  'Disadvantage on ability checks',
  'Speed halved',
  'Disadvantage on attack rolls and saving throws',
  'Hit point maximum halved',
  'Speed reduced to 0',
  'Death',
];

const level = (ch) => Math.max(0, Math.min(MAX_EXHAUSTION, parseInt(ch && ch.exhaustion, 10) || 0));
const is2014 = (ch) => ch && ch.rulesEdition === '2014';

export function exhaustionText(lvl, edition = '2024') {
  const n = Math.max(0, Math.min(MAX_EXHAUSTION, parseInt(lvl, 10) || 0));
  if (!n) return 'Not exhausted';
  if (edition === '2014') return RULES_2014.slice(1, n + 1).join('; ') + (n >= 6 ? '' : ' (2014 rules: effects add up)');
  if (n >= 6) return 'Level 6: the creature dies';
  return `−${2 * n} to every d20 Test (attack rolls, saving throws, ability checks); speed −${5 * n} ft. A long rest removes one level.`;
}

export const d20Penalty = (ch) => (is2014(ch) ? 0 : -2 * level(ch));

export function effectiveSpeed(ch) {
  const speed = parseInt(ch && ch.speed, 10) || 0;
  const n = level(ch);
  if (!n) return speed;
  if (is2014(ch)) return n >= 5 ? 0 : n >= 2 ? Math.floor(speed / 2) : speed;
  return Math.max(0, speed - 5 * n);
}
