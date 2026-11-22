// Custom content over REST (errors must reach the browser).
//   GET    /api/content          { entries, kinds, featTypes, sizes, skills, classes, canAdd }
//   POST   /api/content          { kind, name, source, ...fields }  DMs and the admin
//   PUT    /api/content/:id      the one who added it, or the admin
//   DELETE /api/content/:id      the one who added it, or the admin
// A character already built with an entry keeps what it got; deleting an
// entry only removes it from the choices.
const express = require('express');
const content = require('./service');
const { isDm } = require('../../core/identity');
const { getRules } = require('../characters/builder/rules');

// DM and admin accounts, or whoever runs the table it's at (open mode: the DM).
const mayAdd = (id) => isDm(id) || ['admin', 'dm'].includes(id.accountRole);
const mayChange = (id, entry) => (id.accountId ? id.accountRole === 'admin' || entry.createdBy === id.accountId : isDm(id));

function createContentRouter({ onChanged = () => {} } = {}) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const rules = getRules();
    res.set('Cache-Control', 'no-store');
    res.json({
      entries: content.all().map((e) => ({ ...e, mine: mayChange(req.identity, e) })),
      canAdd: mayAdd(req.identity),
      kinds: content.KINDS,
      featTypes: content.FEAT_TYPES,
      sizes: content.SIZES,
      skills: content.SKILL_NAMES,
      classes: rules.classes.map((c) => ({ key: c.key, name: c.name, subclassLevel: c.subclassLevel })),
      originFeats: rules.feats.filter((f) => f.type === 'origin').map((f) => ({ key: f.key, name: f.name, source: f.source })),
    });
  });

  router.post('/', (req, res) => {
    if (!mayAdd(req.identity)) return res.status(403).json({ error: 'Only DMs and the admin can add content.' });
    const r = content.add(req.body, req.identity.accountId);
    if (r.error) return res.status(400).json({ error: r.error });
    onChanged();
    res.json({ entry: r.entry });
  });

  router.put('/:id', (req, res) => {
    const e = content.find(req.params.id);
    if (!e) return res.status(404).json({ error: 'No such entry.' });
    if (!mayChange(req.identity, e)) return res.status(403).json({ error: 'Only the one who added it, or the admin, can change it.' });
    const r = content.update(req.params.id, { ...req.body, kind: e.kind });
    if (r.error) return res.status(400).json({ error: r.error });
    onChanged();
    res.json({ entry: r.entry });
  });

  router.delete('/:id', (req, res) => {
    const e = content.find(req.params.id);
    if (!e) return res.status(404).json({ error: 'No such entry.' });
    if (!mayChange(req.identity, e)) return res.status(403).json({ error: 'Only the one who added it, or the admin, can delete it.' });
    content.remove(req.params.id);
    onChanged();
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createContentRouter };
