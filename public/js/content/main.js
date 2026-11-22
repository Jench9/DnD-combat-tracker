// Content page: the custom subclasses, species, backgrounds, feats and class
// options (Eldritch Invocations, Metamagic)
// (src/features/content), with their source tags. DMs and the admin add
// them; the one who added an entry (or the admin) edits or deletes it.
// Everything goes through REST /api/content.
import { $ } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { identityHeaders } from '../core/identity.js';
import { fillRich } from '../core/richText.js';
import { PRESETS } from '../core/modifiers.js';

renderNav();

const KIND_LABEL = { subclass: 'Subclasses', species: 'Species', background: 'Backgrounds', feat: 'Feats', option: 'Class options' };
const ONE = { subclass: 'subclass', species: 'species', background: 'background', feat: 'feat', option: 'class option' };
const OPTION_TYPE = { invocation: 'Eldritch Invocation (Warlock)', metamagic: 'Metamagic (Sorcerer)' };
const FEAT_TYPE = { origin: 'Origin feat', general: 'General feat', 'fighting-style': 'Fighting Style', 'epic-boon': 'Epic Boon' };
const ABILITIES = [['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']];
const DEFAULT_SOURCE = "Player's Handbook (2024)";

let data = { entries: [], kinds: [], classes: [], featTypes: [], sizes: [], skills: [], originFeats: [], canAdd: false };
let kind = 'subclass';

const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
};

async function api(method, url, body) {
  let r;
  try {
    r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...identityHeaders() }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Could not reach the server.');
  }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || `Something went wrong (${r.status}).`);
  return out;
}

async function load() {
  data = await api('GET', '/api/content');
  $('addBtn').hidden = !data.canAdd;
  drawFilters();
  drawList();
}

const className = (key) => (data.classes.find((c) => c.key === key) || {}).name || key;
const featName = (key) => (data.originFeats.find((f) => f.key === key) || {}).name || key;

function summary(e) {
  if (e.kind === 'subclass') return `${className(e.classKey)} subclass · ${e.features.length} feature${e.features.length === 1 ? '' : 's'}${e.summary ? ' · ' + e.summary : ''}`;
  if (e.kind === 'species') return `${e.size} · speed ${e.speed} ft · ${e.traits.length} trait${e.traits.length === 1 ? '' : 's'}${e.skillChoice ? ' · a skill of choice' : ''}`;
  if (e.kind === 'background') return `${e.abilities.map((a) => a.toUpperCase()).join(' / ')} · ${e.skills.join(', ')} · ${featName(e.featKey)}`;
  if (e.kind === 'option') {
    return [OPTION_TYPE[e.optionType], e.minLevel ? `level ${e.minLevel}+` : '', e.prereq, e.cost ? `${e.cost} Sorcery Point${e.cost === 1 ? '' : 's'}` : '',
      e.action ? (USED_AS.find((u) => u[0] === e.action) || [])[1] : '', e.preset ? `switches on ${(PRESETS.find((p) => p.key === e.preset) || {}).name || e.preset}` : '',
      e.repeatable ? 'repeatable' : ''].filter(Boolean).join(' · ');
  }
  return `${FEAT_TYPE[e.type]}${e.minLevel ? ` · level ${e.minLevel}+` : ''}${e.asi.length ? ` · +1 ${e.asi.map((a) => a.toUpperCase()).join('/')}` : ''}${e.repeatable ? ' · repeatable' : ''}`;
}

// The entry's text, formatted, under a "Show" toggle.
function preview(e) {
  const d = el('details', 'ct-preview');
  d.appendChild(el('summary', '', 'Show'));
  const body = el('div', 'ct-preview-body');
  const block = (title, text) => {
    if (title) body.appendChild(el('div', 'ct-preview-h', title));
    if (text) body.appendChild(fillRich(el('div'), text));
  };
  d.addEventListener('toggle', () => {
    if (!d.open || body.childElementCount) return;
    if (e.kind === 'subclass') {
      block('', e.desc);
      (e.resources || []).forEach((r) => body.appendChild(el('div', 'ct-item-sub', `${r.name}: ${r.pb ? 'proficiency bonus' : r.ability ? `${r.ability.toUpperCase()} modifier (at least 1)` : r.uses.map((u) => `${u.max} at ${u.level}`).join(', ')} · back on ${r.recharge === 'short' ? 'a Short or Long Rest' : r.recharge === 'long' ? 'a Long Rest' : 'nothing'}`)));
      if (e.spellcasting) body.appendChild(el('div', 'ct-item-sub', `Spellcasting: ${e.spellcasting.type} caster, ${e.spellcasting.ability.toUpperCase()}, ${e.spellcasting.list} list`));
      e.features.forEach((f) => {
        block(`Level ${f.level}: ${f.name}${f.action ? ` (${USED_AS.find((u) => u[0] === f.action)[1]}${f.resource ? `, spends ${f.cost} ${f.resource}` : ''})` : ''}`, f.desc);
        const byLevel = {};
        (f.spells || []).forEach((x) => { (byLevel[x.level] = byLevel[x.level] || []).push(x.name); });
        const rows = Object.entries(byLevel).map(([lv, names]) => `| ${lv} | ${names.join(', ')} |`);
        if (rows.length) block('', ['| Level | Always prepared |', '|---|---|', ...rows].join('\n'));
      });
    } else if (e.kind === 'species') e.traits.forEach((t) => block(t.name, t.desc));
    else if (e.kind === 'feat' || e.kind === 'option') block('', e.desc);
    else block('', [`Skills: ${e.skills.join(', ')}`, e.tools.length ? `Tools: ${e.tools.join(', ')}` : '', `Equipment: ${e.equipment || '—'}${e.gp ? `, ${e.gp} GP` : ''} — or 50 GP`].filter(Boolean).join('\n'));
  });
  d.appendChild(body);
  return d;
}

function drawFilters() {
  const tabs = $('kindTabs');
  tabs.innerHTML = '';
  data.kinds.forEach((k) => {
    const n = data.entries.filter((e) => e.kind === k).length;
    const b = el('button', k === kind ? 'on' : '', `${KIND_LABEL[k]} (${n})`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(k === kind));
    b.addEventListener('click', () => { kind = k; drawFilters(); drawList(); });
    tabs.appendChild(b);
  });
  const sel = $('sourceFilter');
  const keep = sel.value;
  sel.innerHTML = '<option value="">All</option>';
  [...new Set(data.entries.map((e) => e.source))].sort().forEach((s) => { const o = el('option', '', s); o.value = s; sel.appendChild(o); });
  sel.value = [...sel.options].some((o) => o.value === keep) ? keep : '';
}
$('sourceFilter').addEventListener('change', () => drawList());

function drawList() {
  const list = $('list');
  list.innerHTML = '';
  const src = $('sourceFilter').value;
  const shown = data.entries.filter((e) => e.kind === kind && (!src || e.source === src))
    .sort((a, b) => (kind === 'subclass' ? className(a.classKey).localeCompare(className(b.classKey)) : 0) || a.name.localeCompare(b.name));
  if (!shown.length) {
    list.appendChild(el('div', 'ct-empty', data.canAdd
      ? `No ${KIND_LABEL[kind].toLowerCase()} added yet — + Add content.`
      : `No ${KIND_LABEL[kind].toLowerCase()} added yet. DMs add them here.`));
    return;
  }
  let group = '';
  shown.forEach((e) => {
    if (kind === 'subclass' && className(e.classKey) !== group) {
      group = className(e.classKey);
      list.appendChild(el('div', 'ct-group-head', group));
    }
    const item = el('div', 'ct-item');
    const main = el('div', 'ct-item-main');
    const name = el('div', 'ct-item-name', e.name);
    name.appendChild(el('span', 'ct-tag', e.source));
    main.append(name, el('div', 'ct-item-sub', summary(e)));
    main.appendChild(preview(e));
    item.appendChild(main);
    if (e.mine) {
      const edit = el('button', 'btn secondary small', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', () => openEditor(e));
      item.appendChild(edit);
    }
    list.appendChild(item);
  });
}

// ---- the editor dialog
const dlg = $('editDlg');
let editing = null; // the entry being edited, or null for a new one
let form = {}; // field values

// One input in a <label>; a group of controls (tick boxes, a list with
// buttons) in a role=group with a heading instead, so each control keeps
// its own accessible name.
function field(label, input, { wide = false, hint = '' } = {}) {
  const single = ['INPUT', 'SELECT', 'TEXTAREA'].includes(input.tagName);
  const f = el(single ? 'label' : 'div', 'ct-field' + (wide ? ' wide' : ''));
  if (single) f.appendChild(document.createTextNode(label));
  else {
    const id = 'f' + Math.random().toString(36).slice(2, 8);
    const head = el('span', '', label);
    head.id = id;
    f.setAttribute('role', 'group');
    f.setAttribute('aria-labelledby', id);
    f.appendChild(head);
  }
  f.appendChild(input);
  if (hint) f.appendChild(el('span', 'ct-hint', hint));
  return f;
}
function input(key, { type = 'text', placeholder = '', max = 60, min } = {}) {
  const i = el('input');
  i.type = type;
  i.placeholder = placeholder;
  if (type === 'text') i.maxLength = max;
  if (type === 'number') { i.min = String(min ?? 0); i.max = String(max); }
  i.value = form[key] ?? '';
  i.addEventListener('input', () => { form[key] = type === 'number' ? i.value : i.value; });
  return i;
}
function area(key, placeholder, rows = 4) {
  const t = el('textarea');
  t.rows = rows;
  t.placeholder = placeholder;
  t.value = form[key] || '';
  t.addEventListener('input', () => { form[key] = t.value; });
  return t;
}
function select(key, options, { placeholder } = {}) {
  const s = el('select');
  if (placeholder) { const o = el('option', '', placeholder); o.value = ''; s.appendChild(o); }
  options.forEach(([v, l]) => { const o = el('option', '', l); o.value = v; s.appendChild(o); });
  s.value = form[key] ?? '';
  s.addEventListener('change', () => {
    form[key] = s.value;
    if (key !== 'kind') return;
    if (form.kind === 'option' && String(form.minLevel) === '4') form.minLevel = 0; // the feat default
    drawEditor();
  });
  return s;
}
function checks(key, options, max) {
  const box = el('div', 'ct-checks');
  const chosen = new Set(form[key] || []);
  options.forEach(([v, l]) => {
    const lab = el('label', 'ct-check');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = chosen.has(v);
    cb.addEventListener('change', () => {
      if (cb.checked) chosen.add(v); else chosen.delete(v);
      if (max && chosen.size > max) { chosen.delete(v); cb.checked = false; }
      form[key] = [...chosen];
    });
    lab.append(cb, document.createTextNode(l));
    box.appendChild(lab);
  });
  return box;
}
// A list of { level?, name, desc } parts (subclass features, species traits).
const USED_AS = [['', 'Not an action (text only)'], ['action', 'Action'], ['bonus', 'Bonus Action'], ['reaction', 'Reaction'], ['free', 'No action needed']];
const FORMAT_HINT = 'Formatting: **bold**, *italic*, lines starting with "- " for a list, tables as lines of cells separated by | (or pasted straight from a web page).';

function parts(key, { withLevel, label, defaultLevel = 3, mechanics = false }) {
  const box = el('div', 'ct-parts');
  const draw = () => {
    box.innerHTML = '';
    (form[key] || []).forEach((p, i) => {
      const row = el('div', 'ct-part' + (withLevel ? '' : ' no-level'));
      if (withLevel) {
        const lv = el('input');
        lv.type = 'number';
        lv.min = '1';
        lv.max = '20';
        lv.value = p.level;
        lv.setAttribute('aria-label', 'Level');
        lv.title = 'Level';
        lv.addEventListener('input', () => { p.level = lv.value; });
        row.appendChild(lv);
      }
      const nm = el('input');
      nm.maxLength = 80;
      nm.placeholder = `${label} name`;
      nm.value = p.name;
      nm.addEventListener('input', () => { p.name = nm.value; });
      const x = el('button', 'ct-x', '×');
      x.type = 'button';
      x.title = `Remove this ${label.toLowerCase()}`;
      x.setAttribute('aria-label', x.title);
      x.addEventListener('click', () => { form[key].splice(i, 1); draw(); });
      const ds = el('textarea');
      ds.rows = 3;
      ds.placeholder = 'What it does';
      ds.value = p.desc;
      ds.addEventListener('input', () => { p.desc = ds.value; });
      row.append(nm, x, ds);
      if (mechanics) row.appendChild(featureMechanics(p));
      box.appendChild(row);
    });
    const add = el('button', 'btn secondary small', `+ Add ${label.toLowerCase()}`);
    add.type = 'button';
    add.addEventListener('click', () => { form[key] = [...(form[key] || []), { level: defaultLevel, name: '', desc: '' }]; draw(); });
    box.appendChild(add);
  };
  draw();
  return box;
}

// A subclass feature in play: its action type (it then shows in the sheet's
// Actions list) and the resource a use spends.
function featureMechanics(p) {
  const wrap = el('div', 'ct-mech');
  const mk = (labelText, control) => { const l = el('label', 'ct-mini'); l.append(document.createTextNode(labelText), control); wrap.appendChild(l); };
  const used = el('select');
  USED_AS.forEach(([v, l]) => { const o = el('option', '', l); o.value = v; used.appendChild(o); });
  used.value = p.action || '';
  used.addEventListener('change', () => { p.action = used.value; });
  mk('Used as', used);
  const spends = el('select');
  const none = el('option', '', '— nothing —');
  none.value = '';
  spends.appendChild(none);
  (form.resources || []).filter((r) => r.name).forEach((r) => { const o = el('option', '', r.name); o.value = r.name; spends.appendChild(o); });
  spends.value = p.resource || '';
  spends.addEventListener('change', () => { p.resource = spends.value; });
  mk('Spends', spends);
  const cost = el('input', 'ct-cost');
  cost.type = 'number';
  cost.min = '1';
  cost.max = '20';
  cost.value = p.cost || 1;
  cost.addEventListener('input', () => { p.cost = cost.value; });
  mk('×', cost);
  // Always-prepared spells (domain / patron / oath spells), by class level.
  const sp = el('textarea', 'ct-spells');
  sp.rows = 2;
  sp.placeholder = 'Always-prepared spells, one line per class level — e.g.\n3: Detect Thoughts, Dissonant Whispers\n5: Clairvoyance';
  sp.setAttribute('aria-label', 'Always-prepared spells, one line per class level');
  sp.value = p.spellsText ?? (p.spells || []).reduce((lines, x) => {
    const last = lines[lines.length - 1];
    if (last && last.level === x.level) last.names.push(x.name); else lines.push({ level: x.level, names: [x.name] });
    return lines;
  }, []).map((l) => `${l.level}: ${l.names.join(', ')}`).join('\n');
  sp.addEventListener('input', () => { p.spellsText = sp.value; });
  const spl = el('label', 'ct-mini ct-spells-l');
  spl.append(document.createTextNode('Always prepared'), sp);
  wrap.appendChild(spl);
  return wrap;
}

// The subclass's limited-use resources: name, recharge, uses by level.
function resourceRows() {
  const box = el('div', 'ct-parts');
  const draw = () => {
    box.innerHTML = '';
    (form.resources || []).forEach((r, i) => {
      const row = el('div', 'ct-res');
      const nm = el('input');
      nm.maxLength = 40;
      nm.placeholder = 'e.g. Superiority Dice';
      nm.value = r.name || '';
      nm.setAttribute('aria-label', 'Resource name');
      nm.addEventListener('change', () => { r.name = nm.value; drawEditor(); }); // features' "Spends" lists it
      const rc = el('select');
      rc.setAttribute('aria-label', 'Comes back on');
      [['short', 'Short or Long Rest'], ['long', 'Long Rest'], ['none', 'Not automatically']].forEach(([v, l]) => { const o = el('option', '', l); o.value = v; rc.appendChild(o); });
      rc.value = r.recharge || 'short';
      rc.addEventListener('change', () => { r.recharge = rc.value; });
      const uses = el('input');
      uses.placeholder = 'Uses: 3:4, 7:5, 15:6 — or PB, or CHA';
      uses.value = r.usesText ?? (r.pb ? 'PB' : r.ability ? r.ability.toUpperCase() : (r.uses || []).map((u) => `${u.level}:${u.max}`).join(', '));
      uses.setAttribute('aria-label', 'Uses by class level, PB for the proficiency bonus, or an ability (e.g. CHA) for its modifier');
      uses.addEventListener('input', () => { r.usesText = uses.value; delete r.uses; delete r.pb; delete r.ability; });
      const x = el('button', 'ct-x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove this resource');
      x.addEventListener('click', () => { form.resources.splice(i, 1); drawEditor(); });
      row.append(nm, rc, uses, x);
      box.appendChild(row);
    });
    const add = el('button', 'btn secondary small', '+ Add resource');
    add.type = 'button';
    add.addEventListener('click', () => { form.resources = [...(form.resources || []), { name: '', recharge: 'short', usesText: '' }]; draw(); });
    box.appendChild(add);
  };
  draw();
  return box;
}

// Spellcasting a subclass gives (e.g. a one-third caster): type, ability,
// spell list and, per class level, cantrips known and spells prepared.
function spellcastingBox() {
  const box = el('div', 'ct-sc');
  const on = el('label', 'ct-check');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.checked = !!form.spellcasting;
  on.append(cb, document.createTextNode('This subclass gives spellcasting'));
  box.appendChild(on);
  cb.addEventListener('change', () => {
    form.spellcasting = cb.checked ? { type: 'third', ability: 'int', list: 'wizard', cantrips: Array(20).fill(0), prepared: Array(20).fill(0) } : null;
    drawEditor();
  });
  const sc = form.spellcasting;
  if (!sc) return box;
  const row = el('div', 'ct-row');
  const pick = (labelText, key, options) => {
    const s = el('select');
    options.forEach(([v, l]) => { const o = el('option', '', l); o.value = v; s.appendChild(o); });
    s.value = sc[key];
    s.addEventListener('change', () => { sc[key] = s.value; });
    row.appendChild(field(labelText, s));
  };
  pick('Caster type', 'type', [['third', 'One-third caster (spell slots of a full caster of a third of your level)'], ['half', 'Half caster'], ['full', 'Full caster']]);
  pick('Ability', 'ability', [['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']]);
  pick('Spell list', 'list', ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'].map((x) => [x, x[0].toUpperCase() + x.slice(1)]));
  box.appendChild(row);
  box.appendChild(el('div', 'ct-hint', 'Type the totals from your book for each class level (leave 0 before the subclass level). Spell slots are worked out for you.'));
  const from = (data.classes.find((c) => c.key === form.classKey) || {}).subclassLevel || 3;
  const wrap = el('div', 'rt-table-wrap');
  const t = el('table', 'rt-table ct-sc-table');
  const head = el('tr');
  ['Class level', 'Cantrips known', 'Spells prepared'].forEach((h) => head.appendChild(el('th', '', h)));
  t.createTHead().appendChild(head);
  const body = t.createTBody();
  for (let lv = from; lv <= 20; lv++) {
    const tr = el('tr');
    tr.appendChild(el('td', '', String(lv)));
    ['cantrips', 'prepared'].forEach((k) => {
      const td = el('td');
      const inp = el('input', 'ct-num');
      inp.type = 'number';
      inp.min = '0';
      inp.max = '30';
      inp.value = sc[k][lv - 1] || 0;
      inp.setAttribute('aria-label', `${k === 'cantrips' ? 'Cantrips' : 'Prepared spells'} at level ${lv}`);
      inp.addEventListener('input', () => { sc[k][lv - 1] = parseInt(inp.value, 10) || 0; });
      td.appendChild(inp);
      tr.appendChild(td);
    });
    body.appendChild(tr);
  }
  wrap.appendChild(t);
  box.appendChild(wrap);
  return box;
}

function drawEditor() {
  const body = $('editBody');
  body.innerHTML = '';
  const k = form.kind;
  const top = el('div', 'ct-row');
  if (!editing) top.appendChild(field('What', select('kind', data.kinds.map((x) => [x, ONE[x][0].toUpperCase() + ONE[x].slice(1)]))));
  top.appendChild(field('Name', input('name', { max: 50, placeholder: k === 'subclass' ? 'e.g. Battle Master' : k === 'species' ? 'e.g. Aasimar' : k === 'background' ? 'e.g. Noble' : k === 'option' ? (form.optionType === 'metamagic' ? 'e.g. Quickened Spell' : 'e.g. Agonizing Blast') : 'e.g. Lucky' })));
  const src = input('source', { placeholder: DEFAULT_SOURCE });
  src.setAttribute('list', 'sourceList');
  const dl = el('datalist');
  dl.id = 'sourceList';
  [...new Set([DEFAULT_SOURCE, 'Homebrew', ...data.entries.map((e) => e.source)])].forEach((s) => { const o = el('option'); o.value = s; dl.appendChild(o); });
  top.append(field('Source tag', src, { hint: 'Where it comes from — shown next to it everywhere.' }), dl);
  body.appendChild(top);

  if (k === 'subclass') {
    const row = el('div', 'ct-row');
    row.append(
      field('Class', select('classKey', data.classes.map((c) => [c.key, c.name]), { placeholder: 'Choose…' })),
      field('Summary', input('summary', { max: 200, placeholder: 'One line, shown on its card' })),
    );
    body.append(row, field('Description', area('desc', 'What the subclass is about (optional)', 3), { wide: true, hint: FORMAT_HINT }));
    const lvl = (data.classes.find((c) => c.key === form.classKey) || {}).subclassLevel || 3;
    body.appendChild(field('Resources', resourceRows(), {
      wide: true, hint: 'Limited uses it gives (Superiority Dice…): uses by class level ("3:4, 7:5, 15:6"), PB (proficiency bonus) or an ability such as CHA (its modifier, at least 1). Level up adds them to the sheet\'s Resources.',
    }));
    body.appendChild(field('Features', parts('features', { withLevel: true, label: 'Feature', defaultLevel: lvl, mechanics: true }), {
      wide: true, hint: 'One per feature, with the class level it arrives at; level up adds its text to the sheet. "Used as" puts it in the Actions list (with a Use button that spends its resource). ' + FORMAT_HINT,
    }));
    body.appendChild(field('Spellcasting', spellcastingBox(), { wide: true }));
  } else if (k === 'species') {
    const row = el('div', 'ct-row');
    row.append(
      field('Size', select('size', data.sizes.map((s) => [s, s]))),
      field('Speed (ft)', input('speed', { type: 'number', min: 5, max: 120 })),
    );
    const skill = el('label', 'ct-check');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = !!form.skillChoice;
    cb.addEventListener('change', () => { form.skillChoice = cb.checked; });
    skill.append(cb, document.createTextNode('Gives one skill of the player\'s choice'));
    body.append(row, skill, field('Traits', parts('traits', { withLevel: false, label: 'Trait' }), { wide: true, hint: 'Darkvision, resistances, spells… they go on the sheet\'s features. ' + FORMAT_HINT }));
  } else if (k === 'background') {
    body.appendChild(field('Ability scores (tick three)', checks('abilities', ABILITIES, 3), { wide: true }));
    body.appendChild(field('Skills (tick two)', checks('skills', data.skills.map((s) => [s, s]), 2), { wide: true }));
    const row = el('div', 'ct-row');
    row.append(
      field('Tool proficiency', input('tools', { placeholder: "e.g. Gaming Set, Thieves' Tools", max: 120 })),
      field('Origin feat', select('featKey', data.originFeats.map((f) => [f.key, f.source === 'SRD 5.2' ? f.name : `${f.name} — ${f.source}`]), { placeholder: 'Choose…' }), { hint: 'Add a missing one as a feat first (type: Origin).' }),
    );
    const row2 = el('div', 'ct-row');
    row2.append(
      field('Equipment (option A)', input('equipment', { max: 1000, placeholder: 'e.g. Fine Clothes, Perfume, Signet Ring' })),
      field('Gold with it (GP)', input('gp', { type: 'number', min: 0, max: 1000 }), { hint: 'Option B is always 50 GP.' }),
    );
    body.append(row, row2);
  } else if (k === 'option') {
    const row = el('div', 'ct-row');
    const type = select('optionType', (data.optionTypes || ['invocation', 'metamagic']).map((t) => [t, OPTION_TYPE[t]]));
    type.addEventListener('change', () => drawEditor());
    row.append(
      field('Option of', type),
      field('Minimum class level', input('minLevel', { type: 'number', min: 0, max: 20 }), { hint: form.optionType === 'metamagic' ? '0 = any.' : 'Warlock level; 0 = any.' }),
    );
    const row2 = el('div', 'ct-row');
    row2.appendChild(field('Prerequisite (shown)', input('prereq', { max: 120, placeholder: 'e.g. a Warlock cantrip that deals damage' })));
    if (form.optionType === 'metamagic') row2.appendChild(field('Sorcery Points', input('cost', { type: 'number', min: 0, max: 20 }), { hint: 'What a use costs.' }));
    const row3 = el('div', 'ct-row');
    row3.append(
      field('Used as', select('action', USED_AS), { hint: 'Puts it in the sheet\'s Actions list' + (form.optionType === 'metamagic' ? ' (Use spends the Sorcery Points).' : '.') }),
      field('Switches on', select('preset', PRESETS.filter((p) => p.when).map((p) => [p.key, p.name]), { placeholder: '— no attack modifier —' }), { hint: 'An attack modifier it adds to the sheet (e.g. Agonizing Blast).' }),
    );
    const rep = el('label', 'ct-check');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = !!form.repeatable;
    cb.addEventListener('change', () => { form.repeatable = cb.checked; });
    rep.append(cb, document.createTextNode('Can be taken more than once'));
    body.append(row, row2, row3, rep, field('Description', area('desc', 'What it does', 6), { wide: true, hint: FORMAT_HINT }));
  } else if (k === 'feat') {
    const row = el('div', 'ct-row');
    row.append(
      field('Type', select('type', data.featTypes.map((t) => [t, FEAT_TYPE[t]]))),
      field('Minimum level', input('minLevel', { type: 'number', min: 0, max: 20 }), { hint: '0 = any (origin feats); general feats are 4+.' }),
    );
    const rep = el('label', 'ct-check');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = !!form.repeatable;
    cb.addEventListener('change', () => { form.repeatable = cb.checked; });
    rep.append(cb, document.createTextNode('Can be taken more than once'));
    body.append(row, field('+1 to one of (optional)', checks('asi', ABILITIES), { wide: true, hint: 'The ability increase it gives, if any (max 20).' }), rep,
      field('Description', area('desc', 'What the feat does', 6), { wide: true, hint: FORMAT_HINT }));
  }
}

function openEditor(entry) {
  editing = entry || null;
  form = entry
    ? JSON.parse(JSON.stringify({ ...entry, tools: (entry.tools || []).join(', ') }))
    : { kind, source: data.entries.length ? data.entries[data.entries.length - 1].source : DEFAULT_SOURCE, size: 'Medium', speed: 30, type: 'general', minLevel: kind === 'feat' ? 4 : 0, gp: 0, features: [], traits: [], resources: [], spellcasting: null, optionType: 'invocation', cost: 1, action: '', preset: '' };
  $('editTitle').textContent = entry ? `Edit ${ONE[entry.kind]}: ${entry.name}` : 'Add content';
  $('deleteBtn').hidden = !entry;
  $('editMsg').textContent = '';
  drawEditor();
  dlg.showModal();
}

$('addBtn').addEventListener('click', () => openEditor(null));
$('closeBtn').addEventListener('click', () => dlg.close());
$('cancelBtn').addEventListener('click', () => dlg.close());
$('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('saveBtn').disabled = true;
  $('editMsg').textContent = '';
  try {
    const body = { ...form, tools: String(form.tools || '').split(',').map((t) => t.trim()).filter(Boolean) };
    if (editing) await api('PUT', `/api/content/${editing.id}`, body);
    else await api('POST', '/api/content', body);
    kind = form.kind;
    dlg.close();
    await load();
  } catch (err) {
    $('editMsg').textContent = err.message;
  } finally {
    $('saveBtn').disabled = false;
  }
});
$('deleteBtn').addEventListener('click', async () => {
  if (!editing || !confirm(`Delete "${editing.name}"? Characters already built with it keep what they got.`)) return;
  try {
    await api('DELETE', `/api/content/${editing.id}`);
    dlg.close();
    await load();
  } catch (err) {
    $('editMsg').textContent = err.message;
  }
});

load().catch((err) => { $('list').textContent = err.message; });
