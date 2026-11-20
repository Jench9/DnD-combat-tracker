const test = require('node:test');
const assert = require('node:assert');
const { startServer, connect } = require('./helpers');

// DM sets up: two characters, a goblin (visible) and an ogre (hidden).
async function table(t) {
  const s = await startServer();
  const dm = connect(s.port);
  const lyra = connect(s.port, 'role=player&character=lyra');
  const guest = connect(s.port, ''); // no identity: player without a character
  t.after(async () => { dm.close(); lyra.close(); guest.close(); await s.close(); });
  await Promise.all([dm.opened, lyra.opened, guest.opened]);

  dm.send('addCharacter', { id: 'lyra' });
  dm.send('addCharacter', { id: 'brann' });
  dm.send('updateCharacter', { id: 'lyra', patch: { name: 'Lyra', hpMax: 20, hpCurrent: 20 } });
  dm.send('updateCharacter', { id: 'brann', patch: { name: 'Brann', hpMax: 30, hpCurrent: 30 } });
  dm.send('addMonster', { id: 'gob', patch: { name: 'Goblin', ac: 15, hpMax: 8, icon: 'data:image/png;base64,AAAA', notes: 'secret' } });
  dm.send('addMonster', { id: 'ogre', patch: { name: 'Ogre', ac: 11, hpMax: 59, icon: 'data:image/png;base64,BBBB' } });
  await dm.next('monsterState', (m) => m.monsters.length === 2);
  dm.send('addCharacterToCombat', { characterId: 'lyra', init: 15 });
  dm.send('addCharacterToCombat', { characterId: 'brann', init: 12 });
  dm.send('addMonsterToCombat', { monsterId: 'gob', init: 20 });
  dm.send('addMonsterToCombat', { monsterId: 'ogre', init: 18, hidden: true });
  const st = await dm.next('state', (m) => m.state.combatants.length === 4);
  const by = (name) => st.state.combatants.find((c) => c.name === name);
  return { dm, lyra, guest, ids: { lyra: by('Lyra').id, brann: by('Brann').id, gob: by('Goblin').id, ogre: by('Ogre').id } };
}

const lastOf = async (client, type, pred = () => true) => client.next(type, pred);

// The newest frame of `type` once things settle (drains older queued ones).
async function latest(client, type) {
  await new Promise((r) => setTimeout(r, 120));
  let last;
  try {
    for (;;) last = await client.next(type, () => true, 40);
  } catch { /* queue drained */ }
  return last;
}

test('players get a filtered view: no hidden combatants, no monster HP/AC/notes, aliases', async (t) => {
  const { dm, lyra, ids } = await table(t);

  const view = await lastOf(lyra, 'state', (m) => m.state.combatants.length === 3);
  const names = view.state.combatants.map((c) => c.name);
  assert.deepStrictEqual(names, ['Goblin', 'Lyra', 'Brann'], 'hidden ogre missing');
  const gob = view.state.combatants[0];
  assert.strictEqual(gob.health, 'Unhurt');
  for (const k of ['hp', 'maxHp', 'ac', 'hidden', 'alias', 'dmNotes']) assert.ok(!(k in gob), `goblin leaks ${k}`);
  const me = view.state.combatants.find((c) => c.characterId === 'lyra');
  assert.strictEqual(me.hp, 20, 'PCs keep their HP');
  assert.ok(!JSON.stringify(view).includes('secret'));

  // Monster library: players only get icons of visible monsters.
  const mons = await lastOf(lyra, 'monsterState', (m) => m.monsters.length === 1);
  assert.deepStrictEqual(mons.monsters, [{ id: 'gob', icon: 'data:image/png;base64,AAAA' }]);

  // Damage → health word; alias replaces the name and drops the icon link.
  dm.send('adjustHP', { id: ids.gob, delta: -5 });
  await lastOf(lyra, 'state', (m) => m.state.combatants[0]?.health === 'Bloodied');
  dm.send('setCombatantDm', { id: ids.gob, alias: 'Small shape', dmNotes: 'actually a goblin' });
  const disguised = await lastOf(lyra, 'state', (m) => m.state.combatants[0]?.name === 'Small shape');
  assert.strictEqual(disguised.state.combatants[0].monsterId, '');
  assert.ok(!JSON.stringify(disguised).includes('actually a goblin'));
  await lastOf(lyra, 'monsterState', (m) => m.monsters.length === 0);

  // The DM still sees everything.
  const full = await lastOf(dm, 'state', (m) => m.state.combatants.find((c) => c.id === ids.gob)?.alias === 'Small shape');
  const dmGob = full.state.combatants.find((c) => c.id === ids.gob);
  assert.deepStrictEqual([dmGob.name, dmGob.hp, dmGob.ac, dmGob.dmNotes], ['Goblin', 3, 15, 'actually a goblin']);
  assert.strictEqual(full.state.combatants.length, 4);

  // Revealing the ogre shows it to players.
  dm.send('setCombatantDm', { id: ids.ogre, hidden: false });
  await lastOf(lyra, 'state', (m) => m.state.combatants.some((c) => c.name === 'Ogre'));
});

test('active turn of a hidden combatant shows as -1 to players', async (t) => {
  const { dm, lyra, ids } = await table(t);
  let cur = await latest(dm, 'state');
  for (let i = 0; i < 4 && cur.state.combatants[cur.state.activeIndex].id !== ids.ogre; i++) {
    dm.send('nextTurn');
    cur = await latest(dm, 'state');
  }
  assert.strictEqual(cur.state.combatants[cur.state.activeIndex].id, ids.ogre);
  const v = await latest(lyra, 'state');
  assert.strictEqual(v.state.activeIndex, -1);
  assert.strictEqual(v.state.combatants.length, 3);
});

test('players control only their own character', async (t) => {  const { dm, lyra, guest, ids } = await table(t);
  const dmHp = async (id, hp) => lastOf(dm, 'state', (m) => m.state.combatants.find((c) => c.id === id)?.hp === hp);

  // Not allowed: other PCs, monsters, DM tools.
  lyra.send('adjustHP', { id: ids.brann, delta: -10 });
  lyra.send('adjustHP', { id: ids.gob, delta: -8 });
  lyra.send('removeCombatant', { id: ids.gob });
  lyra.send('setCombatantDm', { id: ids.ogre, hidden: false });
  lyra.send('addMonsterToCombat', { monsterId: 'gob' });
  lyra.send('clearAll');
  lyra.send('updateCharacter', { id: 'brann', patch: { name: 'Hacked' } });
  lyra.send('addCampaign', { id: 'c1', name: 'x' });
  lyra.send('updateMonster', { id: 'gob', patch: { ac: 1 } });
  guest.send('adjustHP', { id: ids.lyra, delta: -10 });
  // Allowed: her own combatant and sheet.
  lyra.send('adjustHP', { id: ids.lyra, delta: -4 });
  lyra.send('updateCharacter', { id: 'lyra', patch: { name: 'Lyra the Bold' } });

  const st = await dmHp(ids.lyra, 16);
  const by = (id) => st.state.combatants.find((c) => c.id === id);
  assert.strictEqual(st.state.combatants.length, 4);
  assert.strictEqual(by(ids.brann).hp, 30);
  assert.strictEqual(by(ids.gob).hp, 8);
  assert.strictEqual(by(ids.ogre).hidden, true);
  const chars = await lastOf(dm, 'charState', (m) => m.characters.some((c) => c.name === 'Lyra the Bold'));
  assert.strictEqual(chars.characters.find((c) => c.id === 'brann').name, 'Brann');

  // Map: only her own token.
  lyra.send('placeToken', { id: ids.brann, x: 1, y: 1 });
  lyra.send('placeToken', { id: ids.lyra, x: 2, y: 2 });
  const map = await lastOf(dm, 'mapState', (m) => m.map.positions[ids.lyra]);
  assert.strictEqual(map.map.positions[ids.brann], undefined);
  lyra.send('setMapSize', { cols: 5, rows: 5 });
  dm.send('placeToken', { id: ids.ogre, x: 3, y: 3 }); // hidden token: DM only
  const m2 = await lastOf(dm, 'mapState', (m) => m.map.positions[ids.ogre]);
  assert.strictEqual(m2.map.cols, 20);
  const pm = await lastOf(lyra, 'mapState', (m) => m.map.positions[ids.lyra]);
  assert.strictEqual(pm.map.positions[ids.ogre], undefined, 'hidden token not sent to players');
});

test('a player can end only their own turn', async (t) => {
  const { dm, lyra } = await table(t);
  const activeChar = (st) => st.state.combatants[st.state.activeIndex].characterId;
  let cur = await latest(dm, 'state');
  if (activeChar(cur) === 'lyra') { dm.send('nextTurn'); cur = await latest(dm, 'state'); }

  lyra.send('nextTurn'); // not her turn: ignored
  const same = await latest(dm, 'state');
  assert.strictEqual((same || cur).state.activeIndex, cur.state.activeIndex);

  for (let i = 0; i < 4 && activeChar(cur) !== 'lyra'; i++) {
    dm.send('nextTurn');
    cur = await latest(dm, 'state');
  }
  assert.strictEqual(activeChar(cur), 'lyra');
  lyra.send('nextTurn');
  const after = await latest(dm, 'state');
  assert.notStrictEqual(activeChar(after), 'lyra');
});

test('duplicateCharacter: DM only; a full copy under a new id, unlinked from D&D Beyond', async () => {
  const srv = await startServer();
  const dm = connect(srv.port);
  const player = connect(srv.port, 'role=player&character=orig');
  try {
    await dm.opened;
    await player.opened;
    dm.send('addCharacter', { id: 'orig' });
    dm.send('updateCharacter', { id: 'orig', patch: { name: 'Bruna', level: 3, ddbId: '123', resources: [{ id: 'r1', name: 'Rage', max: 3, used: 1, recharge: 'long' }] } });
    await dm.next('charState', (m) => m.characters.find((c) => c.id === 'orig')?.ddbId === '123');

    player.send('duplicateCharacter', { id: 'orig', newId: 'byplayer' }); // refused
    dm.send('duplicateCharacter', { id: 'orig', newId: 'copy1' });
    const m = await dm.next('charState', (s) => s.characters.some((c) => c.id === 'copy1'));
    assert.ok(!m.characters.some((c) => c.id === 'byplayer'));
    const copy = m.characters.find((c) => c.id === 'copy1');
    assert.strictEqual(copy.name, 'Copy of Bruna');
    assert.strictEqual(copy.ddbId, '');
    assert.strictEqual(copy.level, 3);
    assert.strictEqual(copy.resources[0].used, 1);
    assert.strictEqual(m.characters.find((c) => c.id === 'orig').ddbId, '123');
    assert.ok(m.characters.findIndex((c) => c.id === 'copy1') < m.characters.findIndex((c) => c.id === 'orig'), 'placed next to it');

    dm.send('duplicateCharacter', { id: 'orig', newId: 'copy1' }); // id taken: ignored
    dm.send('duplicateCharacter', { id: 'orig', newId: 'copy2' });
    const m2 = await dm.next('charState', (s) => s.characters.some((c) => c.id === 'copy2'));
    assert.strictEqual(m2.characters.filter((c) => c.id === 'copy1').length, 1);
  } finally {
    dm.close();
    player.close();
    await srv.close();
  }
});
