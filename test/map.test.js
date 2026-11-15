const test = require('node:test');
const assert = require('node:assert');
const { startServer, connect } = require('./helpers');

async function setup(t) {
  const s = await startServer();
  const c = connect(s.port);
  t.after(async () => { c.close(); await s.close(); });
  await c.opened;
  const first = await c.next('mapState');
  c.send('addCombatant', { name: 'Elf', init: 18, ac: 14, hp: 20, type: 'pc' });
  c.send('addCombatant', { name: 'Goblin', init: 12, ac: 15, hp: 7, type: 'monster' });
  const st = await c.next('state', (m) => m.state.combatants.length === 2);
  const [elf, gob] = st.state.combatants;
  return { c, first, elf, gob };
}

const pos = (m, id) => m.map.positions[id];

test('map: sent on connect, place, move, reject bad moves, remove', async (t) => {
  const { c, first, elf, gob } = await setup(t);
  assert.deepStrictEqual(first.map, { cols: 20, rows: 15, positions: {} });

  c.send('placeToken', { id: elf.id, x: 2, y: 3 });
  await c.next('mapState', (m) => pos(m, elf.id)?.x === 2 && pos(m, elf.id)?.y === 3);

  // Moving: same action again.
  c.send('placeToken', { id: elf.id, x: 4, y: 3 });
  await c.next('mapState', (m) => pos(m, elf.id)?.x === 4);

  // All rejected: occupied cell, out of bounds, fractional, unknown combatant.
  c.send('placeToken', { id: gob.id, x: 4, y: 3 });
  c.send('placeToken', { id: gob.id, x: 20, y: 0 });
  c.send('placeToken', { id: gob.id, x: -1, y: 0 });
  c.send('placeToken', { id: gob.id, x: 1.5, y: 0 });
  c.send('placeToken', { id: gob.id, x: '1', y: 0 });
  c.send('placeToken', { id: 'nobody', x: 0, y: 0 });
  c.send('placeToken', { id: gob.id, x: 0, y: 0 }); // valid, marks the end
  const m = await c.next('mapState', (x) => pos(x, gob.id) !== undefined);
  assert.deepStrictEqual(pos(m, gob.id), { x: 0, y: 0 });
  assert.deepStrictEqual(pos(m, elf.id), { x: 4, y: 3 });
  assert.strictEqual(Object.keys(m.map.positions).length, 2);

  c.send('removeToken', { id: gob.id });
  await c.next('mapState', (x) => pos(x, gob.id) === undefined && pos(x, elf.id));
});

test('map: resize clamps and sends tokens outside back to the tray', async (t) => {
  const { c, elf, gob } = await setup(t);
  c.send('placeToken', { id: elf.id, x: 1, y: 1 });
  c.send('placeToken', { id: gob.id, x: 12, y: 1 });
  await c.next('mapState', (m) => pos(m, gob.id));

  c.send('setMapSize', { cols: 10, rows: 999 });
  const m = await c.next('mapState', (x) => x.map.cols === 10);
  assert.strictEqual(m.map.rows, 50);
  assert.deepStrictEqual(pos(m, elf.id), { x: 1, y: 1 });
  assert.strictEqual(pos(m, gob.id), undefined);

  c.send('setMapSize', { cols: 1, rows: 'abc' });
  const m2 = await c.next('mapState', (x) => x.map.cols === 5);
  assert.strictEqual(m2.map.rows, 50, 'bad value keeps the old size');

  c.send('clearMap');
  await c.next('mapState', (x) => Object.keys(x.map.positions).length === 0);
});

test('map: removed or cleared combatants leave the map', async (t) => {
  const { c, elf, gob } = await setup(t);
  c.send('placeToken', { id: elf.id, x: 0, y: 0 });
  c.send('placeToken', { id: gob.id, x: 1, y: 0 });
  await c.next('mapState', (m) => pos(m, gob.id));

  c.send('removeCombatant', { id: gob.id });
  const m = await c.next('mapState', (x) => pos(x, gob.id) === undefined);
  assert.ok(pos(m, elf.id));

  c.send('clearAll');
  await c.next('mapState', (x) => Object.keys(x.map.positions).length === 0);
});
