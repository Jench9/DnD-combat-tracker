const service = require('./service');
const actions = require('./actions');
const permissions = require('./permissions');
const { isDm } = require('../../core/identity');
const { savingActions } = require('../../core/savingActions');

module.exports = {
  name: 'combat',
  wire: { type: 'state', key: 'state' },
  snapshot: service.getState,
  snapshotFor: (identity) => (isDm(identity) ? service.getState() : service.playerView()),
  actions: savingActions(actions, service.save), // persisted after every action
  permissions,
  // Map and monster slices depend on which combatants exist and which are
  // hidden or disguised, so refresh them when that changes.
  alsoBroadcast: {
    removeCombatant: ['map', 'monsters'],
    clearAll: ['map', 'monsters'],
    addMonsterToCombat: ['monsters'],
    setCombatantDm: ['map', 'monsters'],
    // A PC's HP is saved on its sheet; only then resend the characters
    // slice (it carries every portrait, so not on monster HP clicks).
    adjustHP: (sheetChanged) => (sheetChanged ? ['characters'] : []),
    setTempHp: (sheetChanged) => (sheetChanged ? ['characters'] : []),
  },
};
