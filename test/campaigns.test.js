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
