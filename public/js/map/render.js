// Pure-ish view for the battle map: draws the tray and the grid from the
// current combat + map state. Interaction lives in interact.js.
import { $ } from '../core/dom.js';

// Column letters like a spreadsheet: A..Z, AA, AB...
export function colLabel(x) {
  let s = '';
  for (let n = x + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export const cellLabel = (x, y) => colLabel(x) + (y + 1);

// Token footprint in cells (1 Medium or smaller, 2 Large, 3 Huge, 4 Gargantuan).
export const tokenSize = (c) => (c && Number.isInteger(c.size) ? Math.max(1, Math.min(4, c.size)) : 1);
export const SIZE_NAMES = { 1: 'Medium or smaller', 2: 'Large', 3: 'Huge', 4: 'Gargantuan' };

// Same rule as the server: on the grid and not overlapping another token.
export function canPlace(map, combatants, id, x, y) {
  const sizeOf = (cid) => tokenSize(combatants.find((c) => c.id === cid));
  const size = sizeOf(id);
  if (x < 0 || y < 0 || x + size > map.cols || y + size > map.rows) return false;
  return !Object.entries(map.positions).some(([other, p]) => {
    if (other === id) return false;
    const s = sizeOf(other);
    return x < p.x + s && p.x < x + size && y < p.y + s && p.y < y + size;
  });
}

// How hurt a combatant is, as a CSS level for the name label. Same thresholds
// as the server's health words (players get the word, the DM the numbers).
const HEALTH_LEVEL = { Unhurt: 'ok', Hurt: 'hurt', Bloodied: 'bloodied', 'Near death': 'critical', Down: 'down' };
export function healthLevel(c) {
  if (c.health) return HEALTH_LEVEL[c.health] || 'ok';
  if (c.hp <= 0) return 'down';
  if (!(c.maxHp > 0) || c.hp >= c.maxHp) return 'ok';
  const pct = c.hp / c.maxHp;
  return pct > 0.5 ? 'hurt' : pct > 0.25 ? 'bloodied' : 'critical';
}

// Small name under the token. A trailing number ("Goblin 3") is kept in its
// own span so a long name is cut with "…" but the number always shows.
function nameLabel(c) {
  const label = document.createElement('span');
  label.className = 'tok-name lvl-' + healthLevel(c);
  const m = /^(.*?)\s*(\d+)$/.exec((c.name || '?').trim());
  const base = document.createElement('span');
  base.className = 'base';
  base.textContent = m && m[1] ? m[1] : (c.name || '?').trim();
  label.appendChild(base);
  if (m && m[1]) {
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = m[2];
    label.appendChild(num);
  }
  return label;
}

// Players get monsters with a `health` word instead of hp/maxHp/ac.
// `onBoard`: drawn at its real size (size × size cells) from its cell.
export function tokenNode(c, { active, selected, portrait, where, locked, showName, onBoard }) {
  const down = c.health ? c.health === 'Down' : c.hp <= 0;
  const t = document.createElement('div');
  t.className = 'token ' + (c.type === 'pc' ? 'pc' : 'mon')
    + (active ? ' active' : '') + (selected ? ' selected' : '') + (down ? ' down' : '')
    + (c.hidden ? ' hidden-tok' : '') + (locked ? ' locked' : '');
  t.dataset.id = c.id;
  const size = tokenSize(c);
  if (onBoard && size > 1) {
    t.classList.add('big');
    t.style.setProperty('--size', size);
  }
  if (locked) t.dataset.locked = '1';
  t.tabIndex = locked ? -1 : 0;
  const hp = c.health || (Math.max(0, c.hp) + '/' + c.maxHp + ' HP');
  t.title = [c.name, where, size > 1 ? SIZE_NAMES[size] : '', hp, c.ac !== undefined ? 'AC ' + c.ac : '', c.hidden ? 'hidden from players' : '']
    .filter(Boolean).join(' — ');
  t.setAttribute('aria-label', t.title);

  if (portrait) {
    const img = document.createElement('img');
    img.src = portrait;
    img.alt = '';
    img.draggable = false;
    t.appendChild(img);
  } else {
    const ini = document.createElement('span');
    ini.className = 'ini';
    ini.textContent = ((c.name || '?').trim().charAt(0) || '?').toUpperCase();
    t.appendChild(ini);
  }

  if (showName) {
    t.classList.add('named');
    t.appendChild(nameLabel(c));
  }

  if (c.health) return t; // no numbers to draw a bar from
  const bar = document.createElement('span');
  bar.className = 'tok-hp';
  const fill = document.createElement('span');
  const pct = c.maxHp > 0 ? Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100)) : 0;
  fill.className = pct <= 25 ? 'low' : pct <= 55 ? 'mid' : '';
  fill.style.width = pct + '%';
  bar.appendChild(fill);
  t.appendChild(bar);
  return t;
}

// view: { combat, map, selectedId, portraitFor, canMove(combatant), showNames }
export function renderMap(view) {
  const { combat, map, selectedId, portraitFor, canMove, showNames } = view;
  const active = combat.combatants[combat.activeIndex];
  const byId = new Map(combat.combatants.map((c) => [c.id, c]));

  // Header
  $('roundNum').textContent = combat.round;
  $('turnName').textContent = active ? active.name + "'s turn"
    : combat.combatants.length ? '…' : 'No combatants'; // '…' = a hidden creature's turn
  ['colsInput', 'rowsInput'].forEach((id, i) => {
    const el = $(id);
    if (document.activeElement !== el) el.value = i === 0 ? map.cols : map.rows;
  });

  const opts = (c, where) => ({
    active: active && active.id === c.id, selected: selectedId === c.id, portrait: portraitFor(c), where,
    locked: !canMove(c),
  });

  // Tray: combatants not on the map, in initiative order.
  const tray = $('tray');
  tray.innerHTML = '';
  const off = combat.combatants.filter((c) => !map.positions[c.id]);
  if (combat.combatants.length === 0) {
    tray.innerHTML = '<div class="tray-empty">No combatants yet — add them on the <a href="combat.html">Combat Tracker</a>.</div>';
  } else if (off.length === 0) {
    tray.innerHTML = '<div class="tray-empty">Everyone is on the map. Drop a token here to take it off.</div>';
  } else {
    off.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'tray-item';
      item.appendChild(tokenNode(c, opts(c, 'not on the map')));
      const name = document.createElement('span');
      name.className = 'tray-name';
      name.textContent = c.name;
      item.appendChild(name);
      tray.appendChild(item);
    });
  }

  // Background picker (DM only; players don't get the list).
  const sel = $('bgSelect');
  if (map.backgrounds && document.activeElement !== sel) {
    sel.innerHTML = '';
    [{ id: '', name: 'None' }, ...map.backgrounds].forEach((b) => {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.name;
      sel.appendChild(o);
    });
    sel.value = map.backgroundId || '';
  }
  ['bgFitBtn', 'bgRenameBtn', 'bgDeleteBtn'].forEach((id) => { $(id).hidden = !map.backgroundId; });

  // Board: corner + column labels, then each row's label and cells.
  const board = $('board');
  board.style.setProperty('--cols', map.cols);
  board.style.setProperty('--rows', map.rows);
  board.classList.toggle('has-bg', !!map.backgroundId);
  // The background image is stretched over exactly the cell area, under the
  // cells. Keep the same <img> across redraws so a big map doesn't flicker.
  const oldBg = board.querySelector('.board-bg');
  board.innerHTML = '';
  if (map.backgroundId) {
    const src = '/api/maps/backgrounds/' + encodeURIComponent(map.backgroundId);
    let bg = oldBg && oldBg.dataset.id === map.backgroundId ? oldBg : null;
    if (!bg) {
      bg = document.createElement('img');
      bg.className = 'board-bg';
      bg.dataset.id = map.backgroundId;
      bg.src = src;
      bg.alt = '';
      bg.draggable = false;
    }
    board.appendChild(bg);
  }
  const corner = document.createElement('div');
  corner.className = 'lbl corner';
  board.appendChild(corner);
  for (let x = 0; x < map.cols; x++) {
    const l = document.createElement('div');
    l.className = 'lbl col';
    l.textContent = colLabel(x);
    board.appendChild(l);
  }
  const at = {};
  Object.entries(map.positions).forEach(([id, p]) => { if (byId.has(id)) at[p.x + ',' + p.y] = byId.get(id); });
  for (let y = 0; y < map.rows; y++) {
    const l = document.createElement('div');
    l.className = 'lbl row';
    l.textContent = y + 1;
    board.appendChild(l);
    for (let x = 0; x < map.cols; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;
      const c = at[x + ',' + y];
      if (c) {
        cell.classList.add('has-token');
        cell.appendChild(tokenNode(c, { ...opts(c, cellLabel(x, y)), showName: showNames, onBoard: true }));
      }
      board.appendChild(cell);
    }
  }
  sizeBoard(map.cols);
}

// Fit cells to the available width (32–64px); narrower screens scroll.
export function sizeBoard(cols) {
  const scroll = $('boardScroll');
  const labelW = 26;
  const cell = Math.max(32, Math.min(64, Math.floor((scroll.clientWidth - labelW - 2) / cols)));
  $('board').style.setProperty('--cell', cell + 'px');
}
