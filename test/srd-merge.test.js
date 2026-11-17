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
  // Entries saved before editions existed match the plain (2024) name.
  assert.deepStrictEqual([by('old1').damage, by('old1').versatileDamage, by('old1').edition], ['1d8', '1d10', '2024'], 'updated in place');
  assert.deepStrictEqual([by('old2').name, by('old2').baseAc], ['Half-Plate Armor', 15], 'matched despite the name difference');
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
  // 2024 is the baseline: plain names; the 2014 version of a shared name is "Name (2014)".
  const fb = spells.find((s) => s.name === 'Fireball');
  const fb14 = spells.find((s) => s.name === 'Fireball (2014)');
  assert.deepStrictEqual([fb.edition, fb14.edition, fb.source], ['2024', '2014', 'srd']);
  assert.ok(!spells.some((s) => / \(2024\)$/.test(s.name)), 'no "(2024)" names');
  assert.ok(spells.some((s) => s.name === 'Hex' && s.edition === '2024'));
  assert.strictEqual(new Set(spells.map((s) => s.name.toLowerCase())).size, spells.length, 'names are unique');
});

// Libraries saved while 2014 had the plain names ("Fireball" = 2014,
// "Fireball (2024)" = 2024): the merge follows each entry's edition, so
// ids stay with their edition (characters' spells/items keep their rules)
// while the names swap.
test('a library from the 2014-baseline naming is renamed per edition, keeping ids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-srd-'));
  fs.writeFileSync(path.join(dir, 'spells.json'), JSON.stringify([
    { id: 'fb14', name: 'Fireball', level: 3, edition: '2014', source: 'srd', createdBy: 'dm' },
    { id: 'fb24', name: 'Fireball (2024)', level: 3, edition: '2024', source: 'srd', createdBy: 'dm' },
    { id: 'hex', name: 'Hex', level: 1, edition: '2024', source: 'srd', createdBy: 'dm' },
    { id: 'mine', name: 'Lyra\'s Lights', level: 1, source: 'custom', createdBy: 'lyra' },
  ]));
  fs.writeFileSync(path.join(dir, 'spells.srd-version'), 'older');
  const spells = lastJson(run(dir, DUMP('spells')));
  const by = (id) => spells.find((s) => s.id === id);
  assert.deepStrictEqual([by('fb14').name, by('fb14').edition], ['Fireball (2014)', '2014']);
  assert.deepStrictEqual([by('fb24').name, by('fb24').edition], ['Fireball', '2024']);
  assert.strictEqual(by('hex').name, 'Hex');
  assert.strictEqual(by('mine').source, 'custom');
  assert.strictEqual(spells.length, SRD_SPELLS.length + 1, 'nothing duplicated');
  assert.strictEqual(new Set(spells.map((s) => s.name.toLowerCase())).size, spells.length, 'names are unique');
});
