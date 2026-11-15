// Wires everything together: Express (static files + REST imports),
// the HTTP server, and the realtime hub with all features registered.
//
// To add a new tool: create src/features/<name>/ exposing the feature
// shape described in src/realtime/hub.js, then add it to `features`.
const express = require('express');
const http = require('http');
const { PUBLIC_DIR, JSON_BODY_LIMIT } = require('./config');
const { createHub } = require('./realtime/hub');
const { createImportsRouter } = require('./features/imports');

const combat = require('./features/combat');
const characters = require('./features/characters');
const campaigns = require('./features/campaigns');

function createApp() {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.static(PUBLIC_DIR));

  const server = http.createServer(app);
  const hub = createHub(server, [combat, characters, campaigns]);

  app.use('/api/import', createImportsRouter({
    onCharactersChanged: () => hub.broadcast('characters'),
  }));

  return { app, server, hub };
}

module.exports = { createApp };
