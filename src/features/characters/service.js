// Character storage (newest first). Kept in memory and saved to
// data/characters.json after every change so it survives restarts.
// No WebSocket knowledge here.
const { uid } = require('../../core/ids');
const { createJsonStore } = require('../../core/jsonStore');
const { blankCharacter, sanitizeCharacterPatch } = require('./model');

const store = createJsonStore('characters', []);

// Run saved data back through the sanitizer so an old or hand-edited
// file can't load a malformed character.
// Characters saved before Auto AC existed keep their manual AC.
function load() {
  const saved = store.load();
  return (Array.isArray(saved) ? saved : [])
    .filter((c) => c && typeof c.id === 'string')
    .map((c) => ({ ...sanitizeCharacterPatch(blankCharacter(c.id), c), acAuto: c.acAuto === true }));
}
let characters = load();

// Read the file again (after a restore).
function reload() {
  characters = load();
}

function persist() {
  store.save(characters);
}

function all() {
  return characters;
}

function find(id) {
  return characters.find((c) => c.id === id);
}

// Returns false if the id already exists.
function addBlank(id, campaignId) {
  if (find(id)) return false;
  characters.unshift(sanitizeCharacterPatch(blankCharacter(id), { campaignId }));
  persist();
  return true;
}

// A copy of a sheet under a new id, placed just before the original:
// "Copy of …", not linked to D&D Beyond (a sync would overwrite the
// original's copy). Returns the copy, or null.
function duplicate(id, newId) {
  const src = find(id);
  if (!src || !newId || find(newId)) return null;
  const copy = sanitizeCharacterPatch(blankCharacter(newId), {
    ...JSON.parse(JSON.stringify(src)),
    id: newId,
    name: ('Copy of ' + (src.name || 'character')).slice(0, 40),
    ddbId: '',
    retired: false,
  });
  copy.acAuto = src.acAuto;
  characters.splice(characters.indexOf(src), 0, copy);
  persist();
  return copy;
}

function update(id, patch) {
  const idx = characters.findIndex((c) => c.id === id);
  if (idx === -1) return;
  characters[idx] = sanitizeCharacterPatch(characters[idx], patch);
  persist();
}

function remove(id) {
  characters = characters.filter((c) => c.id !== id);
  persist();
}

// Used by both importers: builds a blank character, applies a mapped
// patch through the same sanitizer normal edits go through, registers
// it, and returns it so the route can respond immediately.
function addImported(mappedPatch, notesPrefix) {
  const id = uid();
  let ch = blankCharacter(id);
  ch = sanitizeCharacterPatch(ch, mappedPatch);
  ch.acAuto = mappedPatch.acAuto === true; // imports bring their own AC
  if (notesPrefix) {
    ch.notes = (notesPrefix + (ch.notes ? '\n\n' + ch.notes : '')).slice(0, 4000);
  }
  characters.unshift(ch);
  persist();
  return ch;
}

// Re-sync an existing character from a fresh import. The table's own
// state wins for things the source doesn't own or that change mid-session:
// notes, campaign, inventory, AC mode, spells and slots, temp HP, damage taken (so a level-up adds the new max HP
// without healing anyone), spent Hit Dice, rules edition, resources (unless the patch brings a merged list), and the portrait
// unless the patch brings one.
// Returns the updated character, or null.
// `replaceInventory` / `replaceSpells`: the patch's inventory / spellbook
// (spells, slots, ability) replace the current ones — a D&D Beyond sync
// re-maps them; otherwise they're kept.
function refreshImported(id, mappedPatch, { replaceInventory = false, replaceSpells = false } = {}) {
  const idx = characters.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const old = characters[idx];
  const damage = Math.max(0, old.hpMax - old.hpCurrent);
  // Inspiration and exhaustion are table state, like damage taken: kept.
  // Coins come from D&D Beyond (where the party's purchases are tracked).
  const {
    notes, hpTemp, campaignId, campaignIds, inventory, acAuto, spellAbility, spellSlots, spells, hitDiceUsed, rulesEdition, inspiration, exhaustion, ...patch
  } = mappedPatch;
  const fresh = {
    ...blankCharacter(id),
    portrait: old.portrait, notes: old.notes, hpTemp: old.hpTemp, campaignIds: old.campaignIds, retired: !!old.retired,
    inventory: replaceInventory && Array.isArray(inventory) ? inventory : old.inventory, acAuto: old.acAuto,
    // Kept unless the patch brings a list (the sync route passes existing +
    // newly detected ones), which is validated like any edit.
    modifiers: old.modifiers,
    resources: old.resources,
    customActions: old.customActions,
    hitDiceUsed: old.hitDiceUsed,
    rulesEdition: old.rulesEdition, // detection is a guess; a choice made on the sheet wins
    inspiration: old.inspiration,
    exhaustion: old.exhaustion,
    ...(replaceSpells && Array.isArray(spells)
      ? { spellAbility: spellAbility || '', spellSlots, spells }
      : { spellAbility: old.spellAbility, spellSlots: old.spellSlots, spells: old.spells }),
  };
  let ch = sanitizeCharacterPatch(fresh, patch);
  ch.hpCurrent = Math.max(0, ch.hpMax - damage);
  characters[idx] = ch;
  persist();
  return ch;
}

// A campaign was deleted: take it off its characters (those in no other
// campaign end up in "No campaign").
function clearCampaign(campaignId) {
  let changed = false;
  characters.forEach((c) => {
    if (!c.campaignIds.includes(campaignId)) return;
    c.campaignIds = c.campaignIds.filter((x) => x !== campaignId);
    c.campaignId = c.campaignIds[0] || '';
    changed = true;
  });
  if (changed) persist();
}

module.exports = { reload, all, find, addBlank, duplicate, update, remove, addImported, refreshImported, clearCampaign };
