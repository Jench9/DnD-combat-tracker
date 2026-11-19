// Editor: the character's familiar (Find Familiar, 2024 rules; Pact of the
// Chain forms too). Choosing a form goes through POST /api/familiars (the
// server copies the stat block); name, creature type and HP are plain sheet
// edits; "Add to combat" sends addFamiliarToCombat.
import { $ } from '../../core/dom.js';
import { cur, patchChar, touch, store } from '../store.js';
import { identityHeaders, ownsCharacter } from '../../core/identity.js';
import { creatureIcon } from '../../core/creatureIcons.js';
import { renderMonsterActions } from '../../core/monsterActions.js';
import { el, section, cards, details, makeDialog, button } from '../builder/common.js';

const TYPES = [['celestial', 'Celestial'], ['fey', 'Fey'], ['fiend', 'Fiend']];
const KINDS = [
  ['spell', 'Find Familiar', 'The forms the spell names.'],
  ['beast', 'Another CR 0 Beast', 'Find Familiar also allows any Beast of Challenge Rating 0.'],
  ['pact', 'Pact of the Chain', 'Warlocks with the Pact of the Chain invocation can also choose these.'],
];
const RULES_2024 = 'Acts on its own turn with its own Initiative and obeys your commands. It can\'t attack, but it can take other actions. '
  + 'Telepathy within 100 ft; as a Bonus Action you can see and hear through it until the start of your next turn. '
  + 'It can deliver your touch spells with its Reaction (within 100 ft). At 0 HP it disappears until you cast Find Familiar again; '
  + 'a Magic action dismisses it to a pocket dimension or brings it back within 30 ft. Casting the spell again changes its form.';
const PACT_RULE = 'Pact of the Chain: when you take the Attack action, you can give up one of your attacks to let the familiar make one attack of its own with its Reaction.';

let forms = null;
async function loadForms() {
  if (!forms) {
    const r = await fetch('/api/familiars');
    if (!r.ok) throw new Error('Could not load the familiar forms.');
    forms = (await r.json()).forms;
  }
  return forms;
}

const iconOf = (f) => creatureIcon({ name: f.form || f.name, creatureType: f.creatureType });
const inCombat = (ch) => ((store.combat && store.combat.combatants) || []).some((c) => c.type === 'familiar' && c.ownerId === ch.id);

function setFamiliar(fields) {
  const c = cur();
  if (!c || !c.familiar) return;
  c.familiar = { ...c.familiar, ...fields };
  touch('f:familiar');
  patchChar({ familiar: fields });
}

export function refreshFamiliarUi(ch) {
  const body = $('familiarBody');
  if (body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // typing a name
  body.innerHTML = '';
  const editable = ownsCharacter(ch.id);
  const fam = ch.familiar;
  if (!fam) {
    body.appendChild(el('div', 'inv-hint', 'No familiar. The Find Familiar spell (and the Warlock\'s Pact of the Chain) gives one: a spirit in the form of a small creature.'));
    if (editable) body.appendChild(button('🐾 Find a familiar…', '', () => openFamiliarChooser(ch)));
    return;
  }

  const head = el('div', 'fam-head');
  head.appendChild(el('span', 'fam-icon', iconOf(fam)));
  const who = el('div', 'fam-who');
  const name = el('input', 'fam-name');
  name.type = 'text';
  name.maxLength = 40;
  name.placeholder = `Name your ${fam.form.toLowerCase()}`;
  name.value = fam.name;
  name.disabled = !editable;
  name.addEventListener('change', () => setFamiliar({ name: name.value.trim() }));
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
  who.appendChild(name);
  const sub = el('div', 'fam-sub');
  const type = el('select', 'fam-type');
  type.setAttribute('aria-label', 'Creature type');
  TYPES.forEach(([v, l]) => { const o = el('option', '', l); o.value = v; type.appendChild(o); });
  type.value = fam.creatureType;
  type.disabled = !editable;
  type.addEventListener('change', () => setFamiliar({ creatureType: type.value }));
  sub.append(el('span', '', `${fam.form}${fam.pact ? ' (Pact of the Chain)' : ''} ·`), type);
  who.appendChild(sub);
  head.appendChild(who);
  body.appendChild(head);

  // AC, HP (−/+ and a number), speed.
  const stats = el('div', 'fam-stats');
  stats.appendChild(el('span', 'fam-stat', `AC ${fam.ac}`));
  const hp = el('span', 'fam-stat fam-hp');
  const minus = button('−', 'secondary', () => setFamiliar({ hp: Math.max(0, fam.hp - 1) }));
  const plus = button('+', 'secondary', () => setFamiliar({ hp: Math.min(fam.hpMax, fam.hp + 1) }));
  const hpIn = el('input', 'fam-hp-input');
  hpIn.type = 'number';
  hpIn.min = '0';
  hpIn.max = String(fam.hpMax);
  hpIn.value = fam.hp;
  hpIn.setAttribute('aria-label', 'Familiar hit points');
  hpIn.addEventListener('change', () => setFamiliar({ hp: Math.max(0, Math.min(fam.hpMax, parseInt(hpIn.value, 10) || 0)) }));
  [minus, plus, hpIn].forEach((x) => { x.disabled = !editable; });
  hp.append('HP ', minus, hpIn, el('span', '', `/ ${fam.hpMax}`), plus);
  stats.appendChild(hp);
  const speed = (/Speed ([^\n]*)/.exec(fam.notes) || [])[1];
  if (speed) stats.appendChild(el('span', 'fam-stat', `Speed ${speed}`));
  body.appendChild(stats);
  if (fam.hp <= 0) body.appendChild(el('div', 'fam-gone', 'At 0 HP the familiar disappears — cast Find Familiar again to bring it back (with full HP).'));

  if (editable) {
    const btns = el('div', 'action-btns');
    const there = inCombat(ch);
    const add = button(there ? 'In combat' : '⚔ Add to combat', '', () => store.send('addFamiliarToCombat', { characterId: ch.id }));
    add.disabled = there || fam.hp <= 0;
    add.title = there ? 'Already in the Combat Tracker' : 'Rolls its own initiative';
    btns.append(add,
      button(fam.hp <= 0 ? 'Cast again (full HP)' : 'Change form…', 'secondary', () => openFamiliarChooser(ch)),
      button('Release', 'secondary', () => {
        if (!confirm(`Release ${fam.name || 'the familiar'} for good?`)) return;
        const c = cur();
        if (c) c.familiar = null;
        touch('f:familiar');
        patchChar({ familiar: null });
        refreshFamiliarUi(cur());
      }));
    body.appendChild(btns);
  }

  // Its actions (roll buttons) and the full stat block.
  const acts = el('div', 'fam-actions');
  renderMonsterActions(acts, { combatant: { id: 'fam-' + ch.id, name: fam.name || fam.form }, monster: { name: fam.form, notes: fam.notes } });
  if (acts.childElementCount) body.appendChild(acts);
  body.appendChild(details('Stat block', fam.notes));
  body.appendChild(details('Familiar rules (2024)', RULES_2024 + (fam.pact ? '\n\n' + PACT_RULE : '')));
}

// Choose a form (new familiar, new form, or casting the spell again).
export async function openFamiliarChooser(ch) {
  let list;
  try {
    list = await loadForms();
  } catch (e) {
    alert(e.message);
    return;
  }
  const fam = ch.familiar;
  const st = { formKey: '', name: fam ? fam.name : '', creatureType: fam ? fam.creatureType : 'fey' };
  const current = fam && list.find((f) => f.name === fam.form);
  if (current) st.formKey = current.key;

  const d = makeDialog('familiarDlg', fam ? `${fam.name || 'Familiar'}: choose a form` : 'Find Familiar');
  d.dlg.classList.add('wide');

  function draw() {
    const top = d.body.scrollTop;
    d.body.innerHTML = '';
    const s = section('Name and type', 'A spirit in animal form: a Celestial, Fey or Fiend instead of a Beast.');
    const row = el('div', 'b-row');
    const name = el('input', 'b-text');
    name.placeholder = 'Name (optional)';
    name.maxLength = 40;
    name.value = st.name;
    name.addEventListener('input', () => { st.name = name.value; });
    row.appendChild(name);
    s.appendChild(row);
    s.appendChild(cards(TYPES.map(([v, l]) => ({ key: v, title: l })), st.creatureType, (k) => { st.creatureType = k; }, { name: 'fam-type' }));
    d.body.appendChild(s);

    KINDS.forEach(([kind, title, hint]) => {
      const group = list.filter((f) => f.kind === kind);
      if (!group.length) return;
      const g = section(title, hint);
      g.appendChild(cards(group.map((f) => ({
        key: f.key,
        title: `${creatureIcon({ name: f.name, creatureType: f.creatureType })} ${f.name}`,
        sub: `AC ${f.ac} · HP ${f.hpMax} · ${f.speed || '?'}${f.edition === '2014' ? ' · 2014 stat block' : ''}`,
      })), st.formKey, (k) => { st.formKey = k; draw(); }, { name: 'fam-form' }));
      d.body.appendChild(g);
    });
    const chosen = list.find((f) => f.key === st.formKey);
    if (chosen) {
      const p = section(`${chosen.name} — stat block`);
      p.appendChild(el('div', 'b-desc', chosen.notes));
      d.body.appendChild(p);
    }
    d.body.scrollTop = top;
  }

  d.btns.append(button('Cancel', 'secondary', () => d.dlg.close()), el('span', 'b-spacer'));
  const ok = button(fam ? '🐾 Cast Find Familiar' : '🐾 Summon familiar', '', async () => {
    if (!st.formKey) { d.msg.textContent = 'Choose a form.'; return; }
    ok.disabled = true;
    try {
      const r = await fetch('/api/familiars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...identityHeaders() },
        body: JSON.stringify({ characterId: ch.id, formKey: st.formKey, name: st.name.trim(), creatureType: st.creatureType }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Could not summon the familiar.');
      const c = store.characters.find((x) => x.id === ch.id);
      if (c) c.familiar = data.character.familiar;
      d.dlg.close();
      if (cur() && cur().id === ch.id) refreshFamiliarUi(cur());
    } catch (e) {
      d.msg.textContent = e.message === 'Failed to fetch' ? 'Could not reach the server.' : e.message;
      ok.disabled = false;
    }
  });
  d.btns.appendChild(ok);
  draw();
  d.dlg.showModal();
}
