// Client -> server map actions. Invalid input is ignored.
const map = require('./service');

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

  clearMap() {
    map.clear();
  },
};
