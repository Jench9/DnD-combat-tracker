// Level-up picks that used to be "by hand": Weapon Mastery weapons (set on
// the Weapon Mastery modifier), Eldritch Invocations and Metamagic (the
// Content page's options, or typed names); and retiring characters.
const test = require('node:test');
const assert = require('node:assert');
// First: sets DATA_DIR / KIT_AUTH before anything reads src/config.
require('./helpers');
const { blankCharacter, sanitizeCharacterPatch } = require('../src/features/characters/model');
const { getRules } = require('../src/features/characters/builder/rules');
const { buildCharacter } = require('../src/features/characters/builder/create');
const { levelUpPlan, applyLevelUp } = require('../src/features/characters/builder/levelup');
const content = require('../src/features/content/service');
const items = require('../src/features/items/service');
const spells = require('../src/features/spells/service');
const characters = require('../src/features/characters/service');
const actions = require('../src/features/characters/actions');

let n = 0;
const ctx = () => ({ rules: getRules(), spells: spells.all(), items: items.all(), newId: () => `o${++n}` });
const apply = (ch, patch) => sanitizeCharacterPatch(ch, patch);
const spellId = (name) => spells.all().find((s) => s.name === name && s.edition === '2024').id;
const mastery = (ch) => ch.modifiers.find((m) => m.preset === 'weapon-mastery');

const BASE = {
  name: 'T', backgroundKey: 'soldier', speciesKey: 'human', originFeat: { key: 'alert' },
  abilityMethod: 'standard', abilities: { str: 15, dex: 13, con: 14, int: 8, wis: 10, cha: 12 },
  backgroundBonus: { str: 2, con: 1 }, speciesSkill: 'Insight', equipment: { class: 0, background: 0 },
};

test('weapon mastery: picked at creation and when the count goes up', () => {
  const build = { ...BASE, classKey: 'fighter', classSkills: ['Perception', 'History'], level1: { fightingStyle: 'defense' } };
  assert.match(buildCharacter(blankCharacter('f'), { ...build, level1: { ...build.level1, weaponMastery: ['Longsword'] } }, ctx()).error, /choose 3/);
  assert.match(buildCharacter(blankCharacter('f'), { ...build, level1: { ...build.level1, weaponMastery: ['Longsword', 'Dagger', 'Wand'] } }, ctx()).error, /Wand isn't/);
  const r = buildCharacter(blankCharacter('f'), { ...build, level1: { ...build.level1, weaponMastery: ['Longsword', 'Dagger', 'Longbow'] } }, ctx());
  assert.ifError(r.error);
  let ch = apply(blankCharacter('f'), r.patch);
  assert.strictEqual(mastery(ch).only, 'Longsword, Dagger, Longbow');

  // Fighter 2, 3: no new kinds. 4: one more (not one already chosen).
  for (let i = 0; i < 2; i++) ch = apply(ch, applyLevelUp(ch, { classKey: 'fighter', hp: { method: 'average' }, subclass: 'champion' }, ctx()).patch);
  const plan = levelUpPlan(ch, 'fighter', ctx());
  const c = plan.choices.find((x) => x.type === 'weaponMastery');
  assert.strictEqual(c.count, 1);
  assert.ok(!c.options.includes('Dagger') && c.options.includes('Greataxe'));
  const up = applyLevelUp(ch, { classKey: 'fighter', hp: { method: 'average' }, feat: { key: 'ability-score-improvement', plus: { str: 2 } }, weaponMastery: ['Greataxe'] }, ctx());
  assert.ifError(up.error);
  ch = apply(ch, up.patch);
  assert.strictEqual(mastery(ch).only, 'Longsword, Dagger, Longbow, Greataxe');

  // A Barbarian masters melee weapons only; none picked = a To do note.
  const barb = buildCharacter(blankCharacter('b'), { ...build, classKey: 'barbarian', classSkills: ['Nature', 'Survival'], level1: {} }, ctx());
  assert.ifError(barb.error);
  assert.match(barb.patch.features, /To do[\s\S]*Weapon Mastery: 2 more kinds/);
  // Still unchosen: offered again at the next level, melee weapons only.
  const bc = levelUpPlan(apply(blankCharacter('b'), barb.patch), 'barbarian', ctx()).choices.find((x) => x.type === 'weaponMastery');
  assert.strictEqual(bc.count, 2);
  assert.ok(bc.options.includes('Greataxe') && !bc.options.includes('Longbow'));
});

test('eldritch invocations and metamagic: Content-page options or typed names', () => {
  const mk = (raw) => { const r = content.add({ source: 'Homebrew', kind: 'option', ...raw }, ''); assert.ifError(r.error); return r.entry; };
  mk({ name: 'Agonizing Blast', optionType: 'invocation', desc: 'Adds CHA to a cantrip.', preset: 'agonizing-blast', prereq: 'a damaging Warlock cantrip' });
  mk({ name: 'Deep Sight', optionType: 'invocation', minLevel: 5, desc: 'See far.' });
  mk({ name: 'Fast Spell', optionType: 'metamagic', cost: 2, action: 'free', desc: 'Cast quicker.' });
  assert.strictEqual(mk({ name: 'Odd', optionType: 'invocation', preset: 'not-a-preset', cost: 5 }).preset, '', 'unknown modifier dropped');
  assert.strictEqual(getRules().options.length, 4);

  const build = {
    ...BASE, classKey: 'warlock', classSkills: ['Arcana', 'Deception'],
    abilities: { str: 8, dex: 13, con: 14, int: 12, wis: 10, cha: 15 }, backgroundBonus: { con: 2, dex: 1 },
    level1: { spells: { cantrips: [spellId('Eldritch Blast'), spellId('Minor Illusion')], spells: [spellId('Hex'), spellId('Charm Person')] }, options: { invocation: ['Agonizing Blast'] } },
  };
  const r = buildCharacter(blankCharacter('w'), build, ctx());
  assert.ifError(r.error);
  let ch = apply(blankCharacter('w'), r.patch);
  assert.ok(ch.feats.includes('invocation:Agonizing Blast'));
  assert.ok(ch.modifiers.some((m) => m.preset === 'agonizing-blast'), 'its attack modifier is switched on');
  assert.match(ch.features, /Eldritch Invocation: Agonizing Blast\n\*Prerequisite: a damaging Warlock cantrip\*/);

  // Warlock 2: two more; Agonizing Blast is taken, Deep Sight needs level 5.
  const plan = levelUpPlan(ch, 'warlock', ctx());
  const c = plan.choices.find((x) => x.type === 'options');
  assert.strictEqual(c.count, 2);
  assert.deepStrictEqual(c.known, ['Agonizing Blast']);
  assert.deepStrictEqual(c.options.filter((o) => !o.ok).map((o) => [o.name, o.why]), [['Agonizing Blast', 'already chosen'], ['Deep Sight', 'Warlock level 5+']]);
  const known = new Set(ch.spells.map((x) => x.spellId));
  const spellsUp = { spells: [spells.all().find((x) => x.edition === '2024' && x.level === 1 && (x.classes || []).includes('warlock') && !known.has(x.id)).id] };
  assert.match(applyLevelUp(ch, { classKey: 'warlock', hp: { method: 'average' }, spells: spellsUp, options: { invocation: ['Deep Sight', 'Mask of Many Faces'] } }, ctx()).error, /level 5/);
  assert.match(applyLevelUp(ch, { classKey: 'warlock', hp: { method: 'average' }, spells: spellsUp, options: { invocation: ['Agonizing Blast', 'Mask of Many Faces'] } }, ctx()).error, /already have/);
  const up = applyLevelUp(ch, { classKey: 'warlock', hp: { method: 'average' }, spells: spellsUp, options: { invocation: ['Odd', 'Mask of Many Faces'] } }, ctx());
  assert.ifError(up.error);
  ch = apply(ch, up.patch);
  assert.ok(ch.feats.includes('invocation:Mask of Many Faces'));
  assert.match(ch.features, /Eldritch Invocation: Mask of Many Faces\nAdd its rules text here/);

  // Sorcerer 2: two Metamagic options; one is used in play (spends Sorcery Points).
  const sorc = apply(blankCharacter('s'), { class: 'Sorcerer 1', level: 1, abilities: { cha: 16 }, classes: [{ key: 'sorcerer', name: 'Sorcerer', level: 1 }] });
  const sp = levelUpPlan(sorc, 'sorcerer', ctx());
  const mm = sp.choices.find((x) => x.type === 'options');
  assert.strictEqual(mm.optionType, 'metamagic');
  const pick = sp.choices.find((x) => x.type === 'spells');
  const picked = spells.all().filter((s) => s.edition === '2024' && s.level === 1 && (s.classes || []).includes('sorcerer')).slice(0, pick.spells).map((s) => s.id);
  const sup = applyLevelUp(sorc, { classKey: 'sorcerer', hp: { method: 'average' }, spells: { spells: picked }, options: { metamagic: ['Fast Spell', 'Careful Spell'] } }, ctx());
  assert.ifError(sup.error);
  const s2 = apply(sorc, sup.patch);
  assert.deepStrictEqual(s2.customActions.map((a) => [a.name, a.type, a.resource, a.cost]), [['Fast Spell', 'free', 'Sorcery Points', 2]]);
  assert.ok(s2.resources.some((x) => x.name === 'Sorcery Points'));
});

test('retired characters: only a DM sets the flag; kept on sync and copied as active', () => {
  characters.addBlank('ret1', '');
  actions.updateCharacter({ id: 'ret1', patch: { retired: true, name: 'Old Hero' } }, { role: 'player', characterId: 'ret1' });
  assert.strictEqual(characters.find('ret1').retired, false, 'a player cannot retire');
  assert.strictEqual(characters.find('ret1').name, 'Old Hero', 'the rest of the edit goes through');
  actions.updateCharacter({ id: 'ret1', patch: { retired: true } }, { role: 'dm' });
  assert.strictEqual(characters.find('ret1').retired, true);
  characters.refreshImported('ret1', { name: 'Old Hero' });
  assert.strictEqual(characters.find('ret1').retired, true, 'D&D Beyond sync keeps it');
  assert.strictEqual(characters.duplicate('ret1', 'ret2').retired, false);
  actions.updateCharacter({ id: 'ret1', patch: { retired: false } }, { role: 'dm' });
  assert.strictEqual(characters.find('ret1').retired, false);
});

// The shape D&D Beyond sends (trimmed): options tied to their class feature
// by componentId, names with what they're tied to in parentheses.
const DDB_WARLOCK = {
  classes: [{
    level: 3, definition: { name: 'Warlock' }, subclassDefinition: { name: 'The Fiend' },
    classFeatures: [{ definition: { id: 101, name: 'Eldritch Invocations', requiredLevel: 1 } }, { definition: { id: 102, name: 'Pact Magic', requiredLevel: 1 } }],
  }],
  options: {
    race: [{ componentId: 7, definition: { name: 'Charisma' } }],
    class: [
      { componentId: 101, definition: { name: 'Agonizing Blast (Eldritch Blast)' } },
      { componentId: 101, definition: { name: 'Pact of the Tome' } },
      { componentId: 999, definition: { name: 'Defense' } }, // another feature's option
    ],
  },
};

test('D&D Beyond: invocations recorded like the builder does, subclass matched, kept on sync', () => {
  const { detectPresets } = require('../src/features/imports/dndbeyond/modifiers');
  const opts = require('../src/features/imports/dndbeyond/options');
  assert.ok(detectPresets(DDB_WARLOCK).includes('agonizing-blast'), '"Agonizing Blast (Eldritch Blast)" is detected');
  assert.deepStrictEqual(opts.optionFeats(DDB_WARLOCK), ['invocation:Agonizing Blast', 'invocation:Pact of the Tome']);
  // D&D Beyond decides the invocations; other feats stay.
  assert.deepStrictEqual(opts.mergeOptionFeats(['alert', 'invocation:Mask of Many Faces'], DDB_WARLOCK), ['alert', 'invocation:Agonizing Blast', 'invocation:Pact of the Tome']);
  assert.deepStrictEqual(opts.mergeOptionFeats(['invocation:Kept'], { classes: [{ level: 1, definition: { name: 'Fighter' }, classFeatures: [] }] }), ['invocation:Kept']);
  const classes = opts.classesFrom(DDB_WARLOCK, getRules(), []);
  assert.deepStrictEqual(classes, [{ key: 'warlock', name: 'Warlock', level: 3, subclass: 'fiend-patron', subclassName: 'Fiend Patron' }]);

  // Content-page options bring their modifier and action.
  content.add({ source: 'Homebrew', kind: 'option', optionType: 'invocation', name: 'Pact of the Tome', action: 'action', desc: 'A book.' }, '');
  const patch = { modifiers: [], customActions: [] };
  opts.applyOptionContent(patch, DDB_WARLOCK, getRules(), () => 'z' + (++n));
  assert.deepStrictEqual(patch.customActions.map((a) => [a.name, a.type]), [['Pact of the Tome', 'action']]);

  // Level up then knows them: Agonizing Blast is "already chosen".
  const ch = apply(blankCharacter('ddbw'), { class: 'Warlock 4', level: 4, abilities: { cha: 16 }, classes, feats: opts.optionFeats(DDB_WARLOCK) });
  const plan = levelUpPlan(ch, 'warlock', ctx());
  const c = plan.choices.find((x) => x.type === 'options');
  assert.deepStrictEqual(c.known, ['Agonizing Blast', 'Pact of the Tome']);
  assert.strictEqual(c.options.find((o) => o.name === 'Agonizing Blast').why, 'already chosen');

  // A sync without those fields keeps what the builder recorded.
  characters.addBlank('ddbk', '');
  characters.update('ddbk', { feats: ['invocation:Agonizing Blast'], classes });
  const synced = characters.refreshImported('ddbk', { name: 'Synced', class: 'Warlock 3', level: 3 });
  assert.deepStrictEqual(synced.feats, ['invocation:Agonizing Blast']);
  assert.strictEqual(synced.classes[0].subclass, 'fiend-patron');
});
