// Renders the shared top nav into <nav class="app-nav" data-active="<id>">.
import { TOOLS } from './tools.js';
import { isDm } from './identity.js';
import { initIdentity } from './join.js';
import { manualDice, setManualDice } from './dice.js';
import './diceDialog.js'; // asks for the dice when "roll my own dice" is on

// Top-bar switch: roll your own (physical) dice and type the results, or
// let the app roll. Per browser; off (automatic) by default.
function diceToggle() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'id-badge dice-toggle';
  const draw = () => {
    const on = manualDice();
    b.textContent = on ? '✋ My dice' : '🎲 Auto dice';
    b.title = on
      ? 'You roll your own dice and enter the results — click to let the app roll'
      : 'The app rolls the dice — click to roll your own dice and enter the results';
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('on', on);
  };
  b.addEventListener('click', () => { setManualDice(!manualDice()); draw(); });
  draw();
  return b;
}

export function renderNav() {
  const nav = document.querySelector('nav.app-nav');
  if (!nav) return;
  const active = nav.dataset.active;
  const items = [{ id: 'home', href: 'index.html', icon: '🏠', title: 'Home' }, ...TOOLS.filter((t) => !t.dmOnly || isDm())];
  nav.innerHTML = '';
  items.forEach((t) => {
    const a = document.createElement('a');
    a.className = 'nav-btn' + (t.id === active ? ' active' : '');
    a.href = t.href;
    const ic = document.createElement('span');
    ic.className = 'ic';
    ic.textContent = t.icon;
    a.append(ic, ' ' + t.title);
    nav.appendChild(a);
  });
  initIdentity(nav);
  nav.appendChild(diceToggle());
  // On narrow screens the tabs scroll sideways: bring the current one into view.
  const current = nav.querySelector('.nav-btn.active');
  if (current) nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
}
