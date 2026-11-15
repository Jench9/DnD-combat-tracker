// Monsters page: the saved monster library (name, AC, HP, initiative
// bonus, icon, notes). Monsters are added to fights from the combat page.
import { $, uid, debounce } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { resizeToDataUrl } from '../core/image.js';

renderNav();

let monsters = [];
let openId = null;

// input id -> [monster prop, isNumber]
const FIELDS = {
  mName: ['name', false], mAC: ['ac', true], mHP: ['hpMax', true], mInit: ['initBonus', true], mNotes: ['notes', false],
};

const signed = (n) => (n >= 0 ? '+' : '') + n;
const current = () => monsters.find((m) => m.id === openId);

function setConn(live) {
  $('connDot').classList.toggle('live', live);
  $('connLabel').textContent = live ? 'Live' : 'Connecting…';
}

const socket = connectSocket({
  onStatus: setConn,
  handlers: {
    monsterState: (msg) => {
      monsters = msg.monsters;
      if (openId && !current()) closeEditor();
      renderGrid();
      refreshEditor();
    },
  },
});

function patch(p) {
  const m = current();
  if (!m) return;
  Object.assign(m, p); // optimistic; the server echo is authoritative
  socket.send('updateMonster', { id: m.id, patch: p });
  renderGrid();
}

// ---- grid
function iconNode(m, cls) {
  const d = document.createElement('div');
  d.className = 'mon-icon ' + cls;
  if (m.icon) {
    const img = document.createElement('img');
    img.src = m.icon;
    img.alt = '';
    d.appendChild(img);
  } else {
    d.textContent = ((m.name || '?').trim().charAt(0) || '?').toUpperCase();
  }
  return d;
}

function renderGrid() {
  const grid = $('monGrid');
  grid.innerHTML = '';
  if (monsters.length === 0) {
    grid.innerHTML = '<div class="empty-lg"><div class="big-icon">🐉</div>No monsters yet — create one with “+ New monster”.</div>';
    return;
  }
  monsters.forEach((m) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'mon-card' + (m.id === openId ? ' open' : '');
    card.addEventListener('click', () => openEditor(m.id));
    card.appendChild(iconNode(m, 'small'));
    const body = document.createElement('div');
    body.className = 'mon-card-body';
    const name = document.createElement('div');
    name.className = 'mon-card-name';
    name.textContent = m.name || 'Unnamed monster';
    const stats = document.createElement('div');
    stats.className = 'mon-card-stats';
    stats.innerHTML = `<span><b>${m.ac}</b> AC</span><span><b>${m.hpMax}</b> HP</span><span><b>${signed(m.initBonus)}</b> init</span>`;
    body.append(name, stats);
    card.appendChild(body);
    grid.appendChild(card);
  });
}

// ---- editor
function setIcon(src) {
  $('iconImg').hidden = !src;
  if (src) $('iconImg').src = src; else $('iconImg').removeAttribute('src');
  $('iconPh').hidden = !!src;
  $('iconRemove').hidden = !src;
}

// Fill the form from state, skipping the field being typed in.
function refreshEditor() {
  const m = current();
  if (!m) return;
  Object.entries(FIELDS).forEach(([id, [prop]]) => {
    if (document.activeElement !== $(id)) $(id).value = m[prop];
  });
  setIcon(m.icon);
}

function openEditor(id) {
  openId = id;
  $('editor').hidden = false;
  refreshEditor();
  renderGrid();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeEditor() {
  openId = null;
  $('editor').hidden = true;
  renderGrid();
}

Object.entries(FIELDS).forEach(([id, [prop, isNumber]]) => {
  const el = $(id);
  const commit = debounce(() => {
    if (isNumber && el.value === '') return; // wait for a number
    patch({ [prop]: isNumber ? parseInt(el.value, 10) : el.value });
  }, 300);
  el.addEventListener('input', commit);
  el.addEventListener('blur', () => setTimeout(refreshEditor, 350)); // show the clamped value
});

$('newMonsterBtn').addEventListener('click', () => {
  const id = uid();
  monsters.unshift({ id, name: '', ac: 12, hpMax: 10, initBonus: 0, icon: '', notes: '' }); // optimistic
  socket.send('addMonster', { id });
  openEditor(id);
  $('mName').focus();
});

$('doneBtn').addEventListener('click', closeEditor);

$('deleteMonsterBtn').addEventListener('click', () => {
  const m = current();
  if (!m || !confirm('Delete "' + (m.name || 'this monster') + '"? Monsters already in a fight stay there.')) return;
  socket.send('deleteMonster', { id: m.id });
  closeEditor();
});

$('iconBtn').addEventListener('click', () => $('iconInput').click());
$('iconInput').addEventListener('change', async () => {
  const file = $('iconInput').files[0];
  $('iconInput').value = '';
  if (!file) return;
  try {
    const dataUrl = await resizeToDataUrl(file, 256);
    setIcon(dataUrl);
    patch({ icon: dataUrl });
  } catch {
    alert('Could not read that image.');
  }
});
$('iconRemove').addEventListener('click', () => { setIcon(''); patch({ icon: '' }); });

renderGrid();
