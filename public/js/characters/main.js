// Character Sheets page entry point: wires socket, list, editor, import.
import { $, uid } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { store, findChar, cur, mergePending, blankCharacter, clearTouched } from './store.js';
import { renderCharGrid } from './list.js';
import { initEditor, openEditor, refreshEditorFromServer, showListView } from './editor/index.js';
import { initImport } from './import.js';
import { identityHeaders, myCharacterId } from '../core/identity.js';
import { refreshItemOptions } from './editor/inventory.js';
import { refreshSpellOptions } from './editor/spellbook.js';
import { initCampaigns, renderCampaignControls, markCampaignsLoaded, campaignForNew, refreshCampaignManager } from './campaigns.js';
import { openCreator } from './builder/wizard.js';
import { openLevelUp } from './builder/levelup.js';
import { refreshFamiliarUi } from './editor/familiar.js';

renderNav();

function setConn(live) {
  $('connDot').classList.toggle('live', live);
  $('connLabel').textContent = live ? 'Live' : 'Connecting…';
}

const socket = connectSocket({
  onStatus: setConn,
  handlers: {
    // Only to know whether the open character's familiar is in the fight.
    state: (msg) => {
      store.combat = msg.state;
      if (cur()) refreshFamiliarUi(cur());
    },
    charState: (msg) => {
      const prev = store.activeCharId ? findChar(store.activeCharId) : null;
      store.characters = msg.characters;
      const now = store.activeCharId ? findChar(store.activeCharId) : null;
      if (prev && now) mergePending(prev, now);
      renderCharGrid(openEditor);
      refreshCampaignManager();
      if (store.activeCharId && !refreshEditorFromServer()) closeEditor();
      openFromHash();
      openOwnSheet();
    },
    itemState: (msg) => {
      store.items = msg.items;
      refreshItemOptions();
      if (store.activeCharId && !refreshEditorFromServer()) closeEditor();
    },
    spellState: (msg) => {
      store.spells = msg.spells;
      refreshSpellOptions();
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

// characters.html#edit=<id> opens that sheet; #create=<id> also opens the
// guided creation for it (a new player from the "Who are you?" screen).
function openFromHash() {
  const m = location.hash.match(/^#(edit|create)=([A-Za-z0-9]+)$/);
  if (!m || !findChar(m[2])) return;
  history.replaceState(null, '', location.pathname);
  openEditor(m[2]);
  if (m[1] === 'create') openCreator({ id: m[2], onDone: adoptCharacter });
}

// The builder's REST answer: take the server's character right away (the
// broadcast follows) and show it.
function adoptCharacter(ch) {
  const idx = store.characters.findIndex((c) => c.id === ch.id);
  if (idx === -1) store.characters.unshift(ch); else store.characters[idx] = ch;
  clearTouched();
  renderCharGrid(openEditor);
  if (store.activeCharId === ch.id) refreshEditorFromServer(); else openEditor(ch.id);
}

// A player playing a character lands on their own sheet instead of the
// list — once per page load, so "Back to list" still shows everyone.
let ownSheetChecked = false;
function openOwnSheet() {
  if (ownSheetChecked) return;
  ownSheetChecked = true;
  const id = myCharacterId();
  if (!id || store.activeCharId || !findChar(id)) return;
  openEditor(id);
}

function closeEditor() {
  store.activeCharId = null;
  renderCharGrid(openEditor);
  showListView();
}

initEditor();
initCampaigns({ onFilterChange: () => renderCharGrid(openEditor) });
renderCampaignControls();

// New character: the guided creation; "Blank sheet" for filling it in by hand.
$('newCharBtn').addEventListener('click', () => openCreator({ campaignId: campaignForNew(), onDone: adoptCharacter }));

$('blankCharBtn').addEventListener('click', () => {
  const id = uid();
  const campaignId = campaignForNew();
  store.characters.unshift({ ...blankCharacter(id), campaignId, campaignIds: campaignId ? [campaignId] : [] }); // optimistic; the server confirms
  store.send('addCharacter', { id, campaignId });
  openEditor(id);
});

$('backToListBtn').addEventListener('click', closeEditor);

// Fill in an empty sheet with the guided creation (a new player's sheet).
$('guidedBtn').addEventListener('click', () => {
  const ch = cur();
  if (ch) openCreator({ id: ch.id, onDone: adoptCharacter });
});

$('levelUpBtn').addEventListener('click', () => {
  const ch = cur();
  if (ch) openLevelUp(ch, { onDone: (next, summary) => { adoptCharacter(next); if (summary) showToast('⬆ ' + summary); } });
});

function showToast(text) {
  const t = document.createElement('div');
  t.className = 'b-toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// DM: copy the open sheet and open the copy.
$('duplicateCharBtn').addEventListener('click', () => {
  const ch = cur();
  if (!ch) return;
  const newId = uid();
  const copy = { ...structuredClone(ch), id: newId, name: ('Copy of ' + (ch.name || 'character')).slice(0, 40), ddbId: '' };
  store.characters.splice(store.characters.indexOf(ch), 0, copy); // optimistic; the server confirms
  store.send('duplicateCharacter', { id: ch.id, newId });
  openEditor(newId);
});

$('deleteCharBtn').addEventListener('click', () => {
  const ch = cur();
  if (!ch) return;
  if (!confirm('Delete "' + (ch.name || 'this character') + '"? This can\'t be undone.')) return;
  store.send('deleteCharacter', { id: store.activeCharId });
  closeEditor();
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
    + 'Stats, proficiencies, inventory, equipment, spells, spell slots and features will be replaced with what\'s on D&D Beyond. '
    + 'Portrait, notes, temp HP and damage taken are kept.')) {
    return;
  }
  const btn = $('ddbSyncBtn');
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  try {
    const resp = await fetch('/api/import/dndbeyond/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...identityHeaders() },
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
