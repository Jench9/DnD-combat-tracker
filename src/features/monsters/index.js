const service = require('./service');
const actions = require('./actions');
const combat = require('../combat/service');
const { isDm } = require('../../core/identity');

// Players never see the library itself — only the icons of monsters that
// are visibly in the fight under their own name (so tokens have pictures).
function playerView() {
  const ids = new Set(combat.playerView().combatants.map((c) => c.monsterId).filter(Boolean));
  return service.all().filter((m) => ids.has(m.id) && m.icon).map((m) => ({ id: m.id, icon: m.icon }));
}

module.exports = {
  name: 'monsters',
  wire: { type: 'monsterState', key: 'monsters' },
  snapshot: service.all,
  snapshotFor: (identity) => (isDm(identity) ? service.all() : playerView()),
  actions, // no permissions entry: managing monsters is DM-only
};
