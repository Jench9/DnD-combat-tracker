const service = require('./service');
const actions = require('./actions');

module.exports = {
  name: 'monsters',
  wire: { type: 'monsterState', key: 'monsters' },
  snapshot: service.all,
  actions,
};
