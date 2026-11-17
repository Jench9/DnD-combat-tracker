// Client -> server map actions. Invalid input is ignored.
const map = require('./service');
const backgrounds = require('./backgrounds');

module.exports = {
  placeToken(payload) {
    map.place(payload.id, payload.x, payload.y);
  },

  removeToken(payload) {
    map.remove(payload.id);
  },

  setMapSize(payload) {
    map.resize(Number(payload.cols), Number(payload.rows));
  },

  // DM: how many cells a token covers (1 Medium or smaller, 2 Large,
  // 3 Huge, 4 Gargantuan). Stored on the combatant.
  setTokenSize(payload) {
    map.setTokenSize(payload.id, Number(payload.size));
  },

  clearMap() {
    map.clear();
  },

  // Background images (uploaded over REST, see route.js). '' = none.
  setBackground(payload) {
    map.setBackground(typeof payload.id === 'string' ? payload.id : '');
  },

  renameBackground(payload) {
    backgrounds.rename(payload.id, payload.name);
  },

  deleteBackground(payload) {
    map.deleteBackground(payload.id);
  },
};
