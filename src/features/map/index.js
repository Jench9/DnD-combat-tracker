const service = require('./service');
const actions = require('./actions');

module.exports = {
  name: 'map',
  wire: { type: 'mapState', key: 'map' },
  snapshot: service.snapshot,
  actions,
};
