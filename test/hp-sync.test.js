const test = require('node:test');
const assert = require('node:assert');
const { startServer, connect } = require('./helpers');

async function setup(t) {
  const s = await startServer();
  const dm = connect(s.port);
  t.after(async () => { dm.close(); await s.close(); });
  await dm.opened;
  dm.send('addCharacter', { id: 'hpsync' });
  dm.send('updateCharacter', { id: 'hpsync', patch: { name: 'Mira', hpMax: 20, hpCurrent: 20 } });
  dm.send('addCharacterToCombat', { characterId: 'hpsync', init: 10 });
  const st = await dm.next('state', (m) => m.state.combatants.some((c) => c.characterId === 'hpsync'));
  const id = st.state.combatants.find((c) => c.characterId === 'hpsync').id;
  return { dm, id, port: s.port };
}

const sheet = (msg) => msg.characters.find((c) => c.id === 'hpsync');
const pc = (msg) => msg.state.combatants.find((c) => c.characterId === 'hpsync');

test('damage and healing in combat are saved on the character sheet', async (t) => {
  const { dm, id } = await setup(t);
  dm.send('adjustHP', { id, delta: -7 });
  await dm.next('charState', (m) => sheet(m)?.hpCurrent === 13);
  dm.send('adjustHP', { id, delta: 100 }); // clamped to max
  await dm.next('charState', (m) => sheet(m)?.hpCurrent === 20);
});

test('HP edited on the sheet updates the combatant', async (t) => {
  const { dm } = await setup(t);
  dm.send('updateCharacter', { id: 'hpsync', patch: { hpCurrent: 5 } });
  await dm.next('state', (m) => pc(m)?.hp === 5);
  dm.send('updateCharacter', { id: 'hpsync', patch: { hpMax: 30 } }); // level-up
  await dm.next('state', (m) => pc(m)?.maxHp === 30 && pc(m)?.hp === 5);
});

test('healing from 0 on the sheet clears death saves', async (t) => {
  const { dm, id } = await setup(t);
  dm.send('adjustHP', { id, delta: -20 });
  dm.send('toggleDeathSave', { id, kind: 'fail', index: 0 });
  await dm.next('state', (m) => pc(m)?.hp === 0 && pc(m)?.deathFail === 1);
  dm.send('updateCharacter', { id: 'hpsync', patch: { hpCurrent: 4 } });
  await dm.next('state', (m) => pc(m)?.hp === 4 && pc(m)?.deathFail === 0);
});

test('monster HP changes do not resend the characters slice', async (t) => {
  const { dm } = await setup(t);
  dm.send('addCombatant', { name: 'Rat', init: 5, hp: 4, type: 'monster' });
  const st = await dm.next('state', (m) => m.state.combatants.some((c) => c.name === 'Rat'));
  const rat = st.state.combatants.find((c) => c.name === 'Rat');
  await new Promise((r) => setTimeout(r, 100));
  while (await dm.next('charState', () => true, 30).catch(() => null)); // drain
  dm.send('adjustHP', { id: rat.id, delta: -1 });
  await dm.next('state', (m) => m.state.combatants.find((c) => c.id === rat.id)?.hp === 3);
  await assert.rejects(dm.next('charState', () => true, 150));
});

test('temporary HP absorb damage first, are not healed, and sync with the sheet', async (t) => {
  const { dm, id } = await setup(t);
  dm.send('setTempHp', { id, value: 5 });
  await dm.next('charState', (m) => sheet(m)?.hpTemp === 5);
  dm.send('adjustHP', { id, delta: -3 }); // all absorbed
  await dm.next('state', (m) => pc(m)?.tempHp === 2 && pc(m)?.hp === 20);
  dm.send('adjustHP', { id, delta: -6 }); // 2 absorbed, 4 through
  await dm.next('state', (m) => pc(m)?.tempHp === 0 && pc(m)?.hp === 16);
  await dm.next('charState', (m) => sheet(m)?.hpTemp === 0 && sheet(m)?.hpCurrent === 16);
  dm.send('adjustHP', { id, delta: 10 }); // healing doesn't bring temp HP back
  await dm.next('state', (m) => pc(m)?.tempHp === 0 && pc(m)?.hp === 20);
  dm.send('updateCharacter', { id: 'hpsync', patch: { hpTemp: 8 } }); // set on the sheet
  await dm.next('state', (m) => pc(m)?.tempHp === 8);
});

test('players see PC temp HP but not a monster\'s', async (t) => {
  const { dm, id, port } = await setup(t);
  dm.send('addCombatant', { name: 'Bugbear', init: 3, hp: 27, type: 'monster' });
  const st = await dm.next('state', (m) => m.state.combatants.some((c) => c.name === 'Bugbear'));
  const bug = st.state.combatants.find((c) => c.name === 'Bugbear');
  dm.send('setTempHp', { id: bug.id, value: 10 });
  dm.send('setTempHp', { id, value: 4 });
  await dm.next('state', (m) => pc(m)?.tempHp === 4 && m.state.combatants.find((c) => c.id === bug.id)?.tempHp === 10);

  const player = connect(port, 'role=player&character=hpsync');
  t.after(() => player.close());
  const view = await player.next('state', (m) => pc(m)?.tempHp === 4);
  assert.ok(!('tempHp' in view.state.combatants.find((c) => c.id === bug.id)), 'monster temp HP leaked');

  // A player may set temp HP on their own PC only.
  player.send('setTempHp', { id: bug.id, value: 0 });
  player.send('setTempHp', { id, value: 7 });
  await dm.next('state', (m) => pc(m)?.tempHp === 7);
  assert.strictEqual(svcBug(), 10);
  function svcBug() { return require('../src/features/combat/service').findCombatant(bug.id).tempHp; }
});
