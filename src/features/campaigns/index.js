const service = require('./service');
const actions = require('./actions');

module.exports = {
  name: 'campaigns',
  wire: { type: 'campaignState', key: 'campaigns' },
  snapshot: service.all,
  actions,
  // Deleting a campaign also un-assigns its characters.
  alsoBroadcast: { deleteCampaign: ['characters'] },
};
