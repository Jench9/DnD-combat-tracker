// Short and long rests, and spending Hit Dice. Pure functions: each takes a
// character and returns a patch for characters/service.update (which runs it
// through the sanitizer), or null when there's nothing to do.
//
//   hitDice      "5d10" or, multiclassed, "3d10 + 2d6" — the total pool
//   hitDiceUsed  { d6, d8, d10, d12 } — spent dice per size
//   pactMagic    { level, count } — Warlock slots inside spellSlots that come
//                back on a short rest
//   resources    [{ id, name, max, used, recharge: 'short'|'long'|'none' }]
//   rulesEdition '2014' | '2024' — a long rest gives back half the Hit Dice
//                (2014) or all of them (2024)
const { mod } = require('./model');

const DIE_SIZES = [6, 8, 10, 12];

// "3d10 + 2d6" -> { d6: 2, d8: 0, d10: 3, d12: 0 }. A bare "d8" counts as 1.
function parseHitDice(text) {
  const pool = { d6: 0, d8: 0, d10: 0, d12: 0 };
  const re = /(\d*)\s*d\s*(\d+)/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const key = 'd' + m[2];
    if (key in pool) pool[key] = Math.min(99, pool[key] + (m[1] === '' ? 1 : parseInt(m[1], 10)));
  }
  return pool;
}

function usedOf(ch) {
  const used = ch.hitDiceUsed || {};
  return Object.fromEntries(DIE_SIZES.map((s) => [`d${s}`, Math.max(0, parseInt(used[`d${s}`], 10) || 0)]));
}

// Dice still available, per size.
function hitDiceLeft(ch) {
  const total = parseHitDice(ch.hitDice);
  const used = usedOf(ch);
  return Object.fromEntries(Object.keys(total).map((k) => [k, Math.max(0, total[k] - used[k])]));
}

// Spend one Hit Die during a short rest: roll + CON modifier HP (at least
// 0, up to max HP). `roll` is the die result if the client rolled it, so
// the player sees the same number; otherwise the server rolls.
function spendHitDie(ch, size, roll) {
  const key = 'd' + size;
  if (!DIE_SIZES.includes(size) || !(hitDiceLeft(ch)[key] > 0)) return null;
  const r = Number.isInteger(roll) && roll >= 1 && roll <= size ? roll : 1 + Math.floor(Math.random() * size);
  const healed = Math.max(0, r + mod(ch.abilities && ch.abilities.con));
  const used = usedOf(ch);
  used[key] += 1;
  return {
    patch: { hitDiceUsed: used, hpCurrent: Math.min(ch.hpMax, (ch.hpCurrent || 0) + healed) },
    roll: r,
    healed,
  };
}

const resetResources = (list, recharges) => (Array.isArray(list) ? list : [])
  .map((r) => (recharges.includes(r.recharge) ? { ...r, used: 0 } : { ...r }));

// Short rest: resources that recharge on a short rest, and Warlock pact slots.
// (Hit Dice are spent one at a time before this, with spendHitDie.)
function shortRest(ch) {
  const patch = { resources: resetResources(ch.resources, ['short']) };
  const pact = ch.pactMagic || {};
  const slots = Array.isArray(ch.spellSlots) ? ch.spellSlots.map((s) => ({ ...s })) : null;
  if (slots && pact.level >= 1 && pact.level <= 9 && pact.count > 0) {
    const s = slots[pact.level - 1];
    s.used = Math.max(0, s.used - pact.count); // pact and other slots of that level share the pips
    patch.spellSlots = slots;
  }
  return patch;
}

// Long rest: full HP, temporary HP gone, every spell slot and resource back,
// one level of exhaustion less (both editions), and Hit Dice — all of them
// (2024) or half the total, at least one (2014), largest dice first.
function longRest(ch) {
  const used = usedOf(ch);
  if (ch.rulesEdition === '2014') {
    const total = parseHitDice(ch.hitDice);
    let regain = Math.max(1, Math.floor(Object.values(total).reduce((a, b) => a + b, 0) / 2));
    [...DIE_SIZES].reverse().forEach((s) => {
      const back = Math.min(regain, used[`d${s}`]);
      used[`d${s}`] -= back;
      regain -= back;
    });
  } else {
    DIE_SIZES.forEach((s) => { used[`d${s}`] = 0; });
  }
  return {
    hpCurrent: ch.hpMax,
    hpTemp: 0,
    hitDiceUsed: used,
    spellSlots: (Array.isArray(ch.spellSlots) ? ch.spellSlots : []).map((s) => ({ ...s, used: 0 })),
    resources: resetResources(ch.resources, ['short', 'long']),
    exhaustion: Math.max(0, (parseInt(ch.exhaustion, 10) || 0) - 1),
  };
}

module.exports = { DIE_SIZES, parseHitDice, hitDiceLeft, spendHitDie, shortRest, longRest };
