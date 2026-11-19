const test = require('node:test');
const assert = require('node:assert');
const { startServer, connect } = require('./helpers');
const { familiarForms, buildFamiliar, SPELL_FORMS, PACT_FORMS } = require('../src/features/characters/familiars');
const { blankCharacter, sanitizeCharacterPatch } = require('../src/features/characters/model');

test('forms: the Find Familiar list, other CR 0 Beasts, Pact of the Chain forms', () => {
  const forms = familiarForms();
  const names = (kind) => forms.filter((f) => f.kind === kind).map((f) => f.name);
  SPELL_FORMS.forEach((n) => assert.ok(names('spell').includes(n), n));
  const owl = forms.find((f) => f.name === 'Owl');
  assert.strictEqual(owl.edition, '2024');
  assert.match(owl.notes, /Flyby/);
  assert.strictEqual(forms.find((f) => f.name === 'Octopus').edition, '2014', 'the SRD 5.2 has no Octopus');
  assert.ok(names('beast').includes('Crab') && names('beast').includes('Seahorse'));
  assert.ok(!names('beast').includes('Owl'), 'listed forms appear once');
  assert.ok(forms.filter((f) => f.kind === 'beast').every((f) => /beast/i.test(f.creatureType)));
  ['Imp', 'Pseudodragon', 'Quasit', 'Sprite', 'Sphinx of Wonder'].forEach((n) => assert.ok(names('pact').includes(n), n));
  assert.ok(PACT_FORMS.includes('Slaad Tadpole') && !names('pact').includes('Slaad Tadpole'), 'not in the SRD library');
});

test('build: stat block copied, full HP, type kept on a new form; sanitized on the sheet', () => {
  const forms = familiarForms();
  const owl = forms.find((f) => f.name === 'Owl');
  const imp = forms.find((f) => f.name === 'Imp');
  const { familiar } = buildFamiliar({ formKey: owl.key, name: 'Hoot', creatureType: 'celestial' }, null);
  assert.deepStrictEqual(
    { name: familiar.name, form: familiar.form, type: familiar.creatureType, pact: familiar.pact, ac: familiar.ac, hp: familiar.hp },
    { name: 'Hoot', form: 'Owl', type: 'celestial', pact: false, ac: 11, hp: 1 },
  );
  const next = buildFamiliar({ formKey: imp.key }, familiar).familiar;
  assert.strictEqual(next.name, 'Hoot');
  assert.strictEqual(next.creatureType, 'celestial');
  assert.ok(next.pact);
  assert.match(buildFamiliar({ formKey: 'nope' }, null).error, /form/);

  let ch = sanitizeCharacterPatch(blankCharacter('c'), { familiar });
  ch = sanitizeCharacterPatch(ch, { familiar: { hp: 99, creatureType: 'dragon' } });
  assert.strictEqual(ch.familiar.hp, 1, 'capped at its max');
  assert.strictEqual(ch.familiar.creatureType, 'celestial', 'only celestial / fey / fiend');
  assert.strictEqual(sanitizeCharacterPatch(ch, { familiar: null }).familiar, null);
});

// The newest frame of `type` once things settle.
async function latest(client, type) {
  await new Promise((r) => setTimeout(r, 150));
  let last;
  try {
    for (;;) last = await client.next(type, () => true, 40);
  } catch { /* drained */ }
  return last;
}

test('REST + combat: owner creates it, adds it to combat, controls it; HP synced both ways', async () => {
  const srv = await startServer();
  const base = `http://localhost:${srv.port}`;
  const dm = connect(srv.port);
  try {
    await dm.opened;
    dm.send('addCharacter', { id: 'wiz1' });
    await dm.next('charState', (m) => m.characters.some((c) => c.id === 'wiz1'));
    const mine = { 'X-Kit-Role': 'player', 'X-Kit-Character': 'wiz1' };
    const other = { 'X-Kit-Role': 'player', 'X-Kit-Character': 'someone' };
    const { forms } = await (await fetch(`${base}/api/familiars`)).json();
    const cat = forms.find((f) => f.name === 'Cat');
    const post = (body, headers) => fetch(`${base}/api/familiars`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

    assert.strictEqual((await post({ characterId: 'wiz1', formKey: cat.key }, other)).status, 403);
    const made = await post({ characterId: 'wiz1', formKey: cat.key, name: 'Pip', creatureType: 'fey' }, mine);
    assert.strictEqual(made.status, 200);
    assert.strictEqual((await made.json()).character.familiar.form, 'Cat');

    // A plain sheet edit can rename it but not change its stat block.
    const player = connect(srv.port, 'role=player&character=wiz1');
    await player.opened;
    player.send('updateCharacter', { id: 'wiz1', patch: { familiar: { name: 'Pippin', ac: 30, notes: 'x' } } });
    const renamed = await player.next('charState', (m) => m.characters.find((c) => c.id === 'wiz1')?.familiar?.name === 'Pippin');
    const fam = renamed.characters.find((c) => c.id === 'wiz1').familiar;
    assert.strictEqual(fam.ac, cat.ac);
    assert.match(fam.notes, /CR 0/);

    // Into combat (the owner may), as a 'familiar' ally they control.
    player.send('addFamiliarToCombat', { characterId: 'wiz1' });
    const st = await player.next('state', (m) => m.state.combatants.some((c) => c.type === 'familiar'));
    const c = st.state.combatants.find((x) => x.type === 'familiar');
    assert.strictEqual(c.name, 'Pippin (Cat)');
    assert.strictEqual(c.ownerId, 'wiz1');
    assert.strictEqual(c.hp, cat.hpMax, 'players see an ally\'s HP');
    player.send('addFamiliarToCombat', { characterId: 'wiz1' }); // only one

    // Damage in combat → the sheet; healing on the sheet → combat.
    player.send('adjustHP', { id: c.id, delta: -1 });
    await player.next('charState', (m) => m.characters.find((x) => x.id === 'wiz1')?.familiar?.hp === cat.hpMax - 1);
    player.send('updateCharacter', { id: 'wiz1', patch: { familiar: { hp: cat.hpMax } } });
    const healed = await player.next('state', (m) => m.state.combatants.find((x) => x.type === 'familiar')?.hp === cat.hpMax);
    assert.strictEqual(healed.state.combatants.filter((x) => x.type === 'familiar').length, 1);

    // Someone else's player can't touch it.
    const stranger = connect(srv.port, 'role=player&character=someone');
    await stranger.opened;
    stranger.send('adjustHP', { id: c.id, delta: -1 });
    stranger.send('addFamiliarToCombat', { characterId: 'wiz1' });
    const last = await latest(dm, 'state');
    const fams = (last || healed).state.combatants.filter((x) => x.type === 'familiar');
    assert.strictEqual(fams.length, 1);
    assert.strictEqual(fams[0].hp, cat.hpMax, 'a stranger can\'t damage it');
    stranger.close();
    player.close();
  } finally {
    dm.close();
    await srv.close();
  }
});
