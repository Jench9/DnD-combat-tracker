// TV view: the battle map for a shared screen (e.g. AirPlay to an Apple TV).
// Read-only and player-safe: it always connects as a plain player, so the
// server sends the filtered view (no hidden monsters, no DM-only details)
// even when the DM opens it on their own computer. The map is scaled to
// fill the screen; a bar shows the round, whose turn it is and the order.
import { connectSocket } from '../core/socket.js';
import { tableQuery } from '../core/identity.js';
import { createPortraitLookup } from '../core/portraits.js';
import { tokenNode, cellLabel } from '../map/render.js';

const $ = (id) => document.getElementById(id);
const view = {
  combat: { round: 1, activeIndex: -1, combatants: [] },
  map: { cols: 20, rows: 15, positions: {}, backgroundId: '' },
};
const pics = createPortraitLookup();

connectSocket({
  query: ['role=player', tableQuery()].filter(Boolean).join('&'), // never the DM view, whoever opens it; at this browser's table
  onStatus: (live) => {
    $('status').textContent = live ? '' : 'Reconnecting…';
    $('status').hidden = live;
  },
  handlers: {
    state: (msg) => { view.combat = msg.state; render(); },
    mapState: (msg) => { view.map = msg.map; render(); },
    charState: (msg) => { pics.setCharacters(msg.characters); render(); },
    monsterState: (msg) => { pics.setMonsters(msg.monsters); render(); },
  },
});

// ---- board
let bgId = '';
function renderBoard() {
  const { map, combat } = view;
  const board = $('board');
  const active = combat.combatants[combat.activeIndex];
  const byId = new Map(combat.combatants.map((c) => [c.id, c]));

  // Keep the background <img> across redraws (no flicker on token moves).
  const oldBg = board.querySelector('.board-bg');
  board.innerHTML = '';
  board.style.setProperty('--cols', map.cols);
  board.style.setProperty('--rows', map.rows);
  board.classList.toggle('has-bg', !!map.backgroundId);
  if (map.backgroundId) {
    let bg = oldBg && bgId === map.backgroundId ? oldBg : null;
    if (!bg) {
      bg = document.createElement('img');
      bg.className = 'board-bg';
      bg.alt = '';
      bg.src = '/api/maps/backgrounds/' + encodeURIComponent(map.backgroundId);
      bgId = map.backgroundId;
    }
    board.appendChild(bg);
  }

  const at = {};
  Object.entries(map.positions).forEach(([id, p]) => { if (byId.has(id)) at[p.x + ',' + p.y] = byId.get(id); });
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const c = at[x + ',' + y];
      if (c) {
        cell.classList.add('has-token');
        cell.appendChild(tokenNode(c, {
          active: active && active.id === c.id, selected: false, portrait: pics.portraitFor(c), glyph: pics.glyphFor(c), sheet: pics.characterFor(c), where: cellLabel(x, y), locked: true, showName: true, onBoard: true,
        }));
      }
      board.appendChild(cell);
    }
  }
  fit();
}

// Largest cell size that fits the whole grid on screen.
function fit() {
  const stage = $('stage');
  const { cols, rows } = view.map;
  const cell = Math.max(8, Math.floor(Math.min(stage.clientWidth / cols, stage.clientHeight / rows)));
  $('board').style.setProperty('--cell', cell + 'px');
}

// ---- bar: round, turn and initiative order
function avatar(c) {
  const a = document.createElement('span');
  a.className = 'tv-pic ' + (c.type === 'monster' ? 'mon' : 'pc') + (c.type === 'familiar' ? ' fam' : '');
  const src = pics.portraitFor(c);
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    a.appendChild(img);
  } else {
    a.textContent = pics.glyphFor(c);
  }
  return a;
}

function renderBar() {
  const { combat } = view;
  const active = combat.combatants[combat.activeIndex];
  $('round').textContent = combat.round;
  $('turn').textContent = active ? `${active.name}'s turn` : combat.combatants.length ? '…' : 'No fight yet';
  const order = $('order');
  order.innerHTML = '';
  combat.combatants.forEach((c, i) => {
    const down = c.health ? c.health === 'Down' : c.hp <= 0;
    const item = document.createElement('div');
    item.className = 'tv-o' + (i === combat.activeIndex ? ' active' : '') + (down ? ' down' : '');
    const name = document.createElement('span');
    name.className = 'tv-o-name';
    name.textContent = c.name;
    const hp = document.createElement('span');
    hp.className = 'tv-o-hp';
    hp.textContent = c.health || `${Math.max(0, c.hp)}/${c.maxHp}`;
    const text = document.createElement('span');
    text.className = 'tv-o-text';
    text.append(name, hp);
    item.append(avatar(c), text);
    order.appendChild(item);
  });
  const act = order.querySelector('.active');
  if (act) act.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function render() {
  const nothing = !view.combat.combatants.length && !view.map.backgroundId;
  $('empty').hidden = !nothing;
  $('empty').textContent = nothing ? `Waiting for the DM to set up the map… (this screen: ${location.host}/tv)` : '';
  renderBoard();
  renderBar();
}

window.addEventListener('resize', fit);

// ---- full screen, idle cursor, keep the screen awake
const fsEl = document.documentElement;
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
$('fsBtn').addEventListener('click', () => {
  if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl);
});
const onFs = () => { $('fsBtn').textContent = isFull() ? '✕ Exit full screen' : '⛶ Full screen'; fit(); };
document.addEventListener('fullscreenchange', onFs);
document.addEventListener('webkitfullscreenchange', onFs);
if (!fsEl.requestFullscreen && !fsEl.webkitRequestFullscreen) $('fsBtn').hidden = true; // e.g. iPhone Safari

let idle;
const wake = () => {
  document.body.classList.remove('idle');
  clearTimeout(idle);
  idle = setTimeout(() => document.body.classList.add('idle'), 3000);
};
['mousemove', 'touchstart', 'keydown'].forEach((e) => document.addEventListener(e, wake, { passive: true }));
wake();

// Ask the browser not to dim/sleep the screen (where supported).
let lock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !lock) lock = await navigator.wakeLock.request('screen'); lock?.addEventListener?.('release', () => { lock = null; }); } catch { /* not allowed / unsupported */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
keepAwake();

render();
