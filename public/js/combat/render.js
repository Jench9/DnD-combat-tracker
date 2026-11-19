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
import { CONCENTRATION_ICON, conditionIcon, effectIcon } from '../core/effects.js';
import { rollBatch, rollDie, RollCancelled } from '../core/dice.js';
import { exhaustionText, MAX_EXHAUSTION } from '../core/exhaustion.js';

function mkHpBtn(label, fn, title) {
  const b = document.createElement('button');
  b.className = 'hp-btn';
  b.textContent = label;
  b.title = title;
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

// Concentration results shown under a row until the next roll ("CON save 14 vs DC 12").
const concRolls = new Map();

function chip(text, title, cls = '') {
  const el = document.createElement('span');
  el.className = 'chip' + cls;
  el.title = title || '';
  el.textContent = text;
  return el;
}
function chipRemove(el, label, fn) {
  const rm = document.createElement('button');
  rm.textContent = '×';
  rm.title = label;
  rm.setAttribute('aria-label', label);
  rm.addEventListener('click', fn);
  el.appendChild(rm);
}

// Concentration: the spell, and after damage the CON save to keep it.
function renderConcentration(c, ctx, canEdit) {
  const { send } = ctx;
  const wrap = document.createDocumentFragment();
  const conc = chip(CONCENTRATION_ICON + ' Concentrating: ' + c.concentration,
    'Ends when this creature fails a CON save after damage, drops to 0 HP or is incapacitated', ' conc');
  if (canEdit) chipRemove(conc, 'End concentration', () => send('endConcentration', { id: c.id }));
  wrap.appendChild(conc);
  if (c.concentrationDc > 0) {
    const check = document.createElement('span');
    check.className = 'conc-check';
    check.appendChild(document.createTextNode('CON save DC ' + c.concentrationDc));
    if (canEdit) {
      const btn = (label, title, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.title = title;
        b.addEventListener('click', fn);
        check.appendChild(b);
      };
      const bonus = ctx.conSaveFor(c);
      if (bonus !== null) {
        btn('Roll', 'Roll d20 + CON save', async () => {
          let d;
          try {
            d = await rollBatch(`${c.name}: concentration save (DC ${c.concentrationDc})`, () => rollDie(20, 'd20 CON save'));
          } catch (err) {
            if (err instanceof RollCancelled) return;
            throw err;
          }
          const total = d + bonus;
          const passed = total >= c.concentrationDc;
          concRolls.set(c.id, `CON save ${total} (d20 ${d} ${bonus < 0 ? '−' : '+'} ${Math.abs(bonus)}) vs DC ${c.concentrationDc}: `
            + (passed ? 'still concentrating' : 'concentration lost'));
          send('resolveConcentration', { id: c.id, passed });
        });
      }
      btn('✓ Passed', 'Made the save: keep concentrating', () => { concRolls.delete(c.id); send('resolveConcentration', { id: c.id, passed: true }); });
      btn('✗ Failed', 'Failed the save: concentration ends', () => { concRolls.delete(c.id); send('resolveConcentration', { id: c.id, passed: false }); });
    }
    wrap.appendChild(check);
  }
  return wrap;
}

function renderConditions(c, ctx, canEdit) {
  const { send, rerender } = ctx;
  const condWrap = document.createElement('div');
  condWrap.className = 'conditions';
  if (c.concentration) condWrap.appendChild(renderConcentration(c, ctx, canEdit));
  // A character's exhaustion lives on its sheet.
  const ch = ctx.characterFor(c);
  const setExhaustion = (n) => send('updateCharacter', { id: ch.id, patch: { exhaustion: Math.max(0, Math.min(MAX_EXHAUSTION, n)) } });
  if (ch && ch.exhaustion > 0) {
    const ex = chip(`😩 Exhaustion ${ch.exhaustion}`, exhaustionText(ch.exhaustion, ch.rulesEdition), ' exh');
    if (canEdit) {
      [['−', 'One level less', -1], ['+', 'One level more', 1]].forEach(([t, label, d]) => {
        const b = document.createElement('button');
        b.textContent = t;
        b.title = label;
        b.setAttribute('aria-label', label);
        b.addEventListener('click', () => setExhaustion(ch.exhaustion + d));
        ex.appendChild(b);
      });
    }
    condWrap.appendChild(ex);
  }
  c.conditions.forEach((cond) => {
    const el = chip(conditionIcon(cond) + ' ' + cond, conditionDescription(cond));
    if (canEdit) chipRemove(el, 'Remove ' + cond, () => send('removeCondition', { id: c.id, condition: cond }));
    condWrap.appendChild(el);
  });
  (c.effects || []).forEach((e) => {
    const caster = e.casterId && ctx.combatantById(e.casterId);
    const el = chip(effectIcon(e.name) + ' ' + e.name,
      (caster ? 'From ' + caster.name : 'Spell effect') + (e.concentration ? ' — ends with their concentration' : ''), ' effect');
    if (canEdit || (caster && ctx.canControl(caster))) chipRemove(el, 'Remove ' + e.name, () => send('removeEffect', { id: c.id, effectId: e.id }));
    condWrap.appendChild(el);
  });

  const addCondBtn = document.createElement('button');
  addCondBtn.className = 'add-cond';
  addCondBtn.textContent = '+ condition';
  addCondBtn.addEventListener('click', () => {
    const menu = document.createElement('select');
    menu.style.fontSize = '11px';
    const opt = (value, text) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = text;
      menu.appendChild(o);
    };
    opt('', 'Choose…');
    CONDITIONS.forEach(([n]) => { if (!c.conditions.includes(n)) opt('c:' + n, conditionIcon(n) + ' ' + n); });
    if (ch && !(ch.exhaustion > 0)) opt('exhaustion', '😩 Exhaustion');
    opt('concentration', CONCENTRATION_ICON + ' Concentrating on…');
    opt('effect', '✨ Spell effect…');
    menu.addEventListener('change', () => {
      const v = menu.value;
      if (v.startsWith('c:')) send('addCondition', { id: c.id, condition: v.slice(2) });
      else if (v === 'exhaustion') setExhaustion(1);
      else if (v === 'concentration') ctx.onConcentrate(c);
      else if (v === 'effect') ctx.onAddEffect(c);
    });
    condWrap.replaceChild(menu, addCondBtn);
    menu.focus();
    menu.addEventListener('blur', () => rerender());
  });
  if (canEdit) condWrap.appendChild(addCondBtn);
  if (concRolls.has(c.id)) {
    const res = document.createElement('div');
    res.className = 'conc-result';
    res.textContent = concRolls.get(c.id);
    condWrap.appendChild(res);
  }
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

// Temporary HP: an editable field for whoever controls the combatant,
// a read-only tag for everyone else (only when there are some).
function renderTempHp(c, send, canEdit) {
  const temp = c.tempHp || 0;
  if (!canEdit) {
    const tag = document.createElement('span');
    tag.className = 'temp-tag';
    tag.textContent = '+' + temp + ' temp';
    tag.hidden = temp <= 0;
    return tag;
  }
  const label = document.createElement('label');
  label.className = 'temp-field' + (temp > 0 ? ' on' : '');
  label.title = 'Temporary HP — lost first when taking damage; a new source replaces it';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.inputMode = 'numeric';
  input.value = temp || '';
  input.placeholder = '0';
  input.setAttribute('aria-label', 'Temporary HP for ' + c.name);
  input.addEventListener('change', () => {
    const value = parseInt(input.value || '0', 10);
    if (Number.isFinite(value) && value >= 0) send('setTempHp', { id: c.id, value });
    else input.value = temp || '';
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  label.append(input, document.createTextNode('temp'));
  return label;
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
  pic.className = 'c-portrait' + (c.type === 'monster' ? ' mon' : ' pc') + (c.type === 'familiar' ? ' fam' : '');
  if (portrait) {
    const img = document.createElement('img');
    img.src = portrait;
    img.alt = '';
    pic.appendChild(img);
  } else {
    pic.textContent = ctx.glyphFor(c);
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
  const sheet = ctx.characterFor(c);
  if (sheet) {
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'insp-star' + (sheet.inspiration ? ' on' : '');
    star.textContent = sheet.inspiration ? '★' : '☆';
    star.title = sheet.inspiration ? 'Has Heroic Inspiration — click when it\'s used' : 'No Heroic Inspiration — click to give it';
    star.setAttribute('aria-label', 'Heroic Inspiration for ' + c.name);
    star.setAttribute('aria-pressed', String(!!sheet.inspiration));
    star.disabled = !canEdit;
    star.addEventListener('click', () => send('updateCharacter', { id: sheet.id, patch: { inspiration: !sheet.inspiration } }));
    nameLine.appendChild(star);
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
    main.appendChild(renderConditions(c, ctx, false));
    row.appendChild(main);
    const spacer = document.createElement('div');
    spacer.className = 'row-actions'; // empty: keeps the desktop grid, hidden on phones
    row.appendChild(spacer);
    return row;
  }

  // hp line
  const adjust = (delta) => send('adjustHP', { id: c.id, delta });
  const hpLine = document.createElement('div');
  hpLine.className = 'hp-line';
  if (canEdit) {
    hpLine.appendChild(mkHpBtn('−5', () => adjust(-5), '5 damage'));
    hpLine.appendChild(mkHpBtn('−1', () => adjust(-1), '1 damage'));
  }

  const hpVal = document.createElement('div');
  hpVal.className = 'hp-val';
  hpVal.innerHTML = '<span class="cur">' + Math.max(c.hp, 0) + '</span><span class="max"> / ' + c.maxHp + '</span>';
  hpLine.appendChild(hpVal);
  hpLine.appendChild(renderTempHp(c, send, canEdit));

  if (canEdit) {
    hpLine.appendChild(mkHpBtn('+1', () => adjust(1), 'Heal 1'));
    hpLine.appendChild(mkHpBtn('+5', () => adjust(5), 'Heal 5'));
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

  main.appendChild(renderConditions(c, ctx, canEdit));
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

// `conSaveFor(c)`: a PC's CON save bonus (null = no sheet: Passed/Failed
// only); `onConcentrate(c)` / `onAddEffect(c)`: open the spell dialog.
export function renderCombat(state, {
  send, rerender, portraitFor = () => '', notesFor = () => '', actionsFor = () => null,
  canControl = () => true, isDm = true, conSaveFor = () => null, onConcentrate = () => {}, onAddEffect = () => {},
  glyphFor = (c) => ((c.name || '?').trim().charAt(0) || '?').toUpperCase(), characterFor = () => null,
}) {
  const byId = new Map(state.combatants.map((c) => [c.id, c]));
  const ctx = {
    send, rerender, portraitFor, notesFor, actionsFor, canControl, isDm, conSaveFor, onConcentrate, onAddEffect, glyphFor,
    characterFor: (c) => (c.characterId ? characterFor(c) : null),
    combatantById: (id) => byId.get(id),
  };
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
