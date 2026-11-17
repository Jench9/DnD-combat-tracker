const service = require('./service');
const actions = require('./actions');
const combat = require('../combat/service');
const { isDm, owns } = require('../../core/identity');
const { savingActions } = require('../../core/savingActions');

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
  actions: savingActions(actions, service.save), // persisted after every action
  permissions: { placeToken: ownsToken, removeToken: ownsToken },
  // The size lives on the combatant, so the combat slice changes too.
  alsoBroadcast: { setTokenSize: ['combat'] },
};
