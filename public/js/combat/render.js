// Pure view: draws the combatant list from a combat state.
// `send(type, payload)` talks to the server; `rerender()` redraws the list;
// `portraitFor(combatant)` returns a portrait data URL or ''.
import { CONDITIONS, conditionDescription } from './conditions.js';

function mkHpBtn(label, fn) {
  const b = document.createElement('button');
  b.className = 'hp-btn';
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

function deathSaveDots(c, kind, filled, send) {
  const wrap = document.createElement('span');
  wrap.className = 'save-dots';
  for (let i = 0; i < 3; i++) {
    const d = document.createElement('span');
    d.className = `dot ${kind}` + (i < filled ? ' filled' : '');
    d.addEventListener('click', () => send('toggleDeathSave', { id: c.id, kind, index: i }));
    wrap.appendChild(d);
  }
  return wrap;
}

function renderConditions(c, send, rerender) {
  const condWrap = document.createElement('div');
  condWrap.className = 'conditions';
  c.conditions.forEach((cond) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.title = conditionDescription(cond);
    chip.textContent = cond;
    const rm = document.createElement('button');
    rm.textContent = '×';
    rm.addEventListener('click', () => send('removeCondition', { id: c.id, condition: cond }));
    chip.appendChild(rm);
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
  condWrap.appendChild(addCondBtn);
  return condWrap;
}

function renderRow(c, idx, state, send, rerender, portraitFor) {
  const row = document.createElement('div');
  row.className = 'row' + (idx === state.activeIndex ? ' active' : '') + (c.hp <= 0 ? ' down' : '');

  // Initiative is editable: fix a typo or apply a re-roll; the list re-sorts.
  const badge = document.createElement('input');
  badge.type = 'number';
  badge.className = 'init-badge';
  badge.value = c.init;
  badge.title = 'Initiative — click to change';
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
  const portrait = portraitFor(c);
  if (portrait) {
    const img = document.createElement('img');
    img.className = 'c-portrait' + (c.type === 'pc' ? ' pc' : ' mon');
    img.src = portrait;
    img.alt = '';
    nameLine.appendChild(img);
  } else {
    const dot = document.createElement('span');
    dot.className = c.type === 'pc' ? 'pc-dot' : 'mon-dot';
    nameLine.appendChild(dot);
  }

  const nameInput = document.createElement('input');
  nameInput.className = 'cname';
  nameInput.value = c.name;
  nameInput.addEventListener('change', () => send('renameCombatant', { id: c.id, name: nameInput.value }));
  nameLine.appendChild(nameInput);

  const acTag = document.createElement('span');
  acTag.className = 'ac-tag';
  acTag.textContent = 'AC ' + c.ac;
  nameLine.appendChild(acTag);
  main.appendChild(nameLine);

  // hp line
  const adjust = (delta) => send('adjustHP', { id: c.id, delta });
  const hpLine = document.createElement('div');
  hpLine.className = 'hp-line';
  hpLine.appendChild(mkHpBtn('−', () => adjust(-5)));
  hpLine.appendChild(mkHpBtn('−', () => adjust(-1)));

  const hpVal = document.createElement('div');
  hpVal.className = 'hp-val';
  hpVal.innerHTML = '<span class="cur">' + Math.max(c.hp, 0) + '</span><span class="max"> / ' + c.maxHp + '</span>';
  hpLine.appendChild(hpVal);

  hpLine.appendChild(mkHpBtn('+', () => adjust(1)));
  hpLine.appendChild(mkHpBtn('+', () => adjust(5)));

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
    ds.appendChild(deathSaveDots(c, 'success', c.deathSuccess, send));
    ds.appendChild(document.createTextNode(' F:'));
    ds.appendChild(deathSaveDots(c, 'fail', c.deathFail, send));
    main.appendChild(ds);
  }

  main.appendChild(renderConditions(c, send, rerender));
  row.appendChild(main);

  const actions = document.createElement('div');
  actions.className = 'row-actions';
  const rm = document.createElement('button');
  rm.className = 'remove-btn';
  rm.textContent = 'Remove';
  rm.addEventListener('click', () => send('removeCombatant', { id: c.id }));
  actions.appendChild(rm);
  row.appendChild(actions);

  return row;
}

export function renderCombat(state, { send, rerender, portraitFor = () => '' }) {
  document.getElementById('roundNum').textContent = state.round;
  const list = document.getElementById('list');
  list.innerHTML = '';

  if (state.combatants.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No combatants yet — add characters and monsters above, then hit "Next turn" to start.';
    list.appendChild(empty);
    return;
  }

  if (state.activeIndex >= state.combatants.length) state.activeIndex = 0;

  state.combatants.forEach((c, idx) => {
    list.appendChild(renderRow(c, idx, state, send, rerender, portraitFor));
  });
}
