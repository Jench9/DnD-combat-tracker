// The "Allies" and "Enemies" add panels, shared by the Combat Tracker and
// the Battle Map. Both are <details> that open and close; the open state is
// remembered per browser and page.
//
//   Allies  — saved characters (+ familiars) by campaign (combat/party.js);
//             players see only their own character ("Join the battle").
//             DM: quick add an ally that has no sheet.
//   Enemies — DM only: search the monster library (combat/bestiary.js),
//             add hidden for an ambush, quick add an enemy.
//
//   initAddPanels(container, { send, page }) builds them and starts party.js
//   and bestiary.js; the page then feeds setPartyData / setBestiary as
//   before, and calls syncAddPanels() after state or sheet updates.
import { isDm, myCharacterId } from '../core/identity.js';
import { rollBatch, rollDie, RollCancelled } from '../core/dice.js';
import { initParty } from './party.js';
import { initBestiary } from './bestiary.js';

let page = 'combat';
const touched = new Set(); // panels the user opened/closed this visit

const storeKey = (name) => `kit-add-${page}-${name}`;
function savedOpen(name, fallback) {
  try {
    const v = localStorage.getItem(storeKey(name));
    return v === null ? fallback : v === '1';
  } catch { return fallback; }
}

function panel(name, title, note, extraClass = '') {
  const det = document.createElement('details');
  det.className = `panel add-panel ${name} ${extraClass}`.trim();
  det.id = name + 'Panel';
  const sum = document.createElement('summary');
  sum.innerHTML = title;
  if (note) {
    const n = document.createElement('span');
    n.className = 'add-note';
    n.innerHTML = note;
    sum.appendChild(n);
  }
  const body = document.createElement('div');
  body.className = 'add-body';
  det.append(sum, body);
  det.open = savedOpen(name, page === 'combat');
  sum.addEventListener('click', () => touched.add(name)); // a person, not syncAddPanels
  det.addEventListener('toggle', () => {
    if (!touched.has(name)) return;
    try { localStorage.setItem(storeKey(name), det.open ? '1' : '0'); } catch { /* storage blocked */ }
  });
  return { det, body };
}

const sub = (text) => {
  const d = document.createElement('div');
  d.className = 'add-sub';
  d.textContent = text;
  return d;
};

// Name / initiative / AC / HP + Add. An empty initiative rolls a d20
// (hand dice ask for it).
function quickAdd(kind, send) {
  const wrap = document.createElement('div');
  wrap.className = 'add-form';
  const field = (label, type, placeholder, attrs = {}) => {
    const f = document.createElement('div');
    f.className = 'field';
    const l = document.createElement('label');
    l.textContent = label;
    const i = document.createElement('input');
    i.type = type;
    i.placeholder = placeholder;
    Object.assign(i, attrs);
    l.htmlFor = i.id = `qa-${kind}-${label.replace(/\W+/g, '').toLowerCase()}`;
    f.append(l, i);
    wrap.appendChild(f);
    return i;
  };
  const name = field('Name', 'text', kind === 'ally' ? 'e.g. Town guard' : 'e.g. Goblin archer', { maxLength: 30 });
  const init = field('Initiative', 'number', 'd20');
  const ac = field('AC', 'number', '10');
  const hp = field('Max HP', 'number', '1');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.style.height = '38px';
  btn.textContent = 'Add';
  wrap.appendChild(btn);
  const go = async () => {
    const n = name.value.trim();
    if (!n) { name.focus(); return; }
    let roll = parseInt(init.value, 10);
    if (!Number.isFinite(roll)) {
      try {
        roll = await rollBatch(`${n}: initiative`, () => rollDie(20, 'd20 initiative'));
      } catch (err) {
        if (err instanceof RollCancelled) return;
        throw err;
      }
    }
    const max = parseInt(hp.value, 10) || 1;
    send('addCombatant', {
      name: n, init: roll, ac: parseInt(ac.value, 10) || 10, hp: max, maxHp: max,
      type: kind === 'ally' ? 'pc' : 'monster',
      ...(kind === 'enemy' ? { hidden: document.getElementById('addHidden').checked } : {}),
    });
    [name, init, ac, hp].forEach((i) => { i.value = ''; });
    name.focus();
  };
  btn.addEventListener('click', go);
  [name, init, ac, hp].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }));
  return wrap;
}

export function initAddPanels(container, { send, page: p = 'combat' }) {
  page = p;
  container.innerHTML = '';

  const allies = panel('allies', '🛡 <span class="dm-only">Allies</span><span class="player-only">Join the battle</span>',
    '<span class="dm-only">characters, familiars, NPC allies</span>');
  const party = document.createElement('div');
  party.className = 'party-list';
  party.id = 'partyList';
  const hint = document.createElement('div');
  hint.className = 'party-hint';
  hint.textContent = 'Type the initiative roll, or leave it empty to roll d20 + DEX automatically.'
    + (page === 'map' ? ' Then drag the new token from “Not on the map” onto the grid.' : '');
  allies.body.append(party, hint);
  const allyQuick = document.createElement('div');
  allyQuick.className = 'dm-only';
  allyQuick.append(sub('Quick add an ally (no sheet)'), quickAdd('ally', send));
  allies.body.appendChild(allyQuick);
  container.appendChild(allies.det);

  const enemies = panel('enemies', '⚔ Enemies', '<a href="monsters.html">Manage monsters →</a>', 'dm-only');
  enemies.det.querySelector('.add-note a').addEventListener('click', (e) => e.stopPropagation());
  const hidden = document.createElement('label');
  hidden.className = 'hidden-check';
  hidden.innerHTML = '<input type="checkbox" id="addHidden"> Add hidden from players (reveal them later with 👁)';
  const search = document.createElement('input');
  search.id = 'bestiarySearch';
  search.className = 'bestiary-search';
  search.type = 'search';
  search.placeholder = '🔍 Search monsters to add…';
  search.setAttribute('aria-label', 'Search monsters');
  const list = document.createElement('div');
  list.className = 'party-list';
  list.id = 'bestiaryList';
  enemies.body.append(hidden, search, list, sub('Quick add an enemy (not saved to the library)'), quickAdd('enemy', send));
  container.appendChild(enemies.det);
  // Typing a search opens nothing by itself; opening the panel focuses it.
  enemies.det.addEventListener('toggle', () => { if (enemies.det.open && touched.has('enemies')) search.focus({ preventScroll: true }); });

  initParty(send);
  if (isDm()) initBestiary(send); // players never get the library's stat blocks
}

// A player who isn't in the fight yet: open "Join the battle" (until they
// open or close it themselves); hide it when they have no sheet.
export function syncAddPanels({ characters, combatants }) {
  if (isDm()) return;
  const det = document.getElementById('alliesPanel');
  if (!det) return;
  const me = (characters || []).some((ch) => ch.id === myCharacterId());
  det.hidden = !me;
  const inFight = (combatants || []).some((c) => c.characterId === myCharacterId());
  if (!touched.has('allies')) det.open = me && (!inFight || savedOpen('allies', page === 'combat'));
}
