// Character Sheets page entry point: wires socket, list, editor, import.
import { $, uid } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { store, findChar, cur, mergePending, blankCharacter } from './store.js';
import { renderCharGrid } from './list.js';
import { initEditor, openEditor, refreshEditorFromServer, showListView } from './editor/index.js';
import { initImport } from './import.js';

renderNav();

function setConn(live) {
  $('connDot').classList.toggle('live', live);
  $('connLabel').textContent = live ? 'Live' : 'Connecting…';
}

const socket = connectSocket({
  onStatus: setConn,
  handlers: {
    charState: (msg) => {
      const prev = store.activeCharId ? findChar(store.activeCharId) : null;
      store.characters = msg.characters;
      const now = store.activeCharId ? findChar(store.activeCharId) : null;
      if (prev && now) mergePending(prev, now);
      renderCharGrid(openEditor);
      if (store.activeCharId && !refreshEditorFromServer()) closeEditor();
    },
  },
});
store.send = socket.send;

function closeEditor() {
  store.activeCharId = null;
  renderCharGrid(openEditor);
  showListView();
}

initEditor();

$('newCharBtn').addEventListener('click', () => {
  const id = uid();
  store.characters.unshift(blankCharacter(id)); // optimistic; the server confirms
  store.send('addCharacter', { id });
  openEditor(id);
});

$('backToListBtn').addEventListener('click', closeEditor);

$('deleteCharBtn').addEventListener('click', () => {
  const ch = cur();
  if (!ch) return;
  if (!confirm('Delete "' + (ch.name || 'this character') + '"? This can\'t be undone.')) return;
  store.send('deleteCharacter', { id: store.activeCharId });
  closeEditor();
});

$('sendToCombatBtn').addEventListener('click', () => {
  if (!store.activeCharId) return;
  store.send('sendToCombat', { id: store.activeCharId });
  window.location.href = 'combat.html';
});

// On import success, adopt the character the server handed back and jump
// straight into its editor so the user can review what got mapped.
initImport({
  onImported: (ch) => {
    if (!findChar(ch.id)) store.characters.unshift(ch);
    renderCharGrid(openEditor);
    openEditor(ch.id);
  },
});
