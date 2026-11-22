const test = require('node:test');
const assert = require('node:assert');
// First: sets DATA_DIR / KIT_AUTH before anything reads src/config.
require('./helpers'); // sets DATA_DIR / KIT_AUTH
const { fetchAvatar } = require('../src/features/imports/dndbeyond/client');
const { mapDndBeyondData } = require('../src/features/imports/dndbeyond/mapper');
const { MAX_PORTRAIT_BYTES } = require('../src/config');
const { MAX_PORTRAIT_CHARS, sanitizeCharacterPatch, blankCharacter } = require('../src/features/characters/model');

// sharp needs Node >= 20.9; without it avatars are skipped by design.
let sharp = null;
try { sharp = require('sharp'); } catch { /* tests below that need it are skipped */ }
const needsSharp = { skip: sharp ? false : 'sharp is not available on this Node version' };

// Swap global fetch for one test; records requested URLs.
function stubFetch(t, respond) {
  const real = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => { calls.push(String(url)); return respond(String(url), opts); };
  t.after(() => { global.fetch = real; });
  return calls;
}
const reply = (type, body, status = 200) => new Response(body, { status, headers: { 'content-type': type } });

// A big, noisy (so it compresses badly) image — like a full-size avatar.
const bigPng = () => sharp({
  create: { width: 1600, height: 1200, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } },
}).png().toBuffer();

test('mapper picks up the avatar URL from decorations or top level', () => {
  assert.strictEqual(mapDndBeyondData({ decorations: { avatarUrl: 'https://www.dndbeyond.com/avatars/1/a.jpeg' } }).avatarUrl,
    'https://www.dndbeyond.com/avatars/1/a.jpeg');
  assert.strictEqual(mapDndBeyondData({ avatarUrl: 'https://www.dndbeyond.com/avatars/2/b.png' }).avatarUrl,
    'https://www.dndbeyond.com/avatars/2/b.png');
  assert.strictEqual(mapDndBeyondData({}).avatarUrl, '');
});

test('fetchAvatar shrinks a large avatar to a 256px JPEG under the limit', needsSharp, async (t) => {
  const png = await bigPng();
  assert.ok(png.length > MAX_PORTRAIT_BYTES, `test image is ${png.length} bytes`);
  const calls = stubFetch(t, () => reply('image/png', png));

  const out = await fetchAvatar('https://www.dndbeyond.com/avatars/1/a.png?width=150&height=150');
  assert.match(out, /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);
  const jpeg = Buffer.from(out.split(',')[1], 'base64');
  const meta = await sharp(jpeg).metadata();
  assert.strictEqual(meta.format, 'jpeg');
  assert.strictEqual(meta.width, 256);
  assert.strictEqual(meta.height, 256);
  assert.ok(jpeg.length <= MAX_PORTRAIT_BYTES, `${jpeg.length} bytes`);
  assert.ok(out.length <= MAX_PORTRAIT_CHARS);
  // ...and the character model accepts it.
  assert.strictEqual(sanitizeCharacterPatch(blankCharacter('x'), { portrait: out }).portrait, out);

  // We still ask the CDN for a small version.
  const u = new URL(calls[0]);
  assert.strictEqual(u.searchParams.get('width'), '256');
  assert.strictEqual(u.searchParams.get('height'), '256');
});

test('fetchAvatar accepts formats other than jpeg/png/webp (e.g. GIF)', needsSharp, async (t) => {
  const gif = await sharp({ create: { width: 300, height: 400, channels: 4, background: '#a33' } }).gif().toBuffer();
  stubFetch(t, () => reply('image/gif', gif));
  const out = await fetchAvatar('https://media.dndbeyond.com/avatars/x.gif');
  assert.match(out, /^data:image\/jpeg;base64,/);
});

test('fetchAvatar refuses other hosts, non-images, broken images, huge downloads and errors', needsSharp, async (t) => {
  let respond = () => reply('image/png', Buffer.alloc(10));
  const calls = stubFetch(t, (...a) => respond(...a));
  assert.strictEqual(await fetchAvatar('https://evil.example.com/x.png'), '');
  assert.strictEqual(await fetchAvatar('http://www.dndbeyond.com/x.png'), '');
  assert.strictEqual(await fetchAvatar('https://notdndbeyond.com/x.png'), '');
  assert.strictEqual(await fetchAvatar('not a url'), '');
  assert.strictEqual(calls.length, 0, 'never requested');

  const url = 'https://www.dndbeyond.com/avatars/x.png';
  respond = () => reply('text/html', '<html>');
  assert.strictEqual(await fetchAvatar(url), '');
  respond = () => reply('image/png', Buffer.from('definitely not a png'));
  assert.strictEqual(await fetchAvatar(url), '');
  respond = () => reply('image/png', Buffer.alloc(16 * 1024 * 1024));
  assert.strictEqual(await fetchAvatar(url), '');
  respond = () => reply('image/png', Buffer.alloc(10), 404);
  assert.strictEqual(await fetchAvatar(url), '');
  respond = () => { throw new Error('offline'); };
  assert.strictEqual(await fetchAvatar(url), '');
});

test('refreshImported: a portrait in the patch replaces, otherwise kept', () => {
  const service = require('../src/features/characters/service');
  const png = (c) => `data:image/png;base64,${c}`;
  const ch = service.addImported({ name: 'A', portrait: png('AAAA') });
  assert.strictEqual(ch.portrait, png('AAAA'));
  assert.strictEqual(service.refreshImported(ch.id, { name: 'B' }).portrait, png('AAAA'));
  assert.strictEqual(service.refreshImported(ch.id, { name: 'B', portrait: png('BBBB') }).portrait, png('BBBB'));
  service.remove(ch.id);
});
