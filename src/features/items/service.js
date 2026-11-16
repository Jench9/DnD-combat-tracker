// Item library, saved to data/items.json; SRD 5.1 + 5.2 weapons, armor,
// gear and magic items are loaded/merged from src/srd (see core/library.js).
// No WebSocket knowledge here.
const { createLibrary } = require('../../core/library');
const { blankItem, sanitizeItemPatch } = require('./model');
const { SRD_ITEMS, SRD_VERSION } = require('../../srd');

const TYPES = ['weapon', 'armor', 'gear'];

module.exports = createLibrary({
  name: 'items',
  blank: (id, patch) => blankItem(id, patch && TYPES.includes(patch.type) ? patch.type : 'gear'),
  sanitize: sanitizeItemPatch,
  starter: SRD_ITEMS,
  starterVersion: SRD_VERSION,
});
