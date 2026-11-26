// Details card for a token on the battle map, so players don't have to
// switch to the Combat Tracker: HP (or the health word players get for
// monsters), AC, initiative, concentration, conditions with their rules,
// spell effects, and for characters a few sheet numbers (speed, passive
// Perception, spell save DC, slots, resources).
//
// Shown on mouse hover (it stays while the pointer moves onto it), on
// keyboard focus, and on click/tap (pinned until clicked again, Esc or a
// click elsewhere). A player's own character also gets its Actions
// (Attack, Cast, items) — the DM gets them for characters on a pinned card.
// It only uses what this browser already received — the server filters
// what players get, so nothing secret can show up here.
//
//   const card = initTokenCard({ getView, lookup, isDragging, actionsFor(c), isDm() });
//   card.refresh()   // after every render (state changes, tokens redrawn)
import { CONCENTRATION_ICON, conditionIcon, effectIcon } from '../core/effects.js';
import { conditionDescription } from '../combat/conditions.js';
import { abilityMod, fmtMod, profBonusForLevel } from '../characters/rules.js';
import { exhaustionText, effectiveSpeed } from '../core/exhaustion.js';
import { healthLevel, tokenSize, SIZE_NAMES, cellLabel } from './render.js';

const SHOW_DELAY_MS = 120;
const HIDE_DELAY_MS = 250; // time to move the pointer from the token onto its card
const closedActions = new Set(); // cards whose Actions the user folded
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function stat(label, value) {
  const s = el('div', 'tc-stat');
  s.append(el('span', 'tc-stat-val', String(value)), el('span', 'tc-stat-lbl', label));
  return s;
}

// A few numbers from the character sheet that matter during a fight.
function sheetLines(ch) {
  const lines = [];
  const prof = profBonusForLevel(ch.level);
  const wis = abilityMod(ch.abilities?.wis);
  const passive = 10 + wis + (ch.skillProf?.Perception ? prof * (ch.skillExpert?.Perception ? 2 : 1) : 0);
  const speed = effectiveSpeed(ch);
  const bits = [`Speed ${speed} ft${speed !== (ch.speed || 30) ? ` (normally ${ch.speed || 30})` : ''}`, `Passive Perception ${passive}`];
  if (ch.spellAbility) {
    const mod = abilityMod(ch.abilities?.[ch.spellAbility]);
    bits.push(`Spell save DC ${8 + mod + prof}`, `Spell attack ${fmtMod(mod + prof)}`);
  }
  lines.push(bits.join(' · '));
  const slots = (ch.spellSlots || [])
    .map((s, i) => (s && s.max > 0 ? `${ORD[i + 1]} ${s.max - s.used}/${s.max}` : ''))
    .filter(Boolean);
  if (slots.length) lines.push('Slots: ' + slots.join(' · '));
  const res = (ch.resources || []).filter((r) => r.max > 0).map((r) => `${r.name} ${r.max - r.used}/${r.max}`);
  if (res.length) lines.push(res.join(' · '));
  return lines;
}

function buildCard(c, { view, lookup, actions }) {
  const { combat, map } = view;
  const byId = new Map(combat.combatants.map((x) => [x.id, x]));
  const card = el('div', 'token-card-body');

  // Header: picture, name, what it is, where it stands.
  const head = el('div', 'tc-head');
  const pic = el('span', 'tc-pic ' + (c.type === 'monster' ? 'mon' : 'pc') + (c.type === 'familiar' ? ' fam' : ''));
  const portrait = lookup.portraitFor(c);
  if (portrait) {
    const img = el('img');
    img.src = portrait;
    img.alt = '';
    pic.appendChild(img);
  } else pic.textContent = lookup.glyphFor(c);
  const title = el('div', 'tc-title');
  title.appendChild(el('div', 'tc-name', c.name));
  const ch = c.characterId ? lookup.characterFor(c) : null;
  const mon = lookup.monsterFor(c);
  // A familiar: its form and type, and whose it is (from the owner's sheet).
  const owner = c.type === 'familiar' && c.ownerId ? lookup.characterFor({ characterId: c.ownerId }) : null;
  const fam = owner && owner.familiar;
  const kind = ch
    ? [ch.race, ch.class || (ch.level ? 'Level ' + ch.level : '')].filter(Boolean).join(' · ')
    : fam ? `${fam.form} · ${fam.creatureType} familiar of ${owner.name || 'a character'}`
      : (mon && mon.notes ? mon.notes.split('\n')[0] : (c.type === 'pc' ? 'Character' : 'Creature'));
  const where = map.positions[c.id] ? cellLabel(map.positions[c.id].x, map.positions[c.id].y) : 'not on the map';
  const size = tokenSize(c);
  const sizeName = size > 1 && !kind.includes(SIZE_NAMES[size]) ? SIZE_NAMES[size] : ''; // stat blocks already say it
  title.appendChild(el('div', 'tc-sub', [kind, sizeName, where].filter(Boolean).join(' · ')));
  head.append(pic, title);
  card.appendChild(head);

  // Turn / initiative.
  const active = combat.combatants[combat.activeIndex];
  const turn = el('div', 'tc-turn' + (active && active.id === c.id ? ' now' : ''));
  turn.textContent = (active && active.id === c.id ? '▶ Their turn · ' : '') + 'Initiative ' + c.init;
  card.appendChild(turn);

  // HP / AC (players get a health word for monsters instead of numbers).
  const stats = el('div', 'tc-stats');
  if (c.health) {
    stats.appendChild(el('div', 'tc-health lvl-' + healthLevel(c), c.health));
  } else {
    const hp = el('div', 'tc-hp');
    const pct = c.maxHp > 0 ? Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100)) : 0;
    hp.appendChild(el('div', 'tc-hp-text', `${Math.max(0, c.hp)} / ${c.maxHp} HP` + (c.tempHp > 0 ? ` (+${c.tempHp} temp)` : '')));
    const track = el('div', 'tc-hp-track');
    const fill = el('div', 'tc-hp-fill' + (pct <= 25 ? ' low' : pct <= 55 ? ' mid' : ''));
    fill.style.width = pct + '%';
    track.appendChild(fill);
    hp.appendChild(track);
    stats.appendChild(hp);
  }
  if (c.ac !== undefined) stats.appendChild(stat('AC', c.ac));
  card.appendChild(stats);

  if (c.type === 'pc' && !c.health && c.hp <= 0) {
    card.appendChild(el('div', 'tc-line warn', `Death saves: ${c.deathSuccess || 0} ✓ · ${c.deathFail || 0} ✗`));
  }

  // Sheet numbers, Heroic Inspiration and exhaustion.
  if (ch) {
    sheetLines(ch).forEach((l) => card.appendChild(el('div', 'tc-line', l)));
    if (ch.inspiration) card.appendChild(el('div', 'tc-line insp', '★ Heroic Inspiration'));
    if (ch.exhaustion > 0) card.appendChild(el('div', 'tc-line warn', `😩 Exhaustion ${ch.exhaustion}: ${exhaustionText(ch.exhaustion, ch.rulesEdition)}`));
  }

  // Concentration, conditions, spell effects.
  const list = el('ul', 'tc-list');
  if (c.concentration) {
    const li = el('li', 'conc');
    li.append(el('span', 'tc-ico', CONCENTRATION_ICON), el('b', '', 'Concentrating: ' + c.concentration));
    if (c.concentrationDc > 0) li.append(el('span', 'tc-due', ` · CON save DC ${c.concentrationDc} due`));
    list.appendChild(li);
  }
  (c.conditions || []).forEach((n) => {
    const li = el('li');
    li.append(el('span', 'tc-ico', conditionIcon(n)), el('b', '', n));
    const desc = conditionDescription(n);
    if (desc) li.append(el('span', 'tc-desc', ' — ' + desc));
    list.appendChild(li);
  });
  (c.effects || []).forEach((e) => {
    const li = el('li', 'effect');
    const caster = e.casterId && byId.get(e.casterId);
    li.append(el('span', 'tc-ico', effectIcon(e.name)), el('b', '', e.name));
    if (caster) li.append(el('span', 'tc-desc', ' — from ' + caster.name + (e.concentration ? ' (concentration)' : '')));
    list.appendChild(li);
  });
  if (list.children.length) card.appendChild(list);
  else card.appendChild(el('div', 'tc-line muted', 'No conditions or spell effects'));

  // The character's actions: Attack / damage, Cast (with slots), items.
  if (actions) {
    const det = el('details', 'tc-actions');
    det.open = !closedActions.has(c.id);
    det.addEventListener('toggle', () => { if (det.open) closedActions.delete(c.id); else closedActions.add(c.id); });
    det.appendChild(el('summary', '', 'Actions'));
    const body = el('div', 'actions-body');
    actions(body);
    det.appendChild(body);
    card.appendChild(det);
  }

  // DM-only bits the DM's browser already has.
  if (c.hidden) card.appendChild(el('div', 'tc-line muted', '🙈 Hidden from players'));
  if (c.alias) card.appendChild(el('div', 'tc-line muted', 'Players see: ' + c.alias));
  if (c.dmNotes) card.appendChild(el('div', 'tc-line dm', c.dmNotes));
  return card;
}

export function initTokenCard({ getView, lookup, isDragging, actionsFor = () => null, isDm = () => false }) {
  const box = el('div', 'token-card');
  box.hidden = true;
  document.body.appendChild(box);

  let hoverId = null; // mouse over a token (or over its card)
  let pinnedId = null; // clicked / tapped / keyboard-focused token
  let shownId = null;
  let timer = null;
  let lastPointer = 'mouse';

  const tokenEl = (id) => document.querySelector('#board .token[data-id="' + id + '"], #tray .token[data-id="' + id + '"]');

  function place(tok) {
    const r = tok.getBoundingClientRect();
    if (window.innerWidth < 600) { // phones: a sheet along the bottom
      box.classList.add('docked');
      box.style.left = box.style.top = '';
      return;
    }
    box.classList.remove('docked');
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const gap = 8;
    let left = r.right + gap;
    if (left + w > window.innerWidth - 8) left = r.left - gap - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.top + r.height / 2 - h / 2;
    // Keep clear of the phone bottom bar when it shows (600–760 px).
    const bar = document.querySelector('.phone-nav');
    const floor = bar && bar.getClientRects().length ? bar.getBoundingClientRect().top : window.innerHeight;
    top = Math.max(8, Math.min(top, floor - h - 8));
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  }

  // Actions (Attack, Cast…) for the player's own character; the DM gets
  // them on a clicked (pinned) card, so hovering stays light.
  function actionsFill(c, id) {
    const fill = actionsFor(c);
    if (!fill) return null;
    return isDm() && pinnedId !== id ? null : fill;
  }

  function refresh() {
    const id = isDragging() ? null : (hoverId || pinnedId);
    const view = getView();
    const c = id && view.combat.combatants.find((x) => x.id === id);
    const tok = c && tokenEl(id);
    if (!c || !tok) {
      box.hidden = true;
      shownId = null;
      if (id && !c) { hoverId = hoverId === id ? null : hoverId; pinnedId = pinnedId === id ? null : pinnedId; }
      return;
    }
    // Don't rebuild under someone choosing a spell slot or typing.
    const busy = box.contains(document.activeElement) && ['SELECT', 'INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (!(busy && shownId === id)) {
      const scroll = shownId === id ? box.scrollTop : 0;
      box.replaceChildren(buildCard(c, { view, lookup, actions: actionsFill(c, id) }));
      box.classList.toggle('with-actions', !!box.querySelector('.tc-actions'));
      box.scrollTop = scroll;
    }
    shownId = id;
    box.hidden = false;
    place(tok);
  }

  // Only move the card (no rebuild), e.g. while the board scrolls.
  function reposition() {
    const tok = shownId && tokenEl(shownId);
    if (tok && !box.hidden) place(tok);
  }

  const later = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };

  document.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; }, true);

  // Mouse: hover a token to see its card; the card stays while the
  // pointer moves onto it (to click its buttons).
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (box.contains(e.target)) { clearTimeout(timer); return; }
    const tok = e.target.closest('.token');
    if (!tok || tok.classList.contains('ghost')) return;
    later(() => { hoverId = tok.dataset.id; refresh(); }, SHOW_DELAY_MS);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse' || document.querySelector('dialog[open]')) return;
    const from = box.contains(e.target) ? box : e.target.closest('.token');
    if (!from || (e.relatedTarget && from.contains(e.relatedTarget))) return;
    later(() => { hoverId = null; refresh(); }, HIDE_DELAY_MS);
  });

  // Click / tap a token to keep its card open (again, Esc, or a click
  // elsewhere closes it). Dragging still works: the card hides meanwhile.
  document.addEventListener('click', (e) => {
    // Using the card (Attack, Cast…) keeps it open, also while a dice or
    // targets dialog covers the page.
    if (box.contains(e.target)) { if (shownId) pinnedId = shownId; return; }
    if (!e.target.isConnected) return;
    const tok = e.target.closest('.token');
    if (tok && !tok.classList.contains('ghost')) {
      pinnedId = pinnedId === tok.dataset.id ? null : tok.dataset.id;
      if (lastPointer === 'mouse' && pinnedId) hoverId = pinnedId;
    } else if (!e.target.closest('dialog')) {
      pinnedId = null;
    }
    refresh();
  });

  // Keyboard: Tab onto a token shows it.
  document.addEventListener('focusin', (e) => {
    const tok = e.target.closest && e.target.closest('.token');
    if (tok && tok.matches(':focus-visible')) { pinnedId = tok.dataset.id; refresh(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (pinnedId || hoverId)) { pinnedId = null; hoverId = null; refresh(); }
  });
  // Any scroll (page or the board's own sideways scroll) moves the token.
  document.addEventListener('scroll', (e) => { if (!box.contains(e.target)) reposition(); }, { passive: true, capture: true });
  window.addEventListener('resize', reposition);

  return { refresh };
}
