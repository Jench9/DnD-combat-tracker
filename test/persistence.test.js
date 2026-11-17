const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Runs a snippet in a fresh Node process against DATA_DIR, so each run is
// a real "server restart" with nothing left in memory.
function run(dataDir, code) {
  return execFileSync(process.execPath, ['-e', code], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: 'utf8',
  });
}

test('characters survive a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-persist-'));
  run(dir, `
    const s = require('./src/features/characters/service');
    const ch = s.addImported({ name: 'Brann', level: 4, abilities: { con: 16 } });
    s.addBlank('gone'); s.remove('gone');
    require('./src/core/jsonStore').flushAllStores();
  `);
  const out = JSON.parse(run(dir, `
    process.stdout.write(JSON.stringify(require('./src/features/characters/service').all()));
  `));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].name, 'Brann');
  assert.strictEqual(out[0].level, 4);
  assert.strictEqual(out[0].abilities.con, 16);
});

test('a corrupt or malformed file loads safely', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-persist-'));
  fs.writeFileSync(path.join(dir, 'characters.json'), '[{"id":"a1","level":99,"name":5}, null, {"noid":true}]');
  const out = JSON.parse(run(dir, `process.stdout.write(JSON.stringify(require('./src/features/characters/service').all()))`));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].level, 20);
  assert.strictEqual(out[0].name, '');

  fs.writeFileSync(path.join(dir, 'characters.json'), '{not json');
  const out2 = run(dir, `process.stdout.write(JSON.stringify(require('./src/features/characters/service').all()))`);
  assert.strictEqual(out2.trim().split('\n').pop(), '[]');
});

test('combat and token positions survive a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-persist-'));
  run(dir, `
    const { createApp } = require('./src/app');
    const { hub } = createApp(); // wires the features (saving actions)
    const features = { combat: require('./src/features/combat'), map: require('./src/features/map') };
    features.combat.actions.addCombatant({ name: 'Elf', init: 18, ac: 14, hp: 20, type: 'pc' });
    features.combat.actions.addCombatant({ name: 'Ogre', init: 9, ac: 11, hp: 59, type: 'monster' });
    const [elf, ogre] = require('./src/features/combat/service').getState().combatants;
    features.combat.actions.adjustHP({ id: ogre.id, delta: -10 });
    features.combat.actions.nextTurn({});
    features.map.actions.setTokenSize({ id: ogre.id, size: 2 });
    features.map.actions.placeToken({ id: elf.id, x: 1, y: 1 });
    features.map.actions.placeToken({ id: ogre.id, x: 5, y: 5 });
    require('./src/core/jsonStore').flushAllStores();
    hub.wss.close();
  `);
  const out = JSON.parse(run(dir, `
    const combat = require('./src/features/combat/service').getState();
    const map = require('./src/features/map/service').snapshot();
    process.stdout.write(JSON.stringify({ combat, map }));
  `));
  const [elf, ogre] = out.combat.combatants;
  assert.strictEqual(out.combat.activeIndex, 1);
  assert.strictEqual(ogre.hp, 49);
  assert.strictEqual(ogre.size, 2);
  assert.strictEqual(elf.size, 1);
  assert.deepStrictEqual(out.map.positions[elf.id], { x: 1, y: 1 });
  assert.deepStrictEqual(out.map.positions[ogre.id], { x: 5, y: 5 });
});

test('a damaged combat file loads safely', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-persist-'));
  fs.writeFileSync(path.join(dir, 'combat.json'), JSON.stringify({
    round: 3, activeIndex: 9, combatants: [{ id: 'a1', name: 'X', hp: 99, maxHp: 10, size: 7 }, null, { name: 'no id' }],
  }));
  fs.writeFileSync(path.join(dir, 'map.json'), '{"cols":500,"positions":{"a1":{"x":1,"y":2},"zz":{"x":"bad"}}}');
  const out = JSON.parse(run(dir, `
    const combat = require('./src/features/combat/service').getState();
    const map = require('./src/features/map/service').snapshot();
    process.stdout.write(JSON.stringify({ combat, map }));
  `));
  assert.strictEqual(out.combat.combatants.length, 1);
  assert.strictEqual(out.combat.activeIndex, 0);
  assert.strictEqual(out.combat.round, 3);
  assert.strictEqual(out.combat.combatants[0].hp, 10);
  assert.strictEqual(out.combat.combatants[0].size, 4);
  assert.strictEqual(out.map.cols, 50);
  assert.deepStrictEqual(out.map.positions, { a1: { x: 1, y: 2 } });
});
