// REST side of the battle map: uploading and serving background images.
//   POST /api/maps/backgrounds        multipart: file, name   (DM only)
//   GET  /api/maps/backgrounds/:id    the image
const express = require('express');
const multer = require('multer');
const { MAX_MAP_BYTES } = require('../../config');
const { identityFromHeaders, isDm } = require('../../core/identity');
const backgrounds = require('./backgrounds');

function createMapRouter({ onMapChanged }) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MAP_BYTES } });

  router.post('/backgrounds', (req, res, next) => {
    if (!isDm(identityFromHeaders(req))) return res.status(403).json({ error: 'Only the DM can add maps.' });
    next();
  }, (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'That image is too large (max 20 MB).' : 'Upload failed.' });
      }
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
      try {
        const name = (req.body && req.body.name) || req.file.originalname.replace(/\.[^.]+$/, '');
        const entry = await backgrounds.add(name, req.file.buffer, req.file.mimetype);
        onMapChanged();
        res.json({ background: { id: entry.id, name: entry.name } });
      } catch (e) {
        console.warn('Map upload rejected:', e.message);
        res.status(400).json({ error: "That doesn't look like an image." });
      }
    });
  });

  // Ids are random and only shared with players for the selected map.
  router.get('/backgrounds/:id', (req, res) => {
    const b = backgrounds.find(req.params.id);
    if (!b) return res.status(404).end();
    res.type(b.type);
    res.set('Cache-Control', 'private, max-age=86400'); // a given id never changes
    res.sendFile(backgrounds.filePath(b));
  });

  return router;
}

module.exports = { createMapRouter };
