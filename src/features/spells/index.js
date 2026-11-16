const service = require('./service');
const actions = require('./actions');

// Same rules as items: everyone sees the library; anyone playing a
// character can add custom spells; players change only their own.
const ownsSpell = (payload, identity) => {
  const sp = service.find(payload.id);
  return !!sp && !!identity.characterId && sp.createdBy === identity.characterId;
};

module.exports = {
  name: 'spells',
  wire: { type: 'spellState', key: 'spells' },
  snapshot: service.all,
  actions,
  permissions: {
    addSpell: (payload, identity) => !!identity.characterId,
    updateSpell: ownsSpell,
    deleteSpell: ownsSpell,
  },
};
