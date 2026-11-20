const service = require('./service');
const actions = require('./actions');
const { withDerived } = require('./derived');
const { owns } = require('../../core/identity');

module.exports = {
  name: 'characters',
  wire: { type: 'charState', key: 'characters' },
  // Sent with computed values (e.g. Auto AC) filled in.
  snapshot: () => service.all().map(withDerived),
  actions,
  // Sheet edits and rests can change a combatant's AC/HP.
  alsoBroadcast: { updateCharacter: ['combat'], spendHitDie: ['combat'], shortRest: ['combat'], longRest: ['combat'] },
  // duplicateCharacter has no entry: DM only (NPC allies, pregens).
  // Anyone can create a character (a new player joining); players edit and
  // delete only their own.
  permissions: {
    addCharacter: 'anyone',
    updateCharacter: (payload, identity) => owns(identity, payload.id),
    deleteCharacter: (payload, identity) => owns(identity, payload.id),
    spendHitDie: (payload, identity) => owns(identity, payload.id),
    shortRest: (payload, identity) => owns(identity, payload.id),
    longRest: (payload, identity) => owns(identity, payload.id),
  },
};
