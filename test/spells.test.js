const test = require('node:test');
const assert = require('node:assert');
const { startServer, connect } = require('./helpers');
const { sanitizeSpellPatch, blankSpell } = require('../src/features/spells/model');
const { STARTER_SPELLS } = require('../src/features/spells/starter');
const { sanitizeCharacterPatch, blankCharacter } = require('../src/features/characters/model');

test('spell fields are validated', () => {
  const sp = sanitizeSpellPatch(blankSpell('x'), {
    level: 12, school: 'pyromancy', mechanic: 'explode', saveAbility: 'luck', dice: '8d6', higherLevelDice: 'lots',
    damageType: 'fire', classes: ['wizard', 'barbarian'], concentration: 1, source: 'srd', createdBy: 'me',
  });
  assert.strictEqual(sp.level, 9);
  assert.strictEqual(sp.school, 'evocation');
  assert.strictEqual(sp.mechanic, 'none');
  assert.strictEqual(sp.saveAbility, '');
  assert.deepStrictEqual([sp.dice, sp.higherLevelDice, sp.damageType], ['8d6', '', 'fire']);
  assert.deepStrictEqual(sp.classes, ['wizard']);
  assert.strictEqual(sp.concentration, true);
  assert.deepStrictEqual([sp.source, sp.createdBy], ['custom', '']);
});

test('character spells and slots are validated', () => {
  const ch = sanitizeCharacterPatch(blankCharacter('c'), {
    spellAbility: 'wis',
    spellSlots: [{ max: 4, used: 9 }, { max: 3, used: 1 }, { max: 'x' }],
    spells: [{ id: 's1', spellId: 'fb', name: 'Fireball', prepared: 1 }, { id: 's1', spellId: 'dup' }, { id: 'BAD', spellId: 'x' }],
  });
  assert.strictEqual(ch.spellAbility, 'wis');
  assert.strictEqual(ch.spellSlots.length, 9);
  assert.deepStrictEqual(ch.spellSlots.slice(0, 3), [{ max: 4, used: 4 }, { max: 3, used: 1 }, { max: 0, used: 0 }]);
  assert.deepStrictEqual(ch.spells, [{ id: 's1', spellId: 'fb', name: 'Fireball', prepared: true }]);
  assert.strictEqual(sanitizeCharacterPatch(ch, { spellAbility: 'luck' }).spellAbility, 'wis');
});

test('spells: SRD spells loaded; custom spells with ownership rules', async (t) => {
  const s = await startServer();
  const dm = connect(s.port);
  const lyra = connect(s.port, 'role=player&character=lyra');
  const brann = connect(s.port, 'role=player&character=brann');
  t.after(async () => { [dm, lyra, brann].forEach((c) => c.close()); await s.close(); });
  await Promise.all([dm.opened, lyra.opened, brann.opened]);

  const first = await lyra.next('spellState');
  assert.strictEqual(first.spells.length, STARTER_SPELLS.length);
  const fireball = first.spells.find((x) => x.name === 'Fireball');
  assert.deepStrictEqual(
    [fireball.level, fireball.mechanic, fireball.saveAbility, fireball.saveSuccess, fireball.dice, fireball.higherLevelDice],
    [3, 'save', 'dex', 'half', '8d6', '1d6'],
  );

  lyra.send('addSpell', { id: 'mybolt', patch: { name: 'Lyra Bolt', level: 1, mechanic: 'attack', dice: '2d8', damageType: 'force' } });
  const added = await dm.next('spellState', (m) => m.spells.some((x) => x.id === 'mybolt'));
  assert.strictEqual(added.spells.find((x) => x.id === 'mybolt').createdBy, 'lyra');

  brann.send('updateSpell', { id: 'mybolt', patch: { name: 'Stolen' } });
  brann.send('updateSpell', { id: fireball.id, patch: { dice: '20d6' } });
  lyra.send('updateSpell', { id: fireball.id, patch: { dice: '20d6' } });
  dm.send('updateSpell', { id: 'mybolt', patch: { description: 'checked' } });
  const after = await dm.next('spellState', (m) => m.spells.find((x) => x.id === 'mybolt')?.description === 'checked');
  assert.strictEqual(after.spells.find((x) => x.id === 'mybolt').name, 'Lyra Bolt');
  assert.strictEqual(after.spells.find((x) => x.id === fireball.id).dice, '8d6');
});

test('a D&D Beyond sync keeps the spellbook', () => {
  const service = require('../src/features/characters/service');
  const ch = service.addImported({ name: 'Wiz' });
  service.update(ch.id, { spellAbility: 'int', spellSlots: [{ max: 2, used: 1 }], spells: [{ id: 'a1', spellId: 'x1', name: 'Shield', prepared: true }] });
  const up = service.refreshImported(ch.id, { name: 'Wiz', spellAbility: '', spells: [] });
  assert.strictEqual(up.spellAbility, 'int');
  assert.deepStrictEqual(up.spellSlots[0], { max: 2, used: 1 });
  assert.strictEqual(up.spells.length, 1);
  service.remove(ch.id);
});
