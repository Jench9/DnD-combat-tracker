const service = require('./service');
const actions = require('./actions');

module.exports = {
  name: 'combat',
  wire: { type: 'state', key: 'state' },
  snapshot: service.getState,
  actions,
};
