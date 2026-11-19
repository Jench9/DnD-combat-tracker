// Guided character creation (2024 rules, SRD 5.2): a build from the wizard
// → a sheet patch. Pure: buildCharacter(ch, build, ctx) → { patch } | { error }.
//
// ctx = { rules, spells: library spells [], items: library items [], newId() }
//
// build = {
//   name, alignment,
//   classKey, backgroundKey, speciesKey, subspeciesKey,
//   abilityMethod: 'standard' | 'pointbuy' | 'roll' | 'manual',
//   abilities: { str…cha },            // before the background's bonus
//   backgroundBonus: { int: 2, wis: 1 } | { int: 1, wis: 1, cha: 1 },
//   classSkills: [names], speciesSkill: name,
//   originFeat: { key, skills, magicInitiate },   // Human "Versatile"
//   backgroundFeat: { skills, magicInitiate },    // answers for the background's feat
//   level1: { fightingStyle, expertise, spells: { cantrips, spells } },
//   equipment: { class: optionIndex, background: optionIndex },
// }
const P = require('./progression');
const L = require('./levelup');
const { indexLibrary, findInLibrary, bundleQty } = require('../../imports/dndbeyond/inventory');

const STANDARD = [15, 14, 13, 12, 10, 8];
const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

function checkAbilities(method, scores) {
  const v = KEYS.map((k) => parseInt(scores && scores[k], 10));
  if (v.some((n) => !Number.isInteger(n))) L.fail('Set all six ability scores.');
  if (method === 'standard') {
    if ([...v].sort((a, b) => b - a).join() !== STANDARD.join()) L.fail('The standard array is 15, 14, 13, 12, 10, 8 — each used once.');
  } else if (method === 'pointbuy') {
    if (v.some((n) => !(n in POINT_COST))) L.fail('Point buy scores go from 8 to 15.');
    if (v.reduce((s, n) => s + POINT_COST[n], 0) > 27) L.fail('Point buy: 27 points at most.');
  } else if (v.some((n) => n < 3 || n > 18)) L.fail('Ability scores go from 3 to 18 before bonuses.');
  return Object.fromEntries(KEYS.map((k, i) => [k, v[i]]));
}

// Starting equipment option → inventory entries + gold + text for what the
// library doesn't have.
function equipmentFrom(option, ctx, idx) {
  const inventory = [];
  const other = [...(option.other || [])];
  (option.items || []).forEach((it) => {
    const lib = findInLibrary(idx, it.name, null, '2024');
    if (!lib) { other.push(`${it.count > 1 ? it.count + ' × ' : ''}${it.name}${it.note ? ` (${it.note})` : ''}`); return; }
    const qty = bundleQty(lib, it.count);
    const same = inventory.find((e) => e.itemId === lib.id);
    if (same) same.qty += qty;
    else inventory.push({ id: ctx.newId(), itemId: lib.id, name: lib.name.slice(0, 60), qty, equipped: lib.type === 'armor' });
  });
  return { inventory, gp: option.gp || 0, other };
}

function buildCharacter(ch, build, ctx) {
  const { rules } = ctx;
  const b = build || {};
  try {
    const def = rules.classByKey.get(b.classKey);
    if (!def) L.fail('Choose a class.');
    const bg = rules.backgroundByKey.get(b.backgroundKey);
    if (!bg) L.fail('Choose a background.');
    const species = rules.speciesByKey.get(b.speciesKey);
    if (!species) L.fail('Choose a species.');
    let sub = null;
    if (species.subspecies.length) {
      sub = species.subspecies.find((s) => s.key === b.subspeciesKey);
      if (!sub) L.fail(`Choose your ${species.name} ${/lineage|legacy|ancestr/i.test(species.subspecies[0].name) ? species.subspecies[0].name.split(':')[0].toLowerCase() : 'option'}.`);
    }

    // Ability scores + the background's +2/+1 or +1/+1/+1.
    const base = checkAbilities(b.abilityMethod, b.abilities);
    const bonus = b.backgroundBonus || {};
    const parts = Object.entries(bonus).filter(([, v]) => v);
    const shape = parts.map(([, v]) => v).sort().join();
    if (!(shape === '1,2' || shape === '1,1,1') || parts.some(([k]) => !bg.abilities.includes(k))) {
      L.fail(`${bg.name}: +2 to one and +1 to another of ${bg.abilities.map((k) => P.ABILITY_LABEL[k]).join(', ')}, or +1 to all three.`);
    }
    const abilities = { ...base };
    parts.forEach(([k, v]) => { abilities[k] = Math.min(20, abilities[k] + v); });

    const race = sub ? `${species.name} (${sub.name.split(':').pop().trim()})` : species.name;
    const start = {
      ...ch, race, abilities, hpMax: 0, hpCurrent: 0, class: '', level: 1, classes: [],
      skillProf: {}, skillExpert: {}, saveProf: {}, feats: [], modifiers: [], spells: [], resources: [],
      weaponProf: { simple: false, martial: false }, spellAbility: '', features: '', inventory: [],
    };
    const w = L.workOf(start);

    // Skills: background, class picks, species.
    bg.skills.forEach((s) => { w.skillProf[s] = true; });
    const classPool = def.skills.from.filter((s) => !w.skillProf[s]);
    const picked = L.checkSkills(b.classSkills, Math.min(def.skills.choose, classPool.length), classPool, w, { label: `${def.name} skills` });
    picked.forEach((s) => { w.skillProf[s] = true; });
    const skillTrait = [...species.traits, ...(sub ? sub.traits : [])].find((t) => t.skillChoice);
    if (skillTrait) {
      const from = skillTrait.skillChoice.from.filter((s) => !w.skillProf[s]);
      const [s] = L.checkSkills(b.speciesSkill ? [b.speciesSkill] : [], Math.min(1, from.length), from, w, { label: skillTrait.name });
      if (s) w.skillProf[s] = true;
    }

    // Species traits; Human: Heroic Inspiration + an origin feat.
    w.blocks.push(`— ${race} —`);
    w.blocks.push(P.featureBlock(`${species.name}`, `Size: ${species.size}. Speed: ${species.speed} ft.`));
    [...species.traits, ...(sub ? sub.traits : [])].forEach((t) => w.blocks.push(P.featureBlock(t.name, t.desc)));
    if (species.key === 'human') {
      w.inspiration = true;
      const o = b.originFeat || {};
      const feat = rules.featByKey.get(o.key);
      if (!feat || feat.type !== 'origin') L.fail('Human (Versatile): choose an Origin feat.');
      if (feat.key === bg.feat.key && !feat.repeatable) L.fail(`You already get ${feat.name} from your background.`);
      L.applyFeat(w, { ...o, key: feat.key }, ctx, { origin: true });
    }

    // Background: tools, origin feat.
    w.blocks.push(`— ${bg.name} (background) —`);
    if (bg.tools.length) w.blocks.push(P.featureBlock(`${bg.name} training`, `Tools: ${bg.tools.join(', ')}.`));
    const bf = b.backgroundFeat || {};
    L.applyFeat(w, { ...bf, key: bg.feat.key }, ctx, { origin: true, fixedList: bg.feat.note ? bg.feat.note.toLowerCase() : '' });

    // Class level 1 (fighting style, expertise, spells…).
    w.blocks.push(`— ${def.name} 1 —`);
    const plan = L.planFor({ ...start, abilities: w.abilities, skillProf: w.skillProf, skillExpert: w.skillExpert, feats: w.feats }, def, [], null, ctx);
    const classes = L.gainClassLevel(w, plan, b.level1 || {}, ctx, []);
    plan.notes.forEach((n) => w.blocks.push(P.featureBlock('To do', n)));

    // Equipment.
    const idx = indexLibrary(ctx.items);
    const pick = (sets, i, what) => {
      if (!sets.length) return { inventory: [], gp: 0, other: [] };
      const opt = sets[0].options[parseInt(i, 10)];
      if (!opt) L.fail(`Choose the ${what} starting equipment.`);
      return equipmentFrom(opt, ctx, idx);
    };
    const eq = b.equipment || {};
    const ce = pick(def.equipment, eq.class, def.name);
    const be = pick(bg.equipment, eq.background, bg.name);
    const inventory = [...ce.inventory];
    be.inventory.forEach((e) => {
      const same = inventory.find((x) => x.itemId === e.itemId);
      if (same) same.qty += e.qty; else inventory.push(e);
    });
    // One body armor and one shield equipped at most (the first of each).
    const types = new Map(ctx.items.map((it) => [it.id, it]));
    let body = false;
    let shield = false;
    inventory.forEach((e) => {
      if (!e.equipped) return;
      const it = types.get(e.itemId);
      const isShield = it && it.armorType === 'shield';
      if (isShield ? shield : body) e.equipped = false;
      if (isShield) shield = true; else body = true;
    });
    const gp = ce.gp + be.gp;

    const patch = L.finishPatch(w, classes, ctx);
    const name = String(b.name || '').trim().slice(0, 60);
    Object.assign(patch, {
      name,
      alignment: String(b.alignment || '').slice(0, 40),
      race,
      background: bg.name,
      speed: species.speed,
      rulesEdition: '2024',
      inspiration: w.inspiration,
      hpCurrent: patch.hpMax,
      hpTemp: 0,
      hitDiceUsed: { d6: 0, d8: 0, d10: 0, d12: 0 },
      inventory,
      equipment: [...ce.other, ...be.other].join('\n'),
      currency: { cp: 0, sp: Math.round((gp % 1) * 10), ep: 0, gp: Math.floor(gp), pp: 0 },
      acAuto: true,
    });
    return { patch };
  } catch (e) {
    if (e.userError) return { error: e.message };
    throw e;
  }
}

module.exports = { buildCharacter, STANDARD, POINT_COST };
