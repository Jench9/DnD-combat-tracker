// Class and species features a character can use in play, sorted by what
// they cost in the turn (2024 rules, with the 2014 differences): an action,
// a Bonus Action, a Reaction, nothing (Action Surge, Luck…), or part of an
// attack (Breath Weapon). Pure — no DOM; core/attacks.js shows them.
//
//   featureActions(character) -> [{ key, name, type, text, stat,
//     resource: { id, name, max, used } | null, cost, pool, roll }]
//
// A feature shows when the character has the class at that level (read from
// the class text, "Fighter 5 / Rogue 2") or the species (race text), or —
// for features with uses — a sheet resource with its name (so a sheet whose
// class text isn't recognised still gets Second Wind if it tracks it).
// `cost` = uses spent by Use (Focus Points: 1); `pool` = spend any amount
// (Lay on Hands); `roll` = { dice, mod, heal?, label } rolled on Use.
import { abilityMod, profBonusForLevel } from '../characters/rules.js';

// "Fighter 5 / Rogue 2" -> { fighter: 5, rogue: 2 } (same rule as modifiers.js).
function classLevels(ch) {
  const out = {};
  const text = String(ch.class || '');
  for (const m of text.matchAll(/([A-Za-z][A-Za-z' -]*?)\s+(\d{1,2})\b/g)) out[m[1].trim().toLowerCase()] = parseInt(m[2], 10);
  if (!Object.keys(out).length && text.trim()) out[text.trim().toLowerCase()] = parseInt(ch.level, 10) || 1;
  return out;
}

const dieBy = (level, table) => table.reduce((d, [min, die]) => (level >= min ? die : d), table[0][1]);

// type: 'action' | 'bonus' | 'reaction' | 'free' | 'attack' (replaces one
// attack of the Attack action). `type2014` when the 2014 rules differ.
// `cls: [name, minLevel]` or `species: /regex/` (+ minLevel = character level).
const CATALOG = [
  // Barbarian
  { key: 'rage', name: 'Rage', cls: ['barbarian', 1], type: 'bonus', res: /^rage\b/i,
    text: 'Advantage on STR checks and saves, bonus damage on STR attacks, resistance to bludgeoning, piercing and slashing. Not in heavy armor; no spells or concentration. Switch on the Rage modifier for the damage.' },
  { key: 'reckless', name: 'Reckless Attack', cls: ['barbarian', 2], type: 'free',
    text: 'On your first attack roll on your turn: advantage on STR attack rolls this turn; attack rolls against you have advantage until your next turn.' },
  // Bard
  { key: 'bardic', name: 'Bardic Inspiration', cls: ['bard', 1], type: 'bonus', res: /bardic inspiration/i,
    stat: (c) => `d${dieBy(c.lv.bard || 1, [[1, 6], [5, 8], [10, 10], [15, 12]])}`,
    text: 'A creature within 60 ft that can see or hear you gains a Bardic Inspiration die to add to one failed D20 Test within the next hour.' },
  // Cleric / Paladin
  { key: 'cd-cleric', name: 'Channel Divinity', cls: ['cleric', 2], type: 'action', res: /channel divinity/i,
    text: 'Magic action: Divine Spark (heal or deal radiant/necrotic damage) or Turn Undead, or your domain\'s option.' },
  { key: 'cd-paladin', name: 'Channel Divinity', cls: ['paladin', 3], type: 'bonus', type2014: 'action', res: /channel divinity/i,
    text: 'Divine Sense (Bonus Action) or your oath\'s option.' },
  { key: 'loh', name: 'Lay on Hands', cls: ['paladin', 1], type: 'bonus', type2014: 'action', res: /lay on hands/i, pool: true,
    text: 'Touch a creature and restore Hit Points from your pool (or spend 5 to remove the Poisoned condition).' },
  // Druid
  { key: 'wildshape', name: 'Wild Shape', cls: ['druid', 2], type: 'bonus', type2014: 'action', res: /wild shape/i,
    text: 'Shape-shift into a Beast form you know.' },
  // Fighter
  { key: 'secondwind', name: 'Second Wind', cls: ['fighter', 1], type: 'bonus', res: /second wind/i,
    roll: (c) => ({ dice: '1d10', mod: c.lv.fighter || 1, heal: true, label: 'HP regained' }),
    text: 'Regain 1d10 + Fighter level Hit Points.' },
  { key: 'actionsurge', name: 'Action Surge', cls: ['fighter', 2], type: 'free', res: /action surge/i,
    text: 'On your turn, take one additional action (not the Magic action, in 2024).' },
  { key: 'indomitable', name: 'Indomitable', cls: ['fighter', 9], type: 'free', res: /indomitable/i,
    text: 'Reroll a failed saving throw (2024: + your Fighter level); you must use the new roll.' },
  // Monk (2024 Focus Points; 2014 Ki)
  { key: 'ma-bonus', name: 'Martial Arts strike', cls: ['monk', 1], type: 'bonus',
    text: 'Make one Unarmed Strike as a Bonus Action (roll it with Unarmed Strike under Attacks).' },
  { key: 'flurry', name: 'Flurry of Blows', cls: ['monk', 2], type: 'bonus', res: /focus|^ki\b/i, cost: 1,
    text: 'Spend 1 Focus Point: two Unarmed Strikes (three at Monk 10).' },
  { key: 'patient', name: 'Patient Defense', cls: ['monk', 2], type: 'bonus', res: /focus|^ki\b/i, cost: 1, optional: true,
    text: 'Disengage for free; or spend 1 Focus Point to Disengage and Dodge.' },
  { key: 'stepwind', name: 'Step of the Wind', cls: ['monk', 2], type: 'bonus', res: /focus|^ki\b/i, cost: 1, optional: true,
    text: 'Dash for free; or spend 1 Focus Point to Disengage and Dash, with double jump distance.' },
  { key: 'deflect', name: 'Deflect Attacks', cls: ['monk', 3], type: 'reaction',
    text: 'When an attack hits you: reduce the damage by 1d10 + DEX + Monk level; at 0, spend 1 Focus Point to redirect it.' },
  // Ranger
  { key: 'hm-free', name: "Hunter's Mark (free cast)", cls: ['ranger', 1], type: 'bonus', res: /hunter'?s mark/i,
    text: "Cast Hunter's Mark without a spell slot." },
  // Rogue
  { key: 'cunning', name: 'Cunning Action', cls: ['rogue', 2], type: 'bonus', text: 'Dash, Disengage or Hide.' },
  { key: 'steadyaim', name: 'Steady Aim', cls: ['rogue', 3], type: 'bonus',
    text: "Advantage on your next attack this turn if you haven't moved; your Speed is 0 until the end of the turn." },
  { key: 'uncanny', name: 'Uncanny Dodge', cls: ['rogue', 5], type: 'reaction', text: 'When an attacker you can see hits you: halve the damage.' },
  // Sorcerer
  { key: 'innate', name: 'Innate Sorcery', cls: ['sorcerer', 1], type: 'bonus', res: /innate sorcery/i,
    text: 'For 1 minute: +1 to your spell save DC and advantage on Sorcerer spell attacks (2 uses per long rest).' },
  { key: 'font', name: 'Font of Magic', cls: ['sorcerer', 2], type: 'bonus', res: /sorcery points/i, noUse: true,
    text: 'Turn Sorcery Points into a spell slot (Bonus Action), or a slot into points. Spend them in Resources.' },
  // Species
  { key: 'breath', name: 'Breath Weapon', species: /dragonborn/i, type: 'attack', type2014: 'action', res: /breath weapon/i,
    stat: (c) => `DEX save DC ${8 + abilityMod(c.ch.abilities.con) + c.pb}`,
    roll: (c) => ({ dice: `${c.level >= 17 ? 4 : c.level >= 11 ? 3 : c.level >= 5 ? 2 : 1}d10`, mod: 0, label: 'damage (half on a save)' }),
    text: '15-ft cone or 30-ft line; Dexterity save. Uses: Proficiency Bonus per long rest.' },
  { key: 'flight', name: 'Draconic Flight', species: /dragonborn/i, minLevel: 5, type: 'bonus', res: /draconic flight/i,
    text: 'Spectral wings for 10 minutes: Fly Speed equal to your Speed (once per long rest).' },
  { key: 'stonecunning', name: 'Stonecunning', species: /dwarf/i, type: 'bonus', res: /stonecunning/i,
    text: 'Tremorsense 60 ft for 10 minutes, on or touching stone (Proficiency Bonus uses per long rest).' },
  { key: 'largeform', name: 'Large Form', species: /goliath/i, minLevel: 5, type: 'bonus', res: /large form/i,
    text: 'Become Large for 10 minutes: advantage on STR checks, +10 ft Speed (once per long rest).' },
  { key: 'adrenaline', name: 'Adrenaline Rush', species: /\borc\b/i, type: 'bonus', res: /adrenaline rush/i,
    stat: (c) => `+${c.pb} temp HP`,
    text: 'Dash as a Bonus Action and gain Temporary Hit Points equal to your Proficiency Bonus (PB uses per short or long rest).' },
  { key: 'relentless', name: 'Relentless Endurance', species: /\borc\b|half-orc/i, type: 'free', res: /relentless endurance/i,
    text: 'When you drop to 0 HP but don\'t die outright, drop to 1 HP instead (once per long rest).' },
  { key: 'luck', name: 'Luck', species: /halfling/i, type: 'free', text: 'When you roll a 1 on a D20 Test, reroll it and use the new roll.' },
];

export const ACTION_TYPES = ['attack', 'action', 'bonus', 'reaction', 'free'];

export function featureActions(ch) {
  const lv = classLevels(ch);
  const level = parseInt(ch.level, 10) || 1;
  const c = { ch, lv, level, pb: profBonusForLevel(level) };
  const resources = Array.isArray(ch.resources) ? ch.resources : [];
  const edition = ch.rulesEdition === '2014' ? '2014' : '2024';
  const out = [];
  CATALOG.forEach((f) => {
    const resource = f.res ? resources.find((r) => f.res.test(r.name)) || null : null;
    const byClass = f.cls && (lv[f.cls[0]] || 0) >= f.cls[1];
    const bySpecies = f.species && f.species.test(ch.race || '') && level >= (f.minLevel || 1);
    // A shared resource (Channel Divinity) shouldn't pull in the other
    // class's version; species features need the species.
    const shared = !!f.cls && /^(cleric|paladin)$/.test(f.cls[0]);
    const byResource = !!resource && !shared && !f.species;
    if (!byClass && !bySpecies && !byResource) return;
    out.push({
      key: f.key,
      name: f.name,
      type: (edition === '2014' && f.type2014) || f.type,
      text: f.text,
      stat: f.stat ? f.stat(c) : '',
      resource: resource ? { id: resource.id, name: resource.name, max: resource.max, used: resource.used || 0 } : null,
      cost: f.noUse ? 0 : (f.cost || 1),
      optional: !!f.optional, // usable for free too (Patient Defense)
      pool: !!f.pool,
      noUse: !!f.noUse,
      tracks: !!f.res, // has limited uses (a sheet resource, if added)
      roll: f.roll ? f.roll(c) : null,
    });
  });
  return out;
}

// Attacks per Attack action (Extra Attack): Fighter 5/11/20, Barbarian,
// Monk, Paladin, Ranger 5.
export function attacksPerAction(ch) {
  const lv = classLevels(ch);
  const f = lv.fighter || 0;
  let n = f >= 20 ? 4 : f >= 11 ? 3 : f >= 5 ? 2 : 1;
  if (['barbarian', 'monk', 'paladin', 'ranger'].some((k) => (lv[k] || 0) >= 5)) n = Math.max(n, 2);
  return n;
}

// What using a carried item costs: 2024 potions are a Bonus Action
// (drinking or giving one); everything else, and 2014 potions, an action.
export const itemActionType = (item, ch) => (/potion/i.test(item.name || '') && ch.rulesEdition !== '2014' ? 'bonus' : 'action');

// "1 bonus action" -> 'bonus'; "1 reaction, which you take when…" -> 'reaction'.
export function castingType(castingTime) {
  const t = String(castingTime || '').toLowerCase();
  if (/bonus action/.test(t)) return 'bonus';
  if (/reaction/.test(t)) return 'reaction';
  if (/^1 action|^action/.test(t)) return 'action';
  return 'long';
}
