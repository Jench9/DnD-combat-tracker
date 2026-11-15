const service = require('./service');
const actions = require('./actions');

module.exports = {
  name: 'characters',
  wire: { type: 'charState', key: 'characters' },
  snapshot: service.all,
  actions,
  // sendToCombat also changes combat state, so tell combat.html too.
  alsoBroadcast: { sendToCombat: ['combat'] },
};
