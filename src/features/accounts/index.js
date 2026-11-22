// Accounts as a realtime slice (wire accountState), so changes show up
// live: each browser gets its own account ({ me, tables }); the admin also
// gets every account and open invite, a DM those of its campaigns' players
// and its own invites. Changes go through REST (route.js), which then
// rebroadcasts this slice.
const service = require('./service');
const { AUTH_MODE } = require('../../config');
const access = require('../../core/access');
const characters = () => require('../characters/service');

// The accounts a DM looks after: those playing in its campaigns (invited
// there, or with a character it runs).
function playersOf(dm) {
  const mine = new Set(access.dmTables(dm));
  return service.all().filter((a) => a.id === dm.id
    || (a.campaignIds || []).some((id) => mine.has(id))
    || a.characterIds.some((id) => access.canDmCharacter(dm, characters().find(id))));
}

function snapshotFor(identity) {
  if (AUTH_MODE === 'open') return { mode: 'open', me: null };
  const account = service.find(identity.accountId);
  const me = service.publicView(account);
  if (!me) return { mode: 'accounts', me: null };
  me.tables = access.tablesFor(account);
  me.mayCreateCampaigns = access.mayCreateCampaigns(account);
  const out = { mode: 'accounts', me };
  if (account.role === 'admin') {
    out.list = service.all().map(service.publicView);
    out.invites = service.pendingInvites();
  } else if (access.dmTables(account).length) { // runs a campaign (any role)
    out.list = playersOf(account).map(service.publicView);
    out.invites = service.pendingInvites().filter((i) => i.createdBy === account.id);
  }
  return out;
}

module.exports = {
  name: 'accounts',
  wire: { type: 'accountState', key: 'accounts' },
  snapshot: () => ({ mode: AUTH_MODE, me: null }),
  snapshotFor,
  actions: {}, // all changes go through REST (route.js)
};
