// Wires everything together: Express (static files + REST imports),
// the HTTP server, and the realtime hub with all features registered.
//
// To add a new tool: create src/features/<name>/ exposing the feature
// shape described in src/realtime/hub.js, then add it to `features`.
const path = require('path');
const express = require('express');
const http = require('http');
const { PUBLIC_DIR, JSON_BODY_LIMIT, AUTH_MODE, TRUST_PROXY } = require('./config');
const { securityHeaders, requireSameOrigin } = require('./core/security');
const { identityFromRequest, isDm } = require('./core/identity');
const access = require('./core/access');
const { createAccountsRouter } = require('./features/accounts/route');
const accountService = require('./features/accounts/service');
const { createHub } = require('./realtime/hub');
const { createImportsRouter } = require('./features/imports');
const { createMapRouter } = require('./features/map/route');
const { createBackupRouter } = require('./features/backup/route');
const { createBuilderRouter } = require('./features/characters/builder/route');
const { createFamiliarRouter } = require('./features/characters/familiarRoute');

const combat = require('./features/combat');
const characters = require('./features/characters');
const campaigns = require('./features/campaigns');
const map = require('./features/map');
const monsters = require('./features/monsters');
const items = require('./features/items');
const spells = require('./features/spells');
const accounts = require('./features/accounts');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind an HTTPS proxy: req.secure / req.ip from X-Forwarded-*.
  if (TRUST_PROXY) app.set('trust proxy', TRUST_PROXY);
  app.use(securityHeaders);
  // Restore uploads are big: their route reads the raw body itself.
  app.use((req, res, next) => (req.path === '/api/restore' ? next() : express.json({ limit: JSON_BODY_LIMIT })(req, res, next)));
  app.use(express.static(PUBLIC_DIR));
  // Short address for the TV view (typed on a TV or shared): /tv
  app.get('/tv', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'tv.html')));

  const server = http.createServer(app);
  const hub = createHub(server, [combat, characters, campaigns, map, monsters, items, spells, accounts]);

  // Every /api call that changes something must come from these pages.
  app.use('/api', requireSameOrigin);
  // Login, setup, invites and (DM) account management.
  app.use('/api', createAccountsRouter({
    onChanged: () => { hub.broadcast('accounts'); hub.broadcast('campaigns'); }, // an accepted invite may add a campaign DM
    onRoleChanged: (accountId) => hub.closeAccount(accountId, 4403),
  }));
  accountService.onSessionsEnded((accountId) => hub.closeAccount(accountId));
  // Everything else under /api needs a logged-in browser (accounts mode).
  app.use('/api', (req, res, next) => {
    req.identity = identityFromRequest(req);
    if (!req.identity) return res.status(401).json({ error: 'Please log in.' });
    next();
  });
  if (AUTH_MODE === 'accounts' && accountService.needsSetup()) {
    console.log(`No DM account yet. Open the app and use this setup code to create it: ${accountService.getSetupCode()}`);
  }

  // For the "Who are you?" screen, which can open on any page (even ones
  // without a live connection): just enough to pick a character, and the
  // campaigns (in their order) to group them by.
  app.get('/api/characters/summary', (req, res) => {
    const charService = require('./features/characters/service');
    const campaignService = require('./features/campaigns/service');
    res.json({
      campaigns: campaignService.all().filter((c) => AUTH_MODE === 'open' || access.canSeeCampaign(access.accountOf(req.identity), c))
        .map((c) => ({ id: c.id, name: c.name, active: !!c.active })),
      // Accounts: a player picks among their own characters; a DM among
      // the ones it may see (it can look through their eyes).
      characters: charService.all().filter((c) => AUTH_MODE === 'open'
        || req.identity.characterIds.includes(c.id)
        || (isDm(req.identity) && access.canSeeCharacter(access.accountOf(req.identity), c))).map((c) => ({
        id: c.id, name: c.name, class: c.class, level: c.level, portrait: c.portrait, campaignId: c.campaignId, campaignIds: c.campaignIds,
      })),
    });
  });

  app.use('/api/maps', createMapRouter({ onMapChanged: () => hub.broadcast('map') }));

  // Backup / restore (DM only). After a restore every slice is resent.
  app.use('/api', createBackupRouter({
    onRestored: () => ['combat', 'characters', 'campaigns', 'map', 'monsters', 'items', 'spells'].forEach((f) => hub.broadcast(f)),
  }));

  // Sheets changed by a REST call: resend them, and the combatants made
  // from them (AC, HP, familiars).
  const onSheetsChanged = () => {
    hub.broadcast('characters');
    hub.broadcast('accounts'); // a player's new character joins their account
    if (require('./features/combat/characterSync').syncCombatantsFromSheets()) hub.broadcast('combat');
  };
  // Custom content (subclasses, species, backgrounds, feats from the DMs' books).
  app.use('/api/content', require('./features/content/route').createContentRouter());
  // Guided character creation and level up.
  app.use('/api/builder', createBuilderRouter({ onCharactersChanged: onSheetsChanged }));
  // Familiars (Find Familiar, Pact of the Chain).
  app.use('/api/familiars', createFamiliarRouter({ onCharactersChanged: onSheetsChanged }));

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
