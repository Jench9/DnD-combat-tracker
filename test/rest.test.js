const test = require('node:test');
const assert = require('node:assert');
const rest = require('../src/features/characters/rest');
const { blankCharacter, sanitizeCharacterPatch } = require('../src/features/characters/model');
const { mapDndBeyondData } = require('../src/features/imports/dndbeyond/mapper');
const { planResources, mergeResources } = require('../src/features/imports/dndbeyond/resources');
const { planSpells } = require('../src/features/imports/dndbeyond/spells');
const { startServer, connect } = require('./helpers');

const char = (patch) => sanitizeCharacterPatch(blankCharacter('c1'), patch);

test('hit dice text is parsed per die size, multiclass included', () => {
  assert.deepStrictEqual(rest.parseHitDice('5d10'), { d6: 0, d8: 0, d10: 5, d12: 0 });
  assert.deepStrictEqual(rest.parseHitDice('3d10 + 2d6'), { d6: 2, d8: 0, d10: 3, d12: 0 });
  assert.deepStrictEqual(rest.parseHitDice('d8'), { d6: 0, d8: 1, d10: 0, d12: 0 });
  assert.deepStrictEqual(rest.parseHitDice('lots'), { d6: 0, d8: 0, d10: 0, d12: 0 });
  const ch = char({ hitDice: '3d10 + 2d6', hitDiceUsed: { d10: 1 } });
  assert.deepStrictEqual(rest.hitDiceLeft(ch), { d6: 2, d8: 0, d10: 2, d12: 0 });
});

test('spending a hit die heals roll + CON, never below 0 or above max', () => {
  const ch = char({ hitDice: '2d10', hpMax: 30, hpCurrent: 10, abilities: { con: 14 } });
  const r = rest.spendHitDie(ch, 10, 7);
  assert.strictEqual(r.healed, 9);
  assert.deepStrictEqual(r.patch, { hitDiceUsed: { d6: 0, d8: 0, d10: 1, d12: 0 }, hpCurrent: 19 });
  const weak = char({ hitDice: '1d6', hpMax: 30, hpCurrent: 10, abilities: { con: 3 } }); // CON −4
  assert.strictEqual(rest.spendHitDie(weak, 6, 1).healed, 0);
  const nearlyFull = char({ hitDice: '1d12', hpMax: 30, hpCurrent: 29 });
  assert.strictEqual(rest.spendHitDie(nearlyFull, 12, 12).patch.hpCurrent, 30);
  assert.strictEqual(rest.spendHitDie(char({ hitDice: '1d8', hitDiceUsed: { d8: 1 } }), 8, 3), null, 'none left');
  assert.strictEqual(rest.spendHitDie(char({ hitDice: '1d8' }), 10, 3), null, 'wrong die size');
  const auto = rest.spendHitDie(char({ hitDice: '1d8' }), 8, 99); // out of range -> server rolls
  assert.ok(auto.roll >= 1 && auto.roll <= 8);
});

const RESOURCES = [
  { id: 'r1', name: 'Second Wind', max: 1, used: 1, recharge: 'short' },
  { id: 'r2', name: 'Rage', max: 3, used: 2, recharge: 'long' },
  { id: 'r3', name: 'Luck', max: 3, used: 3, recharge: 'none' },
];

test('short rest: short-rest resources and pact slots come back, nothing else', () => {
  const ch = char({
    resources: RESOURCES,
    pactMagic: { level: 3, count: 2 },
    spellSlots: [{ max: 4, used: 4 }, { max: 3, used: 1 }, { max: 3, used: 3 }],
    hpCurrent: 3,
  });
  const p = rest.shortRest(ch);
  assert.deepStrictEqual(p.resources.map((r) => r.used), [0, 2, 3]);
  assert.deepStrictEqual(p.spellSlots.slice(0, 3).map((s) => s.used), [4, 1, 1], 'only the 2 pact slots at level 3');
  assert.ok(!('hpCurrent' in p));
  assert.ok(!('spellSlots' in rest.shortRest(char({ resources: RESOURCES }))), 'no pact magic, slots untouched');
});

test('long rest: full HP, no temp HP, slots and resources back; hit dice by edition', () => {
  const base = {
    hitDice: '5d10 + 3d6', hitDiceUsed: { d10: 4, d6: 3 }, hpMax: 40, hpCurrent: 5, hpTemp: 6,
    resources: RESOURCES, spellSlots: [{ max: 4, used: 3 }],
  };
  const p24 = rest.longRest(char({ ...base, rulesEdition: '2024' }));
  assert.strictEqual(p24.hpCurrent, 40);
  assert.strictEqual(p24.hpTemp, 0);
  assert.strictEqual(p24.spellSlots[0].used, 0);
  assert.deepStrictEqual(p24.resources.map((r) => r.used), [0, 0, 3], "'none' is never reset");
  assert.deepStrictEqual(p24.hitDiceUsed, { d6: 0, d8: 0, d10: 0, d12: 0 }, '2024: all back');
  // 2014: half of 8 total = 4 back, largest first: all 4 d10s, no d6s.
  const p14 = rest.longRest(char({ ...base, rulesEdition: '2014' }));
  assert.deepStrictEqual(p14.hitDiceUsed, { d6: 3, d8: 0, d10: 0, d12: 0 });
  // 2014 level 1: at least one die back.
  assert.deepStrictEqual(rest.longRest(char({ hitDice: '1d8', hitDiceUsed: { d8: 1 }, rulesEdition: '2014' })).hitDiceUsed.d8, 0);
});

test('D&D Beyond: multiclass hit dice, spent dice, pact magic and limited uses', () => {
  const data = {
    classes: [
      { level: 3, hitDiceUsed: 1, definition: { name: 'Fighter', hitDice: 10 } },
      { level: 2, hitDiceUsed: 0, definition: { name: 'Warlock', hitDice: 8 } },
    ],
    stats: [], actions: {
      class: [
        { name: 'Second Wind', limitedUse: { maxUses: 1, numberUsed: 1, resetType: 1 } },
        { name: 'Action Surge', limitedUse: { maxUses: 1, numberUsed: 0, resetType: 1 } },
        { name: 'Attack', limitedUse: null },
      ],
      race: [{ name: 'Breath Weapon', limitedUse: { maxUses: 0, useProficiencyBonus: true, proficiencyBonusOperator: 1, resetType: 2 } }],
      feat: [{ name: 'Lucky', limitedUse: { maxUses: 0, statModifierUsesId: 3, numberUsed: 0, resetType: 4 } }],
    },
  };
  const { patch } = mapDndBeyondData(data, '1');
  assert.strictEqual(patch.hitDice, '3d10 + 2d8');
  assert.deepStrictEqual(patch.hitDiceUsed, { d6: 0, d8: 0, d10: 1, d12: 0 });
  assert.strictEqual(patch.rulesEdition, '2014');

  let n = 0;
  const res = planResources(data, { level: 5, abilities: { con: 16 } }, () => 'id' + n++);
  assert.deepStrictEqual(res.map(({ name, max, used, recharge }) => [name, max, used, recharge]), [
    ['Second Wind', 1, 1, 'short'],
    ['Action Surge', 1, 0, 'short'],
    ['Breath Weapon', 3, 0, 'long'], // proficiency bonus at level 5
    ['Lucky', 3, 0, 'none'], // CON modifier
  ]);

  const warlock = planSpells({ classes: [{ level: 5, definition: { name: 'Warlock' } }] }, [], () => 'x');
  assert.deepStrictEqual(warlock.pactMagic, { level: 3, count: 2 });
  assert.deepStrictEqual(planSpells({ classes: [{ level: 5, definition: { name: 'Wizard' } }] }, [], () => 'x').pactMagic, { level: 0, count: 0 });

  // Sync keeps used counts (by name) and hand-made resources.
  const merged = mergeResources(
    [{ id: 'old1', name: 'Second Wind', max: 1, used: 0, recharge: 'short' }, { id: 'mine', name: 'Inspiration', max: 1, used: 1, recharge: 'none' }],
    res,
  );
  assert.deepStrictEqual(merged.map((r) => [r.id, r.name, r.used]), [
    ['old1', 'Second Wind', 0], ['id1', 'Action Surge', 0], ['id2', 'Breath Weapon', 0], ['id3', 'Lucky', 0], ['mine', 'Inspiration', 1],
  ]);
});

test('rest actions over the socket: owner only, and combat HP follows', async (t) => {
  const s = await startServer();
  const dm = connect(s.port);
  const other = connect(s.port, 'role=player&character=someoneelse');
  const owner = connect(s.port, 'role=player&character=rester');
  t.after(async () => { dm.close(); other.close(); owner.close(); await s.close(); });
  await Promise.all([dm.opened, other.opened, owner.opened]);

  dm.send('addCharacter', { id: 'rester' });
  dm.send('updateCharacter', { id: 'rester', patch: {
    name: 'Rester', hitDice: '2d10', hpMax: 30, hpCurrent: 10, abilities: { con: 10 },
    resources: [{ id: 'sw', name: 'Second Wind', max: 1, used: 1, recharge: 'short' }],
  } });
  dm.send('addCharacterToCombat', { characterId: 'rester', init: 5 });
  await dm.next('state', (m) => m.state.combatants.some((c) => c.characterId === 'rester'));
  const sheet = (m) => m.characters.find((c) => c.id === 'rester');
  const pc = (m) => m.state.combatants.find((c) => c.characterId === 'rester');

  other.send('longRest', { id: 'rester' }); // not theirs: ignored
  owner.send('spendHitDie', { id: 'rester', die: 10, roll: 6 });
  await dm.next('charState', (m) => sheet(m)?.hpCurrent === 16 && sheet(m)?.hitDiceUsed?.d10 === 1);
  await dm.next('state', (m) => pc(m)?.hp === 16);

  owner.send('shortRest', { id: 'rester' });
  await dm.next('charState', (m) => sheet(m)?.resources?.[0]?.used === 0);

  owner.send('longRest', { id: 'rester' });
  await dm.next('charState', (m) => sheet(m)?.hpCurrent === 30 && sheet(m)?.hitDiceUsed?.d10 === 0);
  await dm.next('state', (m) => pc(m)?.hp === 30);
});
