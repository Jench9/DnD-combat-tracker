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
