// The character grid (list view).
import { groupByCampaign } from '../core/campaigns.js';
import { $ } from '../core/dom.js';
import { hpClass } from './rules.js';
import { store, ALL, NONE } from './store.js';
import { charactersInView } from './campaigns.js';

function avatarNode(ch) {
  const d = document.createElement('div');
  d.className = 'avatar';
  if (ch.portrait) {
    const img = document.createElement('img');
    img.src = ch.portrait;
    img.alt = '';
    d.appendChild(img);
  } else {
    d.textContent = ((ch.name || '?').trim().charAt(0) || '?').toUpperCase();
  }
  return d;
}

function renderCard(ch, onOpen) {
  const card = document.createElement('div');
  card.className = 'char-card' + (ch.retired ? ' retired' : '');
  card.addEventListener('click', () => onOpen(ch.id));
  card.appendChild(avatarNode(ch));

  const body = document.createElement('div');
  body.className = 'char-card-body';

  const top = document.createElement('div');
  top.className = 'char-card-top';
  const name = document.createElement('div');
  name.className = 'char-card-name';
  name.textContent = ch.name || 'Unnamed character';
  top.appendChild(name);
  const lvl = document.createElement('span');
  lvl.className = 'lvl-pill';
  lvl.textContent = 'Lv ' + (ch.level || 1);
  top.appendChild(lvl);
  if (ch.retired) {
    const r = document.createElement('span');
    r.className = 'retired-pill';
    r.textContent = 'Retired';
    top.appendChild(r);
  }
  body.appendChild(top);

  const sub = document.createElement('div');
  sub.className = 'char-card-sub';
  sub.textContent = [ch.race, ch.class].filter(Boolean).join(' · ') || 'No race/class set';
  body.appendChild(sub);

  const stats = document.createElement('div');
  stats.className = 'char-card-stats';
  stats.innerHTML =
    '<span><b>' + (ch.ac || 10) + '</b> AC</span>' +
    '<span><b>' + Math.max(0, ch.hpCurrent) + '</b>/' + ch.hpMax + ' HP</span>' +
    '<span><b>' + (ch.speed || 30) + '</b> ft</span>';
  body.appendChild(stats);

  const bar = document.createElement('div');
  bar.className = 'hpbar';
  const fill = document.createElement('div');
  const pct = ch.hpMax > 0 ? Math.max(0, Math.min(100, (ch.hpCurrent / ch.hpMax) * 100)) : 0;
  fill.className = 'fill' + hpClass(pct);
  fill.style.width = pct + '%';
  bar.appendChild(fill);
  body.appendChild(bar);

  card.appendChild(body);
  return card;
}

export function renderCharGrid(onOpen) {
  const grid = $('charGrid');
  grid.innerHTML = '';
  const shown = charactersInView();
  if (shown.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-lg';
    empty.style.gridColumn = '1 / -1';
    const where = store.campaignFilter === ALL ? ''
      : store.campaignFilter === NONE ? ' without a campaign'
        : ' in this campaign';
    empty.innerHTML = '<div class="big-icon">📜</div>No character sheets' + where
      + ' yet — create one or import from D&amp;D Beyond.';
    grid.appendChild(empty);
    return;
  }
  if (store.campaignFilter !== ALL) {
    shown.forEach((ch) => grid.appendChild(renderCard(ch, onOpen)));
    return;
  }

  // "All characters": one section per campaign, characters without one
  // first. Empty sections are skipped.
  // A character in two campaigns shows in both.
  const groups = groupByCampaign(shown, store.campaigns, { noneFirst: true })
    .map((g) => ({ ...g, name: (g.active ? '★ ' : '') + g.name + (g.active ? ' (current)' : '') }));
  const showHeaders = store.campaigns.length > 0;
  groups.forEach((g) => {
    if (showHeaders) {
      const head = document.createElement('div');
      head.className = 'char-group-head';
      head.textContent = g.name;
      const count = document.createElement('span');
      count.className = 'char-group-count';
      count.textContent = g.characters.length;
      head.appendChild(count);
      grid.appendChild(head);
    }
    g.characters.forEach((ch) => grid.appendChild(renderCard(ch, onOpen)));
  });
}
