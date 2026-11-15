const test = require('node:test');
const assert = require('node:assert');
const { extractDdbCharacterId, mapDndBeyondData } = require('../src/features/imports/dndbeyond/mapper');
const { mapPdfFormFields, normalizeFieldName } = require('../src/features/imports/pdf/mapper');
const { startServer } = require('./helpers');

test('extractDdbCharacterId accepts URL or bare id', () => {
  assert.strictEqual(extractDdbCharacterId('https://www.dndbeyond.com/characters/12345678'), '12345678');
  assert.strictEqual(extractDdbCharacterId(' 987 '), '987');
  assert.strictEqual(extractDdbCharacterId('hello'), null);
  assert.strictEqual(extractDdbCharacterId(undefined), null);
});

test('mapDndBeyondData maps core fields', () => {
  const { patch, notesPrefix } = mapDndBeyondData({
    name: 'Lyra',
    stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: 10 + id })),
    bonusStats: [{ id: 2, value: 2 }],
    overrideStats: [{ id: 6, value: 20 }],
    classes: [{ level: 3, definition: { name: 'Rogue', hitDice: 8 }, classFeatures: [{ definition: { name: 'Sneak Attack' } }] }],
    race: { fullName: 'Elf' },
    baseHitPoints: 20, removedHitPoints: 5,
    modifiers: { class: [{ type: 'proficiency', subType: 'stealth' }, { type: 'proficiency', subType: 'dexterity-saving-throws' }] },
    inventory: [{ equipped: true, quantity: 3, definition: { name: 'Dagger' } }],
  });
  assert.strictEqual(patch.name, 'Lyra');
  assert.strictEqual(patch.abilities.dex, 14);
  assert.strictEqual(patch.abilities.cha, 20);
  assert.strictEqual(patch.level, 3);
  assert.strictEqual(patch.class, 'Rogue 3');
  // CON 13 (+1) x level 3 added to base 20
  assert.strictEqual(patch.hpMax, 23);
  assert.strictEqual(patch.hpCurrent, 18);
  assert.ok(patch.skillProf.Stealth);
  assert.ok(patch.saveProf.dex);
  assert.strictEqual(patch.equipment, 'Dagger x3');
  assert.strictEqual(patch.features, 'Sneak Attack');
  assert.match(notesPrefix, /best-effort/);
});

test('mapDndBeyondData HP: per-level bonuses and override', () => {
  const base = {
    stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: id === 3 ? 16 : 10 })),
    classes: [{ level: 4, definition: { name: 'Fighter', hitDice: 10 } }],
    baseHitPoints: 34,
    modifiers: { feat: [{ type: 'bonus', subType: 'hit-points-per-level', value: 2 }] },
  };
  // 34 + (CON +3 + Tough 2) * 4
  assert.strictEqual(mapDndBeyondData(base).patch.hpMax, 54);
  assert.strictEqual(mapDndBeyondData({ ...base, overrideHitPoints: 40 }).patch.hpMax, 40);
});

test('refreshImported updates stats but keeps table state', () => {
  const service = require('../src/features/characters/service');
  const lvl = (level, base) => mapDndBeyondData({
    name: 'Brann',
    stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: id === 3 ? 14 : 10 })),
    classes: [{ level, definition: { name: 'Fighter', hitDice: 10 } }],
    baseHitPoints: base,
  }, '555').patch;
  const ch = service.addImported(lvl(3, 28), 'Imported.');
  assert.strictEqual(ch.ddbId, '555');
  assert.strictEqual(ch.hpMax, 34);
  service.update(ch.id, { hpCurrent: 24, hpTemp: 5, notes: 'my notes' });

  const up = service.refreshImported(ch.id, lvl(4, 34));
  assert.strictEqual(up.id, ch.id);
  assert.strictEqual(up.level, 4);
  assert.strictEqual(up.hpMax, 42);
  assert.strictEqual(up.hpCurrent, 32); // 10 damage carried over
  assert.strictEqual(up.hpTemp, 5);
  assert.strictEqual(up.notes, 'my notes');
  assert.strictEqual(up.class, 'Fighter 4');
  assert.strictEqual(service.refreshImported('missing', lvl(4, 34)), null);
  service.remove(ch.id);
});

test('mapPdfFormFields uses aliases, level fallback and leftovers', () => {
  assert.strictEqual(normalizeFieldName('CharacterName 2'), 'charactername2');
  const { patch, leftover } = mapPdfFormFields([
    { name: 'CharacterName', value: 'Bob', type: 'text' },
    { name: 'ClassLevel', value: 'Fighter 3 / Wizard 2', type: 'text' },
    { name: 'AC', value: '16', type: 'text' },
    { name: 'STR', value: '18', type: 'text' },
    { name: 'Stealth', value: true, type: 'checkbox' },
    { name: 'Weird Field', value: 'keep me', type: 'text' },
  ]);
  assert.strictEqual(patch.name, 'Bob');
  assert.strictEqual(patch.level, 5);
  assert.strictEqual(patch.ac, 16);
  assert.strictEqual(patch.abilities.str, 18);
  assert.ok(patch.skillProf.Stealth);
  assert.match(leftover, /Weird Field: keep me/);
});

test('REST import validation errors', async () => {
  const s = await startServer();
  const base = `http://localhost:${s.port}`;
  let r = await fetch(`${base}/api/import/dndbeyond`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'nope' }) });
  assert.strictEqual(r.status, 400);
  assert.strictEqual((await r.json()).error, 'Paste a D&D Beyond character URL or ID.');
  r = await fetch(`${base}/api/import/dndbeyond/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId: 'nope' }) });
  assert.strictEqual(r.status, 404);
  const ch = require('../src/features/characters/service').addImported({ name: 'Unlinked' });
  r = await fetch(`${base}/api/import/dndbeyond/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ characterId: ch.id }) });
  assert.strictEqual(r.status, 400);
  r = await fetch(`${base}/api/import/pdf`, { method: 'POST', body: new FormData() });
  assert.strictEqual(r.status, 400);
  assert.strictEqual((await r.json()).error, 'No file uploaded.');
  await s.close();
});
