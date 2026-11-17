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

test('library monsters with an unedited older SRD stat block get the new one (usage on action names)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-persist-'));
  const { SRD_MONSTERS } = require('../src/srd');
  const st = SRD_MONSTERS.find((m) => m.name === 'Adult Red Dragon');
  assert.match(st.notes, /^Fire Breath \(Recharge 5–6\): /m);
  const old = st.notes.replace(/^Fire Breath \(Recharge 5–6\):/m, 'Fire Breath:');
  fs.writeFileSync(path.join(dir, 'monsters.json'), JSON.stringify([
    { id: 'drg1', name: 'Adult Red Dragon', notes: old },
    { id: 'drg2', name: 'adult red dragon', notes: old + '\nMy own note.' }, // edited: kept
  ]));
  const out = JSON.parse(run(dir, `
    const s = require('./src/features/monsters/service');
    require('./src/core/jsonStore').flushAllStores();
    process.stdout.write(JSON.stringify(s.all()));
  `));
  assert.strictEqual(out.find((m) => m.id === 'drg1').notes, st.notes);
  assert.match(out.find((m) => m.id === 'drg2').notes, /My own note\.$/);
  assert.doesNotMatch(out.find((m) => m.id === 'drg2').notes, /Recharge/);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'monsters.json'), 'utf8'));
  assert.strictEqual(saved.find((m) => m.id === 'drg1').notes, st.notes, 'saved to disk');
});

test('SRD monsters saved with the 2014-baseline names are renamed to the 2024 baseline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-persist-'));
  fs.writeFileSync(path.join(dir, 'monsters.json'), JSON.stringify([
    { id: 'w14', name: 'Wolf', edition: '2014', notes: '' },
    { id: 'w24', name: 'Wolf (2024)', edition: '2024', notes: '' },
    { id: 'kob', name: 'Kobold', edition: '2014', notes: '' }, // 2014-only: stays plain
    { id: 'my', name: 'Wolf (2024)', edition: '', notes: '' }, // custom: untouched
  ]));
  const out = JSON.parse(run(dir, `
    const s = require('./src/features/monsters/service');
    require('./src/core/jsonStore').flushAllStores();
    process.stdout.write(JSON.stringify(s.all()));
  `));
  const name = (id) => out.find((m) => m.id === id).name;
  assert.deepStrictEqual([name('w14'), name('w24'), name('kob'), name('my')], ['Wolf (2014)', 'Wolf', 'Kobold', 'Wolf (2024)']);
});
