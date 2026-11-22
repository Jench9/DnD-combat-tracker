// Quick status: Heroic Inspiration, exhaustion (0–6) and coins.
const test = require('node:test');
const assert = require('node:assert');
// First: sets DATA_DIR / KIT_AUTH before anything reads src/config.
require('./helpers'); // sets DATA_DIR / KIT_AUTH
const rest = require('../src/features/characters/rest');
const { blankCharacter, sanitizeCharacterPatch } = require('../src/features/characters/model');
const { mapDndBeyondData } = require('../src/features/imports/dndbeyond/mapper');

test('status fields: defaults and validation', () => {
  const ch = blankCharacter('a1');
  assert.deepStrictEqual([ch.inspiration, ch.exhaustion, ch.currency], [false, 0, { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }]);
  const next = sanitizeCharacterPatch(ch, { inspiration: 1, exhaustion: 9, currency: { gp: '150', sp: -3, xx: 5, pp: 1e12 } });
  assert.strictEqual(next.inspiration, true);
  assert.strictEqual(next.exhaustion, 6);
  assert.deepStrictEqual(next.currency, { cp: 0, sp: 0, ep: 0, gp: 150, pp: 9999999 });
  // Partial updates keep the other coins; a character saved before these fields gets the defaults.
  assert.deepStrictEqual(sanitizeCharacterPatch(next, { currency: { cp: 7 } }).currency, { cp: 7, sp: 0, ep: 0, gp: 150, pp: 9999999 });
  const { currency, inspiration, exhaustion, ...old } = ch;
  const loaded = sanitizeCharacterPatch(blankCharacter('a1'), old);
  assert.deepStrictEqual([loaded.inspiration, loaded.exhaustion, loaded.currency.gp], [false, 0, 0]);
});

test('a long rest removes one level of exhaustion', () => {
  const ch = { ...blankCharacter('a1'), exhaustion: 3, hpCurrent: 2 };
  assert.strictEqual(rest.longRest(ch).exhaustion, 2);
  assert.strictEqual(rest.longRest({ ...ch, exhaustion: 0 }).exhaustion, 0);
  assert.strictEqual(rest.longRest({ ...ch, rulesEdition: '2014' }).exhaustion, 2);
});

test('D&D Beyond: inspiration, exhaustion (condition 4) and coins', () => {
  const { patch } = mapDndBeyondData({
    inspiration: true,
    conditions: [{ id: 1, level: null }, { id: 4, level: 2 }],
    currencies: { cp: 12, sp: 3, ep: 0, gp: 87, pp: 1 },
    classes: [{ level: 3, definition: { name: 'Fighter', hitDice: 10 } }],
  });
  assert.deepStrictEqual([patch.inspiration, patch.exhaustion, patch.currency], [true, 2, { cp: 12, sp: 3, ep: 0, gp: 87, pp: 1 }]);
  const none = mapDndBeyondData({ classes: [] }).patch;
  assert.deepStrictEqual([none.inspiration, none.exhaustion, none.currency.gp], [false, 0, 0]);
});

test('Sync keeps inspiration and exhaustion (table state) but takes the coins', () => {
  const service = require('../src/features/characters/service');
  const mapped = (extra) => mapDndBeyondData({
    name: 'Brann', classes: [{ level: 3, definition: { name: 'Fighter', hitDice: 10 } }], baseHitPoints: 28, ...extra,
  }, '777').patch;
  const ch = service.addImported(mapped({ currencies: { gp: 10 } }), 'Imported.');
  service.update(ch.id, { inspiration: true, exhaustion: 2, currency: { gp: 4 } });
  const up = service.refreshImported(ch.id, mapped({ inspiration: false, currencies: { gp: 25, sp: 5 } }));
  assert.deepStrictEqual([up.inspiration, up.exhaustion, up.currency.gp, up.currency.sp], [true, 2, 25, 5]);
  service.remove(ch.id);
});
