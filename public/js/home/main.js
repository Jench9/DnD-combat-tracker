import { renderNav } from '../core/nav.js';
import { TOOLS } from '../core/tools.js';
import { isDm } from '../core/identity.js';

renderNav();

const grid = document.getElementById('toolGrid');
TOOLS.filter((t) => !t.dmOnly || isDm()).forEach((t) => {
  const a = document.createElement('a');
  a.className = 'tool-card';
  a.href = t.href;
  const ic = document.createElement('span');
  ic.className = 'ic';
  ic.textContent = t.icon;
  const h = document.createElement('h2');
  h.textContent = t.title;
  const p = document.createElement('p');
  p.textContent = t.description;
  a.append(ic, h, p);
  grid.appendChild(a);
});
