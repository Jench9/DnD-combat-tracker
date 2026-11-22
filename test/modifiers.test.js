const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
// First: sets DATA_DIR / KIT_AUTH before anything reads src/config.
const { startServer, connect } = require('./helpers');
const { sanitizeCharacterPatch, blankCharacter } = require('../src/features/characters/model');
const { detectPresets, mergeModifiers, BY_NAME } = require('../src/features/imports/dndbeyond/modifiers');

test('character modifiers are validated', () => {
  const ch = sanitizeCharacterPatch(blankCharacter('c'), {
    modifiers: [
      { id: 'm1', preset: 'rage', active: 1, only: 'Greataxe' },
      { id: 'm1', preset: 'dueling' }, // duplicate id
      { id: 'm2', preset: 'BAD KEY!' }, // neither a preset nor custom
      { id: 'm3', custom: { name: 'Blessed Blade', toHit: 99, damage: 'cha', dice: '1d6', diceType: 'radiant', appliesTo: 'weapon', range: 'melee', toggle: 1, note: 'x' } },
      { id: 'm4', custom: { name: 'Weird', damage: 'lots', dice: '1d7', diceType: 'sonic', appliesTo: 'sideways' } },
    ],
  });
  assert.deepStrictEqual(ch.modifiers.map((m) => m.id), ['m1', 'm3', 'm4']);
  assert.deepStrictEqual(ch.modifiers[0], { id: 'm1', preset: 'rage', active: true, only: 'Greataxe', custom: null });
  assert.deepStrictEqual(ch.modifiers[1].custom, {
    name: 'Blessed Blade', toHit: 20, damage: 'CHA', dice: '1d6', diceType: 'radiant', appliesTo: 'weapon', range: 'melee', toggle: true, note: 'x', ac: 0,
  });
  assert.deepStrictEqual([ch.modifiers[2].custom.damage, ch.modifiers[2].custom.dice, ch.modifiers[2].custom.diceType, ch.modifiers[2].custom.appliesTo], ['0', '', '', 'weapon']);
});

// Every preset the D&D Beyond detection can produce must exist in the client catalog.
test('detected preset keys all exist in the client catalog', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/js/core/modifier-presets.json'), 'utf8'));
  const keys = new Set(catalog.map((p) => p.key));
  assert.strictEqual(keys.size, catalog.length, 'preset keys are unique');
  const detected = Object.values(BY_NAME).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)));
  detected.forEach((k) => assert.ok(keys.has(k), `missing preset ${k}`));
});

const feature = (name, requiredLevel = 1) => ({ definition: { name, requiredLevel } });
const BARB_2014 = {
  // D&D Beyond marks 2014 content as legacy; without it a character reads as 2024.
  classes: [{ level: 9, definition: { name: 'Barbarian', isLegacy: true }, classFeatures: [feature('Rage'), feature('Brutal Critical', 9), feature('Relentless Rage', 11)] }],
  feats: [{ definition: { name: 'Great Weapon Master' } }],
};
const FIGHTER_2024 = {
  classes: [{
    level: 5, definition: { name: 'Fighter' },
    classFeatures: [feature('Fighting Style'), feature('Weapon Mastery'), feature('Improved Critical', 3)],
    subclassDefinition: { classFeatures: [feature('Superior Critical', 15)] },
  }],
  feats: [{ definition: { name: 'Great Weapon Master' } }],
  options: { class: [{ definition: { name: 'Great Weapon Fighting' } }] },
};

test('D&D Beyond feats/features map to presets, by edition and level', () => {
  assert.deepStrictEqual(detectPresets(BARB_2014), ['gwm-2014', 'rage', 'brutal-critical-2014']);
  assert.deepStrictEqual(detectPresets(FIGHTER_2024), ['gwf-2024', 'gwm-2024', 'improved-critical', 'weapon-mastery'], 'Superior Critical not reached yet');
  assert.deepStrictEqual(detectPresets({ options: { class: [{ definition: { name: 'Fighting Style: Archery' } }, { definition: { name: 'Agonizing Blast' } }] } }), ['archery', 'agonizing-blast']);

  let n = 0;
  const merged = mergeModifiers([{ id: 'keep', preset: 'rage', active: true, only: '' }, { id: 'c1', preset: '', custom: { name: 'Mine' } }], BARB_2014, () => `n${n++}`);
  assert.deepStrictEqual(merged.map((m) => m.preset || 'custom'), ['rage', 'custom', 'gwm-2014', 'brutal-critical-2014']);
  assert.strictEqual(merged[0].active, true, 'existing on/off state kept');
  assert.strictEqual(merged.find((m) => m.preset === 'gwm-2014').active, false, 'situational ones start off');
});

test('D&D Beyond import adds modifiers; sync keeps them and adds new ones', async (t) => {
  let payload = { id: 99, name: 'Brog', stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: 10 })), baseHitPoints: 50, ...BARB_2014 };
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => (String(url).includes('character-service.dndbeyond.com')
    ? new Response(JSON.stringify({ success: true, data: payload }), { status: 200 })
    : realFetch(url, opts));
  t.after(() => { global.fetch = realFetch; });
  const s = await startServer();
  const dm = connect(s.port);
  t.after(async () => { dm.close(); await s.close(); });
  await dm.opened;
  const post = (p, body) => realFetch(`http://localhost:${s.port}/api/import/dndbeyond${p}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Kit-Role': 'dm' }, body: JSON.stringify(body),
  });

  const { character } = await (await post('', { input: '99' })).json();
  assert.deepStrictEqual(character.modifiers.map((m) => m.preset), ['gwm-2014', 'rage', 'brutal-critical-2014']);

  // The player switches Rage on and adds a custom modifier.
  const mods = character.modifiers.map((m) => (m.preset === 'rage' ? { ...m, active: true } : m));
  mods.push({ id: 'cust', preset: '', active: true, only: '', custom: { name: 'Totem', toHit: 0, damage: '1', appliesTo: 'weapon', range: 'any' } });
  dm.send('updateCharacter', { id: character.id, patch: { modifiers: mods } });
  await dm.next('charState', (m) => m.characters.some((c) => c.modifiers.some((x) => x.id === 'cust')));

  // Level 13 on D&D Beyond: nothing new to detect here, but a feat was added.
  payload = { ...payload, feats: [...payload.feats, { definition: { name: 'Savage Attacker' } }] };
  const { character: synced } = await (await post('/refresh', { characterId: character.id })).json();
  assert.deepStrictEqual(synced.modifiers.map((m) => m.preset || m.custom.name), ['gwm-2014', 'rage', 'brutal-critical-2014', 'Totem', 'savage-attacker']);
  assert.strictEqual(synced.modifiers.find((m) => m.preset === 'rage').active, true);
});
