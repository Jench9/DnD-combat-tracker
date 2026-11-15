// Moving tokens: pointer drag (mouse + touch), click-to-select then
// click-a-cell, and arrow keys for the selected token.
//
//   initInteract({ getView, place(id, x, y), remove(id), select(id|null) })
//   isDragging()  — main.js holds re-renders while a drag is in progress
const DRAG_THRESHOLD = 5; // px of movement before a press becomes a drag

let drag = null; // { id, el, startX, startY, ghost, hover }

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

function setHover(el) {
  if (drag.hover === el) return;
  if (drag.hover) drag.hover.classList.remove('drop-hover');
  drag.hover = el;
  if (el) el.classList.add('drop-hover');
}

function endDrag() {
  if (!drag) return;
  if (drag.ghost) drag.ghost.remove();
  if (drag.hover) drag.hover.classList.remove('drop-hover');
  drag.el.classList.remove('dragging');
  drag = null;
}

export function initInteract({ getView, place, remove, select }) {
  const occupiedBy = (x, y) => {
    const { positions } = getView().map;
    return Object.keys(positions).find((id) => positions[id].x === x && positions[id].y === y);
  };
  const tryPlace = (id, x, y) => {
    const other = occupiedBy(x, y);
    if (!other || other === id) place(id, x, y);
  };

  document.addEventListener('pointerdown', (e) => {
    const tok = e.target.closest('.token');
    if (!tok || e.button !== 0) return;
    e.preventDefault(); // no text selection / native image drag
    drag = { id: tok.dataset.id, el: tok, startX: e.clientX, startY: e.clientY, ghost: null, hover: null };
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
    g.style.left = e.clientX - g.offsetWidth / 2 + 'px';
    g.style.top = e.clientY - g.offsetHeight / 2 + 'px';
    const t = dropTarget(e.clientX, e.clientY);
    setHover(t ? t.el : null);
  });

  document.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const { id } = drag;
    if (drag.ghost) {
      const t = dropTarget(e.clientX, e.clientY);
      endDrag();
      if (t && t.cell) tryPlace(id, t.cell.x, t.cell.y);
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
    if (x >= 0 && y >= 0 && x < map.cols && y < map.rows) tryPlace(selectedId, x, y);
  });
}
