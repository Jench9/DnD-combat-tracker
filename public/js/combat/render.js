// Pure view: draws the combatant list from a combat state.
// `send(type, payload)` talks to the server; `rerender()` redraws the list;
// `portraitFor(combatant)` returns a portrait data URL or ''; `notesFor(combatant)`
// returns its library monster's notes (stat block) or ''; `canControl(combatant)`
// says whether this browser may change it (DM: all; player: their own);
// `isDm` adds the DM tools (hide from players, alias, DM notes);
// `actionsFor(combatant)` returns a function that renders a PC's actions
// into a container, or null.
//
// Players get a filtered state from the server: hidden combatants are
// missing and monsters carry a `health` word instead of hp/maxHp/ac.
import { CONDITIONS, conditionDescription } from './conditions.js';

function mkHpBtn(label, fn) {
  const b = document.createElement('button');
  b.className = 'hp-btn';
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

function deathSaveDots(c, kind, filled, send, canEdit) {
  const wrap = document.createElement('span');
  wrap.className = 'save-dots';
  for (let i = 0; i < 3; i++) {
    const d = document.createElement('span');
    d.className = `dot ${kind}` + (i < filled ? ' filled' : '');
    if (canEdit) d.addEventListener('click', () => send('toggleDeathSave', { id: c.id, kind, index: i }));
    wrap.appendChild(d);
  }
  return wrap;
}

function renderConditions(c, send, rerender, canEdit) {
  const condWrap = document.createElement('div');
  condWrap.className = 'conditions';
  c.conditions.forEach((cond) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.title = conditionDescription(cond);
    chip.textContent = cond;
    if (canEdit) {
      const rm = document.createElement('button');
      rm.textContent = '×';
      rm.addEventListener('click', () => send('removeCondition', { id: c.id, condition: cond }));
      chip.appendChild(rm);
    }
    condWrap.appendChild(chip);
  });

  const addCondBtn = document.createElement('button');
  addCondBtn.className = 'add-cond';
  addCondBtn.textContent = '+ condition';
  addCondBtn.addEventListener('click', () => {
    const menu = document.createElement('select');
    menu.style.fontSize = '11px';
    const blank = document.createElement('option');
    blank.textContent = 'Choose…';
    blank.value = '';
    menu.appendChild(blank);
    CONDITIONS.forEach(([n]) => {
      if (!c.conditions.includes(n)) {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        menu.appendChild(opt);
      }
    });
    menu.addEventListener('change', () => {
      if (menu.value) send('addCondition', { id: c.id, condition: menu.value });
    });
    condWrap.replaceChild(menu, addCondBtn);
    menu.focus();
    menu.addEventListener('blur', () => rerender());
  });
  if (canEdit) condWrap.appendChild(addCondBtn);
  return condWrap;
}

// Which combatants have their stat block expanded (survives redraws).
const openStats = new Set();

function renderStats(c, notes) {
  const det = document.createElement('details');
  det.className = 'stat-notes';
  det.open = openStats.has(c.id);
  det.addEventListener('toggle', () => {
    if (det.open) openStats.add(c.id); else openStats.delete(c.id);
  });
  const sum = document.createElement('summary');
  sum.textContent = 'Stats';
  const body = document.createElement('div');
  body.className = 'stat-body';
  body.textContent = notes; // plain text; CSS keeps the line breaks
  det.append(sum, body);
  return det;
}

const HEALTH_CLASS = { Unhurt: '', Hurt: '', Bloodied: ' mid', 'Near death': ' low', Down: ' low' };

// DM tools under a row: private notes, and for monsters an alias players
// see instead of the real name.
function renderDmTools(c, send) {
  const det = document.createElement('details');
  det.className = 'stat-notes dm-tools';
  det.open = openDm.has(c.id);
  det.addEventListener('toggle', () => { if (det.open) openDm.add(c.id); else openDm.delete(c.id); });
  const sum = document.createElement('summary');
  sum.textContent = 'DM' + (c.alias ? ' · shown as “' + c.alias + '”' : '') + (c.dmNotes ? ' · notes' : '');
  const body = document.createElement('div');
  body.className = 'stat-body dm-fields';
  const alias = document.createElement('input');
  alias.placeholder = 'Name players see (blank = real name)';
  alias.maxLength = 30;
  alias.value = c.alias || '';
  alias.addEventListener('change', () => send('setCombatantDm', { id: c.id, alias: alias.value }));
  const notes = document.createElement('textarea');
  notes.placeholder = 'Private DM notes';
  notes.rows = 2;
  notes.value = c.dmNotes || '';
  notes.addEventListener('change', () => send('setCombatantDm', { id: c.id, dmNotes: notes.value }));
  if (c.type === 'monster') body.append(alias);
  body.append(notes);
  det.append(sum, body);
  return det;
}
const openDm = new Set();

// Which rows have Actions expanded (survives redraws).
const openActions = new Set();
function renderActionsSection(c, fill) {
  const det = document.createElement('details');
  det.className = 'stat-notes actions-section';
  det.open = openActions.has(c.id);
  const sum = document.createElement('summary');
  sum.textContent = 'Actions';
  const body = document.createElement('div');
  body.className = 'stat-body actions-body';
  const draw = () => { if (det.open) fill(body); };
  det.addEventListener('toggle', () => {
    if (det.open) openActions.add(c.id); else openActions.delete(c.id);
    draw();
  });
  draw();
  det.append(sum, body);
  return det;
}

function renderRow(c, idx, state, ctx) {
  const { send, rerender, portraitFor, notesFor, actionsFor, canControl, isDm } = ctx;
  const canEdit = canControl(c);
  const row = document.createElement('div');
  const down = c.health ? c.health === 'Down' : c.hp <= 0;
  row.className = 'row' + (idx === state.activeIndex ? ' active' : '') + (down ? ' down' : '')
    + (c.hidden ? ' hidden-row' : '') + (!isDm && canEdit ? ' mine' : '');

  // Initiative is editable: fix a typo or apply a re-roll; the list re-sorts.
  const badge = document.createElement('input');
  badge.type = 'number';
  badge.className = 'init-badge';
  badge.value = c.init;
  badge.title = canEdit ? 'Initiative — click to change' : 'Initiative';
  badge.readOnly = !canEdit;
  if (!canEdit) { badge.tabIndex = -1; badge.classList.add('locked'); }
  badge.setAttribute('aria-label', 'Initiative for ' + c.name);
  badge.addEventListener('change', () => {
    const init = parseInt(badge.value, 10);
    if (Number.isFinite(init)) send('setInitiative', { id: c.id, init });
    else badge.value = c.init;
  });
  badge.addEventListener('keydown', (e) => { if (e.key === 'Enter') badge.blur(); });
  row.appendChild(badge);

  const main = document.createElement('div');
  main.className = 'row-main';

  const nameLine = document.createElement('div');
  nameLine.className = 'name-line';
  if (idx === state.activeIndex) {
    const marker = document.createElement('span');
    marker.className = 'marker';
    marker.textContent = '▶';
    nameLine.appendChild(marker);
  }
  // Icon: the character's portrait / monster's icon, or their initial.
  const portrait = portraitFor(c);
  const pic = document.createElement('span');
  pic.className = 'c-portrait' + (c.type === 'pc' ? ' pc' : ' mon');
  if (portrait) {
    const img = document.createElement('img');
    img.src = portrait;
    img.alt = '';
    pic.appendChild(img);
  } else {
    pic.textContent = ((c.name || '?').trim().charAt(0) || '?').toUpperCase();
  }
  nameLine.appendChild(pic);

  const nameInput = document.createElement('input');
  nameInput.className = 'cname';
  nameInput.value = c.name;
  nameInput.readOnly = !canEdit;
  nameInput.addEventListener('change', () => send('renameCombatant', { id: c.id, name: nameInput.value }));
  nameLine.appendChild(nameInput);

  if (c.ac !== undefined) {
    const acTag = document.createElement('span');
    acTag.className = 'ac-tag';
    acTag.textContent = 'AC ' + c.ac;
    nameLine.appendChild(acTag);
  }
  if (c.hidden) {
    const tag = document.createElement('span');
    tag.className = 'hidden-tag';
    tag.textContent = 'Hidden from players';
    nameLine.appendChild(tag);
  }
  main.appendChild(nameLine);

  // Players see a monster's condition, not its numbers.
  if (c.health) {
    const hl = document.createElement('div');
    hl.className = 'hp-line';
    const chip = document.createElement('span');
    chip.className = 'health-chip' + HEALTH_CLASS[c.health];
    chip.textContent = c.health;
    hl.appendChild(chip);
    main.appendChild(hl);
    main.appendChild(renderConditions(c, send, rerender, false));
    row.appendChild(main);
    row.appendChild(document.createElement('div'));
    return row;
  }

  // hp line
  const adjust = (delta) => send('adjustHP', { id: c.id, delta });
  const hpLine = document.createElement('div');
  hpLine.className = 'hp-line';
  if (canEdit) {
    hpLine.appendChild(mkHpBtn('−', () => adjust(-5)));
    hpLine.appendChild(mkHpBtn('−', () => adjust(-1)));
  }

  const hpVal = document.createElement('div');
  hpVal.className = 'hp-val';
  hpVal.innerHTML = '<span class="cur">' + Math.max(c.hp, 0) + '</span><span class="max"> / ' + c.maxHp + '</span>';
  hpLine.appendChild(hpVal);

  if (canEdit) {
    hpLine.appendChild(mkHpBtn('+', () => adjust(1)));
    hpLine.appendChild(mkHpBtn('+', () => adjust(5)));
  }

  const barTrack = document.createElement('div');
  barTrack.className = 'hp-bar-track';
  const barFill = document.createElement('div');
  const pct = Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100));
  barFill.className = 'hp-bar-fill' + (pct <= 25 ? ' low' : pct <= 55 ? ' mid' : '');
  barFill.style.width = pct + '%';
  barTrack.appendChild(barFill);
  hpLine.appendChild(barTrack);
  main.appendChild(hpLine);

  // death saves (PC at 0 hp)
  if (c.type === 'pc' && c.hp <= 0) {
    const ds = document.createElement('div');
    ds.className = 'death-saves';
    ds.appendChild(document.createTextNode('Death saves — S:'));
    ds.appendChild(deathSaveDots(c, 'success', c.deathSuccess, send, canEdit));
    ds.appendChild(document.createTextNode(' F:'));
    ds.appendChild(deathSaveDots(c, 'fail', c.deathFail, send, canEdit));
    main.appendChild(ds);
  }

  main.appendChild(renderConditions(c, send, rerender, canEdit));
  const notes = notesFor(c);
  if (notes) main.appendChild(renderStats(c, notes));
  const fillActions = canEdit && actionsFor(c);
  if (fillActions) main.appendChild(renderActionsSection(c, fillActions));
  if (isDm) main.appendChild(renderDmTools(c, send));
  row.appendChild(main);

  const actions = document.createElement('div');
  actions.className = 'row-actions';
  if (isDm) {
    const eye = document.createElement('button');
    eye.className = 'remove-btn eye-btn' + (c.hidden ? ' on' : '');
    eye.textContent = c.hidden ? '🙈 Hidden' : '👁 Visible';
    eye.title = c.hidden ? 'Hidden from players — click to reveal' : 'Visible to players — click to hide';
    eye.addEventListener('click', () => send('setCombatantDm', { id: c.id, hidden: !c.hidden }));
    actions.appendChild(eye);
  }
  if (canEdit) {
    const rm = document.createElement('button');
    rm.className = 'remove-btn';
    rm.textContent = 'Remove';
    rm.addEventListener('click', () => send('removeCombatant', { id: c.id }));
    actions.appendChild(rm);
  }
  row.appendChild(actions);

  return row;
}

export function renderCombat(state, {
  send, rerender, portraitFor = () => '', notesFor = () => '', actionsFor = () => null,
  canControl = () => true, isDm = true,
}) {
  const ctx = { send, rerender, portraitFor, notesFor, actionsFor, canControl, isDm };
  document.getElementById('roundNum').textContent = state.round;
  const list = document.getElementById('list');
  list.innerHTML = '';

  if (state.combatants.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No combatants yet — add characters and monsters below, then hit "Next turn" to start.';
    list.appendChild(empty);
    return;
  }

  if (state.activeIndex >= state.combatants.length) state.activeIndex = 0; // (-1 = a hidden creature's turn)

  state.combatants.forEach((c, idx) => {
    list.appendChild(renderRow(c, idx, state, ctx));
  });
}
