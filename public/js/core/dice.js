// Dice expressions like "2d6+1", "8d6+2d6", "1d8-1" or a flat "4".
//   parseDice(expr)            -> { groups: [{ count, sides }], mod } | null
//   addDice(a, b, times)       -> a + times × b, combined ("8d6" + 2×"1d6" = "10d6")
//   scaleDice(expr, factor)    -> dice counts × factor (cantrip scaling)
//   formatDice(expr, extraMod) -> canonical text with an extra flat modifier
//   roll(expr, extraMod, { crit, label }) -> { total, text }  (crit doubles the dice)
//   rollBatch(title, fn)       -> Promise of fn(): with "roll my own dice" on,
//                                 asks for the dice fn uses (see below)
const TERM_RE = /([+-])?\s*(\d{1,3})(?:\s*d\s*(\d{1,3}))?/gy;

export function parseDice(expr) {
  // Spaces are fine around "+", "-" and "d", nowhere else ("1d6 2" is invalid).
  const s = String(expr || '').trim().toLowerCase().replace(/\s*([+-])\s*/g, '$1').replace(/\s*d\s*/g, 'd');
  if (!s || /\s/.test(s)) return null;
  const groups = [];
  let mod = 0;
  let pos = 0;
  TERM_RE.lastIndex = 0;
  while (pos < s.length) {
    TERM_RE.lastIndex = pos;
    const m = TERM_RE.exec(s);
    if (!m || m.index !== pos || (pos > 0 && !m[1])) return null;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[3] !== undefined) {
      if (sign < 0) return null; // no subtracted dice
      groups.push({ count: parseInt(m[2], 10), sides: parseInt(m[3], 10) });
    } else {
      mod += sign * parseInt(m[2], 10);
    }
    pos = TERM_RE.lastIndex;
  }
  return { groups, mod };
}

// Same-sided dice merged, bigger dice first: "2d8+1d6+3".
function canonical({ groups, mod }) {
  const bySides = new Map();
  groups.forEach((g) => bySides.set(g.sides, (bySides.get(g.sides) || 0) + g.count));
  const dice = [...bySides.entries()].filter(([, c]) => c > 0).sort((a, b) => b[0] - a[0]).map(([s, c]) => `${c}d${s}`);
  if (!dice.length) return String(mod);
  return dice.join('+') + (mod ? (mod > 0 ? '+' : '') + mod : '');
}

export function addDice(a, b, times = 1) {
  const da = parseDice(a);
  const db = parseDice(b);
  if (!da) return String(a || '');
  if (!db || times <= 0) return canonical(da);
  return canonical({
    groups: [...da.groups, ...db.groups.map((g) => ({ ...g, count: g.count * times }))],
    mod: da.mod + db.mod * times,
  });
}

export function scaleDice(expr, factor) {
  const d = parseDice(expr);
  if (!d) return String(expr || '');
  return canonical({ groups: d.groups.map((g) => ({ ...g, count: g.count * factor })), mod: d.mod });
}

export function formatDice(expr, extraMod = 0) {
  const d = parseDice(expr);
  if (!d) return String(expr || '');
  return canonical({ groups: d.groups, mod: d.mod + extraMod });
}

export const randomDie = (sides) => 1 + Math.floor(Math.random() * sides);

// ---- Rolling your own dice
// Every die goes through rollDie(). Normally it's random; inside
// rollBatch() with the "roll my own dice" setting on, the dice come from
// the player instead. rollBatch runs `fn` (synchronous, no side effects)
// once to learn which dice it needs, asks for them all in one dialog, then
// runs it again with the answers. Dice that depend on others (a Great
// Weapon Fighting reroll of a 1 or 2) are asked for in a second round.
// Keep each batch free of other branches: e.g. roll a spell attack and its
// damage in two batches, because a critical hit changes the damage dice.
let source = null; // (sides, label, kind) => value, while a batch runs
let asker = null; // async ([{ sides, label }], title) => [values] | null (cancelled)

export const rollDie = (sides, label = '') => (source ? source(sides, label, 'die') : randomDie(sides));
const rerollDie = (sides, label = '') => (source ? source(sides, label, 'reroll') : randomDie(sides));

const MANUAL_KEY = 'kit.manualDice';
export function manualDice() {
  try { return localStorage.getItem(MANUAL_KEY) === '1'; } catch { return false; }
}
export function setManualDice(on) {
  try { localStorage.setItem(MANUAL_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
}
// The page's dialog for asking (core/diceDialog.js registers itself).
export function setDiceAsker(fn) { asker = fn; }

export class RollCancelled extends Error {}

export async function rollBatch(title, fn) {
  if (!manualDice() || !asker) return fn();
  const given = { die: [], reroll: [] };
  for (let round = 0; round < 4; round++) {
    const used = { die: 0, reroll: 0 };
    const need = [];
    source = (sides, label, kind) => {
      const i = used[kind]++;
      if (i < given[kind].length) return given[kind][i];
      need.push({ sides, label, kind });
      return sides; // a placeholder that triggers no reroll
    };
    let result;
    try { result = fn(); } finally { source = null; }
    if (!need.length) return result;
    const answers = await asker(need, round === 0 ? title : title + ' — rerolls');
    if (!answers) throw new RollCancelled();
    need.forEach((n, i) => given[n.kind].push(answers[i]));
  }
  return fn();
}

// Reroll rules, applied to each die: returns [value, shown text].
//   'gwf-2014': 1 or 2 is rerolled once (the new roll stands)
//   'gwf-2024': 1 or 2 counts as 3
//   'ea':       1 counts as 2 (Elemental Adept)
function applyReroll(r, sides, rule, label) {
  if (rule === 'gwf-2014' && r <= 2) { const n = rerollDie(sides, `reroll the ${r} (${label})`); return [n, `${r}→${n}`]; }
  if (rule === 'gwf-2024' && r <= 2) return [3, `${r}→3`];
  if (rule === 'ea' && r === 1) return [2, '1→2'];
  return [r, String(r)];
}

// Options: crit doubles every die; critExtraDice adds that many more dice
// of the first group's size on a crit (Brutal Critical); reroll as above.
export function roll(expr, extraMod = 0, { crit = false, reroll = '', critExtraDice = 0, label = '' } = {}) {
  const d = parseDice(expr);
  if (!d) return { total: 0, rolls: [], text: '?' };
  const parts = [];
  let total = 0;
  d.groups.forEach((g, i) => {
    const count = g.count * (crit ? 2 : 1) + (crit && i === 0 ? critExtraDice : 0);
    const shown = [];
    for (let k = 0; k < count; k++) {
      const what = `d${g.sides}` + (label ? ` ${label}` : '');
      const [v, txt] = applyReroll(rollDie(g.sides, what), g.sides, reroll, what);
      total += v;
      shown.push(txt);
    }
    parts.push(`${count}d${g.sides} [${shown.join(', ')}]`);
  });
  const mod = d.mod + extraMod;
  total += mod;
  const text = parts.join(' + ') + (mod ? (parts.length ? (mod > 0 ? ' + ' : ' − ') + Math.abs(mod) : String(mod)) : (parts.length ? '' : '0'));
  return { total, text };
}
