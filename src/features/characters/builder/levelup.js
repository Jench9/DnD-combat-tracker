// Level up (2024 rules): what a new level brings and which choices it asks
// for (levelUpPlan), and applying it with the player's answers
// (applyLevelUp). gainClassLevel is shared with character creation (level 1).
//
// ctx = { rules, spells: library spells [], newId() }
//
// Answers (all optional unless the plan asks for them):
//   { classKey,
//     hp: { method: 'average' | 'roll', roll },
//     subclass: key | 'custom', subclassName,           // at the subclass level
//     feat: { key | 'custom', name, plus: { str: 2 }, skills: [], magicInitiate: { list, cantrips: [id, id], spell: id } },
//     fightingStyle: featKey | 'custom', fightingStyleName,
//     expertise: [skill names],
//     skills: [skill names],                              // multiclass / Bonus Proficiencies
//     spells: { cantrips: [spellIds], spells: [spellIds] } }
const { mod } = require('../model');
const P = require('./progression');

const SCHOLAR_SKILLS = ['Arcana', 'History', 'Investigation', 'Medicine', 'Nature', 'Religion'];
const MI_LISTS = ['cleric', 'druid', 'wizard'];

// Choices asked by class features, by feature key.
function featureChoice(featureKey, def) {
  if (/-ability-score-improvement$/.test(featureKey)) return { type: 'feat', slot: 'asi' };
  if (/-epic-boon$/.test(featureKey)) return { type: 'feat', slot: 'boon' };
  if (/-fighting-style$/.test(featureKey)) return { type: 'fightingStyle', alternative: def.key === 'paladin' ? 'Blessed Warrior' : def.key === 'ranger' ? 'Druidic Warrior' : '' };
  if (featureKey === 'rogue-expertise' || featureKey === 'bard-expertise' || featureKey === 'ranger-expertise') return { type: 'expertise', count: 2 };
  if (featureKey === 'ranger-deft-explorer') return { type: 'expertise', count: 1 };
  if (featureKey === 'wizard-scholar') return { type: 'expertise', count: 1, from: SCHOLAR_SKILLS };
  return null;
}
// Subclass features that ask for something.
function subclassFeatureChoice(name) {
  if (/^Additional Fighting Style$/i.test(name)) return { type: 'fightingStyle', alternative: '' };
  if (/^Bonus Proficiencies$/i.test(name)) return { type: 'skills', count: 3, from: P.SKILL_NAMES };
  return null;
}

const hasFightingStyle = (classes, rules) => classes.some((c) => {
  const def = rules.classByKey.get(c.key);
  return def && def.levels.some((l) => l.level <= c.level && l.features.some((f) => /-fighting-style$/.test(f)));
});

// Feats this character could take for an ASI / Epic Boon slot.
function featOptions(ch, slot, level, classes, rules) {
  const fs = hasFightingStyle(classes, rules);
  const types = slot === 'boon' ? ['epic-boon', 'general', 'origin', 'fighting-style'] : ['general', 'origin', 'fighting-style'];
  return rules.feats.filter((f) => types.includes(f.type)).map((f) => {
    const allowed = P.featAllowed(f, ch, { level, hasFightingStyle: fs });
    return { key: f.key, name: f.name, type: f.type, desc: f.desc, asi: f.asi, ok: allowed.ok, why: allowed.why };
  }).sort((a, b) => (slot === 'boon' ? (a.type === 'epic-boon' ? 0 : 1) - (b.type === 'epic-boon' ? 0 : 1) : 0));
}

const fightingStyleOptions = (ch, rules) => rules.feats.filter((f) => f.type === 'fighting-style')
  .map((f) => ({ key: f.key, name: f.name, desc: f.desc, ok: !(ch.feats || []).includes(f.key) }));

// Multiclassing (2024): 13+ in the new class's primary ability and in each
// current class's. Returns '' or why not.
function multiclassBlock(ch, def, classes, rules) {
  const fails = (d) => {
    const pre = d.multiclass.prereq;
    if (pre.any) return !pre.any.some((p) => (ch.abilities[p.ability] || 0) >= p.min) ? pre.any.map((p) => `${P.ABILITY_LABEL[p.ability]} 13`).join(' or ') : '';
    const missing = (pre.all || []).filter((p) => (ch.abilities[p.ability] || 0) < p.min);
    return missing.length ? missing.map((p) => `${P.ABILITY_LABEL[p.ability]} 13`).join(' and ') : '';
  };
  const own = fails(def);
  if (own) return `${def.name} needs ${own}.`;
  for (const c of classes) {
    const d = rules.classByKey.get(c.key);
    const f = d && fails(d);
    if (f) return `To leave ${d.name} for another class you need ${f}.`;
  }
  return '';
}

// What gaining a level in `classKey` brings. { error } or a plan:
// { classKey, className, newClassLevel, newTotalLevel, isNewClass, hitDie,
//   hpAverage, conMod, features: [{ name, desc }], choices: [...],
//   subclasses?: [{ key, name, summary, desc, features, choices }], notes: [] }
function levelUpPlan(ch, classKey, ctx) {
  const { rules } = ctx;
  const classes = P.classesOf(ch, rules);
  const total = P.totalLevel(classes);
  if (!classes.length) return { error: 'This character has no class yet — use the guided creation first.' };
  if (total >= 20) return { error: 'Already level 20.' };
  const def = rules.classByKey.get(classKey);
  if (!def) return { error: 'Choose one of the SRD classes.' };
  const existing = classes.find((c) => c.key === classKey);
  if (!existing) {
    const block = multiclassBlock(ch, def, classes, rules);
    if (block) return { error: block };
  }
  return planFor(ch, def, classes, existing, ctx);
}

// The plan for the next level of `def` (`existing` = its current entry, or
// null for a new class; no `classes` at all = the character's first level).
function planFor(ch, def, classes, existing, ctx) {
  const { rules } = ctx;
  const first = !classes.length;
  const total = P.totalLevel(classes);
  const newClassLevel = existing ? existing.level + 1 : 1;
  const row = P.levelRow(def, newClassLevel);
  const choices = [];
  const notes = [];
  const features = [];

  if (!first) choices.push({ type: 'hp', die: def.hitDie, average: def.hitDie / 2 + 1, conMod: mod(ch.abilities.con) });

  row.features.forEach((key) => {
    if (key === `${def.key}-subclass`) return; // the subclass's own features instead
    const f = rules.features[key];
    if (f) features.push({ key, name: f.name, desc: f.desc });
    const choice = featureChoice(key, def);
    if (!choice) return;
    if (choice.type === 'feat') choice.options = featOptions(ch, choice.slot, total + 1, classes, rules);
    if (choice.type === 'fightingStyle') choice.options = fightingStyleOptions(ch, rules);
    if (choice.type === 'expertise') {
      const pool = (choice.from || P.SKILL_NAMES).filter((s) => ch.skillProf && ch.skillProf[s] && !(ch.skillExpert || {})[s]);
      choice.options = pool;
      choice.count = Math.min(choice.count, pool.length);
      if (!choice.count) return;
    }
    choices.push(choice);
  });

  // Subclass: chosen now, or its features for this level.
  let subclasses;
  const sub = existing && existing.subclass ? def.subclasses.find((s) => s.key === existing.subclass) : null;
  if (newClassLevel === def.subclassLevel && !(existing && (existing.subclass || existing.subclassName))) {
    subclasses = def.subclasses.map((s) => ({
      key: s.key, name: s.name, summary: s.summary, desc: s.desc,
      features: s.features.filter((f) => f.level === newClassLevel),
      choices: s.features.filter((f) => f.level === newClassLevel).map((f) => subclassFeatureChoice(f.name)).filter(Boolean),
    }));
    choices.push({ type: 'subclass', options: subclasses.map((s) => ({ key: s.key, name: s.name })) });
  } else if (sub) {
    sub.features.filter((f) => f.level === newClassLevel).forEach((f) => {
      features.push({ name: `${f.name} (${sub.name})`, desc: f.desc });
      const c = subclassFeatureChoice(f.name);
      if (c && c.type === 'fightingStyle') choices.push({ ...c, options: fightingStyleOptions(ch, rules) });
      else if (c) choices.push(c);
    });
  } else if (existing && existing.subclassName && newClassLevel > def.subclassLevel && def.levels.some((l) => l.level === newClassLevel && l.features.includes(`${def.key}-subclass`))) {
    notes.push(`${existing.subclassName} gains a feature at this level — add it to Features yourself.`);
  }

  if (!existing && !first && def.multiclass.skills) {
    choices.push({ type: 'skills', count: def.multiclass.skills.choose, from: def.multiclass.skills.from.filter((s) => !(ch.skillProf || {})[s]) });
  }

  const picks = P.spellPicks(def, newClassLevel);
  if (picks.cantrips || picks.spells) choices.push({ type: 'spells', list: def.key, ...picks });

  const prevRow = newClassLevel > 1 ? P.levelRow(def, newClassLevel - 1) : null;
  const counter = (k) => ((row.counters || {})[k] || 0) - (((prevRow || {}).counters || {})[k] || 0);
  if (counter('weapon_mastery') > 0) notes.push(`Weapon Mastery: you can use the mastery of ${counter('weapon_mastery')} more kind(s) of weapon (set it with the modifier's "only for").`);
  if (def.key === 'warlock' && counter('eldritch_invocations') > 0) notes.push(`Choose ${counter('eldritch_invocations')} more Eldritch Invocation(s) and add them to Features.`);
  if (row.features.includes('sorcerer-metamagic')) notes.push('Choose two Metamagic options and add them to Features.');
  if (!existing && !first) {
    const extra = def.multiclass.proficiencies.filter((p) => !/Weapons$/.test(p));
    if (extra.length) notes.push(`Multiclass training: ${extra.join(', ')}.`);
  }

  return {
    classKey: def.key,
    className: def.name,
    newClassLevel,
    newTotalLevel: total + 1,
    isNewClass: !existing,
    hitDie: def.hitDie,
    hpAverage: def.hitDie / 2 + 1,
    conMod: mod(ch.abilities.con),
    features,
    choices,
    subclasses,
    notes,
  };
}

// ---------------------------------------------------------------- applying

// A mutable working copy of the fields a level (or creation) changes.
function workOf(ch) {
  return {
    ch,
    abilities: { ...ch.abilities },
    skillProf: { ...(ch.skillProf || {}) },
    skillExpert: { ...(ch.skillExpert || {}) },
    saveProf: { ...(ch.saveProf || {}) },
    weaponProf: { ...(ch.weaponProf || { simple: false, martial: false }) },
    feats: [...(ch.feats || [])],
    modifiers: (ch.modifiers || []).map((m) => ({ ...m })),
    spells: (ch.spells || []).map((s) => ({ ...s })),
    blocks: [],
    hpGain: 0,
    spellAbility: ch.spellAbility || '',
    inspiration: !!ch.inspiration,
  };
}

const fail = (msg) => { const e = new Error(msg); e.userError = true; throw e; };
const uniq = (a) => [...new Set(a)];

// Add library spells to the spellbook (no duplicates).
function addSpells(w, ids, ctx, { listKey, cantrip, maxLevel, count, prepared = true, label }) {
  const list = uniq(Array.isArray(ids) ? ids : []);
  if (list.length !== count) fail(`Choose ${count} ${cantrip ? 'cantrip' : 'spell'}${count === 1 ? '' : 's'}${label ? ' for ' + label : ''}.`);
  list.forEach((id) => {
    const spell = ctx.spells.find((s) => s.id === id);
    if (!P.spellFits(spell, listKey, { cantrip, maxLevel })) fail(`${spell ? spell.name : 'That spell'} isn't on that spell list at that level.`);
    if (w.spells.some((s) => s.spellId === id)) fail(`${spell.name} is already in the spellbook.`);
    w.spells.push({ id: ctx.newId(), spellId: id, name: spell.name.slice(0, 60), prepared });
  });
}

function checkSkills(list, count, from, w, { expertise, label } = {}) {
  const picked = uniq(Array.isArray(list) ? list : []);
  if (picked.length !== count) fail(`${label || (expertise ? 'Expertise' : 'Skills')}: choose ${count} skill${count === 1 ? '' : 's'}.`);
  picked.forEach((s) => {
    if (!from.includes(s)) fail(`${s} isn't one of the options.`);
    if (expertise ? !w.skillProf[s] || w.skillExpert[s] : w.skillProf[s]) fail(expertise ? `Expertise needs a skill you're proficient in without Expertise (${s}).` : `You're already proficient in ${s}.`);
  });
  return picked;
}

// A feat taken now (origin feat, ASI slot, Epic Boon, fighting style).
// answer: { key | 'custom', name, plus, skills, magicInitiate }
function applyFeat(w, answer, ctx, { level, origin = false, fixedList = '', hasFS = false } = {}) {
  const { rules } = ctx;
  const a = answer || {};
  if (a.key === 'custom') {
    const name = String(a.name || '').trim().slice(0, 60);
    if (!name) fail('Type the name of the feat.');
    const next = Object.keys(a.plus || {}).length ? P.applyIncrease(w.abilities, a.plus, { total: 1, perAbility: 1, allowed: Object.keys(P.ABILITY_LABEL), max: 20 }) : w.abilities;
    if (!next) fail('A custom feat can raise one ability by 1 (max 20).');
    w.abilities = next;
    w.feats.push(name);
    w.blocks.push(P.featureBlock(`${name} (feat)`, 'Add its rules text here.'));
    return name;
  }
  const feat = rules.featByKey.get(a.key);
  if (!feat) fail('Choose a feat.');
  if (!origin) {
    const ok = P.featAllowed(feat, { ...w.ch, abilities: w.abilities, feats: w.feats, spellAbility: w.spellAbility }, { level, hasFightingStyle: hasFS });
    if (!ok.ok) fail(`${feat.name}: ${ok.why}`);
  }
  if (feat.key === 'ability-score-improvement') {
    const next = P.applyIncrease(w.abilities, a.plus, { total: 2, perAbility: 2, allowed: Object.keys(P.ABILITY_LABEL), max: 20 });
    if (!next) fail('Ability Score Improvement: +2 to one ability or +1 to two (max 20).');
    w.abilities = next;
    const what = Object.entries(a.plus).filter(([, v]) => v).map(([k, v]) => `${P.ABILITY_LABEL[k]} +${v}`).join(', ');
    w.blocks.push(P.featureBlock(`Ability Score Improvement: ${what}`, ''));
    w.feats.push(feat.key);
    return feat.name;
  }
  if (feat.asi) {
    const next = P.applyIncrease(w.abilities, a.plus, { total: 1, perAbility: 1, allowed: feat.asi.abilities, max: feat.asi.max });
    if (!next) fail(`${feat.name}: choose which ability goes up by 1 (${feat.asi.abilities.map((k) => P.ABILITY_LABEL[k]).join(', ')}; max ${feat.asi.max}).`);
    w.abilities = next;
  }
  let title = `${feat.name} (feat)`;
  if (feat.key === 'skilled') {
    const picked = checkSkills(a.skills, 3, P.SKILL_NAMES, w, { label: 'Skilled' });
    picked.forEach((s) => { w.skillProf[s] = true; });
    title = `Skilled (feat): ${picked.join(', ')}`;
  }
  if (feat.key === 'magic-initiate') {
    const mi = a.magicInitiate || {};
    const list = fixedList || mi.list;
    if (!MI_LISTS.includes(list)) fail('Magic Initiate: choose Cleric, Druid or Wizard spells.');
    if (w.feats.includes(`magic-initiate:${list}`)) fail('Magic Initiate: choose a different spell list than last time.');
    addSpells(w, mi.cantrips, ctx, { listKey: list, cantrip: true, count: 2, label: 'Magic Initiate' });
    addSpells(w, mi.spell ? [mi.spell] : [], ctx, { listKey: list, cantrip: false, maxLevel: 1, count: 1, label: 'Magic Initiate' });
    w.feats.push(`magic-initiate:${list}`);
    title = `Magic Initiate (${list[0].toUpperCase() + list.slice(1)}) (feat)`;
  }
  if (P.FEAT_PRESETS[feat.key]) w.modifiers = P.addPresets(w.modifiers, [P.FEAT_PRESETS[feat.key]], ctx.newId);
  if (feat.key !== 'magic-initiate') w.feats.push(feat.key);
  w.blocks.push(P.featureBlock(title, feat.desc));
  return feat.name;
}

function applyFightingStyle(w, answer, alternative, ctx) {
  if (answer === 'custom' && alternative) {
    w.feats.push(alternative);
    w.blocks.push(P.featureBlock(alternative, 'Instead of a Fighting Style feat (see the class feature).'));
    return;
  }
  const feat = ctx.rules.featByKey.get(answer);
  if (!feat || feat.type !== 'fighting-style') fail('Choose a Fighting Style.');
  if (w.feats.includes(feat.key)) fail(`You already have ${feat.name}.`);
  applyFeat(w, { key: feat.key }, ctx, { origin: true });
}

// Gain one level in `def` (the plan says which choices it needs). Mutates
// `w`; returns the new classes list.
function gainClassLevel(w, plan, answers, ctx, classes) {
  const { rules } = ctx;
  const def = rules.classByKey.get(plan.classKey);
  const a = answers || {};
  const level = plan.newClassLevel;
  let entry = classes.find((c) => c.key === def.key);
  const next = classes.map((c) => ({ ...c }));
  if (!entry) {
    entry = { key: def.key, name: def.name, level: 0, subclass: '', subclassName: '' };
    next.push(entry);
  } else entry = next.find((c) => c.key === def.key);
  entry.level = level;
  const first = !classes.length; // the character's very first level

  // Proficiencies: the first class gives saves + all training; later
  // classes only their multiclass training.
  if (first) {
    def.saves.forEach((k) => { w.saveProf[k] = true; });
    w.weaponProf = { simple: def.weapons.simple || w.weaponProf.simple, martial: def.weapons.martial || w.weaponProf.martial };
    w.blocks.push(P.featureBlock(`${def.name} training`, `Saving throws: ${def.saves.map((k) => P.ABILITY_LABEL[k]).join(', ')}. Proficiencies: ${def.proficiencies.join(', ')}.${def.otherChoices.length ? ' ' + def.otherChoices.join('. ') + '.' : ''}`));
  } else if (level === 1) {
    if (def.multiclass.weapons.martial) w.weaponProf.martial = true;
    if (def.multiclass.proficiencies.length) w.blocks.push(P.featureBlock(`${def.name} multiclass training`, def.multiclass.proficiencies.join(', ') + '.'));
  }
  if (!w.spellAbility && def.spellAbility) w.spellAbility = def.spellAbility;

  // Hit points.
  const hp = a.hp || {};
  const conBefore = mod(w.abilities.con);
  let gain;
  if (first) gain = def.hitDie;
  else if (hp.method === 'roll') {
    const r = parseInt(hp.roll, 10);
    if (!(r >= 1 && r <= def.hitDie)) fail(`Roll a d${def.hitDie} for hit points (1–${def.hitDie}).`);
    gain = r;
  } else gain = def.hitDie / 2 + 1;
  w.hpGain += Math.max(1, gain + conBefore);
  if (/dwarf/i.test(w.ch.race || '')) w.hpGain += 1; // Dwarven Toughness

  // Features of this level.
  plan.features.forEach((f) => w.blocks.push(P.featureBlock(`${f.name} (${def.name} ${level})`, f.desc)));
  w.modifiers = P.addPresets(w.modifiers, P.presetsAt(def.key, level), ctx.newId);
  if (entry.subclass) w.modifiers = P.addPresets(w.modifiers, P.presetsAt(entry.subclass, level), ctx.newId);
  if (entry.subclass === 'draconic-sorcery' && level > 3) w.hpGain += 1; // Draconic Resilience

  // Choices, in plan order.
  const subChoices = [];
  plan.choices.forEach((c) => {
    if (c.type === 'subclass') {
      if (a.subclass === 'custom') {
        const name = String(a.subclassName || '').trim().slice(0, 60);
        if (!name) fail('Type the subclass name.');
        entry.subclassName = name;
        w.blocks.push(P.featureBlock(`${name} (${def.name} subclass)`, 'Add its features here.'));
        return;
      }
      const s = (plan.subclasses || []).find((x) => x.key === a.subclass);
      if (!s) fail(`Choose a ${def.name} subclass.`);
      entry.subclass = s.key;
      entry.subclassName = s.name;
      w.blocks.push(P.featureBlock(`${s.name} (${def.name} subclass)`, s.desc));
      s.features.forEach((f) => w.blocks.push(P.featureBlock(`${f.name} (${s.name} ${level})`, f.desc)));
      w.modifiers = P.addPresets(w.modifiers, P.presetsAt(s.key, level), ctx.newId);
      if (s.key === 'draconic-sorcery') w.hpGain += level; // +3 at level 3
      subChoices.push(...s.choices);
    }
  });
  [...plan.choices, ...subChoices].forEach((c) => {
    if (c.type === 'feat') {
      const name = applyFeat(w, a.feat, ctx, { level: plan.newTotalLevel, hasFS: hasFightingStyle(next, rules) });
      if (c.slot === 'boon') w.blocks.push(P.featureBlock(`Epic Boon: ${name}`, ''));
    } else if (c.type === 'fightingStyle') {
      applyFightingStyle(w, a.fightingStyle, c.alternative, ctx);
    } else if (c.type === 'expertise') {
      const pool = (c.from || P.SKILL_NAMES);
      const picked = checkSkills(a.expertise, c.count, pool, w, { expertise: true });
      picked.forEach((s) => { w.skillExpert[s] = true; });
      w.blocks.push(P.featureBlock(`Expertise: ${picked.join(', ')}`, ''));
    } else if (c.type === 'skills') {
      const picked = checkSkills(a.skills, Math.min(c.count, c.from.length), c.from, w, { label: 'Skill proficiencies' });
      picked.forEach((s) => { w.skillProf[s] = true; });
      if (picked.length) w.blocks.push(P.featureBlock(`Skill proficiencies: ${picked.join(', ')}`, ''));
    } else if (c.type === 'spells') {
      const sp = a.spells || {};
      if (c.cantrips) addSpells(w, sp.cantrips, ctx, { listKey: c.list, cantrip: true, count: c.cantrips, label: def.name });
      if (c.spells) addSpells(w, sp.spells, ctx, { listKey: c.list, cantrip: false, maxLevel: c.maxLevel, count: c.spells, label: def.name });
    }
  });

  // Constitution went up: +1 HP per character level for each point of modifier.
  const conAfter = mod(w.abilities.con);
  if (conAfter !== conBefore) w.hpGain += (conAfter - conBefore) * P.totalLevel(next);
  return next;
}

// The sheet patch for the new classes + the work done.
// Classes that aren't in the SRD (e.g. from D&D Beyond) have no rules here:
// their Hit Dice and spell slots are kept as they were.
function finishPatch(w, classes, ctx, gainedDie) {
  const { rules } = ctx;
  const ch = w.ch;
  const unknown = classes.some((c) => !rules.classByKey.has(c.key));
  const slots = unknown
    ? { spellSlots: ch.spellSlots, pactMagic: ch.pactMagic || { level: 0, count: 0 } }
    : P.applySlots(ch, classes, rules);
  return {
    class: P.classText(classes),
    level: P.totalLevel(classes),
    classes,
    hitDice: unknown ? addHitDie(ch.hitDice, gainedDie) : P.hitDiceText(classes, rules),
    hpMax: Math.max(1, (ch.hpMax || 0) + w.hpGain),
    hpCurrent: Math.max(0, (ch.hpCurrent || 0) + w.hpGain),
    abilities: w.abilities,
    saveProf: w.saveProf,
    skillProf: w.skillProf,
    skillExpert: w.skillExpert,
    weaponProf: w.weaponProf,
    feats: w.feats,
    modifiers: w.modifiers,
    spells: w.spells,
    spellAbility: w.spellAbility,
    spellSlots: slots.spellSlots,
    pactMagic: slots.pactMagic,
    resources: P.resourcesFor({ ...ch, resources: ch.resources }, classes, w.abilities, rules, ctx.newId),
    features: P.appendFeatures(ch.features, w.blocks),
  };
}

// "3d10 + 2d8" plus one d`die`.
function addHitDie(text, die) {
  const pool = {};
  for (const m of String(text || '').matchAll(/(\d*)\s*d\s*(\d+)/gi)) pool[m[2]] = (pool[m[2]] || 0) + (m[1] === '' ? 1 : parseInt(m[1], 10));
  if (die) pool[die] = (pool[die] || 0) + 1;
  return Object.keys(pool).map(Number).sort((a, b) => b - a).map((d) => `${pool[d]}d${d}`).join(' + ');
}

// { patch, summary } or { error }.
function applyLevelUp(ch, answers, ctx) {
  const a = answers || {};
  const plan = levelUpPlan(ch, a.classKey, ctx);
  if (plan.error) return { error: plan.error };
  try {
    const w = workOf(ch);
    const classes = gainClassLevel(w, plan, a, ctx, P.classesOf(ch, ctx.rules));
    w.blocks.unshift(`— Level ${plan.newTotalLevel}: ${plan.className} ${plan.newClassLevel} —`);
    const patch = finishPatch(w, classes, ctx, plan.hitDie);
    if (classes.some((c) => !ctx.rules.classByKey.has(c.key))) {
      patch.features = P.appendFeatures(patch.features, [P.featureBlock('To do', 'Some classes aren\'t in the SRD rules here: check Hit Dice and spell slots by hand.')]);
    }
    return { patch, summary: `${plan.className} ${plan.newClassLevel} (level ${plan.newTotalLevel}), +${w.hpGain} HP` };
  } catch (e) {
    if (e.userError) return { error: e.message };
    throw e;
  }
}

module.exports = { levelUpPlan, planFor, applyLevelUp, gainClassLevel, workOf, finishPatch, applyFeat, addSpells, checkSkills, fail, MI_LISTS };
