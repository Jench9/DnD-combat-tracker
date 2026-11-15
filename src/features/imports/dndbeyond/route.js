const express = require('express');
const characters = require('../../characters/service');
const { extractDdbCharacterId, mapDndBeyondData } = require('./mapper');
const { fetchCharacter } = require('./client');

// Fetches and maps a D&D Beyond character. Resolves to { mapped } or
// { status, error } ready to send back to the client.
async function loadDdbCharacter(ddbId) {
  const result = await fetchCharacter(ddbId);

  if (!result.ok) {
    console.warn(`D&D Beyond import: HTTP ${result.status} for character ${ddbId}. Body: ${result.bodyPreview}`);
    return { status: 502, error: `D&D Beyond returned an error (${result.status}).` };
  }

  const json = result.json;
  if (!json || json.success === false || !json.data) {
    console.warn(`D&D Beyond import: unusable response for character ${ddbId}. Body: ${result.bodyPreview}`);
    return {
      status: 404,
      error: 'Could not load that character. Make sure its D&D Beyond sharing is set to "Public".',
    };
  }

  return { mapped: mapDndBeyondData(json.data, ddbId) };
}

// POST /api/import/dndbeyond          { input: <character URL or numeric id>, campaignId? }
//   Creates a new character (in campaignId, if given).
// POST /api/import/dndbeyond/refresh  { characterId, input? }
//   Re-imports into an existing character (e.g. after leveling up).
//   Uses the character's stored D&D Beyond id; `input` links or re-links it.
function createDndBeyondRouter({ onCharactersChanged }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const ddbId = extractDdbCharacterId(req.body && req.body.input);
    if (!ddbId) {
      return res.status(400).json({ error: 'Paste a D&D Beyond character URL or ID.' });
    }
    try {
      const { mapped, status, error } = await loadDdbCharacter(ddbId);
      if (error) return res.status(status).json({ error });
      const ch = characters.addImported({ ...mapped.patch, campaignId: req.body.campaignId }, mapped.notesPrefix);
      onCharactersChanged();
      res.json({ character: ch });
    } catch (err) {
      console.error('D&D Beyond import failed:', err);
      res.status(500).json({ error: 'Import failed — see server logs for details.' });
    }
  });

  router.post('/refresh', async (req, res) => {
    const body = req.body || {};
    const existing = characters.find(body.characterId);
    if (!existing) {
      return res.status(404).json({ error: 'That character no longer exists.' });
    }
    const ddbId = body.input ? extractDdbCharacterId(body.input) : existing.ddbId;
    if (!ddbId) {
      return res.status(400).json({ error: 'Paste a D&D Beyond character URL or ID.' });
    }
    try {
      const { mapped, status, error } = await loadDdbCharacter(ddbId);
      if (error) return res.status(status).json({ error });
      const ch = characters.refreshImported(existing.id, mapped.patch);
      onCharactersChanged();
      res.json({ character: ch });
    } catch (err) {
      console.error('D&D Beyond refresh failed:', err);
      res.status(500).json({ error: 'Update failed — see server logs for details.' });
    }
  });

  return router;
}

module.exports = { createDndBeyondRouter };
