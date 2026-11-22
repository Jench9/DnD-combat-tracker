// Spells page: browse the spell library; create and edit custom spells.
// Same rules as items: players edit only spells they created, the DM all.
import { $, uid, debounce } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { createCappedGroups } from '../core/cappedGroup.js';
import { connectSocket } from '../core/socket.js';
import { isDm, myCharacterId } from '../core/identity.js';
import { levelLabel, spellSummary, spellHeader } from './format.js';

renderNav();

const SCHOOLS = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation'];
const CLASSES = ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'];
const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

let spells = [];
let characters = [];
let openId = null;

const canCreate = () => isDm() || !!myCharacterId();
const canEdit = (sp) => isDm() || (!!myCharacterId() && sp.createdBy === myCharacterId());
const current = () => spells.find((sp) => sp.id === openId);

const socket = connectSocket({
  onStatus: (live) => {
    $('connDot').classList.toggle('live', live);
    $('connLabel').textContent = live ? 'Live' : 'Connecting…';
  },
  handlers: {
    spellState: (msg) => {
      spells = msg.spells;
      if (openId && !current()) closeEditor();
      renderList();
      refreshEditor();
    },
    charState: (msg) => { characters = msg.characters; renderList(); },
  },
});

function option(sel, value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  sel.appendChild(o);
}
for (let l = 0; l <= 9; l++) { option($('levelFilter'), l, l === 0 ? 'Cantrips' : levelLabel(l)); option($('sLevel'), l, l === 0 ? 'Cantrip' : levelLabel(l)); }
CLASSES.forEach((c) => option($('classFilter'), c, c[0].toUpperCase() + c.slice(1)));
SCHOOLS.forEach((s) => option($('sSchool'), s, s));
option($('sDamageType'), '', '—');
option($('sExtraType'), '', '—');
DAMAGE_TYPES.forEach((d) => { option($('sDamageType'), d, d); option($('sExtraType'), d, d); });
CLASSES.forEach((c) => {
  const l = document.createElement('label');
  l.className = 'check';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.value = c;
  l.append(cb, ' ' + c);
  $('sClasses').appendChild(l);
});

// ---- list
function creatorLabel(sp) {
  if (sp.source === 'srd') return '';
  if (sp.createdBy === 'dm') return 'custom · by the DM';
  const ch = characters.find((c) => c.id === sp.createdBy);
  return 'custom · by ' + ((ch && ch.name) || 'a player');
}

function renderRow(sp) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'item-row' + (sp.id === openId ? ' open' : '') + (sp.source === 'custom' ? ' custom' : '');
  row.addEventListener('click', () => (canEdit(sp) ? openEditor(sp.id) : toggleDetails(row, sp)));
  const top = document.createElement('div');
  top.className = 'item-top';
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = sp.name || 'Unnamed spell';
  const meta = document.createElement('span');
  meta.className = 'item-meta';
  meta.textContent = [sp.edition, sp.classes.join(', ')].filter(Boolean).join(' · ');
  top.append(name, meta);
  const head = document.createElement('div');
  head.className = 'item-sum';
  head.textContent = spellHeader(sp);
  const sum = document.createElement('div');
  sum.className = 'item-sum strong';
  sum.textContent = spellSummary(sp);
  row.append(top, head);
  if (sum.textContent) row.appendChild(sum);
  const who = creatorLabel(sp);
  if (who) {
    const tag = document.createElement('div');
    tag.className = 'item-tag';
    tag.textContent = who;
    row.appendChild(tag);
  }
  return row;
}

function toggleDetails(row, sp) {
  const open = row.querySelector('.item-notes');
  if (open) { open.remove(); return; }
  const n = document.createElement('div');
  n.className = 'item-notes';
  n.textContent = `${sp.components} · ${sp.duration}\n${sp.description || ''}`.trim();
  row.appendChild(n);
}

// Long groups show their first 30 rows; an expanded group stays open until
// a filter changes (server echoes redraw the list too).
const capped = createCappedGroups({ cap: 30 });
const refilter = () => { capped.reset(); renderList(); };

function renderList() {
  const list = $('spellList');
  list.innerHTML = '';
  const q = $('search').value.trim().toLowerCase();
  const lvl = $('levelFilter').value;
  const cls = $('classFilter').value;
  const ed = $('editionFilter').value;
  const shown = spells.filter((sp) => (lvl === '' || sp.level === Number(lvl)) && (!cls || sp.classes.includes(cls))
    && (!ed || (ed === 'custom' ? sp.source === 'custom' : sp.edition === ed))
    && (!q || sp.name.toLowerCase().includes(q) || sp.description.toLowerCase().includes(q)));
  if (!shown.length) { list.innerHTML = '<div class="empty-lg">No spells match.</div>'; return; }
  for (let l = 0; l <= 9; l++) {
    const group = shown.filter((sp) => sp.level === l).sort((a, b) => a.name.localeCompare(b.name));
    if (!group.length) continue;
    const head = document.createElement('div');
    head.className = 'item-group-head';
    head.textContent = l === 0 ? 'Cantrips' : levelLabel(l);
    const count = document.createElement('span');
    count.className = 'item-group-count';
    count.textContent = group.length;
    head.appendChild(count);
    list.appendChild(head);
    const box = document.createElement('div');
    box.className = 'item-group';
    capped.fill(box, String(l), group, renderRow, 'spells'); // first 30 + "Show all" (phones)
    list.appendChild(box);
  }
}
['search', 'levelFilter', 'classFilter', 'editionFilter'].forEach((id) => $(id).addEventListener('input', refilter));

// ---- editor
// input id -> [spell prop, kind]  (kind: text | dice | select | number | check)
const FIELDS = {
  sName: ['name', 'text'], sLevel: ['level', 'number'], sSchool: ['school', 'select'], sTime: ['castingTime', 'text'],
  sRange: ['range', 'text'], sComponents: ['components', 'text'], sDuration: ['duration', 'text'],
  sConc: ['concentration', 'check'], sRitual: ['ritual', 'check'], sMechanic: ['mechanic', 'select'],
  sSave: ['saveAbility', 'select'], sSaveSuccess: ['saveSuccess', 'select'], sDice: ['dice', 'dice'],
  sDamageType: ['damageType', 'select'], sHigher: ['higherLevelDice', 'dice'], sExtra: ['extraDice', 'dice'],
  sExtraType: ['extraDamageType', 'select'], sAddMod: ['addMod', 'check'], sScaling: ['cantripScaling', 'check'],
  sDesc: ['description', 'text'],
};

// Show only the fields that matter for how the spell resolves.
function showFields(sp) {
  const m = sp.mechanic;
  const vis = { save: m === 'save', dice: m !== 'none', damage: m !== 'none' && m !== 'heal' };
  document.querySelectorAll('#editor [data-show]').forEach((el) => { el.hidden = !vis[el.dataset.show]; });
  $('sDiceLabel').textContent = m === 'heal' ? 'Healing dice' : 'Damage dice';
}

function refreshEditor() {
  const sp = current();
  if (!sp) return;
  Object.entries(FIELDS).forEach(([id, [prop, kind]]) => {
    const el = $(id);
    if (document.activeElement === el) return;
    if (kind === 'check') el.checked = !!sp[prop];
    else el.value = sp[prop] ?? '';
  });
  $('sClasses').querySelectorAll('input').forEach((cb) => { cb.checked = sp.classes.includes(cb.value); });
  showFields(sp);
}

const patch = (p) => { if (current()) socket.send('updateSpell', { id: openId, patch: p }); };

Object.entries(FIELDS).forEach(([id, [prop, kind]]) => {
  const el = $(id);
  const value = () => (kind === 'check' ? el.checked : kind === 'number' ? Number(el.value) : el.value);
  if (kind === 'select' || kind === 'check' || kind === 'number') {
    el.addEventListener('change', () => {
      const sp = current();
      if (sp) { sp[prop] = value(); showFields(sp); }
      patch({ [prop]: value() });
    });
  } else {
    el.addEventListener('input', debounce(() => patch({ [prop]: value() }), 400));
    el.addEventListener('blur', () => setTimeout(refreshEditor, 450)); // show what the server kept
  }
});
$('sClasses').addEventListener('change', () => {
  patch({ classes: [...$('sClasses').querySelectorAll('input:checked')].map((c) => c.value) });
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

$('newSpellBtn').hidden = !canCreate();
$('newSpellBtn').addEventListener('click', () => {
  const id = uid();
  socket.send('addSpell', { id, patch: { name: 'New spell', level: Number($('levelFilter').value || 1) } });
  const wait = setInterval(() => {
    if (spells.some((sp) => sp.id === id)) { clearInterval(wait); openEditor(id); $('sName').select(); }
  }, 50);
  setTimeout(() => clearInterval(wait), 3000);
});
$('doneBtn').addEventListener('click', closeEditor);
$('deleteSpellBtn').addEventListener('click', () => {
  const sp = current();
  if (!sp || !confirm('Delete "' + (sp.name || 'this spell') + '"? Characters who know it keep it listed as removed.')) return;
  socket.send('deleteSpell', { id: sp.id });
  closeEditor();
});

renderList();
