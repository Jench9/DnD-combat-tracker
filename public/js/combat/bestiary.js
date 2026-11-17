// "Add monsters" panel on the combat page: the saved monster library, with
// how many to add. Each copy gets its own initiative roll on the server
// (d20 + bonus); fix any of them by editing the initiative in the list.
import { creatureIcon } from '../core/creatureIcons.js';
import { $ } from '../core/dom.js';

let monsters = [];
let send = () => {};
const counts = {}; // monsterId -> count typed in

const signed = (n) => (n >= 0 ? '+' : '') + n;

function renderRow(m) {
  const row = document.createElement('div');
  row.className = 'party-row';

  const who = document.createElement('div');
  who.className = 'party-who with-pic';
  const pic = document.createElement('div');
  pic.className = 'mini-pic mon';
  if (m.icon) {
    const img = document.createElement('img');
    img.src = m.icon;
    img.alt = '';
    pic.appendChild(img);
  } else {
    pic.textContent = creatureIcon(m);
  }
  const text = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'party-name';
  name.textContent = m.name || 'Unnamed monster';
  const sub = document.createElement('div');
  sub.className = 'party-sub';
  sub.textContent = `AC ${m.ac} · ${m.hpMax} HP · Init ${signed(m.initBonus)}`;
  text.append(name, sub);
  who.append(pic, text);
  row.appendChild(who);

  const controls = document.createElement('div');
  controls.className = 'party-controls';
  const label = document.createElement('label');
  label.className = 'count-field';
  label.textContent = '×';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '20';
  input.className = 'party-init count';
  input.value = counts[m.id] || 1;
  input.setAttribute('aria-label', 'How many ' + (m.name || 'monsters') + ' to add');
  input.addEventListener('input', () => { counts[m.id] = input.value; });
  label.appendChild(input);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn small';
  add.textContent = 'Add';
  const go = () => send('addMonsterToCombat', {
    monsterId: m.id, count: parseInt(input.value, 10) || 1, hidden: $('addHidden').checked,
  });
  add.addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

  controls.append(label, add);
  row.appendChild(controls);
  return row;
}

export function renderBestiary() {
  const list = $('bestiaryList');
  if (list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
    list.dataset.stale = '1';
    return;
  }
  delete list.dataset.stale;
  list.innerHTML = '';
  if (monsters.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = 'No saved monsters yet — create them on the <a href="monsters.html">Monsters</a> page, or quick-add one below.';
    list.appendChild(empty);
    return;
  }
  // The SRD library is large: show matches for the search (first 30).
  const q = $('bestiarySearch').value.trim().toLowerCase();
  const shown = monsters.filter((m) => !q || m.name.toLowerCase().includes(q));
  shown.slice(0, 30).forEach((m) => list.appendChild(renderRow(m)));
  if (shown.length > 30) {
    const more = document.createElement('div');
    more.className = 'empty';
    more.textContent = `…and ${shown.length - 30} more — type to search.`;
    list.appendChild(more);
  } else if (!shown.length) {
    const none = document.createElement('div');
    none.className = 'empty';
    none.textContent = 'No monster matches.';
    list.appendChild(none);
  }
}

export function setBestiary(list) {
  monsters = list;
  renderBestiary();
}

export function initBestiary(sendFn) {
  send = sendFn;
  $('bestiarySearch').addEventListener('input', renderBestiary);
  $('bestiaryList').addEventListener('focusout', () => {
    setTimeout(() => { if ($('bestiaryList').dataset.stale) renderBestiary(); }, 0);
  });
  renderBestiary();
}
