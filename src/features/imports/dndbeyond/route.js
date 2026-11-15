const express = require('express');
const characters = require('../../characters/service');
const { extractDdbCharacterId, mapDndBeyondData } = require('./mapper');
const { fetchCharacter } = require('./client');

// POST /api/import/dndbeyond  { input: <character URL or numeric id> }
function createDndBeyondRouter({ onCharactersChanged }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const ddbId = extractDdbCharacterId(req.body && req.body.input);
    if (!ddbId) {
      return res.status(400).json({ error: 'Paste a D&D Beyond character URL or ID.' });
    }
    try {
      const result = await fetchCharacter(ddbId);

      if (!result.ok) {
        console.warn(`D&D Beyond import: HTTP ${result.status} for character ${ddbId}. Body: ${result.bodyPreview}`);
        return res.status(502).json({ error: `D&D Beyond returned an error (${result.status}).` });
      }

      const json = result.json;
      if (!json || json.success === false || !json.data) {
        console.warn(`D&D Beyond import: unusable response for character ${ddbId}. Body: ${result.bodyPreview}`);
        return res.status(404).json({
          error: 'Could not load that character. Make sure its D&D Beyond sharing is set to "Public".',
        });
      }

      const { patch, notesPrefix } = mapDndBeyondData(json.data);
      const ch = characters.addImported(patch, notesPrefix);
      onCharactersChanged();
      res.json({ character: ch });
    } catch (err) {
      console.error('D&D Beyond import failed:', err);
      res.status(500).json({ error: 'Import failed — see server logs for details.' });
    }
  });

  return router;
}

module.exports = { createDndBeyondRouter };
