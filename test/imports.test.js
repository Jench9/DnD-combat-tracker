const test = require('node:test');
const assert = require('node:assert');
// First: sets DATA_DIR / KIT_AUTH before anything reads src/config.
const { startServer } = require('./helpers');
const { extractDdbCharacterId, mapDndBeyondData } = require('../src/features/imports/dndbeyond/mapper');
const { mapPdfFormFields, normalizeFieldName } = require('../src/features/imports/pdf/mapper');

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
    modifiers: { class: [{ type: 'proficiency', subType: 'stealth' }, { type: 'proficiency', subType: 'dexterity-saving-throws' }, { type: 'proficiency', subType: 'simple-weapons' }] },
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
  assert.deepStrictEqual(patch.weaponProf, { simple: true, martial: false });
  assert.strictEqual(patch.equipment, 'Dagger x3');
  assert.strictEqual(patch.features, 'Sneak Attack');
  assert.match(notesPrefix, /best-effort/);
});

test('mapDndBeyondData: features above the class level are listed apart, with their level', () => {
  const { patch } = mapDndBeyondData({
    stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: 10 })),
    classes: [{
      level: 3, definition: { name: 'Warlock' },
      classFeatures: [
        { definition: { name: 'Contact Patron', requiredLevel: 9 } },
        { definition: { name: 'Pact Magic', requiredLevel: 1 } },
        { definition: { name: '8: Ability Score Improvement', requiredLevel: 8 } },
        { definition: { name: 'Magical Cunning', requiredLevel: 2 } },
      ],
      subclassDefinition: { name: 'Fiend Patron', classFeatures: [{ definition: { name: "Dark One's Blessing", requiredLevel: 3 } }, { definition: { name: "Dark One's Own Luck", requiredLevel: 6 } }] },
    }],
    feats: [{ definition: { name: 'Alert' } }],
  });
  assert.strictEqual(patch.features, [
    'Pact Magic', 'Magical Cunning', "Dark One's Blessing", 'Alert', '',
    '◆ Later levels (not yet)',
    "- Dark One's Own Luck (Fiend Patron, Warlock 6)",
    '- Ability Score Improvement (Warlock 8)',
    '- Contact Patron (Warlock 9)',
  ].join('\n'));
});

test('mapDndBeyondData ability scores: background, race, feat and item bonuses', () => {
  const { patch } = mapDndBeyondData({
    stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: 10 })),
    classes: [{ level: 4, definition: { name: 'Warlock', hitDice: 8 } }],
    modifiers: {
      // 2024 background (e.g. The Haunted One on D&D Beyond): +2 / +1
      background: [
        { type: 'bonus', subType: 'charisma-score', value: 2 },
        { type: 'bonus', subType: 'wisdom-score', value: 1 },
        { type: 'proficiency', subType: 'arcana' },
      ],
      race: [{ type: 'bonus', subType: 'dexterity-score', value: 2 }], // ignored: the background gives the increases
      feat: [{ type: 'bonus', subType: 'charisma-score', value: 1 }], // e.g. a half-feat
      item: [
        { type: 'set', subType: 'strength-score', value: 19, componentId: 101 }, // gauntlets, attuned
        { type: 'set', subType: 'intelligence-score', value: 19, componentId: 102 }, // headband, not attuned
        { type: 'bonus', subType: 'constitution-score', value: 2, componentId: 103 }, // not equipped
      ],
    },
    inventory: [
      { equipped: true, isAttuned: true, definition: { id: 101, name: 'Gauntlets of Ogre Power', canAttune: true } },
      { equipped: true, isAttuned: false, definition: { id: 102, name: 'Headband of Intellect', canAttune: true } },
      { equipped: false, definition: { id: 103, name: 'Amulet of Health', canAttune: false } },
    ],
  });
  assert.deepStrictEqual(patch.abilities, { str: 19, dex: 10, con: 10, int: 10, wis: 11, cha: 13 });
  assert.ok(patch.skillProf.Arcana);
});

// Shape of a real 2024 character (Elf, Scribe background): D&D Beyond lists
// the species' +2/+1 *and* the background's (as a feat); only the
// background's count, as on D&D Beyond.
test('mapDndBeyondData ability scores: 2024 background increases replace the species ones', () => {
  const stats = [8, 15, 14, 15, 10, 8].map((value, i) => ({ id: i + 1, value }));
  const species = [
    { type: 'bonus', subType: 'intelligence-score', value: 2, componentId: 3727523 },
    { type: 'bonus', subType: 'dexterity-score', value: 1, componentId: 3727523 },
  ];
  const background = [
    { type: 'bonus', subType: 'dexterity-score', value: 2, componentId: 1789184 },
    { type: 'bonus', subType: 'intelligence-score', value: 1, componentId: 1789184 },
  ];
  const feats = [{ definition: { id: 1789184, name: 'Scribe Ability Score Improvements' } }, { definition: { id: 1789131, name: 'Dueling' } }];
  const both = mapDndBeyondData({ stats, feats, modifiers: { race: species, feat: background } }).patch.abilities;
  assert.deepStrictEqual(both, { str: 8, dex: 17, con: 14, int: 16, wis: 10, cha: 8 });

  // A background without increases (2014 rules / legacy background): the species' count.
  const legacy = mapDndBeyondData({ stats, feats: [], modifiers: { race: species } }).patch.abilities;
  assert.deepStrictEqual(legacy, { str: 8, dex: 16, con: 14, int: 17, wis: 10, cha: 8 });

  // A 2024 "Ability Score Improvement" feat (level 4) is not a background: species still count.
  const asi = mapDndBeyondData({
    stats,
    feats: [{ definition: { id: 77, name: 'Ability Score Improvement' } }],
    modifiers: { race: species, feat: [{ type: 'bonus', subType: 'strength-score', value: 2, componentId: 77 }] },
  }).patch.abilities;
  assert.deepStrictEqual(asi, { str: 10, dex: 16, con: 14, int: 17, wis: 10, cha: 8 });
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

test('REST import validation and permission errors', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  const base = `http://localhost:${s.port}`;
  const json = (body, who = { 'X-Kit-Role': 'dm' }) => ({
    method: 'POST', headers: { 'Content-Type': 'application/json', ...who }, body: JSON.stringify(body),
  });
  const player = (id) => ({ 'X-Kit-Role': 'player', 'X-Kit-Character': id });

  // New imports are DM-only.
  let r = await fetch(`${base}/api/import/dndbeyond`, json({ input: '123' }, player('x')));
  assert.strictEqual(r.status, 403);
  r = await fetch(`${base}/api/import/dndbeyond`, json({ input: '123' }, {}));
  assert.strictEqual(r.status, 403, 'no identity = player');
  r = await fetch(`${base}/api/import/pdf`, { method: 'POST', body: new FormData() });
  assert.strictEqual(r.status, 403);

  r = await fetch(`${base}/api/import/dndbeyond`, json({ input: 'nope' }));
  assert.strictEqual(r.status, 400);
  assert.strictEqual((await r.json()).error, 'Paste a D&D Beyond character URL or ID.');
  r = await fetch(`${base}/api/import/dndbeyond/refresh`, json({ characterId: 'nope' }));
  assert.strictEqual(r.status, 404);

  // Sync: the DM or the character's own player.
  const ch = require('../src/features/characters/service').addImported({ name: 'Unlinked' });
  r = await fetch(`${base}/api/import/dndbeyond/refresh`, json({ characterId: ch.id }, player('someoneelse')));
  assert.strictEqual(r.status, 403);
  r = await fetch(`${base}/api/import/dndbeyond/refresh`, json({ characterId: ch.id }, player(ch.id)));
  assert.strictEqual(r.status, 400, 'owner gets past the permission check (no D&D Beyond id)');
  r = await fetch(`${base}/api/import/dndbeyond/refresh`, json({ characterId: ch.id }));
  assert.strictEqual(r.status, 400);

  r = await fetch(`${base}/api/import/pdf`, { method: 'POST', headers: { 'X-Kit-Role': 'dm' }, body: new FormData() });
  assert.strictEqual(r.status, 400);
  assert.strictEqual((await r.json()).error, 'No file uploaded.');

  r = await fetch(`${base}/api/characters/summary`);
  const summary = await r.json();
  assert.ok(summary.characters.some((c) => c.id === ch.id && c.name === 'Unlinked'));
  assert.ok(Array.isArray(summary.campaigns), 'campaigns to group the chooser by');
});
