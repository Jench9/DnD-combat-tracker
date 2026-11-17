// Battle Map page entry point: socket, state, and wiring render + interact.
import { $ } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { renderMap, sizeBoard, tokenSize } from './render.js';
import { initInteract, isDragging } from './interact.js';
import { initTokenCard } from './card.js';
import { combatActionsFor } from '../core/combatActions.js';
import { createPortraitLookup } from '../core/portraits.js';
import { isDm, ownsCharacter, identityHeaders } from '../core/identity.js';

renderNav();

const view = {
  combat: { round: 1, activeIndex: 0, combatants: [] },
  map: { cols: 20, rows: 15, positions: {} },
  selectedId: null,
  showNames: true,
};

// Name labels on the board: a per-browser preference.
try { view.showNames = localStorage.getItem('kit-map-names') !== '0'; } catch { /* storage blocked */ }
$('namesToggle').checked = view.showNames;
$('namesToggle').addEventListener('change', (e) => {
  view.showNames = e.target.checked;
  try { localStorage.setItem('kit-map-names', view.showNames ? '1' : '0'); } catch { /* storage blocked */ }
  render();
});

const pics = createPortraitLookup(); // character portraits + monster icons
const { portraitFor } = pics;
// The DM moves everything; a player only their own character's token.
const canMove = (c) => isDm() || (!!c.characterId && ownsCharacter(c.characterId));

// Hover / tap a token for its details (HP, AC, conditions, effects…) and,
// for your own character, its actions. Sheets and libraries for those:
let characters = [];
let items = [];
let spells = [];
const card = initTokenCard({
  getView: () => view,
  lookup: pics,
  isDragging,
  isDm,
  actionsFor: (c) => (canMove(c) ? combatActionsFor(c, {
    characters, items, spells, state: view.combat, send, isDm: isDm(), ownsCharacter, monsterFor: pics.monsterFor,
  }) : null),
});

// Hold redraws while a token is being dragged (it would vanish from
// under the pointer); catch up when the drag ends.
function render() {
  if (isDragging()) return;
  if (view.selectedId && !view.combat.combatants.some((c) => c.id === view.selectedId)) view.selectedId = null;
  renderMap({ ...view, portraitFor, glyphFor: pics.glyphFor, canMove });
  const active = view.combat.combatants[view.combat.activeIndex];
  $('nextTurnBtn').disabled = !(active ? canMove(active) : isDm());
  // DM: size picker for the selected token (Large, Huge… from the stat block).
  const selected = view.combat.combatants.find((c) => c.id === view.selectedId);
  $('tokenSizeField').hidden = !selected;
  if (selected && document.activeElement !== $('tokenSizeSelect')) $('tokenSizeSelect').value = String(tokenSize(selected));
  const busy = ['INPUT', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.closest('.token-card, dialog');
  if (view.selectedId && !busy) {
    const tok = document.querySelector('.token[data-id="' + view.selectedId + '"]');
    if (tok) tok.focus({ preventScroll: true });
  }
  card.refresh();
}

const socket = connectSocket({
  handlers: {
    state: (msg) => { view.combat = msg.state; render(); },
    mapState: (msg) => { view.map = msg.map; render(); },
    charState: (msg) => { characters = msg.characters; pics.setCharacters(msg.characters); render(); },
    itemState: (msg) => { items = msg.items; render(); },
    spellState: (msg) => { spells = msg.spells; render(); },
    monsterState: (msg) => { pics.setMonsters(msg.monsters); render(); },
  },
});
const send = socket.send;

initInteract({
  getView: () => view,
  // Move locally right away; the server's echo is authoritative.
  place: (id, x, y) => {
    view.map = { ...view.map, positions: { ...view.map.positions, [id]: { x, y } } };
    view.selectedId = id;
    render();
    send('placeToken', { id, x, y });
  },
  remove: (id) => {
    const positions = { ...view.map.positions };
    delete positions[id];
    view.map = { ...view.map, positions };
    view.selectedId = null;
    render();
    send('removeToken', { id });
  },
  select: (id) => { view.selectedId = id; render(); },
});

function sendSize() {
  send('setMapSize', { cols: parseInt($('colsInput').value, 10), rows: parseInt($('rowsInput').value, 10) });
}
['colsInput', 'rowsInput'].forEach((id) => {
  $(id).addEventListener('change', sendSize);
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $(id).addEventListener('blur', render);
});

$('tokenSizeSelect').addEventListener('change', (e) => {
  if (view.selectedId) send('setTokenSize', { id: view.selectedId, size: parseInt(e.target.value, 10) });
  e.target.blur();
});

$('clearMapBtn').addEventListener('click', () => {
  if (Object.keys(view.map.positions).length && !confirm('Take every token off the map?')) return;
  send('clearMap');
});

$('nextTurnBtn').addEventListener('click', () => send('nextTurn'));

// The TV view in its own window, ready to move to a TV / AirPlay display.
$('tvBtn').addEventListener('click', () => window.open('/tv', 'kit-tv', 'popup,width=1280,height=720'));

// ---- background maps (DM)
function bgMessage(text, isError) {
  $('bgMsg').textContent = text;
  $('bgMsg').classList.toggle('error', !!isError);
}
const currentBg = () => (view.map.backgrounds || []).find((b) => b.id === view.map.backgroundId);

$('bgSelect').addEventListener('change', (e) => send('setBackground', { id: e.target.value }));

$('bgUploadBtn').addEventListener('click', () => $('bgInput').click());
$('bgInput').addEventListener('change', async () => {
  const file = $('bgInput').files[0];
  $('bgInput').value = '';
  if (!file) return;
  const name = (prompt('Name for this map:', file.name.replace(/\.[^.]+$/, '')) || '').trim();
  if (!name) return;
  const fd = new FormData();
  fd.append('name', name);
  fd.append('file', file);
  bgMessage('Uploading…');
  $('bgUploadBtn').disabled = true;
  try {
    const resp = await fetch('/api/maps/backgrounds', { method: 'POST', headers: identityHeaders(), body: fd });
    const data = await resp.json();
    if (!resp.ok) { bgMessage(data.error || 'Upload failed.', true); return; }
    bgMessage('');
    send('setBackground', { id: data.background.id }); // show it right away
  } catch {
    bgMessage('Could not reach the server.', true);
  } finally {
    $('bgUploadBtn').disabled = false;
  }
});

// Keep the columns, pick the rows so the grid has the image's proportions.
$('bgFitBtn').addEventListener('click', () => {
  const img = document.querySelector('.board-bg');
  if (!img || !img.naturalWidth) return;
  const rows = Math.round(view.map.cols * (img.naturalHeight / img.naturalWidth));
  send('setMapSize', { cols: view.map.cols, rows });
});

$('bgRenameBtn').addEventListener('click', () => {
  const b = currentBg();
  const name = b && (prompt('Rename map:', b.name) || '').trim();
  if (name) send('renameBackground', { id: b.id, name });
});

$('bgDeleteBtn').addEventListener('click', () => {
  const b = currentBg();
  if (b && confirm('Delete the map "' + b.name + '"? The image file is removed.')) send('deleteBackground', { id: b.id });
});

window.addEventListener('resize', () => sizeBoard(view.map.cols));
render();
