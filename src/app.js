// Wires everything together: Express (static files + REST imports),
// the HTTP server, and the realtime hub with all features registered.
//
// To add a new tool: create src/features/<name>/ exposing the feature
// shape described in src/realtime/hub.js, then add it to `features`.
const path = require('path');
const express = require('express');
const http = require('http');
const { PUBLIC_DIR, JSON_BODY_LIMIT } = require('./config');
const { createHub } = require('./realtime/hub');
const { createImportsRouter } = require('./features/imports');
const { createMapRouter } = require('./features/map/route');

const combat = require('./features/combat');
const characters = require('./features/characters');
const campaigns = require('./features/campaigns');
const map = require('./features/map');
const monsters = require('./features/monsters');
const items = require('./features/items');
const spells = require('./features/spells');

function createApp() {
  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.static(PUBLIC_DIR));
  // Short address for the TV view (typed on a TV or shared): /tv
  app.get('/tv', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'tv.html')));

  const server = http.createServer(app);
  const hub = createHub(server, [combat, characters, campaigns, map, monsters, items, spells]);

  // For the "Who are you?" screen, which can open on any page (even ones
  // without a live connection): just enough to pick a character.
  app.get('/api/characters/summary', (req, res) => {
    const charService = require('./features/characters/service');
    res.json({
      characters: charService.all().map((c) => ({
        id: c.id, name: c.name, class: c.class, level: c.level, portrait: c.portrait, campaignId: c.campaignId,
      })),
    });
  });

  app.use('/api/maps', createMapRouter({ onMapChanged: () => hub.broadcast('map') }));

  app.use('/api/import', createImportsRouter({
    onCharactersChanged: () => {
      hub.broadcast('characters');
      if (require('./features/combat/characterSync').syncCombatantsFromSheets()) hub.broadcast('combat');
    },
    onItemsChanged: () => hub.broadcast('items'),
    onSpellsChanged: () => hub.broadcast('spells'),
  }));

  return { app, server, hub };
}

module.exports = { createApp };
