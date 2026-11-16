// Editor: rests and limited-use resources.
// - HP panel: Hit Dice left, Short rest (spend Hit Dice one at a time, then
//   finish to get short-rest features and pact slots back), Long rest.
// - Actions tab: the Resources list (uses, what brings them back) and the
//   rules edition for rests.
// - Spells tab: Pact Magic (which slots a short rest restores).
// The rest rules themselves run on the server (src/features/characters/rest.js).
import { $ } from '../../core/dom.js';
import { rollDie } from '../../core/dice.js';
import { store, cur, patchChar, touch, untouch } from '../store.js';
import { abilityMod, fmtMod } from '../rules.js';

const SIZES = [12, 10, 8, 6];
const RECHARGE_LABEL = { short: 'Short rest', long: 'Long rest', none: 'Manually' };
const entryId = () => Math.random().toString(36).slice(2, 10);

// Same parsing as the server: "3d10 + 2d6" -> { d6: 2, d8: 0, d10: 3, d12: 0 }.
export function parseHitDice(text) {
  const pool = { d6: 0, d8: 0, d10: 0, d12: 0 };
  const re = /(\d*)\s*d\s*(\d+)/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const key = 'd' + m[2];
    if (key in pool) pool[key] = Math.min(99, pool[key] + (m[1] === '' ? 1 : parseInt(m[1], 10)));
  }
  return pool;
}

function hitDice(c) {
  const total = parseHitDice(c.hitDice);
  const used = c.hitDiceUsed || {};
  return SIZES.map((s) => ({ size: s, total: total['d' + s], left: Math.max(0, total['d' + s] - (used['d' + s] || 0)) }))
    .filter((d) => d.total > 0);
}

const resourcesOf = (c) => (Array.isArray(c.resources) ? c.resources.map((r) => ({ ...r })) : []);

// Change locally (instant feedback) and send the field.
function change(prop, value) {
  const c = cur();
  if (!c) return;
  c[prop] = value;
  touch('f:' + prop);
  patchChar({ [prop]: value });
  refreshRestUi(c);
}

function say(text) {
  $('restMsg').textContent = text;
}

// ---- Hit Dice + short rest panel

function renderHitDice(c) {
  const dice = hitDice(c);
  $('hdLeft').textContent = dice.length
    ? dice.map((d) => `${d.left}/${d.total} d${d.size}`).join(' · ')
    : 'set them in the Hit Dice tile (e.g. 5d10)';

  const box = $('srDice');
  box.innerHTML = '';
  dice.forEach((d) => {
    const b = document.createElement('button');
    b.className = 'btn secondary small';
    b.textContent = `Roll d${d.size} (${d.left} left)`;
    b.disabled = d.left <= 0 || c.hpCurrent >= c.hpMax;
    b.addEventListener('click', () => spendDie(d.size));
    box.appendChild(b);
  });
  if (c.hpCurrent >= c.hpMax) {
    const full = document.createElement('span');
    full.className = 'inv-hint';
    full.textContent = 'At full HP.';
    box.appendChild(full);
  }
  const pact = c.pactMagic || {};
  $('srPactNote').textContent = pact.count > 0 && pact.level > 0 ? ` and ${pact.count} pact slot${pact.count === 1 ? '' : 's'}` : '';
}

function spendDie(size) {
  const c = cur();
  if (!c) return;
  const roll = rollDie(size);
  const con = abilityMod(c.abilities.con);
  const healed = Math.max(0, roll + con);
  const gained = Math.min(c.hpMax, c.hpCurrent + healed) - c.hpCurrent;
  untouch('f:hpCurrent', 'f:hitDiceUsed');
  store.send('spendHitDie', { id: c.id, die: size, roll });
  const line = document.createElement('div');
  line.textContent = `d${size}: ${roll} ${fmtMod(con).replace(/^([+-])/, '$1 ')} CON = ${healed} HP`
    + (gained < healed ? ` (${gained} to reach max)` : '');
  $('srLog').appendChild(line);
}

function closeShortRest() {
  $('shortRestPanel').hidden = true;
  $('srLog').innerHTML = '';
}

function finishShortRest() {
  const c = cur();
  if (!c) return;
  const back = resourcesOf(c).filter((r) => r.recharge === 'short' && r.used > 0).map((r) => r.name || 'a resource');
  const pact = c.pactMagic || {};
  const slot = (c.spellSlots || [])[pact.level - 1];
  const pactBack = pact.count > 0 && slot ? Math.min(pact.count, slot.used) : 0;
  if (pactBack) back.push(`${pactBack} pact slot${pactBack === 1 ? '' : 's'}`);
  untouch('f:resources', 'f:spellSlots');
  store.send('shortRest', { id: c.id });
  closeShortRest();
  say('Short rest finished' + (back.length ? ' — back: ' + back.join(', ') + '.' : '.'));
}

export function longRest() {
  const c = cur();
  if (!c) return;
  const hd = c.rulesEdition === '2014' ? 'half your Hit Dice (at least one)' : 'all your Hit Dice';
  if (!confirm(`Long rest for ${c.name || 'this character'}?\n\nHP back to max, temporary HP gone, every spell slot and resource back, and ${hd}.`)) return;
  untouch('f:hpCurrent', 'f:hpTemp', 'f:hitDiceUsed', 'f:spellSlots', 'f:resources');
  store.send('longRest', { id: c.id });
  closeShortRest();
  say('Long rest finished — HP, spell slots and resources restored.');
}

// ---- Resources list

function renderResources(c) {
  const list = $('resList');
  if (list.contains(document.activeElement)) return; // don't redraw under the cursor
  list.innerHTML = '';
  const resources = resourcesOf(c);
  if (!resources.length) {
    list.innerHTML = '<div class="inv-hint">No resources yet. Add the features you can use a limited number of times.</div>';
    return;
  }
  resources.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'res-row';

    const name = document.createElement('input');
    name.className = 'res-name';
    name.value = r.name;
    name.maxLength = 40;
    name.setAttribute('aria-label', 'Resource name');
    name.addEventListener('change', () => update(i, { name: name.value.trim() }));

    const uses = document.createElement('div');
    uses.className = 'res-uses';
    if (r.max <= 10) {
      // One pip per use: filled = available.
      for (let p = 0; p < r.max; p++) {
        const pip = document.createElement('button');
        pip.type = 'button';
        pip.className = 'pip' + (p < r.used ? ' used' : '');
        pip.title = p < r.used ? 'Used — click to get it back' : 'Available — click to use';
        pip.addEventListener('click', () => update(i, { used: p < r.used ? p : p + 1 }));
        uses.appendChild(pip);
      }
    } else {
      // Big pools (Lay on Hands, Ki at high level): − left / max +.
      const minus = document.createElement('button');
      minus.className = 'res-step';
      minus.textContent = '−';
      minus.title = 'Use one';
      minus.addEventListener('click', () => update(i, { used: Math.min(r.max, r.used + 1) }));
      const left = document.createElement('span');
      left.className = 'res-left';
      left.textContent = `${r.max - r.used} / ${r.max}`;
      const plus = document.createElement('button');
      plus.className = 'res-step';
      plus.textContent = '+';
      plus.title = 'Get one back';
      plus.addEventListener('click', () => update(i, { used: Math.max(0, r.used - 1) }));
      uses.append(minus, left, plus);
    }

    const max = document.createElement('input');
    max.type = 'number';
    max.min = '0';
    max.max = '999';
    max.className = 'res-max';
    max.value = r.max;
    max.title = 'Uses';
    max.setAttribute('aria-label', 'Uses of ' + (r.name || 'resource'));
    max.addEventListener('change', () => {
      const m = Math.max(0, Math.min(999, parseInt(max.value, 10) || 0));
      update(i, { max: m, used: Math.min(r.used, m) });
    });

    const recharge = document.createElement('select');
    recharge.className = 'res-recharge';
    recharge.setAttribute('aria-label', 'Comes back on');
    Object.entries(RECHARGE_LABEL).forEach(([v, label]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      recharge.appendChild(o);
    });
    recharge.value = r.recharge;
    recharge.addEventListener('change', () => update(i, { recharge: recharge.value }));

    const rm = document.createElement('button');
    rm.className = 'res-rm';
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.addEventListener('click', () => {
      const next = resourcesOf(cur());
      next.splice(i, 1);
      change('resources', next);
    });

    row.append(name, uses, max, recharge, rm);
    list.appendChild(row);
  });
}

function update(i, patch) {
  const next = resourcesOf(cur());
  if (!next[i]) return;
  next[i] = { ...next[i], ...patch };
  change('resources', next);
}

function addResource() {
  const c = cur();
  const name = $('resName').value.trim();
  if (!c || !name) return;
  const max = Math.max(1, Math.min(999, parseInt($('resMax').value, 10) || 1));
  change('resources', [...resourcesOf(c), { id: entryId(), name, max, used: 0, recharge: $('resRecharge').value }]);
  $('resName').value = '';
  $('resMax').value = '1';
}

// ---- Pact Magic + rules edition

function renderPact(c) {
  const pact = c.pactMagic || { level: 0, count: 0 };
  if (document.activeElement !== $('pactCount')) $('pactCount').value = pact.count || 0;
  if (document.activeElement !== $('pactLevel')) $('pactLevel').value = pact.level || 0;
}

function changePact() {
  const count = Math.max(0, Math.min(9, parseInt($('pactCount').value, 10) || 0));
  const level = Math.max(0, Math.min(9, parseInt($('pactLevel').value, 10) || 0));
  change('pactMagic', { count, level });
}

export function refreshRestUi(c) {
  renderHitDice(c);
  renderResources(c);
  renderPact(c);
  if (document.activeElement !== $('rulesEdition')) $('rulesEdition').value = c.rulesEdition === '2014' ? '2014' : '2024';
}

// Opening another character: fresh short-rest panel and no old message.
export function resetRestUi() {
  closeShortRest();
  say('');
}

export function initRest() {
  $('shortRestBtn').addEventListener('click', () => {
    const panel = $('shortRestPanel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) say('');
  });
  $('srCancel').addEventListener('click', closeShortRest);
  $('srFinish').addEventListener('click', finishShortRest);
  $('longRestBtn2').addEventListener('click', longRest);
  $('resAddBtn').addEventListener('click', addResource);
  $('resName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addResource(); });
  $('pactCount').addEventListener('change', changePact);
  $('pactLevel').addEventListener('change', changePact);
  $('rulesEdition').addEventListener('change', (e) => change('rulesEdition', e.target.value));
}
