const test = require('node:test');
const assert = require('node:assert');
const { startServer, connect } = require('./helpers');

// DM + Lyra's player; Lyra and Brann (PCs), a goblin and a hidden ogre.
async function table(t) {
  const s = await startServer();
  const dm = connect(s.port);
  const lyra = connect(s.port, 'role=player&character=lyra');
  t.after(async () => { dm.close(); lyra.close(); await s.close(); });
  await Promise.all([dm.opened, lyra.opened]);
  dm.send('addCharacter', { id: 'lyra' });
  dm.send('addCharacter', { id: 'brann' });
  dm.send('updateCharacter', { id: 'lyra', patch: { name: 'Lyra', hpMax: 20, hpCurrent: 20 } });
  dm.send('updateCharacter', { id: 'brann', patch: { name: 'Brann', hpMax: 30, hpCurrent: 30 } });
  dm.send('addCharacterToCombat', { characterId: 'lyra', init: 15 });
  dm.send('addCharacterToCombat', { characterId: 'brann', init: 12 });
  dm.send('addCombatant', { name: 'Goblin', init: 20, ac: 15, hp: 7, type: 'monster' });
  dm.send('addCombatant', { name: 'Ogre', init: 18, ac: 11, hp: 59, type: 'monster' });
  let st = await dm.next('state', (m) => m.state.combatants.length === 4);
  const by = (n) => st.state.combatants.find((c) => c.name === n).id;
  const ids = { lyra: by('Lyra'), brann: by('Brann'), gob: by('Goblin'), ogre: by('Ogre') };
  dm.send('setCombatantDm', { id: ids.ogre, hidden: true });
  st = await dm.next('state', (m) => m.state.combatants.find((c) => c.id === ids.ogre)?.hidden);
  return { dm, lyra, ids };
}

// Older frames may not have everyone yet: a missing combatant reads as empty.
const NONE = { effects: [], conditions: [], missing: true };
// The newest frame of `type` once things settle (drains older queued ones).
async function latest(client, type = 'state') {
  await new Promise((r) => setTimeout(r, 120));
  let last;
  try {
    for (;;) last = await client.next(type, () => true, 40);
  } catch { /* queue drained */ }
  return last;
}

const find = (m, id) => m.state.combatants.find((c) => c.id === id) || NONE;

test('concentration: targets get the effect; it ends with the caster\'s concentration', async (t) => {
  const { dm, lyra, ids } = await table(t);
  // Lyra's player casts Bless on herself, Brann and (trying) the hidden ogre.
  lyra.send('setConcentration', { id: ids.lyra, spell: 'Bless', targets: [ids.lyra, ids.brann, ids.ogre, 'nobody'] });
  let m = await latest(dm);
  assert.deepStrictEqual(find(m, ids.brann).effects.map((e) => [e.name, e.casterId, e.concentration]), [['Bless', ids.lyra, true]]);
  assert.strictEqual(find(m, ids.lyra).effects.length, 1);
  assert.strictEqual(find(m, ids.ogre).effects.length, 0, 'players can\'t target what they can\'t see');

  // A player can't concentrate for someone else's combatant.
  lyra.send('setConcentration', { id: ids.brann, spell: 'Haste', targets: [] });
  // Damage → CON save DC max(10, half the damage).
  dm.send('adjustHP', { id: ids.lyra, delta: -4 });
  m = await latest(dm);
  assert.strictEqual(find(m, ids.brann).concentration, '');
  assert.strictEqual(find(m, ids.lyra).concentrationDc, 10);
  dm.send('adjustHP', { id: ids.lyra, delta: -1 }); // heal back up later; 24 damage → DC 12
  dm.send('adjustHP', { id: ids.lyra, delta: 5 });
  dm.send('setTempHp', { id: ids.lyra, value: 30 });
  dm.send('adjustHP', { id: ids.lyra, delta: -24 }); // all absorbed by temp HP: still a save
  m = await latest(dm);
  assert.strictEqual(find(m, ids.lyra).concentrationDc, 12);
  lyra.send('resolveConcentration', { id: ids.lyra, passed: true });
  m = await latest(dm);
  assert.strictEqual(find(m, ids.lyra).concentrationDc, 0);
  assert.strictEqual(find(m, ids.lyra).concentration, 'Bless');

  // A new concentration spell replaces the old one and its effects.
  lyra.send('setConcentration', { id: ids.lyra, spell: 'Hold Person', targets: [ids.gob] });
  m = await latest(dm);
  assert.strictEqual(find(m, ids.brann).effects.length, 0);
  assert.deepStrictEqual(find(m, ids.gob).effects.map((e) => e.name), ['Hold Person']);

  // Dropping to 0 HP ends it.
  dm.send('adjustHP', { id: ids.lyra, delta: -60 });
  m = await latest(dm);
  assert.strictEqual(find(m, ids.lyra).concentration, '');
  assert.strictEqual(find(m, ids.gob).effects.length, 0);
});

test('concentration: incapacitating conditions, failed saves and removal end it', async (t) => {
  const { dm, ids } = await table(t);
  dm.send('setConcentration', { id: ids.ogre, spell: 'Hex', targets: [ids.brann] });
  let m = await latest(dm);
  dm.send('addCondition', { id: ids.ogre, condition: 'Stunned' });
  m = await latest(dm);
  assert.strictEqual(find(m, ids.ogre).concentration, '');
  assert.strictEqual(find(m, ids.brann).effects.length, 0);

  dm.send('setConcentration', { id: ids.gob, spell: 'Bane', targets: [ids.brann] });
  dm.send('adjustHP', { id: ids.gob, delta: -2 });
  m = await latest(dm);
  assert.strictEqual(find(m, ids.gob).concentrationDc, 10);
  dm.send('resolveConcentration', { id: ids.gob, passed: false });
  m = await latest(dm);
  assert.strictEqual(find(m, ids.brann).effects.length, 0);

  dm.send('setConcentration', { id: ids.gob, spell: 'Bane', targets: [ids.brann] });
  await latest(dm);
  dm.send('removeCombatant', { id: ids.gob });
  m = await latest(dm);
  assert.strictEqual(find(m, ids.brann).effects.length, 0);
});

test('effects: added by hand or by a caster; players see a hidden caster as unknown', async (t) => {
  const { dm, lyra, ids } = await table(t);
  dm.send('setConcentration', { id: ids.ogre, spell: 'Faerie Fire', targets: [ids.lyra] });
  const pm = await latest(lyra);
  assert.strictEqual(find(pm, ids.lyra).effects[0].casterId, '', 'the hidden ogre is not revealed');

  // Lyra casts Mage Armor on Brann (not hers, but she's the caster)…
  lyra.send('addEffect', { id: ids.brann, name: 'Mage Armor', casterId: ids.lyra });
  let m = await latest(dm);
  const effect = find(m, ids.brann).effects[0];
  assert.deepStrictEqual([effect.name, effect.casterId, effect.concentration], ['Mage Armor', ids.lyra, false]);
  // …but can't put one on the goblin in Brann's name, nor remove the DM's one with a fake casterId.
  lyra.send('addEffect', { id: ids.gob, name: 'Bane', casterId: ids.brann });
  dm.send('addEffect', { id: ids.gob, name: 'Slow' });
  m = await latest(dm);
  lyra.send('removeEffect', { id: ids.gob, effectId: find(m, ids.gob).effects[0].id, casterId: ids.lyra });
  // Lyra may remove the one she cast.
  lyra.send('removeEffect', { id: ids.brann, effectId: effect.id });
  m = await latest(dm);
  assert.deepStrictEqual(find(m, ids.gob).effects.map((e) => e.name), ['Slow']);
});
