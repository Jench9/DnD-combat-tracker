const service = require('./service');
const actions = require('./actions');
const { owns } = require('../../core/identity');

module.exports = {
  name: 'characters',
  wire: { type: 'charState', key: 'characters' },
  snapshot: service.all,
  actions,
  // Anyone can create a character (a new player joining); players edit and
  // delete only their own.
  permissions: {
    addCharacter: 'anyone',
    updateCharacter: (payload, identity) => owns(identity, payload.id),
    deleteCharacter: (payload, identity) => owns(identity, payload.id),
  },
};
