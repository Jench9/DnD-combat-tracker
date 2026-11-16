// Client -> server character actions.
const { uid } = require('../../core/ids');
const characters = require('./service');
const { syncCombatantAcs } = require('../combat/characterSync');

module.exports = {
  // Client generates the id (so it can open the editor immediately
  // without waiting on a round trip) and just asks the server to
  // register it.
  addCharacter(payload) {
    const id = (payload && typeof payload.id === 'string' && payload.id) || uid();
    characters.addBlank(id, payload && payload.campaignId);
  },

  updateCharacter(payload) {
    const { id, patch } = payload || {};
    if (!patch || typeof patch !== 'object') return;
    characters.update(id, patch);
    syncCombatantAcs(); // AC can change (armor, Shield, Haste…)
  },

  deleteCharacter(payload) {
    characters.remove(payload && payload.id);
  },
};
