// Spell library, saved to data/spells.json and seeded once with common
// SRD spells (see core/library.js). No WebSocket knowledge here.
const { createLibrary } = require('../../core/library');
const { blankSpell, sanitizeSpellPatch } = require('./model');
const { STARTER_SPELLS } = require('./starter');

module.exports = createLibrary({
  name: 'spells',
  blank: (id) => blankSpell(id),
  sanitize: sanitizeSpellPatch,
  starter: STARTER_SPELLS,
});
