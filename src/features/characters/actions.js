// Client -> server character actions.
const { uid } = require('../../core/ids');
const { mod } = require('./model');
const characters = require('./service');
const combat = require('../combat/service');

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
  },

  deleteCharacter(payload) {
    characters.remove(payload && payload.id);
  },

  // Bridges the two tools: drop a saved character straight into the
  // combat tracker as a PC combatant.
  sendToCombat(payload) {
    const ch = characters.find(payload && payload.id);
    if (!ch) return;
    combat.addCombatant({
      name: ch.name || 'Unnamed',
      init: 10 + mod(ch.abilities.dex),
      ac: typeof ch.ac === 'number' ? ch.ac : 10,
      hp: typeof ch.hpCurrent === 'number' ? ch.hpCurrent : (ch.hpMax || 1),
      maxHp: ch.hpMax || 1,
      type: 'pc',
    });
  },
};
