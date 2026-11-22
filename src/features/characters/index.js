const service = require('./service');
const actions = require('./actions');
const { withDerived } = require('./derived');
const { owns } = require('../../core/identity');
const access = require('../../core/access');

const mine = (payload, identity) => owns(identity, payload.id);

module.exports = {
  name: 'characters',
  wire: { type: 'charState', key: 'characters' },
  // Sent with computed values (e.g. Auto AC) filled in.
  snapshot: () => service.all().map(withDerived),
  // Only the sheets at this browser's tables (accounts mode; core/access.js).
  snapshotFor: (identity) => {
    const account = access.accountOf(identity);
    return service.all().filter((c) => !identity.accountId || access.canSeeCharacter(account, c)).map(withDerived);
  },
  actions,
  // Sheet edits and rests can change a combatant's AC/HP.
  // New / deleted characters change who owns what (accountState).
  alsoBroadcast: { addCharacter: ['accounts'], deleteCharacter: ['accounts'], updateCharacter: ['combat'], spendHitDie: ['combat'], shortRest: ['combat'], longRest: ['combat'] },
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
  // A DM only changes characters in the campaigns it runs.
  dmPermissions: {
    updateCharacter: mine, deleteCharacter: mine, duplicateCharacter: mine, spendHitDie: mine, shortRest: mine, longRest: mine,
  },
};
