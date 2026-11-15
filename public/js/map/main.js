// Battle Map page entry point: socket, state, and wiring render + interact.
import { $ } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { renderMap, sizeBoard } from './render.js';
import { initInteract, isDragging } from './interact.js';
import { createPortraitLookup } from '../core/portraits.js';

renderNav();

const view = {
  combat: { round: 1, activeIndex: 0, combatants: [] },
  map: { cols: 20, rows: 15, positions: {} },
  selectedId: null,
};

const pics = createPortraitLookup(); // character portraits + monster icons
const { portraitFor } = pics;

// Hold redraws while a token is being dragged (it would vanish from
// under the pointer); catch up when the drag ends.
function render() {
  if (isDragging()) return;
  if (view.selectedId && !view.combat.combatants.some((c) => c.id === view.selectedId)) view.selectedId = null;
  renderMap({ ...view, portraitFor });
  if (view.selectedId) {
    const tok = document.querySelector('.token[data-id="' + view.selectedId + '"]');
    if (tok) tok.focus({ preventScroll: true });
  }
}

const socket = connectSocket({
  handlers: {
    state: (msg) => { view.combat = msg.state; render(); },
    mapState: (msg) => { view.map = msg.map; render(); },
    charState: (msg) => { pics.setCharacters(msg.characters); render(); },
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

$('clearMapBtn').addEventListener('click', () => {
  if (Object.keys(view.map.positions).length && !confirm('Take every token off the map?')) return;
  send('clearMap');
});

$('nextTurnBtn').addEventListener('click', () => send('nextTurn'));

window.addEventListener('resize', () => sizeBoard(view.map.cols));
render();
