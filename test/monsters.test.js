const test = require('node:test');
const assert = require('node:assert');
const { startServer, connect } = require('./helpers');

test('monsters: library add/update (sanitized)/delete', async (t) => {
  const s = await startServer();
  const c = connect(s.port);
  t.after(async () => { c.close(); await s.close(); });
  await c.opened;
  await c.next('monsterState');

  c.send('addMonster', { id: 'gob', patch: { name: 'Goblin', ac: 15, hpMax: 7, initBonus: 2 } });
  c.send('addMonster', { id: 'gob', patch: { name: 'Dup' } }); // ignored
  c.send('addMonster', { id: 'BAD!', patch: { name: 'x' } }); // ignored
  const added = await c.next('monsterState', (m) => m.monsters.length === 1);
  assert.deepStrictEqual(added.monsters[0], { id: 'gob', name: 'Goblin', ac: 15, hpMax: 7, initBonus: 2, icon: '', notes: '' });

  c.send('updateMonster', { id: 'gob', patch: { ac: 99, hpMax: 0, initBonus: 'x', icon: 'javascript:alert(1)', bogus: 1 } });
  const upd = await c.next('monsterState', (m) => m.monsters[0]?.ac === 40);
  const g = upd.monsters[0];
  assert.strictEqual(g.hpMax, 1);
  assert.strictEqual(g.initBonus, 2, 'bad value keeps the old one');
  assert.strictEqual(g.icon, '');
  assert.strictEqual(g.bogus, undefined);

  c.send('updateMonster', { id: 'gob', patch: { icon: 'data:image/png;base64,AAAA' } });
  await c.next('monsterState', (m) => m.monsters[0]?.icon === 'data:image/png;base64,AAAA');

  c.send('deleteMonster', { id: 'gob' });
  await c.next('monsterState', (m) => m.monsters.length === 0);
});

test('monsters: add to combat with count, numbering and initiative', async (t) => {
  const s = await startServer();
  const c = connect(s.port);
  t.after(async () => { c.close(); await s.close(); });
  await c.opened;
  c.send('addMonster', { id: 'gob', patch: { name: 'Goblin', ac: 15, hpMax: 7, initBonus: 2 } });
  c.send('addMonster', { id: 'ogre', patch: { name: 'Ogre', ac: 11, hpMax: 59, initBonus: -1 } });
  await c.next('monsterState', (m) => m.monsters.length === 2);

  c.send('addMonsterToCombat', { monsterId: 'ogre', init: 9 });
  const one = await c.next('state', (m) => m.state.combatants.length === 1);
  assert.deepStrictEqual(
    (({ name, init, ac, hp, maxHp, type, monsterId }) => ({ name, init, ac, hp, maxHp, type, monsterId }))(one.state.combatants[0]),
    { name: 'Ogre', init: 9, ac: 11, hp: 59, maxHp: 59, type: 'monster', monsterId: 'ogre' },
  );

  c.send('addMonsterToCombat', { monsterId: 'gob', count: 3 });
  const three = await c.next('state', (m) => m.state.combatants.length === 4);
  const gobs = three.state.combatants.filter((x) => x.monsterId === 'gob');
  assert.deepStrictEqual(gobs.map((x) => x.name).sort(), ['Goblin 1', 'Goblin 2', 'Goblin 3']);
  gobs.forEach((x) => assert.ok(x.init >= 3 && x.init <= 22, `rolled ${x.init}`));

  // More later continue the numbering; count is clamped; unknown ids ignored.
  c.send('addMonsterToCombat', { monsterId: 'nope', count: 5 });
  c.send('addMonsterToCombat', { monsterId: 'gob', count: 999 });
  const many = await c.next('state', (m) => m.state.combatants.length === 24);
  const names = many.state.combatants.filter((x) => x.monsterId === 'gob').map((x) => x.name);
  assert.ok(names.includes('Goblin 4') && names.includes('Goblin 23'));
});

test('monsters: starter set is added once, keeping existing ones', async (t) => {
  const s = await startServer();
  const c = connect(s.port);
  t.after(async () => { c.close(); await s.close(); });
  await c.opened;
  const { STARTER_MONSTERS } = require('../src/features/monsters/starter');
  const start = (await c.next('monsterState')).monsters.length; // earlier tests in this file left some

  c.send('addMonster', { id: 'mygob', patch: { name: 'goblin', ac: 99 } }); // already have a goblin
  const before = await c.next('monsterState', (m) => m.monsters.some((x) => x.id === 'mygob'));
  const have = new Set(before.monsters.map((x) => x.name.toLowerCase()));
  const expectedNew = STARTER_MONSTERS.filter((x) => !have.has(x.name.toLowerCase())).length;
  assert.ok(expectedNew < STARTER_MONSTERS.length);

  c.send('addStarterMonsters');
  const after = await c.next('monsterState', (m) => m.monsters.length > start + 1);
  assert.strictEqual(after.monsters.length, before.monsters.length + expectedNew, 'existing names skipped');
  const goblins = (m) => m.monsters.filter((x) => x.name.toLowerCase() === 'goblin').length;
  assert.strictEqual(goblins(after), goblins(before), 'no new goblin');
  const ogre = after.monsters.find((x) => x.name === 'Ogre');
  assert.deepStrictEqual([ogre.ac, ogre.hpMax, ogre.initBonus], [11, 59, -1]);
  assert.strictEqual(after.monsters[0].name, 'Kobold', 'CR order at the top');

  // Full stat blocks in the notes.
  const gob = after.monsters.find((x) => x.name === 'Kobold');
  assert.match(gob.notes, /^CR 1\/8 · Small humanoid\n/);
  assert.match(gob.notes, /Dagger: \+4, reach 5 ft, 1d4\+2 piercing\./);

  c.send('addStarterMonsters'); // nothing new
  c.send('addMonster', { id: 'marker', patch: { name: 'Marker' } });
  const again = await c.next('monsterState', (m) => m.monsters.some((x) => x.id === 'marker'));
  assert.strictEqual(again.monsters.length, after.monsters.length + 1);
});

test('monsters: starter button upgrades old one-line notes, keeps edited notes', async (t) => {
  const s = await startServer();
  const c = connect(s.port);
  t.after(async () => { c.close(); await s.close(); });
  await c.opened;
  await c.next('monsterState');
  // Libraries from the first version have the one-line summary as notes.
  c.send('addMonster', { id: 'oldwolf', patch: { name: 'Dire Wolf', notes: 'CR 1 · Large beast' } });
  c.send('addMonster', { id: 'mytroll', patch: { name: 'Troll', notes: 'my own notes' } });
  const before = await c.next('monsterState', (m) => m.monsters.some((x) => x.id === 'mytroll'));
  const wolves = (x) => x.monsters.filter((y) => y.name === 'Dire Wolf').length;

  c.send('addStarterMonsters');
  const m = await c.next('monsterState', (x) => /Pack Tactics/.test(x.monsters.find((y) => y.id === 'oldwolf')?.notes || ''));
  assert.strictEqual(m.monsters.find((x) => x.id === 'mytroll').notes, 'my own notes');
  assert.strictEqual(wolves(m), wolves(before), 'no extra Dire Wolf added');
});
