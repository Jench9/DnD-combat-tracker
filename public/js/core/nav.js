// Renders the shared top nav into <nav class="app-nav" data-active="<id>">,
// and on phones a bottom bar with the pages (phoneNav below).
import { visibleTools } from './tools.js';
import { isDm, authMode } from './identity.js';
import { initIdentity } from './join.js';
import { manualDice, setManualDice } from './dice.js';
import './diceDialog.js'; // asks for the dice when "roll my own dice" is on

// Top-bar switch: roll your own (physical) dice and type the results, or
// let the app roll. Per browser; hand dice by default.
function diceToggle() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'id-badge dice-toggle';
  const ic = document.createElement('span');
  ic.className = 'ic';
  ic.setAttribute('aria-hidden', 'true');
  b.append(ic); // icon only: the words are in the tooltip and the accessible name
  const draw = () => {
    const on = manualDice();
    ic.textContent = on ? '✋' : '🎲';
    b.title = on
      ? 'Hand dice: you roll your own dice and type the results — click to let the app roll'
      : 'App dice: the app rolls for you — click to roll your own dice and type the results';
    b.setAttribute('aria-label', on ? 'Hand dice (you roll)' : 'App dice (the app rolls)');
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('on', on);
  };
  b.addEventListener('click', () => { setManualDice(!manualDice()); draw(); });
  draw();
  return b;
}

// Faded edges on the tab strip when there's more to scroll to.
function markOverflow(tabs) {
  const max = tabs.scrollWidth - tabs.clientWidth;
  tabs.classList.toggle('more-left', tabs.scrollLeft > 2);
  tabs.classList.toggle('more-right', max > 2 && tabs.scrollLeft < max - 2);
}

// The top bar: page tabs on the left (they scroll sideways when they don't
// fit — mouse wheel, trackpad, drag or the thin scrollbar), and on the right
// the dice switch and who you are, always visible.
export function renderNav() {
  const nav = document.querySelector('nav.app-nav');
  if (!nav) return;
  const active = nav.dataset.active;
  const items = [{ id: 'home', href: 'index.html', icon: '🏠', title: 'Home', short: '' }, ...visibleTools({ isDm: isDm(), accounts: authMode() === 'accounts' })];
  nav.innerHTML = '';
  const tabs = document.createElement('div');
  tabs.className = 'nav-tabs';
  items.forEach((t) => {
    const a = document.createElement('a');
    a.className = 'nav-btn' + (t.id === active ? ' active' : '') + (t.id === 'home' ? ' home' : '');
    a.href = t.href;
    a.title = t.title;
    if (t.id === active) a.setAttribute('aria-current', 'page');
    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = t.icon;
    a.appendChild(ic);
    const label = t.short ?? t.title;
    if (label) {
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = label;
      a.appendChild(lbl);
    } else a.setAttribute('aria-label', t.title);
    tabs.appendChild(a);
  });
  const side = document.createElement('div');
  side.className = 'nav-side';
  nav.append(tabs, side);
  side.appendChild(diceToggle());
  initIdentity(side);

  // A vertical mouse wheel scrolls the tabs sideways when they overflow.
  tabs.addEventListener('wheel', (e) => {
    if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    tabs.scrollLeft += e.deltaY;
  }, { passive: false });
  tabs.addEventListener('scroll', () => markOverflow(tabs), { passive: true });
  window.addEventListener('resize', () => markOverflow(tabs));
  // Bring the current page's tab into view.
  const current = tabs.querySelector('.nav-btn.active');
  if (current) tabs.scrollLeft = current.offsetLeft - (tabs.clientWidth - current.offsetWidth) / 2;
  markOverflow(tabs);

  phoneNav(items.filter((t) => t.id !== 'home'), active);
}

// ---- phone bottom bar (≤ 760 px; CSS hides it on wider screens) ----
// The top bar keeps only 🏠, the current page and the right-hand badges;
// the pages move to a bar at the bottom, in reach of the thumb. Up to
// PHONE_SLOTS pages fit; otherwise the best-ranked (`phone` in tools.js)
// keep a slot and the rest open from "More" as a bottom sheet.
const PHONE_SLOTS = 5;

function navLink(t, active, cls, label) {
  const a = document.createElement('a');
  a.className = cls + (t.id === active ? ' active' : '');
  a.href = t.href;
  if (t.id === active) a.setAttribute('aria-current', 'page');
  const ic = document.createElement('span');
  ic.className = 'ic';
  ic.setAttribute('aria-hidden', 'true');
  ic.textContent = t.icon;
  const lbl = document.createElement('span');
  lbl.className = 'lbl';
  lbl.textContent = label;
  a.append(ic, lbl);
  return a;
}

function phoneNav(tools, active) {
  document.querySelectorAll('.phone-nav, .pn-sheet-backdrop').forEach((n) => n.remove());
  let main = tools;
  let rest = [];
  if (tools.length > PHONE_SLOTS) {
    const keep = new Set([...tools].sort((a, b) => (a.phone ?? 99) - (b.phone ?? 99)).slice(0, PHONE_SLOTS - 1));
    main = tools.filter((t) => keep.has(t)); // registry order, like the top bar
    rest = tools.filter((t) => !keep.has(t));
  }

  const bar = document.createElement('nav');
  bar.className = 'phone-nav';
  bar.setAttribute('aria-label', 'Pages');
  main.forEach((t) => bar.appendChild(navLink(t, active, 'pn-btn', t.short ?? t.title)));
  document.body.classList.add('has-phone-nav');
  document.body.appendChild(bar);
  if (!rest.length) return;

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'pn-btn pn-more' + (rest.some((t) => t.id === active) ? ' active' : '');
  more.setAttribute('aria-haspopup', 'dialog');
  more.setAttribute('aria-expanded', 'false');
  more.innerHTML = '<span class="ic" aria-hidden="true">☰</span><span class="lbl">More</span>';
  bar.appendChild(more);

  const backdrop = document.createElement('div');
  backdrop.className = 'pn-sheet-backdrop';
  backdrop.hidden = true;
  const sheet = document.createElement('div');
  sheet.className = 'pn-sheet';
  sheet.id = 'pnSheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'More pages');
  rest.forEach((t) => sheet.appendChild(navLink(t, active, 'pn-sheet-btn', t.title)));
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
  more.setAttribute('aria-controls', sheet.id);

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function open() {
    backdrop.hidden = false;
    more.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKey);
    sheet.querySelector('a')?.focus();
  }
  function close() {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    more.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey);
    more.focus();
  }
  more.addEventListener('click', () => (backdrop.hidden ? open() : close()));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
}

// While typing on a phone the on-screen keyboard leaves little room, so the
// bottom bar steps aside (CSS: body.typing) until the field loses focus.
const TYPING = 'input:not([type=checkbox], [type=radio], [type=range], [type=button], [type=submit], [type=file], [type=color]), textarea, [contenteditable="true"]';
document.addEventListener('focusin', (e) => {
  if (e.target instanceof Element && e.target.matches(TYPING)) document.body.classList.add('typing');
});
document.addEventListener('focusout', () => document.body.classList.remove('typing'));
