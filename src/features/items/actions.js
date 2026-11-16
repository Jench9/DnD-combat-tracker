// Client -> server item library actions.
const items = require('./service');

module.exports = {
  addItem(payload, identity) {
    items.add(payload.id, payload.patch, identity.role === 'dm' ? 'dm' : identity.characterId);
  },

  updateItem(payload) {
    if (!payload.patch || typeof payload.patch !== 'object') return;
    items.update(payload.id, payload.patch);
  },

  deleteItem(payload) {
    items.remove(payload.id);
  },
};
