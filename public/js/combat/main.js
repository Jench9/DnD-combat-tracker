import { $ } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { CONDITIONS } from './conditions.js';
import { renderCombat } from './render.js';
import { setPartyData } from './party.js';
import { setBestiary } from './bestiary.js';
import { initAddPanels, syncAddPanels } from './addPanels.js';
import { createPortraitLookup } from '../core/portraits.js';
import { isDm, ownsCharacter, myCharacterId } from '../core/identity.js';
import { renderMeStrip } from './meStrip.js';
import { combatActionsFor } from '../core/combatActions.js';
import { abilityMod, profBonusForLevel } from '../characters/rules.js';
import { d20Penalty } from '../core/exhaustion.js';
import { openSpellDialog } from '../core/spellDialog.js';

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
let spells = []; // the spell library

const socket = connectSocket({
  handlers: {
    state: (msg) => { state = msg.state; render(); setPartyData({ combatants: state.combatants }); syncAddPanels({ characters, combatants: state.combatants }); },
    itemState: (msg) => { items = msg.items; render(); },
    spellState: (msg) => { spells = msg.spells; render(); },
    charState: (msg) => {
      characters = msg.characters;
      pics.setCharacters(msg.characters);
      render(); // portraits may have changed
      setPartyData({ characters: msg.characters });
      syncAddPanels({ characters, combatants: state.combatants });
    },
    monsterState: (msg) => {
      pics.setMonsters(msg.monsters);
      render();
      if (isDm()) setBestiary(msg.monsters);
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

// A PC's actions (attacks, items, spells), or null (core/combatActions.js).
const actionsFor = (c) => combatActionsFor(c, {
  characters, items, spells, state, send, isDm: isDm(), ownsCharacter, monsterFor: pics.monsterFor,
});

// A PC's CON saving throw bonus, from their sheet (null without one).
function conSaveFor(c) {
  const ch = c.characterId && characters.find((x) => x.id === c.characterId);
  if (!ch) return null;
  return abilityMod(ch.abilities?.con) + (ch.saveProf?.con ? profBonusForLevel(ch.level) : 0) + d20Penalty(ch);
}

function render() {
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && $('list').contains(el)) { stale = true; return; }
  stale = false;
  renderCombat(state, {
    send, rerender: render, portraitFor, notesFor, actionsFor, isDm: isDm(), conSaveFor, glyphFor: pics.glyphFor, characterFor: pics.characterFor,
    onConcentrate: (c) => openSpellDialog({ state, caster: c, spell: '', concentration: true, send, canTargetHidden: isDm() }),
    onAddEffect: (c) => openSpellDialog({ state, target: c, send, canTargetHidden: isDm() }),
    canControl: (c) => isDm() || (!!(c.characterId || c.ownerId) && ownsCharacter(c.characterId || c.ownerId)), // ownerId: a familiar
  });
  // Players may only end their own turn.
  const active = state.combatants[state.activeIndex];
  const controller = active && (active.characterId || active.ownerId);
  const mayAdvance = isDm() || (!!controller && ownsCharacter(controller));
  $('nextTurnBtn').disabled = !mayAdvance;
  $('nextTurnBtn').title = mayAdvance ? '' : 'Only the DM (or the player whose turn it is) can end the turn';
  // Phones: your turn + HP above the bottom bar (players only).
  const me = myCharacterId();
  renderMeStrip(state, { mine: !isDm() && me ? state.combatants.find((c) => c.characterId === me) : undefined, send, mayAdvance });
}
$('list').addEventListener('focusout', () => setTimeout(() => { if (stale) render(); }, 0));

initAddPanels($('addPanels'), { send, page: 'combat' });

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
