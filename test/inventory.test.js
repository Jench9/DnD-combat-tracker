const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { startServer, connect } = require('./helpers');
const { sanitizeCharacterPatch, blankCharacter } = require('../src/features/characters/model');

test('inventory entries are validated', () => {
  const ch = sanitizeCharacterPatch(blankCharacter('c'), {
    inventory: [
      { id: 'a1', itemId: 'i1', qty: 3, equipped: 1, name: 'Dagger', extra: 'x' },
      { id: 'a1', itemId: 'i2' }, // duplicate entry id
      { id: 'BAD!', itemId: 'i3' },
      { id: 'a2', itemId: 'i4', qty: -5 },
      { id: 'a3', itemId: 'i5', qty: 'lots' },
      null,
    ],
  });
  assert.deepStrictEqual(ch.inventory, [
    { id: 'a1', itemId: 'i1', name: 'Dagger', qty: 3, equipped: true },
    { id: 'a2', itemId: 'i4', name: '', qty: 0, equipped: false },
    { id: 'a3', itemId: 'i5', name: '', qty: 1, equipped: false },
  ]);
  assert.strictEqual(blankCharacter('x').acAuto, true, 'new characters compute AC');
});

// Sets up a character wearing whatever `names` say, via the real server.
async function setup(t) {
  const s = await startServer();
  const dm = connect(s.port);
  const lyra = connect(s.port, 'role=player&character=lyra');
  t.after(async () => { dm.close(); lyra.close(); await s.close(); });
  await Promise.all([dm.opened, lyra.opened]);
  let lib = (await dm.next('itemState')).items;
  const setLibrary = (items) => { lib = items; };
  const item = (name) => lib.find((i) => i.name === name);
  dm.send('addCharacter', { id: 'lyra' });
  await dm.next('charState', (m) => m.characters.some((c) => c.id === 'lyra'));
  let n = 0;
  // Equip exactly these items (by library name) and return Lyra's AC.
  async function wear(names, abilities) {
    n++;
    const inventory = names.map((nm, i) => ({ id: `e${n}x${i}`, itemId: item(nm).id, name: nm, qty: 1, equipped: true }));
    lyra.send('updateCharacter', { id: 'lyra', patch: { inventory, notes: `step${n}`, ...(abilities ? { abilities } : {}) } });
    const m = await dm.next('charState', (x) => x.characters.find((c) => c.id === 'lyra')?.notes === `step${n}`);
    return m.characters.find((c) => c.id === 'lyra').ac;
  }
  return { dm, lyra, item, wear, setLibrary };
}

test('Auto AC follows the 5e armor rules', async (t) => {
  const { wear } = await setup(t);
  assert.strictEqual(await wear([], { dex: 14 }), 12, 'no armor: 10 + DEX');
  assert.strictEqual(await wear(['Leather Armor'], { dex: 16 }), 14, 'light: 11 + 3');
  assert.strictEqual(await wear(['Chain Shirt'], { dex: 18 }), 15, 'medium: 13 + DEX capped at 2');
  assert.strictEqual(await wear(['Chain Shirt'], { dex: 8 }), 12, 'medium: negative DEX still applies');
  assert.strictEqual(await wear(['Plate Armor'], { dex: 8 }), 18, 'heavy: no DEX either way');
  assert.strictEqual(await wear(['Plate Armor', 'Shield']), 20, 'shield +2');
  assert.strictEqual(await wear(['Shield'], { dex: 12 }), 13, 'shield alone: 10 + DEX + 2');
});

test('Auto AC: magic armor, unequipped items, manual mode, live library edits, combat', async (t) => {
  const { dm, lyra, item, wear, setLibrary } = await setup(t);
  dm.send('addItem', { id: 'plusone', patch: { name: '+1 Breastplate', type: 'armor', armorType: 'medium', baseAc: 14, maxDex: 2, magicBonus: 1 } });
  setLibrary((await dm.next('itemState', (m) => m.items.some((i) => i.id === 'plusone'))).items);
  assert.strictEqual(await wear(['+1 Breastplate'], { dex: 14 }), 17, '14 + 2 + 1');

  // Unequipped armor doesn't count.
  lyra.send('updateCharacter', { id: 'lyra', patch: { inventory: [{ id: 'u1', itemId: item('Plate Armor').id, qty: 1, equipped: false }], notes: 'unequipped' } });
  let m = await dm.next('charState', (x) => x.characters.find((c) => c.id === 'lyra')?.notes === 'unequipped');
  assert.strictEqual(m.characters.find((c) => c.id === 'lyra').ac, 12);

  // The DM changes the library armor: wearers' AC updates without touching the sheet.
  await wear(['Leather Armor'], { dex: 14 });
  dm.send('updateItem', { id: item('Leather Armor').id, patch: { baseAc: 13 } });
  m = await dm.next('charState', (x) => x.characters.find((c) => c.id === 'lyra')?.ac === 15);
  assert.ok(m);

  // Combat uses the computed AC.
  dm.send('addCharacterToCombat', { characterId: 'lyra', init: 10 });
  const st = await dm.next('state', (x) => x.state.combatants.length === 1);
  assert.strictEqual(st.state.combatants[0].ac, 15);

  // Manual mode: the typed AC wins.
  lyra.send('updateCharacter', { id: 'lyra', patch: { acAuto: false, ac: 19 } });
  m = await dm.next('charState', (x) => x.characters.find((c) => c.id === 'lyra')?.acAuto === false);
  assert.strictEqual(m.characters.find((c) => c.id === 'lyra').ac, 19);
});

test('characters saved before Auto AC keep their manual AC; imports too', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-inv-'));
  fs.writeFileSync(path.join(dir, 'characters.json'), JSON.stringify([{ id: 'old1', name: 'Old', ac: 17 }]));
  const out = execFileSync(process.execPath, ['-e', `
    const s = require('./src/features/characters/service');
    const imported = s.addImported({ name: 'Imp', ac: 16 });
    s.addBlank('fresh');
    process.stdout.write(JSON.stringify(s.all().map((c) => [c.id === imported.id ? 'imported' : c.id, c.acAuto, c.ac])));
  `], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: dir }, encoding: 'utf8' });
  const rows = Object.fromEntries(JSON.parse(out).map(([id, auto, ac]) => [id, [auto, ac]]));
  assert.deepStrictEqual(rows.old1, [false, 17]);
  assert.deepStrictEqual(rows.imported, [false, 16]);
  assert.strictEqual(rows.fresh[0], true);
});
