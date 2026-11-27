// Battle Map page entry point: socket, state, and wiring render + interact.
import { $ } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { renderMap, sizeBoard, tokenSize, cellLabel } from './render.js';
import { initInteract, isDragging, cancelDrag } from './interact.js';
import { initZoom } from './zoom.js';
import { initTokenCard } from './card.js';
import { combatActionsFor } from '../core/combatActions.js';
import { createPortraitLookup } from '../core/portraits.js';
import { isDm, ownsCharacter, identityHeaders, myCharacterId } from '../core/identity.js';
import { renderMeStrip } from '../combat/meStrip.js';
import { setPartyData } from '../combat/party.js';
import { setBestiary } from '../combat/bestiary.js';
import { initAddPanels, syncAddPanels } from '../combat/addPanels.js';

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
const canMove = (c) => isDm() || (!!(c.characterId || c.ownerId) && ownsCharacter(c.characterId || c.ownerId)); // ownerId: a familiar

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
  // HP buttons: the DM for every token, a player for their own (same rule as moving).
  adjustHp: (c) => (canMove(c) ? (delta) => send('adjustHP', { id: c.id, delta }) : null),
});

let zoom = null; // set up below, once the board exists

// Hold redraws while a token is being dragged (it would vanish from
// under the pointer); catch up when the drag ends.
function render() {
  if (isDragging()) return;
  if (view.selectedId && !view.combat.combatants.some((c) => c.id === view.selectedId)) view.selectedId = null;
  renderMap({ ...view, portraitFor, glyphFor: pics.glyphFor, sheetFor: pics.characterFor, canMove });
  const active = view.combat.combatants[view.combat.activeIndex];
  const mayAdvance = active ? canMove(active) : isDm();
  $('nextTurnBtn').disabled = $('fbNextBtn').disabled = !mayAdvance;
  // Phones, players: your turn + HP above the page bar, as on the Combat page.
  const me = myCharacterId();
  const mine = !isDm() && me ? view.combat.combatants.find((c) => c.characterId === me) : undefined;
  renderMeStrip(view.combat, { mine, send, mayAdvance, onFind: () => findToken(mine.id), findTitle: 'Show your token' });
  $('fbTurn').textContent = `R${view.combat.round} · ` + $('turnName').textContent;
  $('fbTurn').classList.toggle('mine', !!(active && !isDm() && canMove(active)));
  const off = view.combat.combatants.filter((c) => !view.map.positions[c.id]).length;
  $('trayBtn').textContent = off ? `Tokens · ${off}` : 'Tokens';
  renderSelBar();
  const busy = ['INPUT', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.closest('.token-card, dialog');
  if (view.selectedId && !busy) {
    const tok = document.querySelector('.token[data-id="' + view.selectedId + '"]');
    if (tok) tok.focus({ preventScroll: true });
  }
  card.refresh();
  zoom?.refresh();
}

// Bring a token into view: centred on the board, or the tray if it's not on the map.
function findToken(id) {
  const tok = document.querySelector(`#board .token[data-id="${CSS.escape(id)}"]`);
  if (tok) { tok.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); return; }
  if (document.body.classList.contains('map-full')) setTrayOpen(true);
  else $('trayPanel').scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// The selected token's bar (fixed at the bottom): what a tap on a cell does,
// back to the tray, size (DM) and deselect, so phones don't need the keys.
function renderSelBar() {
  const c = view.combat.combatants.find((x) => x.id === view.selectedId);
  $('selBar').hidden = !c;
  document.body.classList.toggle('has-selbar', !!c);
  if (!c) return;
  const p = view.map.positions[c.id];
  const name = document.createElement('b');
  name.textContent = c.name + (p ? ' · ' + cellLabel(p.x, p.y) : '');
  const hint = document.createElement('small');
  hint.textContent = p ? 'Tap a cell to move' : 'Tap a cell to place';
  $('selText').replaceChildren(name, hint);
  $('selTrayBtn').hidden = !p;
  if (document.activeElement !== $('tokenSizeSelect')) $('tokenSizeSelect').value = String(tokenSize(c));
}

const socket = connectSocket({
  handlers: {
    state: (msg) => { view.combat = msg.state; render(); setPartyData({ combatants: msg.state.combatants }); updateJoin(); },
    mapState: (msg) => { view.map = msg.map; render(); },
    charState: (msg) => {
      characters = msg.characters;
      pics.setCharacters(msg.characters);
      render();
      setPartyData({ characters: msg.characters });
      updateJoin();
    },
    campaignState: (msg) => setPartyData({ campaigns: msg.campaigns }),
    itemState: (msg) => { items = msg.items; render(); },
    spellState: (msg) => { spells = msg.spells; render(); },
    monsterState: (msg) => { pics.setMonsters(msg.monsters); render(); if (isDm()) setBestiary(msg.monsters); },
  },
});
const send = socket.send;

// Allies / Enemies panels (combat/addPanels.js), as on the combat page.
initAddPanels($('addPanels'), { send, page: 'map' });
const updateJoin = () => syncAddPanels({ characters, combatants: view.combat.combatants });

// Move locally right away; the server's echo is authoritative.
function placeToken(id, x, y) {
  view.map = { ...view.map, positions: { ...view.map.positions, [id]: { x, y } } };
  view.selectedId = id;
  render();
  send('placeToken', { id, x, y });
}
function removeToken(id) {
  const positions = { ...view.map.positions };
  delete positions[id];
  view.map = { ...view.map, positions };
  view.selectedId = null;
  render();
  send('removeToken', { id });
}
function selectToken(id) {
  view.selectedId = id;
  // Full screen: picked from the tray drawer → close it so the board is free to tap.
  if (id && !view.map.positions[id]) setTrayOpen(false);
  render();
}
initInteract({ getView: () => view, place: placeToken, remove: removeToken, select: selectToken });

$('selTrayBtn').addEventListener('click', () => { if (view.selectedId) { card.close(); removeToken(view.selectedId); } });
$('selClearBtn').addEventListener('click', () => { card.close(); selectToken(null); });

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
$('fbNextBtn').addEventListener('click', () => send('nextTurn'));

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

// Pinch / Ctrl+wheel / buttons. A second finger cancels a token drag.
zoom = initZoom({
  getCols: () => view.map.cols,
  onGestureStart: () => { if (cancelDrag()) render(); },
  onZoom: () => card.refresh(),
});

window.addEventListener('resize', () => { sizeBoard(view.map.cols); zoom.refresh(); });

// ---- full screen: only the board, between a slim bar at the top and the
// phone's page bar (map.css body.map-full). One finger pans the board itself.
// The tray, grid and background tools open as a drawer ("Tokens").
// Remembered per browser.
const FULL_KEY = 'kit-map-full';
function setTrayOpen(open) {
  if (open === document.body.classList.contains('map-tray-open')) return;
  document.body.classList.toggle('map-tray-open', open);
  $('trayBtn').setAttribute('aria-expanded', String(open));
}
function setFull(on) {
  document.body.classList.toggle('map-full', on);
  $('fullBtn').setAttribute('aria-pressed', String(on));
  $('fullBtn').textContent = on ? '✕' : '⛶ Full screen';
  $('fullBtn').setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
  $('fullBtn').title = on ? 'Back to the page (Esc)' : 'Only the board, as big as the screen (Esc to leave)';
  if (!on) setTrayOpen(false);
  try { localStorage.setItem(FULL_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
  sizeBoard(view.map.cols); // the board is wider now (or narrower again)
  zoom.refresh();
  card.refresh();
}
$('fullBtn').addEventListener('click', () => setFull(!document.body.classList.contains('map-full')));
$('trayBtn').addEventListener('click', () => {
  const open = !document.body.classList.contains('map-tray-open');
  if (open) card.close(); // it would cover the drawer
  setTrayOpen(open);
});
// Esc closes the closest thing first: the drawer, then the token card or
// selection (card.js / interact.js), then full screen.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !document.body.classList.contains('map-full') || document.querySelector('dialog[open]')) return;
  if (document.body.classList.contains('map-tray-open')) { setTrayOpen(false); e.stopImmediatePropagation(); return; }
  if (!view.selectedId && !card.isOpen()) setFull(false);
}, true);
try { if (localStorage.getItem(FULL_KEY) === '1') setFull(true); } catch { /* storage blocked */ }

render();
