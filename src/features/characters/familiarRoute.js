// REST for familiars (characters/familiars.js):
//
//   GET  /api/familiars                         { forms } — eligible forms with stat blocks
//   POST /api/familiars { characterId, formKey, name?, creatureType? }
//        → { character } — gives the character that familiar (a new form
//          replaces the old one; owner or DM)
//
// Name, creature type and HP then change with updateCharacter
// (`familiar: { name, creatureType, hp }`), and `familiar: null` releases it.
const express = require('express');
const { identityFromHeaders, owns } = require('../../core/identity');
const characters = require('./service');
const { familiarForms, buildFamiliar } = require('./familiars');

function createFamiliarRouter({ onCharactersChanged }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ forms: familiarForms() });
  });

  router.post('/', (req, res) => {
    const body = req.body || {};
    const id = String(body.characterId || '');
    const ch = /^[A-Za-z0-9]{1,40}$/.test(id) ? characters.find(id) : null;
    if (!ch) { res.status(404).json({ error: 'Character not found.' }); return; }
    if (!owns(identityFromHeaders(req), id)) { res.status(403).json({ error: 'You can only change your own character.' }); return; }
    const result = buildFamiliar(body, ch.familiar);
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    characters.update(id, { familiar: result.familiar });
    onCharactersChanged();
    res.json({ character: characters.find(id) });
  });

  return router;
}

module.exports = { createFamiliarRouter };
