// Shared pieces of the creation wizard and the level-up dialog: the rules
// data, REST calls, and small form widgets (skills, spells, feats, ability
// increases). The server validates everything again.
import { fillRich } from '../../core/richText.js';
import { identityHeaders } from '../../core/identity.js';
import { store } from '../store.js';

export const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
export const ABILITY_KEYS = Object.keys(ABILITY_NAMES);
export const MI_LISTS = [['cleric', 'Cleric'], ['druid', 'Druid'], ['wizard', 'Wizard']];

let rulesPromise = null;
export function loadRules() {
  if (!rulesPromise) {
    rulesPromise = fetch('/api/builder/rules').then((r) => {
      if (!r.ok) throw new Error('Could not load the rules.');
      return r.json();
    }).catch((e) => { rulesPromise = null; throw e; });
  }
  return rulesPromise;
}

export async function api(path, body) {
  const opts = body === undefined
    ? { headers: identityHeaders() }
    : { method: 'POST', headers: { 'Content-Type': 'application/json', ...identityHeaders() }, body: JSON.stringify(body) };
  let resp;
  try {
    resp = await fetch('/api/builder' + path, opts);
  } catch {
    throw new Error('Could not reach the server.');
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

// A collapsible rules text.
export function details(title, body, open = false) {
  const d = el('details', 'b-details');
  d.open = open;
  d.appendChild(el('summary', '', title));
  if (body) d.appendChild(fillRich(el('div', 'b-desc'), body)); // **bold**, lists, tables
  return d;
}

export function section(title, hint) {
  const s = el('section', 'b-section');
  if (title) s.appendChild(el('h4', 'b-h', title));
  if (hint) s.appendChild(el('div', 'b-hint', hint));
  return s;
}

// Checkboxes, at most `count` checked. onChange(selected[]).
export function checkList(options, selected, count, onChange, { disabled = () => '' } = {}) {
  const wrap = el('div', 'b-checks');
  const sel = new Set(selected);
  const counter = el('div', 'b-count');
  const update = () => {
    counter.textContent = `${sel.size} / ${count} chosen`;
    counter.classList.toggle('done', sel.size === count);
    wrap.querySelectorAll('input').forEach((cb) => {
      cb.disabled = !!cb.dataset.why || (!cb.checked && sel.size >= count);
    });
  };
  options.forEach((opt) => {
    const why = disabled(opt);
    const label = el('label', 'b-check' + (why ? ' off' : ''));
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = sel.has(opt);
    if (why) { cb.dataset.why = why; label.title = why; }
    cb.addEventListener('change', () => {
      if (cb.checked) sel.add(opt); else sel.delete(opt);
      update();
      onChange([...sel]);
    });
    label.append(cb, el('span', '', opt));
    wrap.appendChild(label);
  });
  const box = el('div');
  box.append(counter, wrap);
  update();
  return box;
}

// Radio cards: [{ key, title, sub, body }] → onPick(key).
// Where an option comes from: "SRD 5.2" or a DM's tag (custom content).
export const SRD = 'SRD 5.2';
// For drop-down labels: the source, unless it's the SRD.
export const withSource = (name, source) => (source && source !== SRD ? `${name} — ${source}` : name);

export function cards(options, current, onPick, { name = 'card' + Math.random().toString(36).slice(2) } = {}) {
  const grid = el('div', 'b-cards');
  options.forEach((o) => {
    const label = el('label', 'b-card' + (o.key === current ? ' on' : '') + (o.disabled ? ' off' : ''));
    const r = el('input');
    r.type = 'radio';
    r.name = name;
    r.value = o.key;
    r.checked = o.key === current;
    r.disabled = !!o.disabled;
    r.addEventListener('change', () => onPick(o.key));
    label.appendChild(r);
    label.appendChild(el('span', 'b-card-title', o.title));
    if (o.tag) label.appendChild(el('span', 'b-card-tag' + (o.tag === SRD ? ' srd' : ''), o.tag));
    if (o.sub) label.appendChild(el('span', 'b-card-sub', o.sub));
    if (o.disabled && typeof o.disabled === 'string') label.appendChild(el('span', 'b-card-why', o.disabled));
    grid.appendChild(label);
  });
  return grid;
}

export function select(options, value, onChange, { placeholder = 'Choose…' } = {}) {
  const s = el('select', 'b-select');
  const ph = el('option', '', placeholder);
  ph.value = '';
  s.appendChild(ph);
  options.forEach((o) => {
    const opt = el('option', '', o.label);
    opt.value = o.value;
    if (o.disabled) opt.disabled = true;
    s.appendChild(opt);
  });
  s.value = value || '';
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

// ---- spells

// Library spells for a class list: cantrips (level 0) or 1…maxLevel. 2024
// entries and the table's own spells (no edition / no class list).
export function spellsFor(listKey, { cantrip, maxLevel }) {
  return (store.spells || []).filter((s) => {
    if (s.edition && s.edition !== '2024') return false;
    const lvl = parseInt(s.level, 10) || 0;
    if (cantrip ? lvl !== 0 : lvl < 1 || lvl > maxLevel) return false;
    const classes = Array.isArray(s.classes) ? s.classes : [];
    return !classes.length || classes.includes(listKey);
  }).sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
}

// Searchable spell checklist. `taken` = spell ids already in the book (or
// chosen elsewhere in this dialog): shown, not selectable.
export function spellPicker({ title, listKey, cantrip, maxLevel, count, selected, taken = new Set(), onChange }) {
  const box = el('div', 'b-spells');
  const head = el('div', 'b-spells-head');
  head.appendChild(el('b', '', title));
  const counter = el('span', 'b-count');
  head.appendChild(counter);
  const search = el('input', 'b-search');
  search.type = 'search';
  search.placeholder = 'Search…';
  head.appendChild(search);
  box.appendChild(head);
  const list = el('div', 'b-spell-list');
  box.appendChild(list);
  const sel = new Set(selected);
  const all = spellsFor(listKey, { cantrip, maxLevel });
  if (!all.length) list.appendChild(el('div', 'b-hint', 'No spells for this list in the library.'));
  const update = () => {
    counter.textContent = `${sel.size} / ${count}`;
    counter.classList.toggle('done', sel.size === count);
    list.querySelectorAll('input').forEach((cb) => { cb.disabled = taken.has(cb.value) || (!cb.checked && sel.size >= count); });
  };
  all.forEach((s) => {
    const row = el('label', 'b-spell');
    row.dataset.name = s.name.toLowerCase();
    const cb = el('input');
    cb.type = 'checkbox';
    cb.value = s.id;
    cb.checked = sel.has(s.id);
    cb.addEventListener('change', () => {
      if (cb.checked) sel.add(s.id); else sel.delete(s.id);
      update();
      onChange([...sel]);
    });
    const meta = `${s.level ? 'Level ' + s.level : 'Cantrip'} · ${s.school || ''}${s.concentration ? ' · C' : ''}${s.ritual ? ' · R' : ''}`;
    row.append(cb, el('span', 'b-spell-name', s.name + (taken.has(s.id) ? ' (already known)' : '')), el('span', 'b-spell-meta', meta));
    row.title = (s.description || '').slice(0, 400);
    list.appendChild(row);
  });
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    list.querySelectorAll('.b-spell').forEach((r) => { r.hidden = !!q && !r.dataset.name.includes(q); });
  });
  update();
  return box;
}

// ---- ability increases

// { mode: '2' | '1-1' }: +2 to one or +1 to two (ASI), or +1 to one of
// `allowed` (feat). `abilities` = current scores (to respect the max).
export function increasePicker({ kind, allowed = ABILITY_KEYS, max = 20, abilities, value, onChange }) {
  const box = el('div', 'b-asi');
  const v = { ...(value || {}) };
  const opts = (exclude) => allowed.map((k) => ({ value: k, label: `${ABILITY_NAMES[k]} (${abilities[k]})`, disabled: k === exclude || abilities[k] >= max }));
  if (kind === 'asi') {
    let mode = Object.values(v).includes(2) ? '2' : Object.keys(v).length ? '1-1' : '2';
    const modeSel = select([{ value: '2', label: '+2 to one ability' }, { value: '1-1', label: '+1 to two abilities' }], mode, (m) => { mode = m || '2'; draw({}); });
    modeSel.querySelector('option[value=""]').remove();
    box.appendChild(modeSel);
    const slots = el('div', 'b-asi-slots');
    box.appendChild(slots);
    const draw = (cur) => {
      slots.innerHTML = '';
      const keys = Object.keys(cur);
      if (mode === '2') {
        const s = select(allowed.map((k) => ({ value: k, label: `${ABILITY_NAMES[k]} (${abilities[k]})`, disabled: abilities[k] + 2 > max })), keys[0], (k) => onChange(k ? { [k]: 2 } : {}));
        slots.appendChild(s);
        onChange(keys[0] && cur[keys[0]] === 2 ? cur : {});
      } else {
        let a = keys[0] || '';
        let b = keys[1] || '';
        const emit = () => onChange(Object.fromEntries([a, b].filter(Boolean).map((k) => [k, 1])));
        const sa = select(opts(b), a, (k) => { a = k; draw(Object.fromEntries([a, b].filter(Boolean).map((x) => [x, 1]))); });
        const sb = select(opts(a), b, (k) => { b = k; draw(Object.fromEntries([a, b].filter(Boolean).map((x) => [x, 1]))); });
        slots.append(sa, sb);
        emit();
      }
    };
    draw(v);
  } else {
    const keys = Object.keys(v);
    box.appendChild(el('span', 'b-hint', `+1 to (max ${max}): `));
    box.appendChild(select(opts(''), keys[0], (k) => onChange(k ? { [k]: 1 } : {})));
  }
  return box;
}

// Sub-choices of a feat that need answers: Skilled (3 skills), Magic
// Initiate (list + 2 cantrips + 1 spell), ability increase.
// `answer` is mutated; `ctx` = { abilities, skillProf, allSkills, takenSpells, fixedList }.
export function featExtras(feat, answer, ctx, redraw) {
  const box = el('div', 'b-feat-extras');
  if (!feat) return box;
  if (feat.key === 'ability-score-improvement') {
    box.appendChild(increasePicker({ kind: 'asi', abilities: ctx.abilities, value: answer.plus, onChange: (p) => { answer.plus = p; } }));
  } else if (feat.asi) {
    box.appendChild(increasePicker({ kind: 'one', allowed: feat.asi.abilities, max: feat.asi.max, abilities: ctx.abilities, value: answer.plus, onChange: (p) => { answer.plus = p; } }));
  }
  if (feat.key === 'skilled') {
    const names = ctx.allSkills;
    box.appendChild(el('div', 'b-hint', 'Skilled: three skill proficiencies (tools: add them to Features yourself).'));
    box.appendChild(checkList(names, answer.skills || [], 3, (s) => { answer.skills = s; if (ctx.onSkills) ctx.onSkills(); }, { disabled: (s) => (ctx.skillProf[s] ? 'Already proficient' : '') }));
  }
  if (feat.key === 'magic-initiate') {
    const mi = answer.magicInitiate || (answer.magicInitiate = { list: ctx.fixedList || '', cantrips: [], spell: '' });
    if (ctx.fixedList) mi.list = ctx.fixedList;
    if (!ctx.fixedList) {
      const s = select(MI_LISTS.map(([v, l]) => ({ value: v, label: `${l} spells` })), mi.list, (v) => { mi.list = v; mi.cantrips = []; mi.spell = ''; redraw(); });
      box.appendChild(s);
    }
    if (mi.list) {
      const listName = MI_LISTS.find(([v]) => v === mi.list)[1];
      box.appendChild(spellPicker({ title: `${listName} cantrips (Magic Initiate)`, listKey: mi.list, cantrip: true, count: 2, selected: mi.cantrips, taken: ctx.takenSpells, onChange: (ids) => { mi.cantrips = ids; } }));
      box.appendChild(spellPicker({ title: `${listName} level 1 spell (Magic Initiate)`, listKey: mi.list, cantrip: false, maxLevel: 1, count: 1, selected: mi.spell ? [mi.spell] : [], taken: ctx.takenSpells, onChange: (ids) => { mi.spell = ids[0] || ''; } }));
    }
  }
  return box;
}

// The <dialog> shell used by both: title, body, message line, buttons.
// Eldritch Invocations / Metamagic (a level-up plan's `options` choice):
// tick the Content page's options, or type others (their text by hand).
// value: [names]; onChange([names]).
export function optionPicker(choice, value, onChange) {
  const box = el('div', 'b-options');
  const listed = choice.options.map((o) => o.name);
  let ticked = value.filter((n) => listed.includes(n));
  let typed = value.filter((n) => !listed.includes(n));
  const emit = () => onChange([...ticked, ...typed]);
  if (choice.known && choice.known.length) box.appendChild(el('div', 'b-hint', `Already known: ${choice.known.join(', ')}`));
  if (choice.options.length) {
    const why = new Map(choice.options.map((o) => [o.name, o.why]));
    box.appendChild(checkList(listed, ticked, choice.count, (v) => { ticked = v; emit(); }, { disabled: (n) => why.get(n) || '' }));
    choice.options.forEach((o) => box.appendChild(details(`${o.name}${o.source ? ` — ${o.source}` : ''}${o.why ? ` (${o.why})` : ''}`,
      [o.prereq ? `*Prerequisite: ${o.prereq}*` : '', o.cost ? `**Cost:** ${o.cost} Sorcery Point${o.cost === 1 ? '' : 's'}` : '', o.desc].filter(Boolean).join('\n'))));
  } else {
    box.appendChild(el('div', 'b-hint', `No ${choice.label} options on the Content page yet — a DM can add them there (with their text, action and attack modifier). Or type the names here.`));
  }
  const inp = el('input', 'b-text');
  inp.placeholder = choice.options.length ? 'Others not listed, comma-separated' : `${choice.count} name${choice.count === 1 ? '' : 's'}, comma-separated`;
  inp.setAttribute('aria-label', `${choice.label}: other names`);
  inp.value = typed.join(', ');
  inp.addEventListener('input', () => { typed = inp.value.split(',').map((s) => s.trim()).filter(Boolean); emit(); });
  box.appendChild(inp);
  return box;
}

export function makeDialog(id, title) {
  let dlg = document.getElementById(id);
  if (dlg) dlg.remove();
  dlg = el('dialog', 'builder-dlg');
  dlg.id = id;
  const head = el('div', 'b-head');
  const h = el('h3', '', title);
  const close = el('button', 'b-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => dlg.close());
  head.append(h, close);
  const steps = el('div', 'b-steps');
  const body = el('div', 'b-body');
  const msg = el('div', 'b-msg');
  msg.setAttribute('role', 'alert');
  const btns = el('div', 'b-btns');
  dlg.append(head, steps, body, msg, btns);
  dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 0));
  document.body.appendChild(dlg);
  return { dlg, title: h, steps, body, msg, btns };
}

export function button(text, cls, onClick) {
  const b = el('button', 'btn small ' + (cls || ''), text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
