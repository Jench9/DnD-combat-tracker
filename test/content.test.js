// Custom content (subclasses, species, backgrounds, feats with a source
// tag): who may add it, validation, and that the guided creation and level
// up use it like the SRD options.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');
const { blankCharacter, sanitizeCharacterPatch } = require('../src/features/characters/model');
const { getRules } = require('../src/features/characters/builder/rules');
const { buildCharacter } = require('../src/features/characters/builder/create');
const { applyLevelUp } = require('../src/features/characters/builder/levelup');
const items = require('../src/features/items/service');
const spells = require('../src/features/spells/service');

let n = 0;
const ctx = () => ({ rules: getRules(), spells: spells.all(), items: items.all(), newId: () => `y${++n}` });

test('custom content: DMs add it with a source tag; the builder offers and uses it', async () => {
  const srv = await startServer();
  const base = `http://localhost:${srv.port}`;
  const call = async (method, path, body, who = 'dm') => {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Kit-Role': who },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  try {
    const PHB = "Player's Handbook (2024)";
    // Players can read, not add.
    assert.strictEqual((await call('GET', '/api/content', null, 'player')).status, 200);
    assert.strictEqual((await call('POST', '/api/content', { kind: 'feat', name: 'X', source: PHB }, 'player')).status, 403);
    // Validation.
    assert.match((await call('POST', '/api/content', { kind: 'feat', name: 'Lucky' })).data.error, /source/);
    assert.match((await call('POST', '/api/content', { kind: 'background', name: 'Noble', source: PHB, abilities: ['str'] })).data.error, /three/);

    const feat = (await call('POST', '/api/content', {
      kind: 'feat', name: 'Lucky', source: PHB, type: 'origin', desc: 'Luck points.', minLevel: 0,
    })).data.entry;
    const species = (await call('POST', '/api/content', {
      kind: 'species', name: 'Aasimar', source: PHB, size: 'Medium', speed: 30, skillChoice: true,
      traits: [{ name: 'Celestial Resistance', desc: 'Resistance to Necrotic and Radiant damage.' }, { name: '' }],
    })).data.entry;
    const bg = (await call('POST', '/api/content', {
      kind: 'background', name: 'Noble', source: PHB, abilities: ['str', 'int', 'cha'], skills: ['History', 'Persuasion'],
      tools: 'Gaming Set', featKey: `c-${feat.id}`, equipment: 'Fine Clothes, Signet Ring', gp: 29,
    })).data.entry;
    const sub = (await call('POST', '/api/content', {
      kind: 'subclass', name: 'Battle Master', source: PHB, classKey: 'fighter', summary: 'Master of maneuvers',
      features: [{ level: 7, name: 'Know Your Enemy', desc: 'Study a creature.' }, { level: 3, name: 'Combat Superiority', desc: 'Superiority dice.' }],
    })).data.entry;
    assert.deepStrictEqual(sub.features.map((f) => f.level), [3, 7], 'sorted by level');
    assert.deepStrictEqual(species.traits.map((t) => t.name), ['Celestial Resistance'], 'empty traits dropped');

    // The builder's rules (what the browser gets) include them, tagged.
    const rules = await (await fetch(`${base}/api/builder/rules`)).json();
    const fighter = rules.classes.find((c) => c.key === 'fighter');
    assert.strictEqual(fighter.subclasses.find((s) => s.name === 'Champion').source, 'SRD 5.2');
    assert.strictEqual(fighter.subclasses.find((s) => s.name === 'Battle Master').source, PHB);
    assert.strictEqual(rules.species.find((s) => s.name === 'Aasimar').source, PHB);
    assert.strictEqual(rules.backgrounds.find((b) => b.name === 'Noble').feat.name, 'Lucky');
    assert.ok(rules.feats.some((f) => f.name === 'Lucky' && f.type === 'origin'));

    // A character with all of it: Aasimar Noble Fighter, then Battle Master at 3.
    const build = {
      name: 'Aurel', classKey: 'fighter', backgroundKey: `c-${bg.id}`, speciesKey: `c-${species.id}`,
      abilityMethod: 'standard', abilities: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
      backgroundBonus: { str: 2, cha: 1 }, classSkills: ['Athletics', 'Perception'], speciesSkill: 'Insight',
      level1: { fightingStyle: 'defense' }, equipment: { class: 0, background: 0 },
    };
    const made = buildCharacter(blankCharacter('au'), build, ctx());
    assert.ifError(made.error);
    let ch = sanitizeCharacterPatch(blankCharacter('au'), made.patch);
    assert.strictEqual(ch.race, 'Aasimar');
    assert.ok(ch.skillProf.History && ch.skillProf.Persuasion && ch.skillProf.Insight);
    assert.match(ch.features, /Celestial Resistance/);
    assert.match(ch.features, /Lucky/);
    assert.ok(ch.feats.includes(`c-${feat.id}`));
    assert.match(ch.equipment, /Signet Ring/);
    ch = sanitizeCharacterPatch(ch, applyLevelUp(ch, { classKey: 'fighter', hp: { method: 'average' } }, ctx()).patch);
    const up = applyLevelUp(ch, { classKey: 'fighter', hp: { method: 'average' }, subclass: `c-${sub.id}` }, ctx());
    assert.ifError(up.error);
    ch = sanitizeCharacterPatch(ch, up.patch);
    assert.strictEqual(ch.classes[0].subclassName, 'Battle Master');
    assert.match(ch.features, /Combat Superiority/);
    assert.doesNotMatch(ch.features, /Know Your Enemy/, 'the level 7 feature comes later');

    // Edit and delete: the tag changes everywhere; deleted = no longer offered.
    await call('PUT', `/api/content/${species.id}`, { source: 'Homebrew' });
    assert.strictEqual(getRules().speciesByKey.get(`c-${species.id}`).source, 'Homebrew');
    await call('DELETE', `/api/content/${species.id}`);
    assert.ok(!getRules().speciesByKey.has(`c-${species.id}`));
    assert.strictEqual(ch.race, 'Aasimar', 'built characters keep what they got');
  } finally {
    await srv.close();
  }
});
