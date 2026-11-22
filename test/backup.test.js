const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { startServer, connect } = require('./helpers');

const DM = { 'X-Kit-Role': 'dm' };

test('backup / restore: DM only, full round trip, rebroadcast, safety copy', async (t) => {
  const s = await startServer();
  const dm = connect(s.port);
  t.after(async () => { dm.close(); await s.close(); });
  await dm.opened;
  const url = (p) => `http://localhost:${s.port}/api${p}`;
  const { DATA_DIR } = require('../src/config');

  dm.send('addCharacter', { id: 'bk1' });
  dm.send('updateCharacter', { id: 'bk1', patch: { name: 'Before Backup', level: 4, currency: { gp: 50 } } });
  dm.send('addCombatant', { name: 'Goblin 1', init: 12, ac: 15, hp: 7, type: 'monster' });
  await dm.next('charState', (m) => m.characters.some((c) => c.name === 'Before Backup'));
  // A map background image on disk (as an upload would leave it).
  fs.mkdirSync(path.join(DATA_DIR, 'maps'), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'maps', 'abcdef12.png'), Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  fs.writeFileSync(path.join(DATA_DIR, 'map-backgrounds.json'), JSON.stringify([{ id: 'abcdef12', name: 'Cave', file: 'abcdef12.png', type: 'image/png' }]));

  // Players can't.
  assert.strictEqual((await fetch(url('/backup'), { headers: { 'X-Kit-Role': 'player', 'X-Kit-Character': 'bk1' } })).status, 403);
  assert.strictEqual((await fetch(url('/restore'), { method: 'POST', body: '{}' })).status, 403);

  const resp = await fetch(url('/backup'), { headers: DM });
  assert.strictEqual(resp.status, 200);
  assert.match(resp.headers.get('content-disposition'), /attachment; filename="adventurers-kit-backup-\d{4}-\d\d-\d\d\.json"/);
  const bundle = await resp.json();
  assert.strictEqual(bundle.format, 'adventurers-kit-backup');
  assert.ok(bundle.files['characters.json'].some((c) => c.name === 'Before Backup'));
  assert.ok(bundle.files['combat.json'].tables[''].combatants.some((c) => c.name === 'Goblin 1'), 'pending writes flushed first');
  assert.strictEqual(bundle.files['maps/abcdef12.png'], Buffer.from([137, 80, 78, 71, 1, 2, 3]).toString('base64'));
  assert.ok(bundle.files['items.json'].length > 900);

  // Change everything, then restore.
  dm.send('updateCharacter', { id: 'bk1', patch: { name: 'Changed' } });
  dm.send('addCharacter', { id: 'bk2' });
  dm.send('clearAll');
  await dm.next('charState', (m) => m.characters.some((c) => c.id === 'bk2'));
  fs.unlinkSync(path.join(DATA_DIR, 'maps', 'abcdef12.png'));
  fs.writeFileSync(path.join(DATA_DIR, 'extra.srd-version'), 'x'); // not in the backup: removed

  const r = await fetch(url('/restore'), { method: 'POST', headers: { ...DM, 'Content-Type': 'application/json' }, body: JSON.stringify(bundle) });
  const result = await r.json();
  assert.strictEqual(r.status, 200, JSON.stringify(result));
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'backups', result.safetyCopy)), 'the previous data was kept');

  const chars = await dm.next('charState', (m) => m.characters.some((c) => c.name === 'Before Backup'));
  assert.ok(!chars.characters.some((c) => c.id === 'bk2'));
  assert.strictEqual(chars.characters.find((c) => c.id === 'bk1').currency.gp, 50);
  await dm.next('state', (m) => m.state.combatants.some((c) => c.name === 'Goblin 1'));
  await dm.next('mapState', (m) => (m.map.backgrounds || []).some((b) => b.id === 'abcdef12'));
  assert.ok(fs.existsSync(path.join(DATA_DIR, 'maps', 'abcdef12.png')));
  assert.ok(!fs.existsSync(path.join(DATA_DIR, 'extra.srd-version')));
  const safety = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'backups', result.safetyCopy), 'utf8'));
  assert.ok(safety.files['characters.json'].some((c) => c.id === 'bk2'), 'the safety copy has the replaced data');
});

test('restore rejects files that are not backups, without touching the data', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  const post = (body) => fetch(`http://localhost:${s.port}/api/restore`, { method: 'POST', headers: { ...DM, 'Content-Type': 'application/json' }, body });
  const before = require('../src/features/characters/service').all().length;
  const bad = [
    'not json',
    JSON.stringify({ hello: 1 }),
    JSON.stringify({ format: 'adventurers-kit-backup', version: 99, files: {} }),
    JSON.stringify({ format: 'adventurers-kit-backup', version: 1, files: { '../etc/passwd': 'x' } }),
    JSON.stringify({ format: 'adventurers-kit-backup', version: 1, files: { 'maps/zz.png': 'x' } }),
    JSON.stringify({ format: 'adventurers-kit-backup', version: 1, files: { 'characters.json': 'not an object' } }),
    JSON.stringify({ format: 'adventurers-kit-backup', version: 1, files: { 'maps/abcdef12.png': '!!' } }),
  ];
  for (const body of bad) {
    const r = await post(body);
    assert.strictEqual(r.status, 400, body);
    assert.ok((await r.json()).error);
  }
  assert.strictEqual(require('../src/features/characters/service').all().length, before);
});

test('automatic backups: due weekly, newest 2 kept, listed and downloadable by the DM only, kept across a restore', async (t) => {
  const s = await startServer();
  t.after(() => s.close());
  const backup = require('../src/features/backup/service');
  const { DATA_DIR } = require('../src/config');
  const dir = path.join(DATA_DIR, 'backups');
  backup.autoBackups().forEach((b) => fs.unlinkSync(path.join(dir, b.name))); // a clean start

  const day = 24 * 60 * 60 * 1000;
  const t0 = new Date('2026-01-01T10:00:00.000Z');
  assert.ok(backup.autoBackupDue(7, t0), 'none yet: due');
  backup.runAutoBackup({ keep: 2, now: t0 });
  assert.ok(!backup.autoBackupDue(7, new Date(+t0 + 6 * day)), 'six days later: not yet');
  assert.ok(backup.autoBackupDue(7, new Date(+t0 + 7 * day)), 'a week later: due');
  backup.runAutoBackup({ keep: 2, now: new Date(+t0 + 7 * day) });
  backup.runAutoBackup({ keep: 2, now: new Date(+t0 + 14 * day) });
  const list = backup.autoBackups();
  assert.deepStrictEqual(list.map((b) => b.createdAt), [new Date(+t0 + 14 * day).toISOString(), new Date(+t0 + 7 * day).toISOString()]);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, list[0].name), 'utf8'));
  assert.strictEqual(saved.format, backup.FORMAT, 'the same bundle as Download backup');

  const base = `http://localhost:${s.port}`;
  const r = await fetch(`${base}/api/backups`, { headers: DM });
  const data = await r.json();
  assert.strictEqual(data.keep, 2);
  assert.strictEqual(data.everyDays, 7);
  assert.strictEqual(data.backups.length, 2);
  assert.strictEqual((await fetch(`${base}/api/backups`, { headers: { 'X-Kit-Role': 'player' } })).status, 403);
  const dl = await fetch(`${base}/api/backups/${list[0].name}`, { headers: DM });
  assert.strictEqual(dl.status, 200);
  assert.strictEqual((await dl.json()).format, backup.FORMAT);
  assert.strictEqual((await fetch(`${base}/api/backups/..%2Fcharacters.json`, { headers: DM })).status, 404);

  // A restore keeps them (they live in backups/, not with the data).
  await fetch(`${base}/api/restore`, { method: 'POST', headers: { ...DM, 'Content-Type': 'application/json' }, body: JSON.stringify(saved) });
  assert.strictEqual(backup.autoBackups().length, 2);
});
