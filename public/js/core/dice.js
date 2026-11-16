// Dice: parse "2d6+1" (or a flat "1") and roll it.
const DICE_RE = /^\s*(?:(\d{1,2})d(\d{1,3})(?:\s*([+-])\s*(\d{1,3}))?|(\d{1,3}))\s*$/i;

export function parseDice(expr) {
  const m = DICE_RE.exec(String(expr || ''));
  if (!m) return null;
  if (m[5] !== undefined) return { count: 0, sides: 0, mod: parseInt(m[5], 10) };
  const mod = m[3] ? (m[3] === '-' ? -1 : 1) * parseInt(m[4], 10) : 0;
  return { count: parseInt(m[1], 10), sides: parseInt(m[2], 10), mod };
}

export const rollDie = (sides) => 1 + Math.floor(Math.random() * sides);

// Rolls `expr` plus an extra flat modifier. A critical hit doubles the
// number of dice (not the modifiers). Returns { total, rolls, text }.
export function roll(expr, extraMod = 0, { crit = false } = {}) {
  const d = parseDice(expr);
  if (!d) return { total: 0, rolls: [], text: '?' };
  const count = d.count * (crit ? 2 : 1);
  const rolls = Array.from({ length: count }, () => rollDie(d.sides));
  const mod = d.mod + extraMod;
  const total = rolls.reduce((a, b) => a + b, 0) + mod;
  const dicePart = count ? `${count}d${d.sides} [${rolls.join(', ')}]` : '';
  const modPart = mod ? (dicePart ? (mod > 0 ? ' + ' : ' − ') + Math.abs(mod) : String(mod)) : (dicePart ? '' : '0');
  return { total, rolls, text: dicePart + modPart };
}

// "1d8" + 3 -> "1d8+3"; "1" + 3 -> "4" (flat damage just adds up).
export function formatDice(expr, extraMod = 0) {
  const d = parseDice(expr);
  if (!d) return String(expr || '');
  const mod = d.mod + extraMod;
  if (!d.count) return String(mod);
  return `${d.count}d${d.sides}${mod ? (mod > 0 ? '+' : '') + mod : ''}`;
}
