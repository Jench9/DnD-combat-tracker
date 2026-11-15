const service = require('./service');
const actions = require('./actions');

module.exports = {
  name: 'combat',
  wire: { type: 'state', key: 'state' },
  snapshot: service.getState,
  actions,
  // Removing combatants also takes their tokens off the map.
  alsoBroadcast: { removeCombatant: ['map'], clearAll: ['map'] },
};
