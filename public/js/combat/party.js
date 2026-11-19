// "Add characters" panel on the combat page: lists saved character sheets
// grouped by campaign so the DM can drop them into the fight with their
// initiative rolls, one by one or a whole campaign at once. An empty roll
// means the server rolls d20 + DEX.
import { $ } from '../core/dom.js';
import { isDm, myCharacterId } from '../core/identity.js';

const view = {
  characters: [],
  campaigns: [],
  combatants: [],
  typed: {}, // characterId -> initiative typed in but not added yet
};
let send = () => {};

const dexMod = (ch) => Math.floor((((ch.abilities && ch.abilities.dex) || 10) - 10) / 2);
function signed(n) { return (n >= 0 ? '+' : '') + n; }
function campaignName(id) {
  const c = view.campaigns.find((x) => x.id === id);
  return c ? c.name : '';
}

// [{ name, characters }] in campaign order, "No campaign" last; empty
// groups are skipped. Characters whose campaign was deleted count as none.
function groups() {
  // A player only adds themselves.
  if (!isDm()) {
    const me = view.characters.filter((ch) => ch.id === myCharacterId());
    return me.length ? [{ name: 'Your character', characters: me, solo: true }] : [];
  }
  const out = view.campaigns.map((c) => ({
    name: c.name,
    characters: view.characters.filter((ch) => ch.campaignId === c.id),
  }));
  // With no campaigns at all, "No campaign" would read oddly.
  out.push({ name: view.campaigns.length ? 'No campaign' : 'All characters', characters: view.characters.filter((ch) => !campaignName(ch.campaignId)) });
  return out.filter((g) => g.characters.length);
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

function renderRow(ch) {
  const row = document.createElement('div');
  row.className = 'party-row';
  const mod = dexMod(ch);

  const who = document.createElement('div');
  who.className = 'party-who with-pic';
  const pic = document.createElement('div');
  pic.className = 'mini-pic pc';
  if (ch.portrait) {
    const img = document.createElement('img');
    img.src = ch.portrait;
    img.alt = '';
    pic.appendChild(img);
  } else {
    pic.textContent = ((ch.name || '?').trim().charAt(0) || '?').toUpperCase();
  }
  const text = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'party-name';
  name.textContent = ch.name || 'Unnamed character';
  const sub = document.createElement('div');
  sub.className = 'party-sub';
  sub.textContent = ['Lv ' + (ch.level || 1), ch.class, 'AC ' + ch.ac, ch.hpCurrent + '/' + ch.hpMax + ' HP', 'Init ' + signed(mod)]
    .filter(Boolean).join(' · ');
  text.append(name, sub);
  who.append(pic, text);
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

// A character's familiar (from its sheet), under the character: add it
// with its own initiative roll.
function renderFamiliarRow(ch) {
  const fam = ch.familiar;
  const row = document.createElement('div');
  row.className = 'party-row party-fam';
  const who = document.createElement('div');
  who.className = 'party-who';
  const name = document.createElement('div');
  name.className = 'party-sub';
  name.textContent = `🐾 ${fam.name ? fam.name + ' — ' : ''}${fam.form} (${fam.creatureType} familiar) · AC ${fam.ac} · ${fam.hp}/${fam.hpMax} HP`;
  who.appendChild(name);
  row.appendChild(who);
  const there = view.combatants.find((c) => c.type === 'familiar' && c.ownerId === ch.id);
  if (there) {
    const tag = document.createElement('span');
    tag.className = 'party-in';
    tag.textContent = 'In combat · init ' + there.init;
    row.appendChild(tag);
  } else {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn secondary small';
    add.textContent = 'Add familiar';
    add.title = fam.hp > 0 ? 'Rolls its own initiative' : 'At 0 HP: cast Find Familiar again on the sheet';
    add.disabled = fam.hp <= 0;
    add.addEventListener('click', () => send('addFamiliarToCombat', { characterId: ch.id }));
    row.appendChild(add);
  }
  return row;
}

function renderGroup(g) {
  const wrap = document.createElement('div');
  wrap.className = 'party-group';
  const waiting = g.characters.filter((ch) => !inCombat(ch));
  const head = document.createElement('div');
  head.className = 'party-group-head';
  const title = document.createElement('div');
  title.className = 'party-group-name';
  title.textContent = g.name;
  const count = document.createElement('span');
  count.className = 'party-group-count';
  count.textContent = g.characters.length;
  title.appendChild(count);
  head.appendChild(title);
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'btn secondary small';
  all.textContent = 'Add all';
  all.title = 'Add every character in ' + g.name + ' that isn\'t in combat yet';
  all.disabled = waiting.length === 0;
  all.hidden = !!g.solo;
  all.addEventListener('click', () => waiting.forEach(addToCombat));
  head.appendChild(all);
  wrap.appendChild(head);
  g.characters.forEach((ch) => {
    wrap.appendChild(renderRow(ch));
    if (ch.familiar) wrap.appendChild(renderFamiliarRow(ch));
  });
  return wrap;
}

export function renderParty() {
  const list = $('partyList');
  // Don't rebuild under the DM's cursor; catch up when they leave the field.
  if (list.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
    list.dataset.stale = '1';
    return;
  }
  delete list.dataset.stale;
  list.innerHTML = '';
  const gs = groups();
  if (gs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = 'No character sheets yet — create them on the <a href="characters.html">Characters</a> page.';
    list.appendChild(empty);
    return;
  }
  gs.forEach((g) => list.appendChild(renderGroup(g)));
}

export function setPartyData(patch) {
  Object.assign(view, patch);
  renderParty();
}

export function initParty(sendFn) {
  send = sendFn;
  $('partyList').addEventListener('focusout', () => {
    setTimeout(() => { if ($('partyList').dataset.stale) renderParty(); }, 0);
  });
  renderParty();
}
