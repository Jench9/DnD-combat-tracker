// Spell library, saved to data/spells.json; SRD 5.1 + 5.2 spells are
// loaded/merged from src/srd (see core/library.js). No WebSocket knowledge here.
const { createLibrary } = require('../../core/library');
const { blankSpell, sanitizeSpellPatch } = require('./model');
const { SRD_SPELLS, SRD_VERSION } = require('../../srd');

module.exports = createLibrary({
  name: 'spells',
  blank: (id) => blankSpell(id),
  sanitize: sanitizeSpellPatch,
  starter: SRD_SPELLS,
  starterVersion: SRD_VERSION,
});
