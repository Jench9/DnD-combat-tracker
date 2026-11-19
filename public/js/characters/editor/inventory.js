// Editor: inventory (items from the item library), Auto AC toggle,
// weapon proficiencies and the Actions tab built from equipped items.
import { $ } from '../../core/dom.js';
import { store, cur, patchChar, touch } from '../store.js';
import { itemSummary } from '../../items/format.js';
import { renderActions } from '../../core/attacks.js';
import { refreshRestUi } from './rest.js';
import { ownsCharacter } from '../../core/identity.js';
import { refreshSpellbookUi } from './spellbook.js';

const entryId = () => Math.random().toString(36).slice(2, 10);
const itemById = (id) => store.items.find((it) => it.id === id);

// Change the open character locally (so the screen updates at once) and
// send the change; the pending-edit tracking keeps it until the echo.
function change(prop, value) {
  const c = cur();
  if (!c) return;
  c[prop] = value;
  touch('f:' + prop);
  patchChar({ [prop]: value });
  refreshInventoryUi(c);
  if (prop === 'spellSlots') refreshSpellbookUi(c); // a cast spent a slot
}

function setInventory(fn) {
  const c = cur();
  if (c) change('inventory', fn((c.inventory || []).map((e) => ({ ...e }))));
}

// Wearing new body armor takes off the old one; same for shields.
function toggleEquip(entry) {
  const it = itemById(entry.itemId);
  setInventory((inv) => inv.map((e) => {
    if (e.id === entry.id) return { ...e, equipped: !e.equipped };
    const other = itemById(e.itemId);
    const sameSlot = it && it.type === 'armor' && other && other.type === 'armor'
      && (it.armorType === 'shield') === (other.armorType === 'shield');
    return !entry.equipped && sameSlot ? { ...e, equipped: false } : e;
  }));
}

function renderInventory(ch) {
  const list = $('invList');
  list.innerHTML = '';
  const inv = ch.inventory || [];
  if (inv.length === 0) {
    list.innerHTML = '<div class="empty-mini">Nothing carried yet — add items from the library below.</div>';
  }
  inv.forEach((entry) => {
    const it = itemById(entry.itemId);
    const row = document.createElement('div');
    row.className = 'inv-row' + (entry.equipped ? ' equipped' : '');

    const main = document.createElement('div');
    main.className = 'inv-main';
    const name = document.createElement('div');
    name.className = 'inv-name';
    name.textContent = it ? it.name : (entry.name || 'Unknown item') + ' (removed from the library)';
    const sum = document.createElement('div');
    sum.className = 'inv-sum';
    sum.textContent = it ? itemSummary(it) : '';
    main.append(name, sum);
    row.appendChild(main);

    const qty = document.createElement('input');
    qty.type = 'number';
    qty.min = '0';
    qty.className = 'inv-qty';
    qty.value = entry.qty;
    qty.setAttribute('aria-label', 'Quantity');
    qty.addEventListener('change', () => {
      const n = Math.max(0, parseInt(qty.value, 10) || 0);
      setInventory((list2) => list2.map((e) => (e.id === entry.id ? { ...e, qty: n } : e)));
    });
    row.appendChild(qty);

    if (it && (it.type === 'weapon' || it.type === 'armor')) {
      const eq = document.createElement('button');
      eq.type = 'button';
      eq.className = 'btn small ' + (entry.equipped ? '' : 'secondary');
      eq.textContent = entry.equipped ? 'Equipped' : 'Equip';
      eq.addEventListener('click', () => toggleEquip(entry));
      row.appendChild(eq);
    } else {
      row.appendChild(document.createElement('span'));
    }

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'inv-rm';
    rm.textContent = '×';
    rm.title = 'Remove from inventory';
    rm.addEventListener('click', () => setInventory((l) => l.filter((e) => e.id !== entry.id)));
    row.appendChild(rm);
    list.appendChild(row);
  });

  const weight = inv.reduce((sum, e) => sum + ((itemById(e.itemId)?.weight || 0) * e.qty), 0);
  $('invHint').textContent = inv.length ? `Total weight: ${Math.round(weight * 100) / 100} lb` : '';
}

function renderActionsTab(ch) {
  $('profSimple').checked = !!ch.weaponProf?.simple;
  $('profMartial').checked = !!ch.weaponProf?.martial;
  renderActions($('actionList'), {
    character: ch,
    items: store.items,
    spells: store.spells,
    canUse: ownsCharacter(ch.id),
    onUse: (id) => setInventory((inv) => inv.map((e) => (e.id === id ? { ...e, qty: Math.max(0, e.qty - 1) } : e))),
    onSpendSlot: (level) => {
      const c = cur();
      if (!c) return;
      const slots = (c.spellSlots || []).map((s, i) => (i === level - 1 ? { ...s, used: Math.min(s.max, s.used + 1) } : { ...s }));
      change('spellSlots', slots);
    },
    // Use on a class feature (Second Wind, Rage…): spend its resource.
    onSpendResource: (resId, n) => {
      const c = cur();
      if (!c) return;
      const resources = (c.resources || []).map((r) => (r.id === resId ? { ...r, used: Math.min(r.max, (r.used || 0) + n) } : { ...r }));
      change('resources', resources);
      refreshRestUi(c);
    },
  });
}

function renderAc(ch) {
  $('csAcAuto').checked = !!ch.acAuto;
  $('csAC').readOnly = !!ch.acAuto;
  // Auto: show how it's made up (armor, DEX, shield, Defense, Shield spell…).
  $('csAC').title = ch.acAuto
    ? `AC ${ch.ac} = ${ch.acBreakdown || 'armor, shield and DEX'}`
    : 'Manual AC — tick "auto" to calculate it from armor, shield, DEX and AC modifiers';
  if (ch.acAuto) $('csAC').value = ch.ac;
}

// Everything in this module, from the open character.
export function refreshInventoryUi(ch) {
  renderInventory(ch);
  renderActionsTab(ch);
  renderAc(ch);
}

export function refreshItemOptions() {
  const dl = $('invOptions');
  dl.innerHTML = '';
  [...store.items].sort((a, b) => a.name.localeCompare(b.name)).forEach((it) => {
    const o = document.createElement('option');
    o.value = it.name;
    dl.appendChild(o);
  });
}

export function initInventory() {
  const add = () => {
    const q = $('invAdd').value.trim().toLowerCase();
    const it = store.items.find((x) => x.name.toLowerCase() === q)
      || store.items.find((x) => x.name.toLowerCase().includes(q));
    if (!q || !it) { $('invHint').textContent = q ? 'No item called "' + $('invAdd').value + '" — create it on the Items page.' : ''; return; }
    setInventory((inv) => {
      const same = inv.find((e) => e.itemId === it.id && it.type === 'gear');
      if (same) return inv.map((e) => (e === same ? { ...e, qty: e.qty + 1 } : e)); // stack gear
      return [...inv, { id: entryId(), itemId: it.id, name: it.name, qty: 1, equipped: false }];
    });
    $('invAdd').value = '';
  };
  $('invAddBtn').addEventListener('click', add);
  $('invAdd').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  // Turning Auto off keeps the AC currently shown as the manual value.
  $('csAcAuto').addEventListener('change', (e) => {
    const c = cur();
    if (!c) return;
    if (!e.target.checked) { c.ac = parseInt($('csAC').value, 10) || c.ac; touch('f:ac'); patchChar({ ac: c.ac }); }
    change('acAuto', e.target.checked);
  });
  const prof = () => change('weaponProf', { simple: $('profSimple').checked, martial: $('profMartial').checked });
  $('profSimple').addEventListener('change', prof);
  $('profMartial').addEventListener('change', prof);
}
