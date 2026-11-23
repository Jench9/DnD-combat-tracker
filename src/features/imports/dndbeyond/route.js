const express = require('express');
const characters = require('../../characters/service');
const { extractDdbCharacterId, mapDndBeyondData } = require('./mapper');
const { fetchCharacter, fetchAvatar } = require('./client');
const { planInventory } = require('./inventory');
const { planSpells } = require('./spells');
const { mergeModifiers } = require('./modifiers');
const { planResources, mergeResources } = require('./resources');
const { mergeOptionFeats, classesFrom, applyOptionContent } = require('./options');
const { getRules } = require('../../characters/builder/rules');
const items = require('../../items/service');
const spellLibrary = require('../../spells/service');
const { uid } = require('../../../core/ids');
const { identityFromHeaders, isDm, owns } = require('../../../core/identity');
const { campaignForNewCharacter } = require('../../../core/access');

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

  const mapped = mapDndBeyondData(json.data, ddbId);
  mapped.data = json.data;
  const portrait = mapped.avatarUrl ? await fetchAvatar(mapped.avatarUrl) : '';
  if (portrait) mapped.patch.portrait = portrait;
  return { mapped };
}

// POST /api/import/dndbeyond          { input: <character URL or numeric id>, campaignId? }
//   Creates a new character (in campaignId, if given).
// POST /api/import/dndbeyond/refresh  { characterId, input? }
//   Re-imports into an existing character (e.g. after leveling up).
//   Uses the character's stored D&D Beyond id; `input` links or re-links it.
function createDndBeyondRouter({ onCharactersChanged, onItemsChanged, onSpellsChanged }) {
  const router = express.Router();

  // Map the D&D Beyond inventory onto the item library: matched items go
  // into the character's inventory (with D&D Beyond's equipped flags);
  // unknown weapons/armor are added to the library first; other unknown
  // gear stays as free text in "Other equipment".
  function applyInventory(mapped) {
    const plan = planInventory(mapped.data, items.all(), uid);
    plan.newItems.forEach((n) => items.add(n.id, n.patch, 'dm'));
    if (plan.newItems.length) onItemsChanged();
    mapped.patch.inventory = plan.inventory;
    mapped.patch.equipment = plan.otherText;
  }

  // Eldritch Invocations / Metamagic as the builder records them (`feats`
  // "invocation:<Name>"), subclasses matched to the builder's (SRD or
  // Content page), and the Content page's modifiers / actions for those
  // options — so level up knows what the character already has.
  function applyClassOptions(mapped, existing) {
    const rules = getRules();
    mapped.patch.feats = mergeOptionFeats(existing ? existing.feats : [], mapped.data);
    mapped.patch.classes = classesFrom(mapped.data, rules, existing ? existing.classes : []);
    mapped.patch.customActions = existing ? existing.customActions || [] : [];
    mapped.extraResources = applyOptionContent(mapped.patch, mapped.data, rules, uid);
  }
  // Free casts of granted spells (once per rest) as 1-use resources.
  const withFreeCasts = (list, mapped) => {
    const out = [...list];
    (mapped.extraResources || []).forEach((r) => {
      if (!out.some((x) => x.name.toLowerCase() === r.name.toLowerCase())) out.push({ id: uid(), name: r.name, max: r.max, used: 0, recharge: r.recharge });
    });
    return out;
  };

  // Same for spells: matched by name, unknown ones added to the library;
  // slots from the caster tables, used counts from D&D Beyond.
  function applySpells(mapped) {
    const plan = planSpells(mapped.data, spellLibrary.all(), uid);
    plan.newSpells.forEach((n) => spellLibrary.add(n.id, n.patch, 'dm'));
    if (plan.newSpells.length) onSpellsChanged();
    mapped.patch.spells = plan.spells;
    mapped.patch.spellSlots = plan.spellSlots;
    mapped.patch.spellAbility = plan.spellAbility;
    mapped.patch.pactMagic = plan.pactMagic;
  }

  router.post('/', async (req, res) => {
    if (!isDm(identityFromHeaders(req))) {
      return res.status(403).json({ error: 'Only the DM can import new characters.' });
    }
    const ddbId = extractDdbCharacterId(req.body && req.body.input);
    if (!ddbId) {
      return res.status(400).json({ error: 'Paste a D&D Beyond character URL or ID.' });
    }
    try {
      const { mapped, status, error } = await loadDdbCharacter(ddbId);
      if (error) return res.status(status).json({ error });
      applyInventory(mapped);
      applySpells(mapped);
      mapped.patch.modifiers = mergeModifiers([], mapped.data, uid);
      applyClassOptions(mapped, null);
      mapped.patch.resources = withFreeCasts(planResources(mapped.data, mapped.patch, uid), mapped);
      const ch = characters.addImported({ ...mapped.patch, campaignId: campaignForNewCharacter(identityFromHeaders(req), req.body.campaignId) }, mapped.notesPrefix);
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
    if (!owns(identityFromHeaders(req), existing.id)) {
      return res.status(403).json({ error: 'You can only update your own character.' });
    }
    const ddbId = body.input ? extractDdbCharacterId(body.input) : existing.ddbId;
    if (!ddbId) {
      return res.status(400).json({ error: 'Paste a D&D Beyond character URL or ID.' });
    }
    try {
      const { mapped, status, error } = await loadDdbCharacter(ddbId);
      if (error) return res.status(status).json({ error });
      // A portrait set in the app wins; D&D Beyond's only fills an empty one.
      if (existing.portrait) delete mapped.patch.portrait;
      applyInventory(mapped);
      applySpells(mapped);
      // Newly gained feats/features are added; existing modifiers are kept.
      mapped.patch.modifiers = mergeModifiers(existing.modifiers, mapped.data, uid);
      applyClassOptions(mapped, existing);
      // Same for limited-use features: used counts from the table are kept.
      mapped.patch.resources = withFreeCasts(mergeResources(existing.resources, planResources(mapped.data, mapped.patch, uid)), mapped);
      const ch = characters.refreshImported(existing.id, mapped.patch, { replaceInventory: true, replaceSpells: true });
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
