// Renders the shared top nav into <nav class="app-nav" data-active="<id>">.
import { TOOLS } from './tools.js';

export function renderNav() {
  const nav = document.querySelector('nav.app-nav');
  if (!nav) return;
  const active = nav.dataset.active;
  const items = [{ id: 'home', href: 'index.html', icon: '🏠', title: 'Home' }, ...TOOLS];
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
}
