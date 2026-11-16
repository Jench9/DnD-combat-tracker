const service = require('./service');
const actions = require('./actions');
const permissions = require('./permissions');
const { isDm } = require('../../core/identity');

module.exports = {
  name: 'combat',
  wire: { type: 'state', key: 'state' },
  snapshot: service.getState,
  snapshotFor: (identity) => (isDm(identity) ? service.getState() : service.playerView()),
  actions,
  permissions,
  // Map and monster slices depend on which combatants exist and which are
  // hidden or disguised, so refresh them when that changes.
  alsoBroadcast: {
    removeCombatant: ['map', 'monsters'],
    clearAll: ['map', 'monsters'],
    addMonsterToCombat: ['monsters'],
    setCombatantDm: ['map', 'monsters'],
  },
};
