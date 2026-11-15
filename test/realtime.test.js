const test = require('node:test');
const assert = require('node:assert');
const { startServer, connect } = require('./helpers');

test('new client receives both slices on connect', async () => {
  const s = await startServer();
  const c = connect(s.port);
  await c.opened;
  const st = await c.next('state');
  const cs = await c.next('charState');
  assert.deepStrictEqual(st.state.combatants, []);
  assert.strictEqual(st.state.round, 1);
  assert.deepStrictEqual(cs.characters, []);
  c.close();
  await s.close();
});

test('combat: add, sort, adjust HP, conditions, next turn; broadcast to all clients', async () => {
  const s = await startServer();
  const a = connect(s.port);
  const b = connect(s.port);
  await Promise.all([a.opened, b.opened]);
  await a.next('state'); await b.next('state');

  a.send('addCombatant', { name: 'Goblin', init: 12, ac: 15, hp: 7, maxHp: 7, type: 'monster' });
  a.send('addCombatant', { name: 'Elf', init: 18, ac: 14, hp: 20, maxHp: 20, type: 'pc' });
  const last = await b.next('state', (m) => m.state.combatants.length === 2);
  assert.deepStrictEqual(last.state.combatants.map((c) => c.name), ['Elf', 'Goblin']);

  const elf = last.state.combatants[0];
  a.send('adjustHP', { id: elf.id, delta: -25 });
  const hurt = await b.next('state', (m) => m.state.combatants[0].hp === 0);
  assert.strictEqual(hurt.state.combatants[0].hp, 0);

  a.send('addCondition', { id: elf.id, condition: 'Prone' });
  const cond = await b.next('state', (m) => m.state.combatants[0].conditions.includes('Prone'));
  assert.ok(cond);

  // Goblin was active when Elf was added (the active combatant is tracked
  // through re-sorting), so the next turn wraps to Elf and starts round 2.
  a.send('nextTurn');
  const turn = await b.next('state', (m) => m.state.round === 2);
  assert.strictEqual(turn.state.activeIndex, 0);

  a.send('clearAll');
  const cleared = await b.next('state', (m) => m.state.combatants.length === 0);
  assert.strictEqual(cleared.state.round, 1);
  a.close(); b.close();
  await s.close();
});

test('bad input is ignored, server stays up', async () => {
  const s = await startServer();
  const c = connect(s.port);
  await c.opened;
  c.ws.send('not json');
  c.ws.send('42');
  c.ws.send('null');
  c.send('doesNotExist', {});
  c.send('addCombatant', { name: '', init: 'x' });
  c.send('addCombatant', { name: 'Still works', init: 5 });
  const st = await c.next('state', (m) => m.state.combatants.length === 1);
  assert.strictEqual(st.state.combatants[0].name, 'Still works');
  c.close();
  await s.close();
});

test('characters: add, update (sanitized), add to combat with initiative, delete', async (t) => {
  const s = await startServer();
  const c = connect(s.port);
  t.after(async () => { c.close(); await s.close(); });
  await c.opened;
  await c.next('state');
  await c.next('charState');
  c.send('addCharacter', { id: 'abc' });
  await c.next('charState', (m) => m.characters.length === 1);

  c.send('updateCharacter', { id: 'abc', patch: { name: 'Thorin', hpMax: 30, hpCurrent: 25, abilities: { dex: 14 }, level: 999, bogus: 1 } });
  const upd = await c.next('charState', (m) => m.characters[0].name === 'Thorin');
  const ch = upd.characters[0];
  assert.strictEqual(ch.abilities.dex, 14);
  assert.ok(ch.level <= 20, 'level clamped');
  assert.strictEqual(ch.bogus, undefined);

  c.send('addCharacterToCombat', { characterId: 'abc', init: 17 });
  c.send('addCharacterToCombat', { characterId: 'abc', init: 3 }); // already in combat: ignored
  c.send('addCharacterToCombat', { characterId: 'missing' }); // ignored
  const combat = await c.next('state', (m) => m.state.combatants.length === 1);
  const pc = combat.state.combatants[0];
  assert.strictEqual(pc.name, 'Thorin');
  assert.strictEqual(pc.init, 17);
  assert.strictEqual(pc.hp, 25);
  assert.strictEqual(pc.maxHp, 30);
  assert.strictEqual(pc.type, 'pc');
  assert.strictEqual(pc.characterId, 'abc');

  // No roll given: the server rolls d20 + DEX mod (+2 for DEX 14).
  c.send('addCharacter', { id: 'def' });
  c.send('updateCharacter', { id: 'def', patch: { name: 'Lyra', abilities: { dex: 14 } } });
  c.send('addCharacterToCombat', { characterId: 'def' });
  const rolled = await c.next('state', (m) => m.state.combatants.length === 2);
  const lyra = rolled.state.combatants.find((x) => x.characterId === 'def');
  assert.ok(lyra.init >= 3 && lyra.init <= 22, `rolled ${lyra.init}`);

  // Editing initiative re-sorts; bad values are ignored.
  c.send('setInitiative', { id: lyra.id, init: 30 });
  const sorted = await c.next('state', (m) => m.state.combatants[0]?.init === 30);
  assert.strictEqual(sorted.state.combatants[0].id, lyra.id);
  c.send('setInitiative', { id: lyra.id, init: 'abc' });
  c.send('setInitiative', { id: lyra.id, init: 1 });
  const resorted = await c.next('state', (m) => m.state.combatants[1]?.init === 1);
  assert.strictEqual(resorted.state.combatants[0].id, pc.id);
  c.send('deleteCharacter', { id: 'def' });

  c.send('deleteCharacter', { id: 'abc' });
  await c.next('charState', (m) => m.characters.length === 0);
});
