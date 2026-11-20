const test = require('node:test');
const assert = require('node:assert');
const { startServer, connect } = require('./helpers');

test('campaigns: create, assign characters, rename, delete keeps characters', async (t) => {
  const s = await startServer();
  const a = connect(s.port);
  const b = connect(s.port);
  t.after(async () => { a.close(); b.close(); await s.close(); });
  await Promise.all([a.opened, b.opened]);
  await b.next('campaignState');

  a.send('addCampaign', { id: 'camp1', name: '  Curse of Strahd  ' });
  a.send('addCampaign', { id: 'camp1', name: 'Duplicate id' }); // ignored
  a.send('addCampaign', { id: 'BAD ID!', name: 'x' }); // ignored
  a.send('addCampaign', { id: 'camp2', name: '' }); // ignored
  const created = await b.next('campaignState', (m) => m.campaigns.length === 1);
  assert.deepStrictEqual(created.campaigns, [{ id: 'camp1', name: 'Curse of Strahd' }]);

  a.send('addCharacter', { id: 'pc1', campaignId: 'camp1' });
  a.send('addCharacter', { id: 'pc2' });
  const chars = await b.next('charState', (m) => m.characters.some((c) => c.id === 'pc2'));
  const byId = Object.fromEntries(chars.characters.map((c) => [c.id, c]));
  assert.strictEqual(byId.pc1.campaignId, 'camp1');
  assert.strictEqual(byId.pc2.campaignId, '');

  a.send('updateCharacter', { id: 'pc2', patch: { campaignId: 'camp1' } });
  await b.next('charState', (m) => m.characters.find((c) => c.id === 'pc2')?.campaignId === 'camp1');

  a.send('renameCampaign', { id: 'camp1', name: 'Strahd' });
  await b.next('campaignState', (m) => m.campaigns[0] && m.campaigns[0].name === 'Strahd');

  a.send('deleteCampaign', { id: 'camp1' });
  await b.next('campaignState', (m) => m.campaigns.length === 0);
  // Both characters still exist, now with no campaign.
  const mine = (m) => m.characters.filter((c) => ['pc1', 'pc2'].includes(c.id));
  await b.next('charState', (m) => mine(m).length === 2 && mine(m).every((c) => c.campaignId === ''));

});

test('refreshImported keeps the campaign', () => {
  const service = require('../src/features/characters/service');
  const ch = service.addImported({ name: 'A', campaignId: 'camp9' });
  const up = service.refreshImported(ch.id, { name: 'B', campaignId: 'other' });
  assert.strictEqual(up.campaignId, 'camp9');
  assert.strictEqual(up.name, 'B');
  service.remove(ch.id);
});

test('several campaigns per character; deleting one keeps the others; old campaignId still works', async () => {
  const srv = await startServer();
  const dm = connect(srv.port);
  try {
    await dm.opened;
    dm.send('addCampaign', { id: 'ca', name: 'Curse of A' });
    dm.send('addCampaign', { id: 'cb', name: 'Bandits of B' });
    dm.send('addCharacter', { id: 'both', campaignId: 'ca' });
    let m = await dm.next('charState', (s) => s.characters.some((c) => c.id === 'both'));
    assert.deepStrictEqual(m.characters.find((c) => c.id === 'both').campaignIds, ['ca'], 'a plain campaignId = just that one');

    dm.send('updateCharacter', { id: 'both', patch: { campaignIds: ['ca', 'cb', 'ca', 'BAD!'] } });
    m = await dm.next('charState', (s) => s.characters.find((c) => c.id === 'both')?.campaignIds.length === 2);
    const ch = m.characters.find((c) => c.id === 'both');
    assert.deepStrictEqual(ch.campaignIds, ['ca', 'cb']);
    assert.strictEqual(ch.campaignId, 'ca', 'campaignId = the first');

    dm.send('deleteCampaign', { id: 'ca' });
    m = await dm.next('charState', (s) => s.characters.find((c) => c.id === 'both')?.campaignIds.length === 1);
    assert.deepStrictEqual(m.characters.find((c) => c.id === 'both').campaignIds, ['cb']);
    assert.strictEqual(m.characters.find((c) => c.id === 'both').campaignId, 'cb');

    const summary = await (await fetch(`http://localhost:${srv.port}/api/characters/summary`)).json();
    assert.deepStrictEqual(summary.characters.find((c) => c.id === 'both').campaignIds, ['cb']);
  } finally {
    dm.close();
    await srv.close();
  }
});

test('setActiveCampaign: DM only, one at a time, cleared with an empty id', async () => {
  const srv = await startServer();
  const dm = connect(srv.port);
  const player = connect(srv.port, 'role=player&character=x');
  try {
    await dm.opened;
    await player.opened;
    dm.send('addCampaign', { id: 'ca', name: 'A' });
    dm.send('addCampaign', { id: 'cb', name: 'B' });
    await dm.next('campaignState', (s) => s.campaigns.length === 2);
    player.send('setActiveCampaign', { id: 'ca' }); // refused
    dm.send('setActiveCampaign', { id: 'cb' });
    let m = await dm.next('campaignState', (s) => s.campaigns.some((c) => c.active));
    assert.deepStrictEqual(m.campaigns.filter((c) => c.active).map((c) => c.id), ['cb']);
    dm.send('setActiveCampaign', { id: 'ca' });
    m = await dm.next('campaignState', (s) => s.campaigns.find((c) => c.id === 'ca')?.active);
    assert.deepStrictEqual(m.campaigns.filter((c) => c.active).map((c) => c.id), ['ca']);
    const summary = await (await fetch(`http://localhost:${srv.port}/api/characters/summary`)).json();
    assert.strictEqual(summary.campaigns.find((c) => c.id === 'ca').active, true);
    dm.send('setActiveCampaign', { id: '' });
    m = await dm.next('campaignState', (s) => !s.campaigns.some((c) => c.active));
    assert.ok(m);
  } finally {
    dm.close();
    player.close();
    await srv.close();
  }
});
