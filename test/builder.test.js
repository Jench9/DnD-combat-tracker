const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');
const { blankCharacter, sanitizeCharacterPatch } = require('../src/features/characters/model');
const { getRules } = require('../src/features/characters/builder/rules');
const { buildCharacter } = require('../src/features/characters/builder/create');
const { levelUpPlan, applyLevelUp } = require('../src/features/characters/builder/levelup');
const P = require('../src/features/characters/builder/progression');
const items = require('../src/features/items/service');
const spells = require('../src/features/spells/service');

let n = 0;
const ctx = () => ({ rules: getRules(), spells: spells.all(), items: items.all(), newId: () => `x${++n}` });
const spellId = (name) => spells.all().find((s) => s.name === name && s.edition === '2024').id;
const apply = (ch, patch) => sanitizeCharacterPatch(ch, patch);

// A 2024 Fighter: Soldier, Dwarf, standard array.
const FIGHTER = {
  name: 'Brom', alignment: 'Lawful Good',
  classKey: 'fighter', backgroundKey: 'soldier', speciesKey: 'dwarf',
  abilityMethod: 'standard',
  abilities: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
  backgroundBonus: { str: 2, con: 1 },
  classSkills: ['Perception', 'Survival'],
  level1: { fightingStyle: 'defense' },
  equipment: { class: 0, background: 0 },
};

function makeFighter() {
  const r = buildCharacter(blankCharacter('f1'), FIGHTER, ctx());
  assert.ifError(r.error);
  return apply(blankCharacter('f1'), r.patch);
}

test('rules data: 12 classes with 20 levels, species, backgrounds, feats; presets exist', () => {
  const rules = getRules();
  assert.strictEqual(rules.classes.length, 12);
  rules.classes.forEach((c) => assert.strictEqual(c.levels.length, 20, c.key));
  assert.ok(rules.species.length >= 9 && rules.backgrounds.length >= 4 && rules.feats.length >= 10);
  const keys = new Set(require('../public/js/core/modifier-presets.json').map((p) => p.key));
  Object.values(P.CLASS_PRESETS).forEach((byLevel) => Object.values(byLevel).flat().forEach((k) => assert.ok(keys.has(k), k)));
  Object.values(P.FEAT_PRESETS).forEach((k) => assert.ok(keys.has(k), k));
});

test('create: a level 1 Fighter gets scores, skills, saves, HP, gear, features', () => {
  const ch = makeFighter();
  assert.strictEqual(ch.class, 'Fighter 1');
  assert.strictEqual(ch.level, 1);
  assert.deepStrictEqual(ch.abilities, { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 });
  assert.strictEqual(ch.hpMax, 10 + 2 + 1, 'd10 max + CON + Dwarven Toughness');
  assert.strictEqual(ch.hpCurrent, ch.hpMax);
  assert.strictEqual(ch.hitDice, '1d10');
  assert.deepStrictEqual(ch.saveProf, { str: true, con: true });
  ['Athletics', 'Intimidation', 'Perception', 'Survival'].forEach((s) => assert.ok(ch.skillProf[s], s));
  assert.deepStrictEqual(ch.weaponProf, { simple: true, martial: true });
  assert.strictEqual(ch.speed, 30);
  assert.strictEqual(ch.race, 'Dwarf');
  assert.strictEqual(ch.background, 'Soldier');
  assert.deepStrictEqual(ch.classes.map((c) => [c.key, c.level]), [['fighter', 1]]);
  assert.ok(ch.feats.includes('defense') && ch.feats.includes('savage-attacker'));
  assert.ok(ch.modifiers.some((m) => m.preset === 'defense'));
  assert.ok(ch.modifiers.some((m) => m.preset === 'savage-attacker'));
  assert.ok(ch.modifiers.some((m) => m.preset === 'weapon-mastery'));
  assert.ok(ch.resources.some((r) => r.name === 'Second Wind' && r.max === 2));
  const names = ch.inventory.map((e) => e.name);
  assert.ok(names.includes('Chain Mail') && names.includes('Greatsword'), names.join());
  assert.ok(ch.inventory.find((e) => e.name === 'Chain Mail').equipped);
  assert.ok(ch.currency.gp > 0);
  assert.match(ch.features, /Fighting Style/);
  assert.match(ch.features, /Dwarven Toughness/);
});

test('create: invalid builds are refused with a message', () => {
  const bad = (patch) => buildCharacter(blankCharacter('b'), { ...FIGHTER, ...patch }, ctx()).error;
  assert.match(bad({ classKey: 'nope' }), /class/);
  assert.match(bad({ abilities: { str: 15, dex: 15, con: 14, int: 8, wis: 12, cha: 10 } }), /standard array/);
  assert.match(bad({ abilityMethod: 'pointbuy', abilities: { str: 15, dex: 15, con: 15, int: 15, wis: 8, cha: 8 } }), /27/);
  assert.match(bad({ backgroundBonus: { cha: 2, con: 1 } }), /Soldier/);
  assert.match(bad({ classSkills: ['Arcana', 'Perception'] }), /options/);
  assert.match(bad({ level1: {} }), /Fighting Style/);
  assert.match(bad({ speciesKey: 'elf' }), /lineage/i);
  assert.match(bad({ equipment: { class: 9, background: 0 } }), /equipment/);
});

test('create: a Wizard (Sage, Elf) picks cantrips, spells and Magic Initiate spells', () => {
  const build = {
    name: 'Ilya', classKey: 'wizard', backgroundKey: 'sage', speciesKey: 'elf', subspeciesKey: 'elven-lineage-high-elf',
    abilityMethod: 'pointbuy', abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 8 },
    backgroundBonus: { int: 2, wis: 1 },
    classSkills: ['Investigation', 'Medicine'], speciesSkill: 'Perception',
    backgroundFeat: { magicInitiate: { cantrips: [spellId('Light'), spellId('Mage Hand')], spell: spellId('Shield') } },
    level1: { spells: {
      cantrips: [spellId('Fire Bolt'), spellId('Ray of Frost'), spellId('Minor Illusion')],
      spells: ['Magic Missile', 'Sleep', 'Detect Magic', 'Mage Armor', 'Burning Hands', 'Feather Fall'].map(spellId),
    } },
    equipment: { class: 0, background: 1 },
  };
  const r = buildCharacter(blankCharacter('w1'), build, ctx());
  assert.ifError(r.error);
  const ch = apply(blankCharacter('w1'), r.patch);
  assert.strictEqual(ch.spellAbility, 'int');
  assert.strictEqual(ch.spells.length, 2 + 1 + 3 + 6);
  assert.strictEqual(ch.spellSlots[0].max, 2);
  assert.strictEqual(ch.race, 'Elf (High Elf)');
  assert.ok(ch.skillProf.Perception && ch.skillProf.Arcana && ch.skillProf.History);
  assert.strictEqual(ch.hpMax, 6 + 2);
  // A cleric cantrip isn't on the wizard list.
  const wrong = buildCharacter(blankCharacter('w2'), { ...build, level1: { spells: { ...build.level1.spells, cantrips: [spellId('Sacred Flame'), spellId('Light'), spellId('Mage Hand')] } } }, ctx());
  assert.match(wrong.error, /spell list|already/);
});

test('level up: HP average or roll, new features, slots/resources follow the table', () => {
  let ch = makeFighter();
  const plan = levelUpPlan(ch, 'fighter', ctx());
  assert.strictEqual(plan.newClassLevel, 2);
  assert.ok(plan.features.some((f) => f.name === 'Action Surge'));
  const r = applyLevelUp(ch, { classKey: 'fighter', hp: { method: 'average' } }, ctx());
  assert.ifError(r.error);
  ch = apply(ch, r.patch);
  assert.strictEqual(ch.class, 'Fighter 2');
  assert.strictEqual(ch.level, 2);
  assert.strictEqual(ch.hpMax, 13 + 6 + 2 + 1);
  assert.strictEqual(ch.hitDice, '2d10');
  assert.ok(ch.resources.some((x) => x.name === 'Action Surge' && x.max === 1));
  const rolled = applyLevelUp(ch, { classKey: 'fighter', hp: { method: 'roll', roll: 11 } }, ctx());
  assert.match(rolled.error, /d10/);
});

test('level up: subclass at 3 and ASI / feats at 4 with their limits', () => {
  let ch = makeFighter();
  ch = apply(ch, applyLevelUp(ch, { classKey: 'fighter', hp: { method: 'average' } }, ctx()).patch);
  const plan3 = levelUpPlan(ch, 'fighter', ctx());
  assert.ok(plan3.choices.some((c) => c.type === 'subclass'));
  assert.match(applyLevelUp(ch, { classKey: 'fighter' }, ctx()).error, /subclass/);
  ch = apply(ch, applyLevelUp(ch, { classKey: 'fighter', subclass: 'champion' }, ctx()).patch);
  assert.strictEqual(ch.classes[0].subclass, 'champion');
  assert.ok(ch.modifiers.some((m) => m.preset === 'improved-critical'));
  assert.match(ch.features, /Remarkable Athlete/);

  const plan4 = levelUpPlan(ch, 'fighter', ctx());
  const feat = plan4.choices.find((c) => c.type === 'feat');
  assert.ok(feat && feat.options.some((o) => o.key === 'grappler' && o.ok));
  assert.match(applyLevelUp(ch, { classKey: 'fighter', feat: { key: 'ability-score-improvement', plus: { str: 3 } } }, ctx()).error, /Ability Score/);
  assert.match(applyLevelUp(ch, { classKey: 'fighter', feat: { key: 'defense' } }, ctx()).error, /Already/);
  const con = applyLevelUp(ch, { classKey: 'fighter', feat: { key: 'ability-score-improvement', plus: { con: 1, str: 1 } } }, ctx());
  assert.ifError(con.error);
  const after = apply(ch, con.patch);
  assert.strictEqual(after.abilities.con, 16);
  assert.strictEqual(after.abilities.str, 18);
  // CON 15 → 16 raises the modifier: +1 per level on top of the level's HP.
  assert.strictEqual(after.hpMax - ch.hpMax, 6 + 2 + 1 + 4);
});

test('level up: multiclassing needs 13s, adds the class and the multiclass slot table', () => {
  let ch = makeFighter();
  assert.match(levelUpPlan(ch, 'wizard', ctx()).error, /Intelligence 13/);
  ch = apply(ch, { abilities: { int: 13 } });
  const plan = levelUpPlan(ch, 'wizard', ctx());
  assert.ifError(plan.error);
  assert.ok(plan.isNewClass);
  const r = applyLevelUp(ch, { classKey: 'wizard', hp: { method: 'average' }, spells: {
    cantrips: [spellId('Fire Bolt'), spellId('Ray of Frost'), spellId('Minor Illusion')],
    spells: ['Magic Missile', 'Sleep', 'Detect Magic', 'Mage Armor', 'Burning Hands', 'Feather Fall'].map(spellId),
  } }, ctx());
  assert.ifError(r.error);
  ch = apply(ch, r.patch);
  assert.strictEqual(ch.class, 'Fighter 1 / Wizard 1');
  assert.strictEqual(ch.level, 2);
  assert.strictEqual(ch.hitDice, '1d10 + 1d6');
  assert.strictEqual(ch.spellSlots[0].max, 2);
  assert.strictEqual(ch.spellAbility, 'int');
  assert.deepStrictEqual(ch.saveProf, { str: true, con: true }, 'no new saves from a multiclass');
});

test('level up: Rogue expertise only on proficient skills; Warlock pact slots', () => {
  const rogue = {
    ...FIGHTER, classKey: 'rogue', classSkills: ['Stealth', 'Acrobatics', 'Deception', 'Insight'],
    abilities: { str: 10, dex: 15, con: 14, int: 13, wis: 12, cha: 8 }, backgroundBonus: { dex: 2, con: 1 },
    level1: { expertise: ['Stealth', 'Arcana'] },
  };
  assert.match(buildCharacter(blankCharacter('r'), { ...rogue, backgroundKey: 'soldier' }, ctx()).error, /Expertise|options/);
  const ok = buildCharacter(blankCharacter('r'), { ...rogue, level1: { expertise: ['Stealth', 'Athletics'] } }, ctx());
  assert.ifError(ok.error);
  const ch = apply(blankCharacter('r'), ok.patch);
  assert.ok(ch.skillExpert.Stealth && ch.skillExpert.Athletics);
  assert.ok(ch.modifiers.some((m) => m.preset === 'sneak-attack' && m.active));

  const lock = apply(blankCharacter('k'), { class: 'Warlock 4', level: 4, abilities: { cha: 16 } });
  const plan = levelUpPlan(lock, 'warlock', ctx());
  assert.strictEqual(plan.newClassLevel, 5);
  const sp = plan.choices.find((c) => c.type === 'spells');
  assert.ok(sp && sp.maxLevel === 3);
});

test('a sheet from elsewhere ("Artificer 3 / Fighter 1") keeps its unknown class on level up', () => {
  const ch = apply(blankCharacter('a'), { class: 'Artificer 3 / Fighter 1', level: 4, hitDice: '3d8 + 1d10', hpMax: 40, hpCurrent: 40, abilities: { str: 14, int: 16, con: 14 } });
  const r = applyLevelUp(ch, { classKey: 'fighter', hp: { method: 'average' } }, ctx());
  assert.ifError(r.error);
  const next = apply(ch, r.patch);
  assert.strictEqual(next.class, 'Artificer 3 / Fighter 2');
  assert.strictEqual(next.hitDice, '2d10 + 3d8');
  assert.strictEqual(next.level, 5);
});

test('REST: create (anyone), plan and level up (owner or DM only)', async () => {
  const srv = await startServer();
  const base = `http://localhost:${srv.port}/api/builder`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    const rules = await (await fetch(base + '/rules')).json();
    assert.strictEqual(rules.classes.length, 12);

    const bad = await post('/create', { build: { ...FIGHTER, classKey: '' } });
    assert.strictEqual(bad.status, 400);
    assert.match((await bad.json()).error, /class/);

    const made = await post('/create', { build: FIGHTER });
    assert.strictEqual(made.status, 200);
    const { character } = await made.json();
    assert.strictEqual(character.class, 'Fighter 1');

    const other = { 'X-Kit-Role': 'player', 'X-Kit-Character': 'someoneelse' };
    const mine = { 'X-Kit-Role': 'player', 'X-Kit-Character': character.id };
    assert.strictEqual((await post('/levelup', { id: character.id, answers: { classKey: 'fighter' } }, other)).status, 403);
    const opts = await (await fetch(`${base}/plan?id=${character.id}`, { headers: mine })).json();
    assert.ok(opts.options.find((o) => o.key === 'wizard').blocked);
    const up = await post('/levelup', { id: character.id, answers: { classKey: 'fighter', hp: { method: 'average' } } }, mine);
    assert.strictEqual(up.status, 200);
    assert.strictEqual((await up.json()).character.level, 2);

    // Filling in an existing sheet that already has a class is refused.
    const again = await post('/create', { id: character.id, build: FIGHTER }, mine);
    assert.strictEqual(again.status, 400);
  } finally {
    await srv.close();
  }
});
