// "Add characters" panel on the combat page: lists saved character sheets
// (filtered by campaign) so the DM can drop them into the fight with
// their initiative rolls. An empty roll means the server rolls d20 + DEX.
import { $ } from '../core/dom.js';

const FILTER_KEY = 'kit.campaignFilter'; // shared with the characters page
const ALL = 'all';
const NONE = 'none';

const view = {
  characters: [],
  campaigns: [],
  combatants: [],
  filter: ALL,
  typed: {}, // characterId -> initiative typed in but not added yet
  campaignsLoaded: false,
};
let send = () => {};

const dexMod = (ch) => Math.floor((((ch.abilities && ch.abilities.dex) || 10) - 10) / 2);
function signed(n) { return (n >= 0 ? '+' : '') + n; }
function campaignName(id) {
  const c = view.campaigns.find((x) => x.id === id);
  return c ? c.name : '';
}

function saveFilter() {
  try { localStorage.setItem(FILTER_KEY, view.filter); } catch { /* storage unavailable */ }
}

function shown() {
  if (view.filter === ALL) return view.characters;
  if (view.filter === NONE) return view.characters.filter((c) => !campaignName(c.campaignId));
  return view.characters.filter((c) => c.campaignId === view.filter);
}

function inCombat(ch) {
  return view.combatants.find((c) => c.characterId === ch.id);
}

function parseInit(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function addToCombat(ch) {
  send('addCharacterToCombat', { characterId: ch.id, init: parseInit(view.typed[ch.id]) });
  delete view.typed[ch.id];
}

function renderSelect() {
  const sel = $('partyCampaign');
  if (view.campaignsLoaded && view.filter !== ALL && view.filter !== NONE && !campaignName(view.filter)) {
    view.filter = ALL;
  }
  sel.innerHTML = '';
  const opts = [[ALL, 'All characters'], ...view.campaigns.map((c) => [c.id, c.name]), [NONE, 'No campaign']];
  opts.forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    sel.appendChild(o);
  });
  sel.value = view.filter;
}

function renderRow(ch) {
  const row = document.createElement('div');
  row.className = 'party-row';
  const mod = dexMod(ch);

  const who = document.createElement('div');
  who.className = 'party-who';
  const name = document.createElement('div');
  name.className = 'party-name';
  name.textContent = ch.name || 'Unnamed character';
  const sub = document.createElement('div');
  sub.className = 'party-sub';
  sub.textContent = ['Lv ' + (ch.level || 1), ch.class, 'AC ' + ch.ac, ch.hpCurrent + '/' + ch.hpMax + ' HP', 'Init ' + signed(mod)]
    .filter(Boolean).join(' · ');
  who.append(name, sub);
  row.appendChild(who);

  const fighting = inCombat(ch);
  if (fighting) {
    const tag = document.createElement('span');
    tag.className = 'party-in';
    tag.textContent = 'In combat · init ' + fighting.init;
    row.appendChild(tag);
    return row;
  }

  const controls = document.createElement('div');
  controls.className = 'party-controls';
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'party-init';
  input.placeholder = 'd20' + signed(mod);
  input.title = 'Initiative roll (leave empty to roll automatically)';
  input.value = view.typed[ch.id] ?? '';
  input.addEventListener('input', () => { view.typed[ch.id] = input.value; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addToCombat(ch); });

  const roll = document.createElement('button');
  roll.type = 'button';
  roll.className = 'btn secondary small';
  roll.textContent = '🎲';
  roll.title = 'Roll d20 ' + signed(mod);
  roll.addEventListener('click', () => {
    input.value = 1 + Math.floor(Math.random() * 20) + mod;
    view.typed[ch.id] = input.value;
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn small';
  add.textContent = 'Add';
  add.addEventListener('click', () => addToCombat(ch));

  controls.append(input, roll, add);
  row.appendChild(controls);
  return row;
}

export function renderParty() {
  const list = $('partyList');
  // Don't rebuild under the DM's cursor; catch up when they leave the field.
  if (list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
    list.dataset.stale = '1';
    return;
  }
  delete list.dataset.stale;
  renderSelect();
  list.innerHTML = '';
  const chars = shown();
  if (chars.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = view.characters.length
      ? 'No characters in this campaign.'
      : 'No character sheets yet — create them on the <a href="characters.html">Characters</a> page.';
    list.appendChild(empty);
  } else {
    chars.forEach((ch) => list.appendChild(renderRow(ch)));
  }
  $('partyAddAllBtn').disabled = !chars.some((ch) => !inCombat(ch));
}

export function setPartyData(patch) {
  Object.assign(view, patch);
  if (patch.campaigns) view.campaignsLoaded = true;
  renderParty();
}

export function initParty(sendFn) {
  send = sendFn;
  try { view.filter = localStorage.getItem(FILTER_KEY) || ALL; } catch { /* storage unavailable */ }

  $('partyCampaign').addEventListener('change', (e) => {
    view.filter = e.target.value;
    saveFilter();
    renderParty();
  });
  $('partyAddAllBtn').addEventListener('click', () => {
    shown().filter((ch) => !inCombat(ch)).forEach(addToCombat);
  });
  $('partyList').addEventListener('focusout', () => {
    setTimeout(() => { if ($('partyList').dataset.stale) renderParty(); }, 0);
  });
  renderParty();
}
