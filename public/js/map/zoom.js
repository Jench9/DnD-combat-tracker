// Board zoom & pan: pinch with two fingers to zoom, move them together to
// pan; Ctrl+wheel (also a trackpad pinch) zooms on a computer; the − / Fit /
// + buttons work everywhere. One finger keeps its usual job (scroll the page,
// drag a token, tap for the card).
//
//   initZoom({ getCols, onGestureStart, onZoom })
//     getCols()        — current grid width (the fit depends on it)
//     onGestureStart() — a pinch began: cancel a token drag, redraw
//     onZoom()         — the cell size changed (move the token card)
//
// The zoom is a factor on the "fit to width" cell size (render.js setZoom),
// so it survives redraws and grid resizes; it's per page load, not saved.
// While zooming, the grid point under the fingers (or the mouse) stays put:
// the board scroller pans horizontally, the page vertically.
import { $ } from '../core/dom.js';
import { getZoom, setZoom, sizeBoard, fitCell, MIN_CELL, MAX_CELL } from './render.js';

const LABEL_W = 27; // row-label column + board border (not scaled)
const LABEL_H = 21; // column-label row + board border
const STEP = 1.25; // per button press

export function initZoom({ getCols, onGestureStart, onZoom }) {
  const scroll = $('boardScroll');
  const board = $('board');

  // Zoom to `z`, keeping the grid point under client (cx, cy) in place.
  function zoomAt(z, cx, cy) {
    const cols = getCols();
    const before = board.getBoundingClientRect();
    const oldCell = parseFloat(board.style.getPropertyValue('--cell')) || fitCell(cols);
    setZoom(z, cols);
    const ratio = sizeBoard(cols) / oldCell;
    const gx = cx - before.left - LABEL_W;
    const gy = cy - before.top - LABEL_H;
    scroll.scrollLeft += gx * (ratio - 1);
    window.scrollBy(0, gy * (ratio - 1));
    updateButtons();
    if (ratio !== 1) onZoom();
  }
  const zoomCentered = (z) => {
    const r = scroll.getBoundingClientRect();
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, window.innerHeight);
    zoomAt(z, r.left + r.width / 2, (top + bottom) / 2);
  };

  function updateButtons() {
    const cell = sizeBoard(getCols());
    $('zoomOutBtn').disabled = cell <= MIN_CELL;
    $('zoomInBtn').disabled = cell >= MAX_CELL;
    $('zoomFitBtn').disabled = getZoom() === 1;
    $('zoomFitBtn').textContent = Math.round(getZoom() * 100) + '%';
  }

  $('zoomInBtn').addEventListener('click', () => zoomCentered(getZoom() * STEP));
  $('zoomOutBtn').addEventListener('click', () => zoomCentered(getZoom() / STEP));
  $('zoomFitBtn').addEventListener('click', () => { zoomCentered(1); scroll.scrollLeft = 0; });

  // ---- two-finger pinch / pan (touch events: they can stop the browser's
  // own page zoom for this gesture only, and one finger stays native)
  let pinch = null; // { dist, zoom, mx, my }
  const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;

  scroll.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) { if (e.touches.length > 2) pinch = null; return; }
    e.preventDefault();
    onGestureStart();
    const m = mid(e.touches);
    pinch = { dist: dist(e.touches), zoom: getZoom(), mx: m.x, my: m.y };
  }, { passive: false });

  scroll.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();
    const m = mid(e.touches);
    // Pan first (fingers moved together), then zoom around the new midpoint.
    scroll.scrollLeft -= m.x - pinch.mx;
    window.scrollBy(0, -(m.y - pinch.my));
    pinch.mx = m.x;
    pinch.my = m.y;
    const z = pinch.zoom * (dist(e.touches) / pinch.dist);
    if (Math.abs(z - getZoom()) > 0.005) zoomAt(z, m.x, m.y);
  }, { passive: false });

  const endPinch = (e) => { if (e.touches.length < 2) pinch = null; };
  scroll.addEventListener('touchend', endPinch);
  scroll.addEventListener('touchcancel', endPinch);
  // Safari's own page pinch (gesture events) — not on the board.
  scroll.addEventListener('gesturestart', (e) => e.preventDefault());

  // ---- Ctrl+wheel / trackpad pinch on a computer
  scroll.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomAt(getZoom() * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
  }, { passive: false });

  return { refresh: updateButtons };
}
