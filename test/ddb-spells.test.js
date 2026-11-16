const test = require('node:test');
const assert = require('node:assert');
const { planSpells, spellFromDefinition } = require('../src/features/imports/dndbeyond/spells');
const { SRD_SPELLS } = require('../src/srd');
const { startServer, connect } = require('./helpers');

const LIBRARY = SRD_SPELLS.map((sp, i) => ({ id: `sp${i}`, ...sp }));
const cls = (name, level, extra = {}) => ({ id: name + level, level, definition: { name }, ...extra });
const slotsFor = (classes, extra = {}) => planSpells({ classes, ...extra }, LIBRARY, () => 'x').spellSlots.map((s) => s.max);
const row = (...n) => [...n, ...Array(9 - n.length).fill(0)];

test('spell slots follow the 5e caster tables', () => {
  assert.deepStrictEqual(slotsFor([cls('Wizard', 5)]), row(4, 3, 2));
  assert.deepStrictEqual(slotsFor([cls('Cleric', 20)]), row(4, 3, 3, 3, 3, 2, 2, 1, 1));
  assert.deepStrictEqual(slotsFor([cls('Paladin', 1)]), row());
  assert.deepStrictEqual(slotsFor([cls('Paladin', 2)]), row(2));
  assert.deepStrictEqual(slotsFor([cls('Paladin', 5)]), row(4, 2));
  assert.deepStrictEqual(slotsFor([cls('Ranger', 3)]), row(3));
  assert.deepStrictEqual(slotsFor([cls('Fighter', 7, { subclassDefinition: { name: 'Eldritch Knight' } })]), row(4, 2));
  assert.deepStrictEqual(slotsFor([cls('Fighter', 7)]), row(), 'a plain fighter has no slots');
  // Multiclass: full levels + half (rounded down) + third (rounded down).
  assert.deepStrictEqual(slotsFor([cls('Wizard', 3), cls('Cleric', 2)]), row(4, 3, 2));
  assert.deepStrictEqual(slotsFor([cls('Paladin', 4), cls('Sorcerer', 3)]), row(4, 3, 2));
  // Warlock pact slots are folded in at their level.
  assert.deepStrictEqual(slotsFor([cls('Warlock', 5)]), row(0, 0, 2));
  assert.deepStrictEqual(slotsFor([cls('Warlock', 2), cls('Wizard', 3)]), row(6, 2));
  // Used counts from D&D Beyond (never above the max).
  const used = planSpells({ classes: [cls('Wizard', 3)], spellSlots: [{ level: 1, used: 3 }, { level: 2, used: 5 }] }, LIBRARY, () => 'x').spellSlots;
  assert.deepStrictEqual(used.slice(0, 2), [{ max: 4, used: 3 }, { max: 2, used: 2 }]);
});

// A homebrew spell as D&D Beyond describes it.
const HOMEBREW = {
  name: 'Frost Lance', level: 2, school: 'Evocation', concentration: false, ritual: false,
  activation: { activationTime: 1, activationType: 1 }, range: { origin: 'Ranged', rangeValue: 90 },
  components: [1, 2], duration: { durationType: 'Instantaneous' },
  requiresSavingThrow: true, saveDcAbilityId: 3,
  description: '<p>Each creature in a line takes cold damage, or half as much damage on a successful save.</p>',
  modifiers: [
    { type: 'damage', subType: 'cold', die: { diceString: '3d8' }, atHigherLevels: { scaleType: 'spellscale', higherLevelDefinitions: [{ level: 1, dice: { diceString: '1d8' } }] } },
    { type: 'damage', subType: 'piercing', die: { diceString: '1d6' } },
  ],
};

test('spellFromDefinition reads D&D Beyond spell definitions', () => {
  const sp = spellFromDefinition(HOMEBREW);
  assert.deepStrictEqual(
    [sp.level, sp.school, sp.castingTime, sp.range, sp.components, sp.duration, sp.mechanic, sp.saveAbility, sp.saveSuccess],
    [2, 'evocation', '1 action', '90 ft', 'V, S', 'Instantaneous', 'save', 'con', 'half'],
  );
  assert.deepStrictEqual([sp.dice, sp.damageType, sp.extraDice, sp.extraDamageType, sp.higherLevelDice], ['3d8', 'cold', '1d6', 'piercing', '1d8']);
  assert.strictEqual(sp.description, 'Each creature in a line takes cold damage, or half as much damage on a successful save.');

  const heal = spellFromDefinition({
    name: 'Mend', level: 1, school: 'Evocation', activation: { activationTime: 1, activationType: 3 }, range: { origin: 'Touch' },
    modifiers: [{ type: 'bonus', subType: 'hit-points', usePrimaryStat: true, die: { diceString: '2d4' } }],
  });
  assert.deepStrictEqual([heal.mechanic, heal.dice, heal.addMod, heal.castingTime, heal.range], ['heal', '2d4', true, '1 bonus action', 'Touch']);

  const cantrip = spellFromDefinition({
    name: 'Zap', level: 0, school: 'Evocation', requiresAttackRoll: true, range: { origin: 'Self', aoeType: 'Cone', aoeValue: 15 },
    duration: { durationType: 'Concentration', durationInterval: 1, durationUnit: 'Minute' },
    modifiers: [{ type: 'damage', subType: 'lightning', die: { diceString: '1d8' }, atHigherLevels: { scaleType: 'characterlevel' } }],
  });
  assert.deepStrictEqual([cantrip.mechanic, cantrip.cantripScaling, cantrip.range, cantrip.duration], ['attack', true, 'Self (15-ft cone)', 'Up to 1 minute']);
});

const entry = (def, extra = {}) => ({ definition: def, prepared: false, alwaysPrepared: false, ...extra });
const PAYLOAD = {
  classes: [
    { id: 11, level: 5, definition: { name: 'Wizard', spellCastingAbilityId: 4 } },
    { id: 22, level: 1, definition: { name: 'Sorcerer', spellCastingAbilityId: 6 } },
  ],
  classSpells: [
    { characterClassId: 11, spells: [
      entry({ name: 'Fire Bolt', level: 0 }),
      entry({ name: 'Fireball', level: 3 }, { prepared: true }),
      entry({ name: 'Shield', level: 1 }), // not prepared today
      entry(HOMEBREW, { prepared: true }),
    ] },
    { characterClassId: 22, spells: [entry({ name: 'Magic Missile', level: 1 })] }, // known caster
  ],
  spells: {
    race: [entry({ name: 'Faerie Fire', level: 1 })],
    item: [entry({ name: 'Fireball', level: 3 })], // duplicate of a class spell
  },
};

test('planSpells: library matches, new spells, prepared flags, ability', () => {
  let n = 0;
  const plan = planSpells(PAYLOAD, LIBRARY, () => `n${n++}`);
  const by = (name) => plan.spells.find((s) => s.name === name);
  const libId = (name) => LIBRARY.find((s) => s.name === name).id;

  assert.strictEqual(plan.spellAbility, 'int', 'from the highest-level casting class');
  assert.strictEqual(plan.spells.length, 6, 'the duplicate Fireball is merged');
  assert.deepStrictEqual([by('Fireball').spellId, by('Fireball').prepared], [libId('Fireball'), true]);
  assert.strictEqual(by('Fire Bolt').prepared, true, 'cantrip');
  assert.strictEqual(by('Shield').prepared, false, 'wizard spell not prepared');
  assert.strictEqual(by('Magic Missile').prepared, true, 'sorcerers know their spells');
  assert.strictEqual(by('Faerie Fire').prepared, true, 'racial spell');

  assert.strictEqual(plan.newSpells.length, 1);
  assert.strictEqual(plan.newSpells[0].patch.name, 'Frost Lance');
  assert.strictEqual(by('Frost Lance').spellId, plan.newSpells[0].id);
  assert.deepStrictEqual(plan.spellSlots.map((s) => s.max), row(4, 3, 3), 'wizard 5 + sorcerer 1 = caster level 6');
});

test('D&D Beyond import and sync bring spells, slots and ability', async (t) => {
  let payload = { id: 4242, name: 'Mira', stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: id === 4 ? 16 : 10 })), baseHitPoints: 20, ...PAYLOAD };
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => (String(url).includes('character-service.dndbeyond.com')
    ? new Response(JSON.stringify({ success: true, data: payload }), { status: 200 })
    : realFetch(url, opts));
  t.after(() => { global.fetch = realFetch; });

  const s = await startServer();
  const dm = connect(s.port);
  t.after(async () => { dm.close(); await s.close(); });
  await dm.opened;
  const post = (path, body) => realFetch(`http://localhost:${s.port}/api/import/dndbeyond${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Kit-Role': 'dm' }, body: JSON.stringify(body),
  });

  const { character } = await (await post('', { input: '4242' })).json();
  assert.strictEqual(character.spellAbility, 'int');
  assert.deepStrictEqual(character.spellSlots.slice(0, 3).map((x) => x.max), [4, 3, 3]);
  assert.ok(character.spells.some((x) => x.name === 'Frost Lance'));
  const lib = (await dm.next('spellState', (m) => m.spells.some((x) => x.name === 'Frost Lance'))).spells;
  assert.deepStrictEqual([lib.find((x) => x.name === 'Frost Lance').createdBy, lib.find((x) => x.name === 'Frost Lance').source], ['dm', 'custom']);

  // Level up on D&D Beyond: one more wizard level, a new spell, a used slot.
  payload = {
    ...payload,
    classes: [{ ...PAYLOAD.classes[0], level: 6 }, PAYLOAD.classes[1]],
    classSpells: [{ ...PAYLOAD.classSpells[0], spells: [...PAYLOAD.classSpells[0].spells, entry({ name: 'Counterspell', level: 3 }, { prepared: true })] }, PAYLOAD.classSpells[1]],
    spellSlots: [{ level: 3, used: 1 }],
  };
  const before = require('../src/features/spells/service').all().length;
  const { character: synced } = await (await post('/refresh', { characterId: character.id })).json();
  assert.deepStrictEqual(synced.spellSlots.slice(0, 4), [{ max: 4, used: 0 }, { max: 3, used: 0 }, { max: 3, used: 1 }, { max: 1, used: 0 }]);
  assert.ok(synced.spells.some((x) => x.name === 'Counterspell' && x.prepared));
  assert.strictEqual(require('../src/features/spells/service').all().length, before, 'Frost Lance reused, not duplicated');
});
