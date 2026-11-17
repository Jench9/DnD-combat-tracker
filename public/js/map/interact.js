// Moving tokens: pointer drag (mouse + touch), click-to-select then
// click-a-cell, and arrow keys for the selected token.
//
//   initInteract({ getView, place(id, x, y), remove(id), select(id|null) })
//   isDragging()  — main.js holds re-renders while a drag is in progress
//
// A big token (Large and up) keeps the cell you grabbed it by under the
// pointer, so its top-left corner lands `grab` cells up/left of the drop.
import { canPlace, tokenSize } from './render.js';

const DRAG_THRESHOLD = 5; // px of movement before a press becomes a drag

let drag = null; // { id, el, startX, startY, ghost, hover: [cells], grab: { x, y, px, py } }

export function isDragging() {
  return !!(drag && drag.ghost);
}

function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const cell = el.closest('.cell');
  if (cell) return { cell: { x: Number(cell.dataset.x), y: Number(cell.dataset.y) }, el: cell };
  const tray = el.closest('[data-drop="tray"]');
  if (tray) return { tray: true, el: tray };
  return null;
}

function setHover(els) {
  drag.hover.forEach((el) => el.classList.remove('drop-hover'));
  drag.hover = els;
  els.forEach((el) => el.classList.add('drop-hover'));
}

// The cells a token of `size` would cover with its top-left at x, y.
function footprint(x, y, size) {
  const els = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const el = document.querySelector(`#board .cell[data-x="${x + dx}"][data-y="${y + dy}"]`);
      if (el) els.push(el);
    }
  }
  return els;
}

function endDrag() {
  if (!drag) return;
  if (drag.ghost) drag.ghost.remove();
  drag.hover.forEach((el) => el.classList.remove('drop-hover'));
  drag.el.classList.remove('dragging');
  drag = null;
}

export function initInteract({ getView, place, remove, select }) {
  const combatant = (id) => getView().combat.combatants.find((c) => c.id === id);
  const tryPlace = (id, x, y) => {
    const { map, combat } = getView();
    if (canPlace(map, combat.combatants, id, x, y)) place(id, x, y);
  };
  // Where the token's top-left would go for a drop on `cell`.
  const anchor = (cell) => ({ x: cell.x - drag.grab.x, y: cell.y - drag.grab.y });

  document.addEventListener('pointerdown', (e) => {
    const tok = e.target.closest('.token');
    if (!tok || e.button !== 0 || tok.dataset.locked) return; // not this player's token
    e.preventDefault(); // no text selection / native image drag
    const r = tok.getBoundingClientRect();
    const size = tok.closest('.cell') ? tokenSize(combatant(tok.dataset.id)) : 1;
    const step = r.width / size;
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const grab = {
      x: Math.max(0, Math.min(size - 1, Math.floor(px / step))),
      y: Math.max(0, Math.min(size - 1, Math.floor(py / step))),
      px: px / r.width, py: py / r.height, // where in the token, for the ghost
    };
    drag = { id: tok.dataset.id, el: tok, startX: e.clientX, startY: e.clientY, ghost: null, hover: [], grab, size };
    tok.setPointerCapture(e.pointerId);
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      const r = drag.el.getBoundingClientRect();
      drag.ghost = drag.el.cloneNode(true);
      drag.ghost.classList.add('ghost');
      drag.ghost.style.width = r.width + 'px';
      drag.ghost.style.height = r.height + 'px';
      document.body.appendChild(drag.ghost);
      drag.el.classList.add('dragging');
    }
    const g = drag.ghost;
    g.style.left = e.clientX - g.offsetWidth * (drag.size > 1 ? drag.grab.px : 0.5) + 'px';
    g.style.top = e.clientY - g.offsetHeight * (drag.size > 1 ? drag.grab.py : 0.5) + 'px';
    const t = dropTarget(e.clientX, e.clientY);
    if (t && t.cell) {
      const a = anchor(t.cell);
      const { map, combat } = getView();
      const size = tokenSize(combatant(drag.id));
      setHover(canPlace(map, combat.combatants, drag.id, a.x, a.y) ? footprint(a.x, a.y, size) : []);
    } else setHover(t ? [t.el] : []);
  });

  document.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const { id } = drag;
    if (drag.ghost) {
      const t = dropTarget(e.clientX, e.clientY);
      const a = t && t.cell ? anchor(t.cell) : null;
      endDrag();
      if (a) tryPlace(id, a.x, a.y);
      else if (t && t.tray) remove(id);
      else select(getView().selectedId); // dropped outside: just redraw
    } else {
      endDrag();
      select(getView().selectedId === id ? null : id); // a click toggles selection
    }
  });

  document.addEventListener('pointercancel', () => {
    endDrag();
    select(getView().selectedId);
  });

  // Click an empty cell to move the selected token there.
  document.getElementById('board').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    const { selectedId } = getView();
    if (!cell || !selectedId || e.target.closest('.token')) return;
    tryPlace(selectedId, Number(cell.dataset.x), Number(cell.dataset.y));
  });

  document.addEventListener('keydown', (e) => {
    const { selectedId, map } = getView();
    if (!selectedId || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'Escape') { select(null); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(selectedId); return; }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const p = map.positions[selectedId];
    if (!step || !p) return;
    e.preventDefault();
    const x = p.x + step[0];
    const y = p.y + step[1];
    if (x >= 0 && y >= 0 && x < map.cols && y < map.rows) tryPlace(selectedId, x, y); // tryPlace checks the size
  });
}
