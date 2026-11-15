// Character Sheets page entry point: wires socket, list, editor, import.
import { $, uid } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { store, findChar, cur, mergePending, blankCharacter, clearTouched } from './store.js';
import { renderCharGrid } from './list.js';
import { initEditor, openEditor, refreshEditorFromServer, showListView } from './editor/index.js';
import { initImport } from './import.js';
import { initCampaigns, renderCampaignControls, markCampaignsLoaded, campaignForNew } from './campaigns.js';

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
    campaignState: (msg) => {
      store.campaigns = msg.campaigns;
      markCampaignsLoaded();
      renderCampaignControls();
      renderCharGrid(openEditor);
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
initCampaigns({ onFilterChange: () => renderCharGrid(openEditor) });
renderCampaignControls();

$('newCharBtn').addEventListener('click', () => {
  const id = uid();
  const campaignId = campaignForNew();
  store.characters.unshift({ ...blankCharacter(id), campaignId }); // optimistic; the server confirms
  store.send('addCharacter', { id, campaignId });
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

// Re-import the open character from D&D Beyond (e.g. after leveling up).
// Characters not yet linked ask for their URL first.
$('ddbSyncBtn').addEventListener('click', async () => {
  const ch = cur();
  if (!ch) return;
  let input;
  if (!ch.ddbId) {
    input = prompt('Paste the D&D Beyond character URL or ID to link "' + (ch.name || 'this character') + '":');
    if (!input || !input.trim()) return;
  } else if (!confirm('Update "' + (ch.name || 'this character') + '" from D&D Beyond?\n\n'
    + 'Stats, proficiencies, equipment and features will be replaced with what\'s on D&D Beyond. '
    + 'Portrait, notes, temp HP and damage taken are kept.')) {
    return;
  }
  const btn = $('ddbSyncBtn');
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  try {
    const resp = await fetch('/api/import/dndbeyond/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: ch.id, input }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      alert(data.error || 'Update failed.');
    } else {
      const idx = store.characters.findIndex((c) => c.id === data.character.id);
      if (idx !== -1) store.characters[idx] = data.character;
      clearTouched();
      refreshEditorFromServer();
      renderCharGrid(openEditor);
    }
  } catch (err) {
    alert('Could not reach the server.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sync from D&D Beyond';
  }
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
