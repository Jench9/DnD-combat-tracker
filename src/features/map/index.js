const service = require('./service');
const actions = require('./actions');
const combat = require('../combat/service');
const { isDm, owns } = require('../../core/identity');

// Players move only the token of their own character.
const ownsToken = (payload, identity) => {
  const c = combat.findCombatant(payload.id);
  return !!c && !!c.characterId && owns(identity, c.characterId);
};

module.exports = {
  name: 'map',
  wire: { type: 'mapState', key: 'map' },
  snapshot: service.snapshot,
  snapshotFor: (identity) => (isDm(identity) ? service.snapshot() : service.playerView()),
  actions,
  permissions: { placeToken: ownsToken, removeToken: ownsToken },
};
