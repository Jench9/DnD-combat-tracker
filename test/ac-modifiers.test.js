const test = require('node:test');
const assert = require('node:assert');
const { startServer, connect } = require('./helpers');
const { detectPresets } = require('../src/features/imports/dndbeyond/modifiers');

// A character whose inventory/abilities/modifiers we set step by step;
// returns the AC (and breakdown) the server computes.
async function setup(t) {
  const s = await startServer();
  const dm = connect(s.port);
  t.after(async () => { dm.close(); await s.close(); });
  await dm.opened;
  const lib = (await dm.next('itemState')).items;
  const item = (name) => lib.find((i) => i.name === name);
  dm.send('addCharacter', { id: 'hero' });
  await dm.next('charState', (m) => m.characters.some((c) => c.id === 'hero'));
  let n = 0;
  async function ac({ wear = [], abilities, mods = [] }) {
    n++;
    const inventory = wear.map((nm, i) => ({ id: `w${n}x${i}`, itemId: item(nm).id, qty: 1, equipped: true }));
    const modifiers = mods.map((m, i) => ({ id: `m${n}x${i}`, only: '', active: true, ...(typeof m === 'string' ? { preset: m } : m) }));
    dm.send('updateCharacter', { id: 'hero', patch: { inventory, modifiers, notes: `s${n}`, ...(abilities ? { abilities } : {}) } });
    const m = await dm.next('charState', (x) => x.characters.find((c) => c.id === 'hero')?.notes === `s${n}`);
    const ch = m.characters.find((c) => c.id === 'hero');
    return [ch.ac, ch.acBreakdown];
  }
  return { dm, ac };
}

test('AC modifiers: unarmored formulas, Defense, Shield/Haste bonuses', async (t) => {
  const { ac } = await setup(t);
  const base = { str: 10, dex: 14, con: 16, int: 10, wis: 18, cha: 12 }; // DEX +2, CON +3, WIS +4, CHA +1

  assert.deepStrictEqual(await ac({ abilities: base }), [12, '10 DEX +2']);
  // Barbarian: 10 + DEX + CON, shield still adds.
  assert.strictEqual((await ac({ mods: ['unarmored-defense-barbarian'] }))[0], 15);
  assert.deepStrictEqual(await ac({ wear: ['Shield'], mods: ['unarmored-defense-barbarian'] }), [17, 'Unarmored Defense 10 DEX +2 CON +3 Shield +2']);
  // Monk: 10 + DEX + WIS, but not with a shield (then the plain 10 + DEX + shield).
  assert.strictEqual((await ac({ mods: ['unarmored-defense-monk'] }))[0], 16);
  assert.strictEqual((await ac({ wear: ['Shield'], mods: ['unarmored-defense-monk'] }))[0], 14);
  // Wearing armor switches unarmored formulas off; the better base wins otherwise.
  assert.strictEqual((await ac({ wear: ['Leather Armor'], mods: ['unarmored-defense-monk'] }))[0], 13);
  assert.strictEqual((await ac({ mods: ['draconic-resilience-2014', 'mage-armor'] }))[0], 15, '13 + DEX');
  assert.strictEqual((await ac({ mods: ['draconic-resilience-2024'] }))[0], 13, '10 + DEX + CHA');
  // Defense: +1 only while wearing armor.
  assert.strictEqual((await ac({ mods: ['defense'] }))[0], 12);
  assert.deepStrictEqual(await ac({ wear: ['Chain Mail'], mods: ['defense'] }), [17, 'Chain Mail 16 Defense +1']);
  // Situational bonuses count only when switched on.
  assert.strictEqual((await ac({ wear: ['Chain Mail'], mods: ['shield-spell', 'haste'] }))[0], 23);
  assert.strictEqual((await ac({ wear: ['Chain Mail'], mods: [{ preset: 'shield-spell', active: false }] }))[0], 16);
  // Mage Armor only while active; custom AC bonus.
  assert.strictEqual((await ac({ mods: [{ preset: 'mage-armor', active: false }] }))[0], 12);
  assert.strictEqual((await ac({ mods: [{ preset: '', custom: { name: 'Ring of Protection', ac: 1 } }] }))[0], 13);
});

test('combatants follow their sheet AC (e.g. casting Shield mid-fight)', async (t) => {
  const { dm, ac } = await setup(t);
  await ac({ wear: ['Chain Mail'] });
  dm.send('addCharacterToCombat', { characterId: 'hero', init: 10 });
  await dm.next('state', (m) => m.state.combatants[0]?.ac === 16);
  await ac({ wear: ['Chain Mail'], mods: ['shield-spell'] });
  await dm.next('state', (m) => m.state.combatants[0]?.ac === 21);
});

test('D&D Beyond: Defense, Unarmored Defense per class, Draconic Resilience by edition', () => {
  const feature = (name) => ({ definition: { name, requiredLevel: 1 } });
  assert.deepStrictEqual(detectPresets({ classes: [{ level: 3, definition: { name: 'Barbarian' }, classFeatures: [feature('Unarmored Defense')] }] }), ['unarmored-defense-barbarian']);
  assert.deepStrictEqual(detectPresets({ classes: [{ level: 3, definition: { name: 'Monk' }, classFeatures: [feature('Unarmored Defense')] }] }), ['unarmored-defense-monk']);
  assert.deepStrictEqual(detectPresets({ options: { class: [{ definition: { name: 'Defense' } }] } }), ['defense']);
  // 2024 unless D&D Beyond marks the class as legacy (2014) content.
  assert.deepStrictEqual(detectPresets({ classes: [{ level: 1, definition: { name: 'Sorcerer' }, subclassDefinition: { classFeatures: [feature('Draconic Resilience')] } }] }), ['draconic-resilience-2024']);
  assert.deepStrictEqual(detectPresets({ classes: [{ level: 1, definition: { name: 'Sorcerer', isLegacy: true }, subclassDefinition: { classFeatures: [feature('Draconic Resilience')] } }] }), ['draconic-resilience-2014']);
});
