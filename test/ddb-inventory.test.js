const test = require('node:test');
const assert = require('node:assert');
const { planInventory } = require('../src/features/imports/dndbeyond/inventory');
const { SRD_ITEMS } = require('../src/srd');
const { startServer, connect } = require('./helpers');

const LIBRARY = SRD_ITEMS.map((it, i) => ({ id: `lib${i}`, properties: [], magicBonus: 0, ...it }));
const libId = (name) => LIBRARY.find((i) => i.name === name).id;

// D&D Beyond inventory entries (shape of the unofficial character JSON).
const ddb = (name, extra = {}, def = {}) => ({ quantity: 1, equipped: false, ...extra, definition: { name, ...def } });
const PAYLOAD = {
  inventory: [
    ddb('Longsword', { equipped: true }, { filterType: 'Weapon', type: 'Longsword' }),
    ddb('Crossbow, Light', {}, { filterType: 'Weapon' }),
    ddb('Leather', { equipped: true }, { filterType: 'Armor', armorTypeId: 1, armorClass: 11 }),
    ddb('Arrows', { quantity: 35 }, { filterType: 'Other Gear' }),
    ddb('Potion of Healing', { quantity: 2 }, { filterType: 'Potion' }),
    ddb('Rope, Hempen (50 feet)', {}, { filterType: 'Other Gear' }),
    ddb('Lucky Pebble', {}, { filterType: 'Other Gear' }), // not in the SRD
    ddb("Grandma's Locket", { quantity: 2 }, { filterType: 'Other Gear' }),
    ddb('Longsword, +1', { equipped: true }, {
      filterType: 'Weapon', type: 'Longsword', magic: true, categoryId: 2, attackType: 1,
      damage: { diceString: '1d8' }, damageType: 'Slashing',
      properties: [{ name: 'Versatile', notes: '1d10' }],
      grantedModifiers: [{ type: 'bonus', subType: 'magic', value: 1 }], weight: 3,
    }),
    ddb('Flame Tongue', {}, { filterType: 'Weapon', type: 'Longsword', magic: true, categoryId: 2, damageType: 'Slashing' }),
    ddb('Breastplate, +1', {}, {
      filterType: 'Armor', armorTypeId: 2, armorClass: 14, magic: true,
      grantedModifiers: [{ type: 'bonus', subType: 'armor-class', value: 1 }],
    }),
    ddb('Longsword, +1', {}, { filterType: 'Weapon', damage: { diceString: '1d8' }, damageType: 'Slashing' }), // second copy
    ddb('Mystery Thing', {}, { filterType: 'Weapon' }), // no stats at all
  ],
};

test('planInventory: matches library names, creates magic weapons/armor, leaves other gear as text', () => {
  let n = 0;
  const plan = planInventory(PAYLOAD, LIBRARY, () => `new${n++}`);
  const byName = (name) => plan.inventory.filter((e) => e.name === name);

  const longsword = byName('Longsword')[0];
  assert.deepStrictEqual([longsword.itemId, longsword.equipped, longsword.qty], [libId('Longsword'), true, 1]);
  assert.strictEqual(byName('Light Crossbow')[0].itemId, libId('Light Crossbow'), '"Crossbow, Light"');
  assert.deepStrictEqual([byName('Leather Armor')[0].itemId, byName('Leather Armor')[0].equipped], [libId('Leather Armor'), true]);
  assert.strictEqual(byName('Arrows (20)')[0].qty, 2, '35 arrows = 2 bundles of 20');
  assert.strictEqual(byName('Potion of Healing')[0].qty, 2);
  assert.strictEqual(byName('Rope, hempen (50 feet)')[0].itemId, libId('Rope, hempen (50 feet)'));

  // New library items: +1 longsword (both copies share it), Flame Tongue (base dice), +1 breastplate.
  assert.strictEqual(plan.newItems.length, 3);
  const created = (name) => plan.newItems.find((x) => x.patch.name === name);
  const plus1 = created('Longsword, +1').patch;
  assert.deepStrictEqual([plus1.damage, plus1.damageType, plus1.versatileDamage, plus1.magicBonus, plus1.weaponCategory],
    ['1d8', 'slashing', '1d10', 1, 'martial']);
  assert.strictEqual(byName('Longsword, +1').length, 2);
  assert.ok(byName('Longsword, +1').every((e) => e.itemId === created('Longsword, +1').id));
  // The SRD's "Flame Tongue" is a dice-less magic item, so the weapon is created separately.
  assert.ok(LIBRARY.some((i) => i.name === 'Flame Tongue' && i.type === 'gear'));
  assert.strictEqual(created('Flame Tongue (Longsword)').patch.damage, '1d8', 'falls back to the base weapon');
  const bp = created('Breastplate, +1').patch;
  assert.deepStrictEqual([bp.armorType, bp.baseAc, bp.maxDex, bp.magicBonus], ['medium', 14, 2, 1]);

  assert.strictEqual(plan.otherText, "Lucky Pebble\nGrandma's Locket x2\nMystery Thing");
  assert.strictEqual(new Set(plan.inventory.map((e) => e.id)).size, plan.inventory.length, 'unique entry ids');
});

test('D&D Beyond import and sync map the inventory into the library', async (t) => {
  // Stub D&D Beyond: the character service returns our payload.
  let payload = {
    id: 777, name: 'Brann', stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: id === 2 ? 14 : 10 })),
    classes: [{ level: 5, definition: { name: 'Fighter', hitDice: 10 } }], baseHitPoints: 40,
    modifiers: { class: [{ type: 'proficiency', subType: 'martial-weapons' }] },
    inventory: PAYLOAD.inventory,
  };
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).includes('character-service.dndbeyond.com')) {
      return new Response(JSON.stringify({ success: true, data: payload }), { status: 200 });
    }
    return realFetch(url, opts);
  };
  t.after(() => { global.fetch = realFetch; });

  const s = await startServer();
  const dm = connect(s.port);
  t.after(async () => { dm.close(); await s.close(); });
  await dm.opened;
  const base = `http://localhost:${s.port}/api/import/dndbeyond`;
  const post = (path, body) => realFetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Kit-Role': 'dm' }, body: JSON.stringify(body),
  });

  const r = await post('', { input: '777' });
  assert.strictEqual(r.status, 200);
  const { character } = await r.json();
  const lib = (await dm.next('itemState', (m) => m.items.some((i) => i.name === 'Longsword, +1'))).items;
  const plus1 = lib.find((i) => i.name === 'Longsword, +1');
  assert.deepStrictEqual([plus1.source, plus1.createdBy, plus1.magicBonus], ['custom', 'dm', 1]);
  const longsword = character.inventory.find((e) => e.name === 'Longsword');
  assert.strictEqual(lib.find((i) => i.id === longsword.itemId).name, 'Longsword');
  assert.strictEqual(character.equipment, "Lucky Pebble\nGrandma's Locket x2\nMystery Thing");
  assert.deepStrictEqual(character.weaponProf, { simple: false, martial: true });

  // Sync: D&D Beyond now also has a shield; nothing new is created twice.
  payload = { ...payload, inventory: [...PAYLOAD.inventory, ddb('Shield', { equipped: true }, { filterType: 'Armor', armorTypeId: 4, armorClass: 2 })] };
  const before = lib.length;
  const r2 = await post('/refresh', { characterId: character.id });
  assert.strictEqual(r2.status, 200);
  const synced = (await r2.json()).character;
  assert.ok(synced.inventory.some((e) => e.name === 'Shield' && e.equipped));
  const libraryNow = require('../src/features/items/service').all();
  assert.strictEqual(libraryNow.length, before, 'sync reuses the items created by the first import');
});
