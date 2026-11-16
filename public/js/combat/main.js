import { $ } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { CONDITIONS } from './conditions.js';
import { renderCombat } from './render.js';
import { initParty, setPartyData } from './party.js';
import { initBestiary, setBestiary } from './bestiary.js';
import { createPortraitLookup } from '../core/portraits.js';
import { isDm, ownsCharacter } from '../core/identity.js';
import { renderActions } from '../core/attacks.js';

renderNav();

// Quick-reference conditions list
const condRefEl = $('condRef');
CONDITIONS.forEach(([name, desc]) => {
  const dt = document.createElement('dt'); dt.textContent = name;
  const dd = document.createElement('dd'); dd.textContent = desc;
  condRefEl.append(dt, dd);
});

let state = { round: 1, activeIndex: 0, combatants: [] };
const pics = createPortraitLookup();
let characters = []; // saved sheets: inventories for the Actions section
let items = []; // the item library

const socket = connectSocket({
  handlers: {
    state: (msg) => { state = msg.state; render(); setPartyData({ combatants: state.combatants }); },
    itemState: (msg) => { items = msg.items; render(); },
    charState: (msg) => {
      characters = msg.characters;
      pics.setCharacters(msg.characters);
      render(); // portraits may have changed
      setPartyData({ characters: msg.characters });
    },
    monsterState: (msg) => {
      pics.setMonsters(msg.monsters);
      render();
      setBestiary(msg.monsters);
    },
    campaignState: (msg) => setPartyData({ campaigns: msg.campaigns }),
  },
});
const send = socket.send;

// Don't rebuild the list while someone is typing in it (initiative or
// name); catch up as soon as they leave the field.
let stale = false;
const { portraitFor } = pics;
const notesFor = (c) => (pics.monsterFor(c) || {}).notes || '';

// A PC's actions (attacks from equipped weapons, usable items) as a
// function that fills a container, or null. Using an item spends it from
// the character's inventory.
function actionsFor(c) {
  const ch = c.characterId && characters.find((x) => x.id === c.characterId);
  if (!ch) return null;
  return (container) => renderActions(container, {
    character: ch,
    items,
    canUse: ownsCharacter(ch.id),
    onUse: (entryId) => send('updateCharacter', {
      id: ch.id,
      patch: { inventory: ch.inventory.map((e) => (e.id === entryId ? { ...e, qty: Math.max(0, e.qty - 1) } : e)) },
    }),
  });
}
function render() {
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && $('list').contains(el)) { stale = true; return; }
  stale = false;
  renderCombat(state, {
    send, rerender: render, portraitFor, notesFor, actionsFor, isDm: isDm(),
    canControl: (c) => isDm() || (!!c.characterId && ownsCharacter(c.characterId)),
  });
  // Players may only end their own turn.
  const active = state.combatants[state.activeIndex];
  const mayAdvance = isDm() || (!!active && !!active.characterId && ownsCharacter(active.characterId));
  $('nextTurnBtn').disabled = !mayAdvance;
  $('nextTurnBtn').title = mayAdvance ? '' : 'Only the DM (or the player whose turn it is) can end the turn';
}
$('list').addEventListener('focusout', () => setTimeout(() => { if (stale) render(); }, 0));

initParty(send);
initBestiary(send);

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
