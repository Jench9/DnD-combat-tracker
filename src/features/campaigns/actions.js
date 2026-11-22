// Client -> server campaign actions.
const campaigns = require('./service');
const characters = require('../characters/service');
const combat = require('../combat/service');
const map = require('../map/service');
const accounts = require('../accounts/service');

module.exports = {
  // The account that creates it runs it.
  addCampaign(payload, identity) {
    campaigns.add(payload.id, payload.name, identity && identity.accountId ? [identity.accountId] : []);
  },

  // Admin: { id, dmIds } — the accounts that run it (any role: being DM is
  // per campaign; the admin runs every table anyway).
  setCampaignDms(payload) {
    const dmIds = (Array.isArray(payload.dmIds) ? payload.dmIds : []).filter((id) => {
      const a = accounts.find(id);
      return a && a.role !== 'admin';
    });
    campaigns.setDms(payload.id, dmIds);
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
    accounts.leaveCampaign(payload.id);
    combat.dropTable(payload.id); // its fight and map go with it
    map.dropTable(payload.id);
  },
};
