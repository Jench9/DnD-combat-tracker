// Renders the shared top nav into <nav class="app-nav" data-active="<id>">.
import { TOOLS } from './tools.js';
import { isDm } from './identity.js';
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
  const lbl = document.createElement('span');
  lbl.className = 'lbl';
  b.append(ic, lbl);
  const draw = () => {
    const on = manualDice();
    ic.textContent = on ? '✋' : '🎲';
    lbl.textContent = on ? 'Hand dice' : 'App dice';
    b.title = on
      ? 'Hand dice: you roll your own dice and type the results — click to let the app roll'
      : 'App dice: the app rolls for you — click to roll your own dice and type the results';
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
  const items = [{ id: 'home', href: 'index.html', icon: '🏠', title: 'Home', short: '' }, ...TOOLS.filter((t) => !t.dmOnly || isDm())];
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
}
