// REST for the character builder (REST, not WebSocket actions, so the
// browser gets the validation message back):
//
//   GET  /api/builder/rules                 the rules data (rules-2024.json)
//   GET  /api/builder/plan?id=<char>        classes this character may level in
//   GET  /api/builder/plan?id=<char>&class=<key>   what that level brings
//   POST /api/builder/create  { id?, campaignId?, build }  → { character }
//   POST /api/builder/levelup { id, answers }              → { character, summary }
//
// Create: anyone may make a new character (like addCharacter); with an `id`
// it fills in that blank sheet (owner or DM; a sheet that already has a
// class is refused). Level up: owner or DM.
const express = require('express');
const { uid } = require('../../../core/ids');
const { identityFromHeaders, owns } = require('../../../core/identity');
const { linkToCreator } = require('../../accounts/links');
const { campaignForNewCharacter } = require('../../../core/access');
const characters = require('../service');
const items = require('../../items/service');
const spells = require('../../spells/service');
const { getRules, rulesJson } = require('./rules');
const { buildCharacter } = require('./create');
const { levelUpPlan, applyLevelUp } = require('./levelup');
const P = require('./progression');

const ID_RE = /^[A-Za-z0-9]{1,40}$/;
const ctx = () => ({ rules: getRules(), spells: spells.all(), items: items.all(), newId: uid });

// Every SRD class, with this character's level in it and why it's blocked.
function classOptions(ch) {
  const c = ctx();
  const classes = P.classesOf(ch, c.rules);
  return c.rules.classes.map((def) => {
    const mine = classes.find((x) => x.key === def.key);
    const plan = levelUpPlan(ch, def.key, c);
    return { key: def.key, name: def.name, level: mine ? mine.level : 0, blocked: plan.error || '' };
  });
}

function createBuilderRouter({ onCharactersChanged }) {
  const router = express.Router();

  // SRD + the DMs' custom content (it changes: not cached by the browser).
  router.get('/rules', (req, res) => { res.set('Cache-Control', 'no-store'); res.type('application/json').send(rulesJson()); });

  const ownCharacter = (req, res, id) => {
    const ch = ID_RE.test(String(id || '')) ? characters.find(id) : null;
    if (!ch) { res.status(404).json({ error: 'Character not found.' }); return null; }
    if (!owns(identityFromHeaders(req), id)) { res.status(403).json({ error: 'You can only change your own character.' }); return null; }
    return ch;
  };

  router.get('/plan', (req, res) => {
    const ch = ownCharacter(req, res, req.query.id);
    if (!ch) return;
    const c = ctx();
    const classes = P.classesOf(ch, c.rules);
    if (!req.query.class) {
      res.json({ level: P.totalLevel(classes), classes, options: classOptions(ch), hasClass: classes.length > 0 });
      return;
    }
    const plan = levelUpPlan(ch, String(req.query.class), c);
    if (plan.error) res.status(400).json(plan); else res.json(plan);
  });

  router.post('/create', (req, res) => {
    const body = req.body || {};
    let id = body.id;
    if (id) {
      const ch = ownCharacter(req, res, id);
      if (!ch) return;
      if (String(ch.class || '').trim()) { res.status(400).json({ error: 'This sheet already has a class — use Level up instead.' }); return; }
    }
    const blank = { ...(id ? characters.find(id) : {}), id: id || 'new' };
    const result = buildCharacter(blank, body.build, ctx());
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    if (!id) {
      id = uid();
      characters.addBlank(id, campaignForNewCharacter(req.identity, body.campaignId));
      linkToCreator(req.identity, id);
    }
    characters.update(id, result.patch);
    onCharactersChanged();
    res.json({ character: characters.find(id) });
  });

  router.post('/levelup', (req, res) => {
    const body = req.body || {};
    const ch = ownCharacter(req, res, body.id);
    if (!ch) return;
    const result = applyLevelUp(ch, body.answers, ctx());
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    characters.update(ch.id, result.patch);
    onCharactersChanged();
    res.json({ character: characters.find(ch.id), summary: result.summary });
  });

  return router;
}

module.exports = { createBuilderRouter };
