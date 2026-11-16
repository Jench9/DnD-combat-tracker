// Editor: the Modifiers section of the Actions tab — catalog presets and
// custom modifiers that change attacks (see core/modifiers.js).
import { $ } from '../../core/dom.js';
import { cur, patchChar, touch } from '../store.js';
import { PRESETS, presetByKey } from '../../core/modifiers.js';

const DAMAGE_TYPES = ['', 'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const entryId = () => Math.random().toString(36).slice(2, 10);

let onChanged = () => {};

function change(list) {
  const c = cur();
  if (!c) return;
  c.modifiers = list;
  touch('f:modifiers');
  patchChar({ modifiers: list });
  refreshModifierUi(c);
  onChanged(c);
}
const update = (id, patch) => change((cur().modifiers || []).map((m) => (m.id === id ? { ...m, ...patch } : m)));

export function refreshModifierUi(c) {
  const list = $('modList');
  list.innerHTML = '';
  const mods = c.modifiers || [];
  if (!mods.length) {
    list.innerHTML = '<div class="empty-mini">None yet — add the feats and features that affect this character\'s attacks.</div>';
  }
  mods.forEach((m) => {
    const def = m.preset ? presetByKey(m.preset) : m.custom;
    const row = document.createElement('div');
    row.className = 'mod-row' + (def && def.toggle && !m.active ? ' off' : '');
    const name = document.createElement('div');
    name.className = 'mod-name';
    name.textContent = def ? def.name : `Unknown modifier (${m.preset})`;
    const cat = document.createElement('span');
    cat.className = 'mod-cat';
    cat.textContent = m.preset ? (def ? def.category : '') : 'Custom';
    name.appendChild(cat);
    row.appendChild(name);

    if (def && def.toggle) {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'btn small ' + (m.active ? '' : 'secondary');
      t.textContent = m.active ? 'On' : 'Off';
      t.title = 'Situational: switch on when it applies (e.g. while raging)';
      t.addEventListener('click', () => update(m.id, { active: !m.active }));
      row.appendChild(t);
    } else {
      row.appendChild(document.createElement('span'));
    }

    const only = document.createElement('input');
    only.type = 'text';
    only.className = 'mod-only';
    only.maxLength = 100;
    only.value = m.only || '';
    only.placeholder = (def && def.defaultOnly) ? `only for: ${def.defaultOnly}` : 'only for… (optional)';
    only.title = 'Limit it to weapons/spells with these names, or to these damage types (comma-separated)';
    only.addEventListener('change', () => update(m.id, { only: only.value.trim() }));
    row.appendChild(only);

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'inv-rm';
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.addEventListener('click', () => change((cur().modifiers || []).filter((x) => x.id !== m.id)));
    row.appendChild(rm);
    list.appendChild(row);
  });
}

export function initModifierList(changed) {
  onChanged = changed;
  // Catalog picker, grouped by category.
  const sel = $('modPreset');
  sel.innerHTML = '<option value="">Add a modifier…</option>';
  [...new Set(PRESETS.map((p) => p.category))].forEach((cat) => {
    const g = document.createElement('optgroup');
    g.label = cat;
    PRESETS.filter((p) => p.category === cat).forEach((p) => {
      const o = document.createElement('option');
      o.value = p.key;
      o.textContent = p.name;
      g.appendChild(o);
    });
    sel.appendChild(g);
  });
  $('modAddBtn').addEventListener('click', () => {
    const key = sel.value;
    const c = cur();
    if (!key || !c) return;
    const p = presetByKey(key);
    change([...(c.modifiers || []), { id: entryId(), preset: key, active: !p.toggle || key === 'sneak-attack', only: '' }]);
    sel.value = '';
  });

  // Custom modifiers.
  DAMAGE_TYPES.forEach((t) => {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t || 'same as the attack';
    $('mcDiceType').appendChild(o);
  });
  $('modCustomBtn').addEventListener('click', () => { $('modCustomForm').hidden = false; $('mcName').focus(); });
  $('mcCancel').addEventListener('click', () => { $('modCustomForm').hidden = true; });
  $('mcSave').addEventListener('click', () => {
    const c = cur();
    if (!c) return;
    const custom = {
      name: $('mcName').value.trim() || 'Custom modifier',
      appliesTo: $('mcApplies').value,
      range: $('mcRange').value,
      toHit: parseInt($('mcToHit').value, 10) || 0,
      damage: $('mcDamage').value.trim() || '0',
      dice: $('mcDice').value.trim().toLowerCase(),
      diceType: $('mcDiceType').value,
      ac: parseInt($('mcAc').value, 10) || 0,
      toggle: $('mcToggle').checked,
      note: $('mcNote').value.trim(),
    };
    change([...(c.modifiers || []), { id: entryId(), preset: '', active: true, only: '', custom }]);
    $('modCustomForm').hidden = true;
    ['mcName', 'mcDice', 'mcNote'].forEach((id) => { $(id).value = ''; });
    $('mcToHit').value = '0';
    $('mcDamage').value = '0';
    $('mcAc').value = '0';
    $('mcToggle').checked = false;
  });
}
