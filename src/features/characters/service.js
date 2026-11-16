// Character storage (newest first). Kept in memory and saved to
// data/characters.json after every change so it survives restarts.
// No WebSocket knowledge here.
const { uid } = require('../../core/ids');
const { createJsonStore } = require('../../core/jsonStore');
const { blankCharacter, sanitizeCharacterPatch } = require('./model');

const store = createJsonStore('characters', []);

// Run saved data back through the sanitizer so an old or hand-edited
// file can't load a malformed character.
const saved = store.load();
// Characters saved before Auto AC existed keep their manual AC.
let characters = (Array.isArray(saved) ? saved : [])
  .filter((c) => c && typeof c.id === 'string')
  .map((c) => ({ ...sanitizeCharacterPatch(blankCharacter(c.id), c), acAuto: c.acAuto === true }));

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
// notes, campaign, inventory, AC mode, temp HP, damage taken (so a level-up adds the new max HP
// without healing anyone), and the portrait unless the patch brings one.
// Returns the updated character, or null.
// `replaceInventory`: the patch's inventory replaces the current one (a
// D&D Beyond sync re-maps it); otherwise the inventory is kept.
function refreshImported(id, mappedPatch, { replaceInventory = false } = {}) {
  const idx = characters.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const old = characters[idx];
  const damage = Math.max(0, old.hpMax - old.hpCurrent);
  const { notes, hpTemp, campaignId, inventory, acAuto, ...patch } = mappedPatch;
  const fresh = {
    ...blankCharacter(id),
    portrait: old.portrait, notes: old.notes, hpTemp: old.hpTemp, campaignId: old.campaignId,
    inventory: replaceInventory && Array.isArray(inventory) ? inventory : old.inventory, acAuto: old.acAuto,
  };
  let ch = sanitizeCharacterPatch(fresh, patch);
  ch.hpCurrent = Math.max(0, ch.hpMax - damage);
  characters[idx] = ch;
  persist();
  return ch;
}

// A campaign was deleted: move its characters to "No campaign".
function clearCampaign(campaignId) {
  let changed = false;
  characters.forEach((c) => {
    if (c.campaignId === campaignId) { c.campaignId = ''; changed = true; }
  });
  if (changed) persist();
}

module.exports = { all, find, addBlank, update, remove, addImported, refreshImported, clearCampaign };
