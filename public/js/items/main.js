// Items page: browse the item library; create and edit custom items.
// Everyone sees every item. Players edit only items they created; the DM
// can edit anything (the server enforces the same rules).
import { $, uid, debounce } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { isDm, myCharacterId } from '../core/identity.js';
import { itemSummary } from './format.js';

renderNav();

const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const PROPERTIES = ['ammunition', 'finesse', 'heavy', 'light', 'loading', 'reach', 'special', 'thrown', 'two-handed'];

let items = [];
let characters = [];
let openId = null;
let typeFilter = '';

const canCreate = () => isDm() || !!myCharacterId();
const canEdit = (it) => isDm() || (!!myCharacterId() && it.createdBy === myCharacterId());
const current = () => items.find((it) => it.id === openId);

function setConn(live) {
  $('connDot').classList.toggle('live', live);
  $('connLabel').textContent = live ? 'Live' : 'Connecting…';
}

const socket = connectSocket({
  onStatus: setConn,
  handlers: {
    itemState: (msg) => {
      items = msg.items;
      if (openId && !current()) closeEditor();
      renderList();
      refreshEditor();
    },
    charState: (msg) => { characters = msg.characters; renderList(); },
  },
});

// ---- list
const GROUPS = [
  ['Simple weapons', (it) => it.type === 'weapon' && it.weaponCategory === 'simple'],
  ['Martial weapons', (it) => it.type === 'weapon' && it.weaponCategory === 'martial'],
  ['Armor', (it) => it.type === 'armor' && it.armorType !== 'shield'],
  ['Shields', (it) => it.type === 'armor' && it.armorType === 'shield'],
  ['Gear', (it) => it.type === 'gear'],
];

function creatorLabel(it) {
  if (it.source === 'srd') return '';
  if (it.createdBy === 'dm') return 'custom · by the DM';
  const ch = characters.find((c) => c.id === it.createdBy);
  return 'custom · by ' + ((ch && ch.name) || 'a player');
}

function renderRow(it) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'item-row' + (it.id === openId ? ' open' : '') + (it.source === 'custom' ? ' custom' : '');
  row.addEventListener('click', () => (canEdit(it) ? openEditor(it.id) : toggleDetails(row, it)));

  const top = document.createElement('div');
  top.className = 'item-top';
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = it.name || 'Unnamed item';
  const meta = document.createElement('span');
  meta.className = 'item-meta';
  meta.textContent = [it.cost, it.weight ? it.weight + ' lb' : ''].filter(Boolean).join(' · ');
  top.append(name, meta);

  const sum = document.createElement('div');
  sum.className = 'item-sum';
  sum.textContent = itemSummary(it);
  row.append(top, sum);

  const who = creatorLabel(it);
  if (who) {
    const tag = document.createElement('div');
    tag.className = 'item-tag';
    tag.textContent = who;
    row.appendChild(tag);
  }
  return row;
}

// Read-only items expand to show their notes.
function toggleDetails(row, it) {
  const open = row.querySelector('.item-notes');
  if (open) { open.remove(); return; }
  const n = document.createElement('div');
  n.className = 'item-notes';
  n.textContent = it.notes || 'No notes.';
  row.appendChild(n);
}

function renderList() {
  const list = $('itemList');
  list.innerHTML = '';
  const q = $('search').value.trim().toLowerCase();
  const shown = items.filter((it) => (!typeFilter || it.type === typeFilter)
    && (!q || it.name.toLowerCase().includes(q) || itemSummary(it).toLowerCase().includes(q)));
  if (shown.length === 0) {
    list.innerHTML = '<div class="empty-lg">No items match.</div>';
    return;
  }
  GROUPS.forEach(([title, match]) => {
    const group = shown.filter(match).sort((a, b) => a.name.localeCompare(b.name));
    if (!group.length) return;
    const head = document.createElement('div');
    head.className = 'item-group-head';
    head.textContent = title;
    const count = document.createElement('span');
    count.className = 'item-group-count';
    count.textContent = group.length;
    head.appendChild(count);
    list.appendChild(head);
    const box = document.createElement('div');
    box.className = 'item-group';
    group.forEach((it) => box.appendChild(renderRow(it)));
    list.appendChild(box);
  });
}

$('search').addEventListener('input', renderList);
$('typeTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-type]');
  if (!b) return;
  typeFilter = b.dataset.type;
  document.querySelectorAll('#typeTabs button').forEach((x) => x.classList.toggle('active', x === b));
  renderList();
});

// ---- editor
function fillSelect(id, values, withNone) {
  const sel = $(id);
  (withNone ? [''] : []).concat(values).forEach((v) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v || '—';
    sel.appendChild(o);
  });
}
fillSelect('iDamageType', DAMAGE_TYPES);
fillSelect('iExtraType', DAMAGE_TYPES, true);
PROPERTIES.forEach((p) => {
  const l = document.createElement('label');
  l.className = 'check';
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.value = p;
  l.append(c, ' ' + p);
  $('iProps').appendChild(l);
});

// input id -> [item prop, kind]  (kind: text | number | dice | select | check)
const FIELDS = {
  iName: ['name', 'text'], iType: ['type', 'select'], iCost: ['cost', 'text'], iWeight: ['weight', 'number'],
  iCategory: ['weaponCategory', 'select'], iAttackType: ['attackType', 'select'], iDamage: ['damage', 'dice'],
  iDamageType: ['damageType', 'select'], iVersatile: ['versatileDamage', 'dice'], iRange: ['range', 'text'],
  iMagic: ['magicBonus', 'number'], iExtra: ['extraDamage', 'dice'], iExtraType: ['extraDamageType', 'select'],
  iArmorType: ['armorType', 'select'], iBaseAc: ['baseAc', 'number'], iMaxDex: ['maxDex', 'maxdex'],
  iStr: ['strengthReq', 'number'], iStealth: ['stealthDisadvantage', 'check'],
  iEffectDice: ['effectDice', 'dice'], iEffect: ['effect', 'text'], iNotes: ['notes', 'text'],
};

function showSections(it) {
  document.querySelectorAll('.ed-section').forEach((s) => { s.hidden = s.dataset.for !== it.type; });
  $('iBaseAcLabel').textContent = it.armorType === 'shield' ? 'AC bonus' : 'Base AC';
}

function refreshEditor() {
  const it = current();
  if (!it) return;
  Object.entries(FIELDS).forEach(([id, [prop, kind]]) => {
    const el = $(id);
    if (document.activeElement === el) return;
    if (kind === 'check') el.checked = !!it[prop];
    else if (kind === 'maxdex') el.value = it[prop] === null ? '' : it[prop];
    else el.value = it[prop] ?? '';
  });
  $('iProps').querySelectorAll('input').forEach((c) => { c.checked = it.properties.includes(c.value); });
  showSections(it);
}

function patch(p) {
  const it = current();
  if (!it) return;
  socket.send('updateItem', { id: it.id, patch: p });
}

Object.entries(FIELDS).forEach(([id, [prop, kind]]) => {
  const el = $(id);
  const value = () => {
    if (kind === 'check') return el.checked;
    if (kind === 'number') return el.value === '' ? 0 : Number(el.value);
    if (kind === 'maxdex') return el.value === '' ? null : Number(el.value);
    return el.value;
  };
  const send = () => patch({ [prop]: value() });
  if (kind === 'select' || kind === 'check') {
    el.addEventListener('change', () => {
      const it = current();
      if (it) { it[prop] = value(); showSections(it); }
      send();
    });
  } else {
    el.addEventListener('input', debounce(send, 400));
    // On leaving the field, show what the server kept (e.g. normalised or refused dice).
    el.addEventListener('blur', () => setTimeout(refreshEditor, 450));
  }
});
$('iProps').addEventListener('change', () => {
  patch({ properties: [...$('iProps').querySelectorAll('input:checked')].map((c) => c.value) });
});

function openEditor(id) {
  openId = id;
  $('editor').hidden = false;
  refreshEditor();
  renderList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeEditor() {
  openId = null;
  $('editor').hidden = true;
  renderList();
}

$('newItemBtn').hidden = !canCreate();
$('newItemBtn').addEventListener('click', () => {
  const id = uid();
  socket.send('addItem', { id, patch: { name: 'New item', type: typeFilter || 'weapon' } });
  // Open once the server confirms (it sets who created it).
  const wait = setInterval(() => {
    if (items.some((it) => it.id === id)) { clearInterval(wait); openEditor(id); $('iName').select(); }
  }, 50);
  setTimeout(() => clearInterval(wait), 3000);
});

$('doneBtn').addEventListener('click', closeEditor);
$('deleteItemBtn').addEventListener('click', () => {
  const it = current();
  if (!it || !confirm('Delete "' + (it.name || 'this item') + '"?')) return;
  socket.send('deleteItem', { id: it.id });
  closeEditor();
});

renderList();
