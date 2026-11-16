// Client -> server spell library actions.
const spells = require('./service');

module.exports = {
  addSpell(payload, identity) {
    spells.add(payload.id, payload.patch, identity.role === 'dm' ? 'dm' : identity.characterId);
  },

  updateSpell(payload) {
    if (!payload.patch || typeof payload.patch !== 'object') return;
    spells.update(payload.id, payload.patch);
  },

  deleteSpell(payload) {
    spells.remove(payload.id);
  },
};
