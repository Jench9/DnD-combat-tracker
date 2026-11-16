// Editor: the Spells tab — spellcasting ability, spell slots (a long rest,
// see rest.js, restores them) and the spells the character knows/prepares.
import { $ } from '../../core/dom.js';
import { store, cur, patchChar, touch } from '../store.js';
import { spellcasting } from '../../core/attacks.js';
import { fmtMod } from '../rules.js';
import { levelLabel, spellSummary, spellHeader } from '../../spells/format.js';
import { longRest } from './rest.js';

const entryId = () => Math.random().toString(36).slice(2, 10);
const spellById = (id) => store.spells.find((sp) => sp.id === id);
const blankSlots = () => Array.from({ length: 9 }, () => ({ max: 0, used: 0 }));

// Change locally (instant feedback) and send; the pending-edit tracking
// keeps the local value until the server echoes it.
function change(prop, value, redraw) {
  const c = cur();
  if (!c) return;
  c[prop] = value;
  touch('f:' + prop);
  patchChar({ [prop]: value });
  redraw(c);
}

function slotsOf(c) {
  return (c.spellSlots && c.spellSlots.length === 9 ? c.spellSlots : blankSlots()).map((s) => ({ ...s }));
}

function renderSlots(c) {
  const grid = $('slotGrid');
  grid.innerHTML = '';
  slotsOf(c).forEach((s, i) => {
    const cell = document.createElement('div');
    cell.className = 'slot' + (s.max ? '' : ' empty');
    const lbl = document.createElement('div');
    lbl.className = 'slot-level';
    lbl.textContent = levelLabel(i + 1).replace(' level', '');
    const max = document.createElement('input');
    max.type = 'number';
    max.min = '0';
    max.max = '9';
    max.value = s.max;
    max.setAttribute('aria-label', `${levelLabel(i + 1)} slots`);
    max.addEventListener('change', () => {
      const slots = slotsOf(cur());
      slots[i].max = Math.max(0, Math.min(9, parseInt(max.value, 10) || 0));
      slots[i].used = Math.min(slots[i].used, slots[i].max);
      change('spellSlots', slots, refreshSpellbookUi);
    });
    const pips = document.createElement('div');
    pips.className = 'pips';
    for (let p = 0; p < s.max; p++) {
      const pip = document.createElement('button');
      pip.type = 'button';
      pip.className = 'pip' + (p < s.used ? ' used' : '');
      pip.title = p < s.used ? 'Used — click to restore' : 'Available — click to mark used';
      pip.addEventListener('click', () => {
        const slots = slotsOf(cur());
        slots[i].used = p < slots[i].used ? p : p + 1;
        change('spellSlots', slots, refreshSpellbookUi);
      });
      pips.appendChild(pip);
    }
    cell.append(lbl, max, pips);
    grid.appendChild(cell);
  });
}

function renderBook(c) {
  const book = $('spellBook');
  book.innerHTML = '';
  const known = (c.spells || []).map((e) => ({ e, sp: spellById(e.spellId) }))
    .sort((a, b) => ((a.sp ? a.sp.level : 99) - (b.sp ? b.sp.level : 99)) || (a.e.name || '').localeCompare(b.e.name || ''));
  if (!known.length) book.innerHTML = '<div class="empty-mini">No spells yet — add them from the library below.</div>';
  let lastLevel = null;
  known.forEach(({ e, sp }) => {
    const level = sp ? sp.level : null;
    if (level !== lastLevel) {
      const h = document.createElement('div');
      h.className = 'book-level';
      h.textContent = level === null ? 'Removed from the library' : level === 0 ? 'Cantrips' : levelLabel(level);
      book.appendChild(h);
      lastLevel = level;
    }
    const row = document.createElement('div');
    row.className = 'inv-row spell-row';
    const main = document.createElement('div');
    main.className = 'inv-main';
    const name = document.createElement('div');
    name.className = 'inv-name';
    name.textContent = sp ? sp.name : (e.name || 'Unknown spell');
    const sum = document.createElement('div');
    sum.className = 'inv-sum';
    sum.textContent = sp ? [spellHeader(sp), spellSummary(sp)].filter(Boolean).join(' — ') : '';
    if (sp && sp.description) sum.title = sp.description;
    main.append(name, sum);
    row.appendChild(main);

    if (sp && sp.level > 0) {
      const prep = document.createElement('label');
      prep.className = 'prep';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!e.prepared;
      cb.addEventListener('change', () => change('spells', (cur().spells || []).map((x) => (x.id === e.id ? { ...x, prepared: cb.checked } : x)), refreshSpellbookUi));
      prep.append(cb, ' prepared');
      row.appendChild(prep);
    } else {
      row.appendChild(document.createElement('span'));
    }
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'inv-rm';
    rm.textContent = '×';
    rm.title = 'Remove spell';
    rm.addEventListener('click', () => change('spells', (cur().spells || []).filter((x) => x.id !== e.id), refreshSpellbookUi));
    row.appendChild(rm);
    book.appendChild(row);
  });
}

export function refreshSpellbookUi(c) {
  if (document.activeElement !== $('spellAbility')) $('spellAbility').value = c.spellAbility || '';
  const sc = spellcasting(c);
  $('spellNumbers').textContent = sc ? `Spell attack ${fmtMod(sc.attack)} · Save DC ${sc.dc}` : '';
  renderSlots(c);
  renderBook(c);
}

export function refreshSpellOptions() {
  const dl = $('spellOptions');
  dl.innerHTML = '';
  [...store.spells].sort((a, b) => a.name.localeCompare(b.name)).forEach((sp) => {
    const o = document.createElement('option');
    o.value = sp.name;
    o.label = levelLabel(sp.level);
    dl.appendChild(o);
  });
}

export function initSpellbook(onChanged) {
  const redraw = (c) => { refreshSpellbookUi(c); onChanged(c); };
  $('spellAbility').addEventListener('change', (e) => change('spellAbility', e.target.value, redraw));
  $('longRestBtn').addEventListener('click', longRest); // the full long rest (HP, Hit Dice, resources too)
  const add = () => {
    const q = $('spellAdd').value.trim().toLowerCase();
    const sp = store.spells.find((x) => x.name.toLowerCase() === q) || store.spells.find((x) => x.name.toLowerCase().includes(q));
    if (!q || !sp) { $('spellHint').textContent = q ? 'No spell called "' + $('spellAdd').value + '" — create it on the Spells page.' : ''; return; }
    const c = cur();
    if ((c.spells || []).some((x) => x.spellId === sp.id)) { $('spellAdd').value = ''; return; } // already known
    change('spells', [...(c.spells || []), { id: entryId(), spellId: sp.id, name: sp.name, prepared: true }], redraw);
    $('spellAdd').value = '';
  };
  $('spellAddBtn').addEventListener('click', add);
  $('spellAdd').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
}
