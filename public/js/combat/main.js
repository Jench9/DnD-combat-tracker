import { $ } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { CONDITIONS } from './conditions.js';
import { renderCombat } from './render.js';

renderNav();

// Quick-reference conditions list
const condRefEl = $('condRef');
CONDITIONS.forEach(([name, desc]) => {
  const dt = document.createElement('dt'); dt.textContent = name;
  const dd = document.createElement('dd'); dd.textContent = desc;
  condRefEl.append(dt, dd);
});

let state = { round: 1, activeIndex: 0, combatants: [] };

const socket = connectSocket({
  handlers: {
    state: (msg) => { state = msg.state; render(); },
  },
});
const send = socket.send;

function render() {
  renderCombat(state, { send, rerender: render });
}

// ---- add combatant
let selectedType = 'pc';
$('typeToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-type]');
  if (!btn) return;
  selectedType = btn.dataset.type;
  document.querySelectorAll('#typeToggle button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
});

$('addBtn').addEventListener('click', () => {
  const name = $('inpName').value.trim();
  const init = parseInt($('inpInit').value, 10);
  const ac = parseInt($('inpAC').value, 10) || 10;
  const hp = parseInt($('inpHP').value, 10) || 1;
  if (!name || isNaN(init)) {
    $('inpName').focus();
    return;
  }
  send('addCombatant', { name, init, ac, hp, maxHp: hp, type: selectedType });
  ['inpName', 'inpInit', 'inpAC', 'inpHP'].forEach((id) => { $(id).value = ''; });
  $('inpName').focus();
});

// ---- toolbar
$('sortBtn').addEventListener('click', () => {
  const activeId = state.combatants[state.activeIndex] ? state.combatants[state.activeIndex].id : null;
  send('sortInit');
  if (activeId) state.activeIndex = state.combatants.findIndex((c) => c.id === activeId);
});

$('clearBtn').addEventListener('click', () => {
  if (state.combatants.length && !confirm('Clear all combatants and reset the round?')) return;
  send('clearAll');
});

$('nextTurnBtn').addEventListener('click', () => send('nextTurn'));
