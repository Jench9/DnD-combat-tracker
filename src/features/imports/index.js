// Mounts every importer under /api/import/<source>.
// To add a new importer: create a folder here with a router factory and
// register it below.
const express = require('express');
const { createDndBeyondRouter } = require('./dndbeyond/route');
const { createPdfRouter } = require('./pdf/route');

function createImportsRouter({ onCharactersChanged, onItemsChanged }) {
  const router = express.Router();
  router.use('/dndbeyond', createDndBeyondRouter({ onCharactersChanged, onItemsChanged }));
  router.use('/pdf', createPdfRouter({ onCharactersChanged }));
  return router;
}

module.exports = { createImportsRouter };
