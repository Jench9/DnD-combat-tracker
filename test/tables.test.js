// Campaign tables (accounts mode): each campaign has its own DM(s), fight
// and map; DMs only see and run their own campaigns; the admin sees all.
process.env.KIT_AUTH = 'accounts';
process.env.KIT_SETUP_CODE = 'TABLES-CODE';
const test = require('node:test');
const assert = require('node:assert');
const { startServer, connect } = require('./helpers');

function client(base) {
  let cookie = '';
  async function call(method, path, body) {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const m = (r.headers.get('set-cookie') || '').match(/kit_session=([^;]*)/);
    if (m) cookie = m[1] ? `kit_session=${m[1]}` : '';
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }
  return { call, get cookie() { return cookie; } };
}

test('two DMs, two campaigns: separate fights, characters and powers', async () => {
  const srv = await startServer();
  const base = `http://localhost:${srv.port}`;
  const open = [];
  const ws = (who, query) => { const c = connect(srv.port, query, { headers: { Cookie: who.cookie } }); open.push(c); return c; };
  try {
    const admin = client(base);
    await admin.call('POST', '/api/auth/setup', { code: 'TABLES-CODE', username: 'Admin', password: 'admin-pass-1' });
    const join = async (inviteBody, username) => {
      const inv = await admin.call('POST', '/api/accounts/invites', inviteBody);
      const c = client(base);
      const r = await c.call('POST', `/api/auth/invite/${inv.data.code}`, { username, password: 'password-123' });
      assert.strictEqual(r.status, 200, JSON.stringify(r.data));
      return c;
    };
    const ana = await join({ role: 'dm' }, 'Ana');
    const ben = await join({ role: 'dm' }, 'Ben');

    // Each DM creates a campaign (before it, they're at no table).
    const a0 = ws(ana, 'role=dm');
    await a0.opened;
    a0.send('addCampaign', { id: 'ca', name: 'Ana Campaign' });
    await a0.next('campaignState', (m) => m.campaigns.some((c) => c.id === 'ca'));
    const b0 = ws(ben, 'role=dm');
    await b0.opened;
    b0.send('addCampaign', { id: 'cb', name: 'Ben Campaign' });
    const bc = await b0.next('campaignState', (m) => m.campaigns.some((c) => c.id === 'cb'));
    assert.deepStrictEqual(bc.campaigns.map((c) => c.id), ['cb'], 'Ben sees only his campaign');

    // Ana invites a player into her campaign; Ben can't invite into hers, nor DMs.
    assert.strictEqual((await ben.call('POST', '/api/accounts/invites', { role: 'player', campaignIds: ['ca'] })).status, 400);
    assert.strictEqual((await ben.call('POST', '/api/accounts/invites', { role: 'dm', campaignIds: ['cb'] })).status, 403);
    const inv = await ana.call('POST', '/api/accounts/invites', { role: 'player', campaignIds: ['ca'] });
    assert.strictEqual(inv.status, 200, JSON.stringify(inv.data));
    const pl = client(base);
    await pl.call('POST', `/api/auth/invite/${inv.data.code}`, { username: 'Pia', password: 'password-123' });
    assert.deepStrictEqual((await pl.call('GET', '/api/auth/status')).data.account.tables.map((t) => t.id), ['ca']);

    // "Runs" in an invite: the admin invites Quinn to play in Ana's campaign
    // and run Ben's; a DM can't hand out DM-ship.
    assert.strictEqual((await ana.call('POST', '/api/accounts/invites', { role: 'player', campaignIds: ['ca'], dmCampaignIds: ['ca'] })).status, 403);
    const qInv = await admin.call('POST', '/api/accounts/invites', { role: 'player', campaignIds: ['ca'], dmCampaignIds: ['cb', 'gone'] });
    const quinn = client(base);
    assert.strictEqual((await quinn.call('POST', `/api/auth/invite/${qInv.data.code}`, { username: 'Quinn', password: 'password-123' })).status, 200);
    const qTables = (await quinn.call('GET', '/api/auth/status')).data.account.tables;
    assert.deepStrictEqual(qTables.map((t) => [t.id, t.dm]).sort(), [['ca', false], ['cb', true]]);

    // Pia creates a character: it joins Ana's campaign (her table).
    const p = ws(pl, 'role=player');
    await p.opened;
    p.send('addCharacter', { id: 'pia1' });
    const pc = await p.next('charState', (m) => m.characters.some((c) => c.id === 'pia1'));
    assert.deepStrictEqual(pc.characters.find((c) => c.id === 'pia1').campaignIds, ['ca']);

    // Separate fights.
    const a = ws(ana, 'role=dm&campaign=ca');
    const b = ws(ben, 'role=dm&campaign=cb');
    await Promise.all([a.opened, b.opened]);
    a.send('addCombatant', { name: 'Goblin', init: 10, ac: 12, hp: 7, type: 'monster' });
    b.send('addCombatant', { name: 'Ogre', init: 5, ac: 11, hp: 59, type: 'monster' });
    const as = await a.next('state', (m) => m.state.combatants.some((c) => c.name === 'Goblin'));
    const bs = await b.next('state', (m) => m.state.combatants.some((c) => c.name === 'Ogre'));
    assert.deepStrictEqual(as.state.combatants.map((c) => c.name), ['Goblin']);
    assert.deepStrictEqual(bs.state.combatants.map((c) => c.name), ['Ogre']);
    const adminAtB = ws(admin, 'role=dm&campaign=cb');
    await adminAtB.opened;
    assert.deepStrictEqual((await adminAtB.next('state')).state.combatants.map((c) => c.name), ['Ogre'], 'the admin can sit at any table');
    a.send('clearAll', {});
    await a.next('state', (m) => m.state.combatants.length === 0);

    // Characters: Ben neither sees nor changes Pia's; Ana does.
    const bChars = await b.next('charState');
    assert.ok(!bChars.characters.some((c) => c.id === 'pia1'));
    b.send('updateCharacter', { id: 'pia1', patch: { notes: 'Ben was here' } });
    await new Promise((r) => setTimeout(r, 100));
    a.send('updateCharacter', { id: 'pia1', patch: { name: 'Pia the Brave' } });
    const byAna = await a.next('charState', (m) => m.characters.find((c) => c.id === 'pia1')?.name === 'Pia the Brave');
    assert.strictEqual(byAna.characters.find((c) => c.id === 'pia1').notes, '', 'Ben could not edit it');
    // Pia can't move her character into Ben's campaign.
    p.send('updateCharacter', { id: 'pia1', patch: { campaignIds: ['cb'], name: 'Pia' } });
    const after = await p.next('charState', (m) => m.characters.find((c) => c.id === 'pia1')?.name === 'Pia');
    assert.deepStrictEqual(after.characters.find((c) => c.id === 'pia1').campaignIds, ['ca']);

    // Campaign powers.
    a.send('renameCampaign', { id: 'cb', name: 'Taken over' });
    a.send('setCampaignDms', { id: 'cb', dmIds: [] });
    b.send('renameCampaign', { id: 'cb', name: 'Ben Renamed' });
    const renamed = await b.next('campaignState', (m) => m.campaigns.find((c) => c.id === 'cb')?.name === 'Ben Renamed');
    assert.deepStrictEqual(renamed.campaigns.find((c) => c.id === 'cb').dmIds.length, 2, 'Ana could not change Ben\'s DMs (Ben + Quinn)');
    assert.strictEqual((await ana.call('GET', '/api/backup')).status, 403, 'backups: admin only');
    assert.strictEqual((await ana.call('POST', `/api/accounts/x/reset`)).status, 403);

    // Ana's Players list: Pia and Quinn (they play in her campaign) and herself, not Ben.
    const list = (await a.next('accountState', (m) => m.accounts.list)).accounts.list.map((x) => x.username).sort();
    assert.deepStrictEqual(list, ['Ana', 'Pia', 'Quinn']);

    // One account, two roles: the admin makes Pia (a player account) DM of
    // Ben's campaign. She runs that table and still plays at Ana's.
    const adm = ws(admin, 'role=dm&campaign=cb');
    await adm.opened;
    adm.send('setCampaignDms', { id: 'cb', dmIds: [bc.campaigns[0].dmIds[0], 'nope'] }); // Ben (+ unknown, dropped)
    const benId = bc.campaigns[0].dmIds[0];
    const piaId = (await pl.call('GET', '/api/auth/status')).data.account.id;
    adm.send('setCampaignDms', { id: 'cb', dmIds: [benId, piaId] });
    await adm.next('campaignState', (m) => m.campaigns.find((c) => c.id === 'cb')?.dmIds.includes(piaId));
    const piaTables = (await pl.call('GET', '/api/auth/status')).data.account.tables;
    assert.deepStrictEqual(piaTables.map((t) => [t.id, t.dm]).sort(), [['ca', false], ['cb', true]]);
    const piaDm = ws(pl, 'role=dm&campaign=cb');
    await piaDm.opened;
    const atB = await piaDm.next('state');
    assert.strictEqual(atB.state.combatants.find((c) => c.name === 'Ogre').hp, 59, 'the DM view: real HP');
    piaDm.send('renameCampaign', { id: 'cb', name: 'Co-run by Pia' });
    await piaDm.next('campaignState', (m) => m.campaigns.find((c) => c.id === 'cb')?.name === 'Co-run by Pia');
    // At Ana's table she's still a player, even asking for the DM view.
    a.send('addCombatant', { name: 'Hidden Wolf', init: 8, ac: 13, hp: 11, type: 'monster' });
    await a.next('state', (m) => m.state.combatants.some((c) => c.name === 'Hidden Wolf'));
    const piaAtA = ws(pl, 'role=dm&campaign=ca');
    await piaAtA.opened;
    const atA = await piaAtA.next('state', (m) => m.state.combatants.some((c) => c.name === 'Hidden Wolf'));
    const wolf = atA.state.combatants.find((c) => c.name === 'Hidden Wolf');
    assert.strictEqual(wolf.hp, undefined, 'a player sees a health word, not HP');
    assert.ok(wolf.health);
    piaAtA.send('renameCampaign', { id: 'ca', name: 'Not hers' });
    piaAtA.send('clearAll', {});
    await new Promise((r) => setTimeout(r, 150));
    const a2 = ws(ana, 'role=dm&campaign=ca');
    await a2.opened;
    assert.ok((await a2.next('state')).state.combatants.some((c) => c.name === 'Hidden Wolf'), 'she could not clear Ana\'s fight');
    assert.strictEqual((await a2.next('campaignState')).campaigns.find((c) => c.id === 'ca').name, 'Ana Campaign', 'nor rename it');

    // The admin joins Ana's game as a player: a character made from the
    // player view is theirs; at that table they then see what players see.
    const admPl = ws(admin, 'role=player&campaign=ca');
    await admPl.opened;
    admPl.send('addCharacter', { id: 'admpc' });
    await admPl.next('accountState', (m) => m.accounts.me.characterIds.includes('admpc'));
    const admChar = (await admPl.next('charState', (m) => m.characters.some((c) => c.id === 'admpc'))).characters.find((c) => c.id === 'admpc');
    assert.deepStrictEqual(admChar.campaignIds, ['ca']);
    const asPlayer = ws(admin, 'role=player&campaign=ca&character=admpc');
    await asPlayer.opened;
    const seen = (await asPlayer.next('state', (m) => m.state.combatants.some((c) => c.name === 'Hidden Wolf'))).state.combatants.find((c) => c.name === 'Hidden Wolf');
    assert.strictEqual(seen.hp, undefined, 'the admin as a player: health words only');
    asPlayer.send('updateCharacter', { id: 'admpc', patch: { name: 'Admin the Bard' } });
    await a.next('charState', (m) => m.characters.find((c) => c.id === 'admpc')?.name === 'Admin the Bard'); // Ana sees it
    a.send('updateCharacter', { id: 'admpc', patch: { notes: 'Ana DMs this one' } });
    await asPlayer.next('charState', (m) => m.characters.find((c) => c.id === 'admpc')?.notes === 'Ana DMs this one');
    // From the DM view (the admin runs every table) a new character is an NPC: not linked.
    const admDm = ws(admin, 'role=dm&campaign=ca');
    await admDm.opened;
    assert.strictEqual((await admDm.next('state')).state.combatants.find((c) => c.name === 'Hidden Wolf').hp, 11, 'the DM view: real HP');
    admDm.send('addCharacter', { id: 'npc1', campaignId: 'ca' });
    await admDm.next('charState', (m) => m.characters.some((c) => c.id === 'npc1'));
    assert.ok(!(await admin.call('GET', '/api/auth/status')).data.account.characterIds.includes('npc1'));

    // Ana deletes her campaign: Pia's connection is at no table any more.
    a.send('deleteCampaign', { id: 'ca' });
    await a.next('campaignState', (m) => !m.campaigns.some((c) => c.id === 'ca'));
    const status = (await pl.call('GET', '/api/auth/status')).data.account;
    assert.deepStrictEqual(status.tables.map((t) => t.id).sort(), ['', 'cb'], 'her character is in no campaign now; she still runs cb');
  } finally {
    open.forEach((c) => c.close());
    await srv.close();
  }
});
