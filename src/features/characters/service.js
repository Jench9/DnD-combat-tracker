// Character storage (in memory, newest first). No WebSocket knowledge here.
const { uid } = require('../../core/ids');
const { blankCharacter, sanitizeCharacterPatch } = require('./model');

let characters = [];

function all() {
  return characters;
}

function find(id) {
  return characters.find((c) => c.id === id);
}

// Returns false if the id already exists.
function addBlank(id) {
  if (find(id)) return false;
  characters.unshift(blankCharacter(id));
  return true;
}

function update(id, patch) {
  const idx = characters.findIndex((c) => c.id === id);
  if (idx === -1) return;
  characters[idx] = sanitizeCharacterPatch(characters[idx], patch);
}

function remove(id) {
  characters = characters.filter((c) => c.id !== id);
}

// Used by both importers: builds a blank character, applies a mapped
// patch through the same sanitizer normal edits go through, registers
// it, and returns it so the route can respond immediately.
function addImported(mappedPatch, notesPrefix) {
  const id = uid();
  let ch = blankCharacter(id);
  ch = sanitizeCharacterPatch(ch, mappedPatch);
  if (notesPrefix) {
    ch.notes = (notesPrefix + (ch.notes ? '\n\n' + ch.notes : '')).slice(0, 4000);
  }
  characters.unshift(ch);
  return ch;
}

module.exports = { all, find, addBlank, update, remove, addImported };
