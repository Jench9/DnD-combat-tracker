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

function tokenNode(c, { active, selected, portrait, where }) {
  const t = document.createElement('div');
  t.className = 'token ' + (c.type === 'pc' ? 'pc' : 'mon')
    + (active ? ' active' : '') + (selected ? ' selected' : '') + (c.hp <= 0 ? ' down' : '');
  t.dataset.id = c.id;
  t.tabIndex = 0;
  const hp = Math.max(0, c.hp) + '/' + c.maxHp + ' HP';
  t.title = [c.name, where, hp, 'AC ' + c.ac].filter(Boolean).join(' — ');
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

// view: { combat, map, selectedId, portraitFor }
export function renderMap(view) {
  const { combat, map, selectedId, portraitFor } = view;
  const active = combat.combatants[combat.activeIndex];
  const byId = new Map(combat.combatants.map((c) => [c.id, c]));

  // Header
  $('roundNum').textContent = combat.round;
  $('turnName').textContent = active ? active.name + "'s turn" : 'No combatants';
  ['colsInput', 'rowsInput'].forEach((id, i) => {
    const el = $(id);
    if (document.activeElement !== el) el.value = i === 0 ? map.cols : map.rows;
  });

  const opts = (c, where) => ({
    active: active && active.id === c.id, selected: selectedId === c.id, portrait: portraitFor(c), where,
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

  // Board: corner + column labels, then each row's label and cells.
  const board = $('board');
  board.style.setProperty('--cols', map.cols);
  board.innerHTML = '';
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
      if (c) cell.appendChild(tokenNode(c, opts(c, cellLabel(x, y))));
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
