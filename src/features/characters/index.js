const service = require('./service');
const actions = require('./actions');

module.exports = {
  name: 'characters',
  wire: { type: 'charState', key: 'characters' },
  snapshot: service.all,
  actions,
};
