const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { startServer, connect } = require('./helpers');
const { normaliseDice, sanitizeItemPatch, blankItem } = require('../src/features/items/model');
const { STARTER_ITEMS } = require('../src/features/items/starter');

test('dice are validated and normalised', () => {
  assert.strictEqual(normaliseDice('2D6 + 2'), '2d6+2');
  assert.strictEqual(normaliseDice('1d4 - 1'), '1d4-1');
  assert.strictEqual(normaliseDice('1'), '1');
  for (const bad of ['0d6', '1d7', 'd8', 'abc', '', '1d1000']) assert.strictEqual(normaliseDice(bad), null, bad);

  const it = sanitizeItemPatch(blankItem('x', 'weapon'), {
    damage: 'nonsense', versatileDamage: '', range: '80/20', properties: ['finesse', 'laser'], magicBonus: 9,
    extraDamage: '2d6', extraDamageType: 'fire', source: 'srd', createdBy: 'someone',
  });
  assert.strictEqual(it.damage, '1d4', 'invalid dice keep the old value');
  assert.strictEqual(it.range, '', 'normal range above long range is refused');
  assert.deepStrictEqual(it.properties, ['finesse']);
  assert.strictEqual(it.magicBonus, 5);
  assert.deepStrictEqual([it.extraDamage, it.extraDamageType], ['2d6', 'fire']);
  assert.strictEqual(it.source, 'custom', 'clients cannot set source');
  assert.strictEqual(it.createdBy, '', 'clients cannot set createdBy');
});

test('items: SRD basics are loaded; custom items with ownership rules', async (t) => {
  const s = await startServer();
  const dm = connect(s.port);
  const lyra = connect(s.port, 'role=player&character=lyra');
  const brann = connect(s.port, 'role=player&character=brann');
  const guest = connect(s.port, '');
  t.after(async () => { [dm, lyra, brann, guest].forEach((c) => c.close()); await s.close(); });
  await Promise.all([dm.opened, lyra.opened, brann.opened, guest.opened]);

  const first = await lyra.next('itemState');
  assert.strictEqual(first.items.length, STARTER_ITEMS.length, 'players see the whole library');
  const greatsword = first.items.find((i) => i.name === 'Greatsword');
  assert.deepStrictEqual([greatsword.damage, greatsword.damageType, greatsword.properties],
    ['2d6', 'slashing', ['heavy', 'two-handed']]);
  const plate = first.items.find((i) => i.name === 'Plate Armor');
  assert.deepStrictEqual([plate.baseAc, plate.maxDex, plate.strengthReq, plate.stealthDisadvantage], [18, 0, 15, true]);

  lyra.send('addItem', { id: 'flametongue', patch: { name: 'Flame Tongue', type: 'weapon', weaponCategory: 'martial', damage: '1d8', damageType: 'slashing', extraDamage: '2d6', extraDamageType: 'fire', magicBonus: 1 } });
  guest.send('addItem', { id: 'guestitem', patch: { name: 'Nope' } }); // no character: refused
  const added = await dm.next('itemState', (m) => m.items.some((i) => i.id === 'flametongue'));
  const ft = added.items.find((i) => i.id === 'flametongue');
  assert.deepStrictEqual([ft.createdBy, ft.source, ft.extraDamage, ft.magicBonus], ['lyra', 'custom', '2d6', 1]);
  assert.ok(!added.items.some((i) => i.id === 'guestitem'));

  // Brann can't touch Lyra's item or SRD items; Lyra can edit hers; the DM anything.
  brann.send('updateItem', { id: 'flametongue', patch: { name: 'Stolen' } });
  brann.send('deleteItem', { id: 'flametongue' });
  lyra.send('updateItem', { id: greatsword.id, patch: { damage: '9d12' } });
  lyra.send('updateItem', { id: 'flametongue', patch: { name: 'Flame Tongue +1' } });
  dm.send('updateItem', { id: plate.id, patch: { notes: 'Heavy!' } });
  const after = await dm.next('itemState', (m) => m.items.find((i) => i.id === plate.id)?.notes === 'Heavy!');
  const by = (id) => after.items.find((i) => i.id === id);
  assert.strictEqual(by('flametongue').name, 'Flame Tongue +1');
  assert.strictEqual(by(greatsword.id).damage, '2d6');

  lyra.send('deleteItem', { id: 'flametongue' });
  await dm.next('itemState', (m) => !m.items.some((i) => i.id === 'flametongue'));
});

// Fresh process = server restart, like persistence.test.js.
function run(dataDir, code) {
  return execFileSync(process.execPath, ['-e', code], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: dataDir }, encoding: 'utf8',
  });
}
const COUNT = `process.stdout.write(String(require('./src/features/items/service').all().length))`;

test('items: seeded once; deletions stick; a damaged file is not overwritten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-items-'));
  assert.strictEqual(run(dir, `${COUNT}; require('./src/core/jsonStore').flushAllStores()`), String(STARTER_ITEMS.length));
  run(dir, `const s = require('./src/features/items/service'); s.remove(s.all()[0].id); require('./src/core/jsonStore').flushAllStores()`);
  assert.strictEqual(run(dir, COUNT), String(STARTER_ITEMS.length - 1), 'not re-seeded after a restart');

  const file = path.join(dir, 'items.json');
  fs.writeFileSync(file, '{broken');
  assert.strictEqual(run(dir, COUNT).trim().split('\n').pop(), '0');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '{broken', 'damaged file left for the user to recover');
});
