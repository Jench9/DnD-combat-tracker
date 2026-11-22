const service = require('./service');
const actions = require('./actions');
const access = require('../../core/access');

const accountOf = access.accountOf;
// A campaign's own DMs (and the admin) manage it.
const runs = (payload, identity) => !identity.accountId || access.canDmCampaign(accountOf(identity), payload.id);

module.exports = {
  name: 'campaigns',
  wire: { type: 'campaignState', key: 'campaigns' },
  snapshot: service.all,
  // Only the campaigns at this browser's tables (accounts mode).
  snapshotFor: (identity) => (identity.accountId ? service.all().filter((c) => access.canSeeCampaign(accountOf(identity), c)) : service.all()),
  actions,
  // A DM account with no campaign yet is at no table (a player there) but
  // may still create its first one.
  permissions: {
    addCampaign: (payload, identity) => !!identity.accountId && access.mayCreateCampaigns(accountOf(identity)),
  },
  dmPermissions: {
    renameCampaign: runs,
    deleteCampaign: runs,
    setActiveCampaign: (payload, identity) => !payload.id || runs(payload, identity),
    setCampaignDms: (payload, identity) => !identity.accountId || access.isAdmin(accountOf(identity)),
  },
  // Deleting a campaign also un-assigns its characters; who sits at which
  // table changes with campaigns (accountState carries each account's tables).
  alsoBroadcast: { addCampaign: ['accounts'], deleteCampaign: ['characters', 'accounts'], setCampaignDms: ['accounts', 'characters'] },
};
