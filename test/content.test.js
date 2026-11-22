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

test('custom subclass: spellcasting (one-third caster), resources and features used in play', async () => {
  const srv = await startServer();
  const base = `http://localhost:${srv.port}`;
  try {
    const cantrips = Array(20).fill(0);
    const prepared = Array(20).fill(0);
    for (let lv = 3; lv <= 20; lv++) { cantrips[lv - 1] = lv >= 10 ? 3 : 2; prepared[lv - 1] = lv === 3 ? 3 : lv < 7 ? 4 : 5; }
    const r = await fetch(`${base}/api/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Kit-Role': 'dm' },
      body: JSON.stringify({
        kind: 'subclass', name: 'Spell Knight', source: 'Homebrew', classKey: 'fighter',
        resources: [{ name: 'Superiority Dice', recharge: 'short', usesText: '3:4, 7:5, 15:6' }, { name: 'Bad', usesText: 'nonsense' }],
        features: [
          { level: 3, name: 'Parry Strike', desc: '**Bonus Action.** Spend a die.', action: 'bonus', resource: 'Superiority Dice', cost: 1 },
          { level: 3, name: 'Spellcasting', desc: 'Cantrips | Prepared\n2 | 3' },
          { level: 7, name: 'War Magic', desc: 'Cast and attack.', action: 'free', resource: 'Not a resource' },
        ],
        spellcasting: { type: 'third', ability: 'int', list: 'wizard', cantrips, prepared },
      }),
    });
    const { entry } = await r.json();
    assert.deepStrictEqual(entry.resources.map((x) => x.name), ['Superiority Dice'], 'an unusable resource is dropped');
    assert.deepStrictEqual(entry.resources[0].uses, [{ level: 3, max: 4 }, { level: 7, max: 5 }, { level: 15, max: 6 }]);
    assert.strictEqual(entry.features.find((f) => f.name === 'War Magic').resource, '', 'only its own resources');

    const key = `c-${entry.id}`;
    const spellsBy = (lvl, n, cantrip) => spells.all().filter((s) => s.edition === '2024' && (s.classes || []).includes('wizard') && (cantrip ? s.level === 0 : s.level === lvl)).slice(0, n).map((s) => s.id);
    // A Fighter 2 (SRD), then level 3 with the custom subclass.
    const FIGHTER = {
      name: 'Kay', classKey: 'fighter', backgroundKey: 'soldier', speciesKey: 'human', originFeat: { key: 'alert' },
      abilityMethod: 'standard', abilities: { str: 15, dex: 13, con: 14, int: 12, wis: 10, cha: 8 },
      backgroundBonus: { str: 2, con: 1 }, classSkills: ['Perception', 'History'], speciesSkill: 'Insight',
      level1: { fightingStyle: 'defense' }, equipment: { class: 0, background: 0 },
    };
    const made = buildCharacter(blankCharacter('sk'), FIGHTER, ctx());
    assert.ifError(made.error);
    let ch = sanitizeCharacterPatch(blankCharacter('sk'), made.patch);
    ch = sanitizeCharacterPatch(ch, applyLevelUp(ch, { classKey: 'fighter', hp: { method: 'average' } }, ctx()).patch);
    assert.strictEqual(ch.spellAbility, '');

    const plan = require('../src/features/characters/builder/levelup').levelUpPlan(ch, 'fighter', ctx());
    const opt = plan.subclasses.find((s) => s.key === key);
    assert.deepStrictEqual(opt.choices.find((c) => c.type === 'spells'), { type: 'spells', list: 'wizard', cantrips: 2, spells: 3, maxLevel: 1 });
    const up3 = applyLevelUp(ch, {
      classKey: 'fighter', hp: { method: 'average' }, subclass: key,
      spells: { cantrips: spellsBy(0, 2, true), spells: spellsBy(1, 3) },
    }, ctx());
    assert.ifError(up3.error);
    ch = sanitizeCharacterPatch(ch, up3.patch);
    assert.strictEqual(ch.spellAbility, 'int');
    assert.deepStrictEqual(ch.spellSlots.slice(0, 2).map((s) => s.max), [2, 0], 'a level 3 one-third caster: 2 first-level slots');
    assert.strictEqual(ch.spells.length, 5);
    assert.deepStrictEqual(ch.resources.find((x) => x.name === 'Superiority Dice'), { ...ch.resources.find((x) => x.name === 'Superiority Dice'), max: 4, recharge: 'short' });
    assert.deepStrictEqual(ch.customActions.map((a) => [a.name, a.type, a.resource, a.cost]), [['Parry Strike', 'bonus', 'Superiority Dice', 1]]);
    assert.match(ch.features, /Cantrips \| Prepared/, 'the text, with its table, on the sheet');

    // Level 4: one more spell (3 → 4 prepared), 3 slots.
    const p4 = require('../src/features/characters/builder/levelup').levelUpPlan(ch, 'fighter', ctx());
    assert.deepStrictEqual(p4.choices.find((c) => c.type === 'spells'), { type: 'spells', list: 'wizard', cantrips: 0, spells: 1, maxLevel: 1 });
    const taken = new Set(ch.spells.map((s) => s.spellId));
    const one = spells.all().find((s) => s.edition === '2024' && s.level === 1 && (s.classes || []).includes('wizard') && !taken.has(s.id)).id;
    const up4 = applyLevelUp(ch, { classKey: 'fighter', hp: { method: 'average' }, spells: { spells: [one] }, feat: { key: 'ability-score-improvement', plus: { con: 1, str: 1 } } }, ctx());
    assert.ifError(up4.error);
    ch = sanitizeCharacterPatch(ch, up4.patch);
    assert.strictEqual(ch.spellSlots[0].max, 3);
    // Up to 7: 4 + 2 slots, 5 dice, War Magic (no resource) in the Actions list.
    for (let lv = 5; lv <= 7; lv++) {
      const pl = require('../src/features/characters/builder/levelup').levelUpPlan(ch, 'fighter', ctx());
      const sp = pl.choices.find((c) => c.type === 'spells');
      const have = new Set(ch.spells.map((s) => s.spellId));
      const picks = sp && sp.spells ? spells.all().filter((s) => s.edition === '2024' && s.level >= 1 && s.level <= sp.maxLevel && (s.classes || []).includes('wizard') && !have.has(s.id)).slice(0, sp.spells).map((s) => s.id) : [];
      const feat = pl.choices.some((c) => c.type === 'feat') ? { feat: { key: 'ability-score-improvement', plus: { dex: 1, wis: 1 } } } : {}; // Fighter 6
      const res = applyLevelUp(ch, { classKey: 'fighter', hp: { method: 'average' }, spells: { spells: picks }, ...feat }, ctx());
      assert.ifError(res.error);
      ch = sanitizeCharacterPatch(ch, res.patch);
    }
    assert.deepStrictEqual(ch.spellSlots.slice(0, 3).map((s) => s.max), [4, 2, 0]);
    assert.strictEqual(ch.resources.find((x) => x.name === 'Superiority Dice').max, 5);
    assert.ok(ch.customActions.some((a) => a.name === 'War Magic' && a.type === 'free' && a.resource === ''));
  } finally {
    await srv.close();
  }
});
