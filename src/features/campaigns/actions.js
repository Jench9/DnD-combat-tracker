// Client -> server campaign actions.
const campaigns = require('./service');
const characters = require('../characters/service');

module.exports = {
  addCampaign(payload) {
    campaigns.add(payload.id, payload.name);
  },

  renameCampaign(payload) {
    campaigns.rename(payload.id, payload.name);
  },

  // { id } — mark the campaign being played now; '' clears it.
  setActiveCampaign(payload) {
    campaigns.setActive(typeof payload.id === 'string' ? payload.id : '');
  },

  // Characters aren't deleted with their campaign — they move to
  // "No campaign" so nothing is lost by accident.
  deleteCampaign(payload) {
    if (!campaigns.find(payload.id)) return;
    campaigns.remove(payload.id);
    characters.clearCampaign(payload.id);
  },
};
