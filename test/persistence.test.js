const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Runs a snippet in a fresh Node process against DATA_DIR, so each run is
// a real "server restart" with nothing left in memory.
function run(dataDir, code) {
  return execFileSync(process.execPath, ['-e', code], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: 'utf8',
  });
}

test('characters survive a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-persist-'));
  run(dir, `
    const s = require('./src/features/characters/service');
    const ch = s.addImported({ name: 'Brann', level: 4, abilities: { con: 16 } });
    s.addBlank('gone'); s.remove('gone');
    require('./src/core/jsonStore').flushAllStores();
  `);
  const out = JSON.parse(run(dir, `
    process.stdout.write(JSON.stringify(require('./src/features/characters/service').all()));
  `));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].name, 'Brann');
  assert.strictEqual(out[0].level, 4);
  assert.strictEqual(out[0].abilities.con, 16);
});

test('a corrupt or malformed file loads safely', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-persist-'));
  fs.writeFileSync(path.join(dir, 'characters.json'), '[{"id":"a1","level":99,"name":5}, null, {"noid":true}]');
  const out = JSON.parse(run(dir, `process.stdout.write(JSON.stringify(require('./src/features/characters/service').all()))`));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].level, 20);
  assert.strictEqual(out[0].name, '');

  fs.writeFileSync(path.join(dir, 'characters.json'), '{not json');
  const out2 = run(dir, `process.stdout.write(JSON.stringify(require('./src/features/characters/service').all()))`);
  assert.strictEqual(out2.trim().split('\n').pop(), '[]');
});
