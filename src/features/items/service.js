// Item library, saved to data/items.json and seeded once with the SRD
// basics (see core/library.js). No WebSocket knowledge here.
const { createLibrary } = require('../../core/library');
const { blankItem, sanitizeItemPatch } = require('./model');
const { STARTER_ITEMS } = require('./starter');

const TYPES = ['weapon', 'armor', 'gear'];

module.exports = createLibrary({
  name: 'items',
  blank: (id, patch) => blankItem(id, patch && TYPES.includes(patch.type) ? patch.type : 'gear'),
  sanitize: sanitizeItemPatch,
  starter: STARTER_ITEMS,
});
