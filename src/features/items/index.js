const service = require('./service');
const actions = require('./actions');

// Everyone sees the whole library. Anyone playing a character can add
// custom items; players edit and delete only the ones they made. The DM
// can change anything, including the SRD basics.
const ownsItem = (payload, identity) => {
  const it = service.find(payload.id);
  return !!it && !!identity.characterId && it.createdBy === identity.characterId;
};

module.exports = {
  name: 'items',
  wire: { type: 'itemState', key: 'items' },
  snapshot: service.all,
  actions,
  // Characters' Auto AC depends on the armor items they wear.
  alsoBroadcast: { updateItem: ['characters'], deleteItem: ['characters'] },
  permissions: {
    addItem: (payload, identity) => !!identity.characterId,
    updateItem: ownsItem,
    deleteItem: ownsItem,
  },
};
