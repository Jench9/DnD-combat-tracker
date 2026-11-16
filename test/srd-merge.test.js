const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { SRD_ITEMS, SRD_SPELLS, SRD_VERSION } = require('../src/srd');

// Fresh process = server restart.
function run(dataDir, code) {
  return execFileSync(process.execPath, ['-e', code], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, DATA_DIR: dataDir }, encoding: 'utf8',
  });
}
const DUMP = (lib) => `process.stdout.write('\\n' + JSON.stringify(require('./src/features/${lib}/service').all()))`;
// The JSON is the last line (a merge also logs a line before it).
const lastJson = (out) => JSON.parse(out.trim().split('\n').pop());

test('an existing library gets the SRD merged in once, keeping ids and custom entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-srd-'));
  // Library from before the SRD import: hand-written starter entries + a custom one.
  fs.writeFileSync(path.join(dir, 'items.json'), JSON.stringify([
    { id: 'old1', name: 'Longsword', type: 'weapon', damage: '1d6', source: 'srd', createdBy: 'dm' },
    { id: 'old2', name: 'Half Plate', type: 'armor', armorType: 'medium', baseAc: 1, source: 'srd', createdBy: 'dm' },
    { id: 'mine', name: 'Dagger', type: 'weapon', damage: '3d6', source: 'custom', createdBy: 'lyra' },
  ]));

  const items = lastJson(run(dir, DUMP('items')));
  const by = (id) => items.find((i) => i.id === id);
  assert.deepStrictEqual([by('old1').damage, by('old1').versatileDamage, by('old1').edition], ['1d8', '1d10', '2014'], 'updated in place');
  assert.deepStrictEqual([by('old2').name, by('old2').baseAc], ['Half Plate Armor', 15], 'matched despite the name difference');
  assert.deepStrictEqual([by('mine').damage, by('mine').source], ['3d6', 'custom'], "the table's own item is untouched");
  // Everything else was added; the custom "Dagger" blocks the SRD "Dagger".
  assert.strictEqual(items.length, SRD_ITEMS.length + 1 - 1);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'items.srd-version'), 'utf8'), SRD_VERSION);

  // Deleting an SRD entry sticks: the merge doesn't run again for this version.
  run(dir, `const s = require('./src/features/items/service'); s.remove('old1'); require('./src/core/jsonStore').flushAllStores()`);
  assert.ok(!lastJson(run(dir, DUMP('items'))).some((i) => i.id === 'old1'));
});

test('a fresh install is seeded with the full SRD (both editions)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-srd-'));
  const spells = lastJson(run(dir, DUMP('spells')));
  assert.strictEqual(spells.length, SRD_SPELLS.length);
  const fb = spells.find((s) => s.name === 'Fireball');
  const fb24 = spells.find((s) => s.name === 'Fireball (2024)');
  assert.deepStrictEqual([fb.edition, fb24.edition, fb.source], ['2014', '2024', 'srd']);
  assert.ok(spells.some((s) => s.name === 'Hex' && s.edition === '2024'), '2024-only spells keep plain names');
  assert.strictEqual(new Set(spells.map((s) => s.name.toLowerCase())).size, spells.length, 'names are unique');
});
