// Client -> server monster library actions.
const monsters = require('./service');

module.exports = {
  addMonster(payload) {
    monsters.add(payload.id, payload.patch);
  },

  updateMonster(payload) {
    if (!payload.patch || typeof payload.patch !== 'object') return;
    monsters.update(payload.id, payload.patch);
  },

  addStarterMonsters() {
    monsters.addStarters();
  },

  // Combatants already in a fight keep their stats; they just lose the icon.
  deleteMonster(payload) {
    monsters.remove(payload.id);
  },
};
