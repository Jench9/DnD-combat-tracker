// "Who are you?" screen and the identity badge in the nav. Shown on any
// page when this browser hasn't chosen yet, or its character is gone.
// Choosing reloads the page so the connection reopens as that identity.
import { getIdentity, setIdentity, clearIdentity, isDm } from './identity.js';
import { groupByCampaign } from './campaigns.js';

async function fetchSummary() {
  try {
    const r = await fetch('/api/characters/summary');
    const data = await r.json();
    return { characters: data.characters || [], campaigns: data.campaigns || [] };
  } catch {
    return { characters: [], campaigns: [] };
  }
}
const fetchCharacters = async () => (await fetchSummary()).characters;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function choose(identity, url) {
  setIdentity(identity);
  if (url) location.href = url; else location.reload();
}

// A new player: create a blank character as a guest, then become it and
// open its sheet with the guided creation (they can close it and fill the
// sheet by hand instead). `campaignId`: the campaign it starts in.
function createAndJoin(campaignId = '') {
  const id = Math.random().toString(36).slice(2, 9);
  const ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/?');
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'addCharacter', payload: { id, campaignId } }));
    setTimeout(() => { ws.close(); choose({ role: 'player', characterId: id }, 'characters.html#create=' + id); }, 250);
  };
  ws.onerror = () => alert('Could not reach the server.');
}

function avatar(c) {
  const a = el('span', 'join-pic');
  if (c.portrait) {
    const img = el('img');
    img.src = c.portrait;
    img.alt = '';
    a.appendChild(img);
  } else {
    a.textContent = ((c.name || '?').trim().charAt(0) || '?').toUpperCase();
  }
  return a;
}

export async function showJoin({ dismissible = false } = {}) {
  if (document.querySelector('.join-overlay')) return;
  const overlay = el('div', 'join-overlay');
  const box = el('div', 'join-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.appendChild(el('h2', 'join-title', 'Who are you?'));
  box.appendChild(el('p', 'join-sub', 'Pick your character, or join as the DM. You can switch later from the badge in the top bar.'));

  const dm = el('button', 'join-option dm');
  dm.type = 'button';
  dm.append(el('span', 'join-pic dm', '👑'), el('span', 'join-name', "I'm the DM"));
  dm.addEventListener('click', () => choose({ role: 'dm' }));
  box.appendChild(dm);

  const list = el('div', 'join-list');
  list.appendChild(el('div', 'join-loading', 'Loading characters…'));
  box.appendChild(list);

  const create = el('button', 'join-option new');
  create.type = 'button';
  const createLabel = el('span', 'join-name', 'Create a new character');
  create.append(el('span', 'join-pic', '+'), createLabel);
  let createIn = ''; // the active campaign, once loaded
  create.addEventListener('click', () => createAndJoin(createIn));
  box.appendChild(create);

  if (dismissible) {
    const cancel = el('button', 'btn secondary small join-cancel', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => overlay.remove());
    box.appendChild(cancel);
  }

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  if (dismissible) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    const onKey = (e) => {
      if (!document.body.contains(overlay)) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
  }

  const { characters: chars, campaigns } = await fetchSummary();
  const current = getIdentity();
  list.innerHTML = '';
  if (chars.length === 0) list.appendChild(el('div', 'join-loading', 'No characters yet.'));

  const active = campaigns.find((c) => c.active);
  if (active) {
    createIn = active.id;
    createLabel.textContent = `Create a new character in ${active.name}`;
  }

  const option = (c) => {
    const b = el('button', 'join-option');
    b.type = 'button';
    const text = el('span', 'join-text');
    text.append(el('span', 'join-name', c.name || 'Unnamed character'),
      el('span', 'join-meta', ['Lv ' + (c.level || 1), c.class].filter(Boolean).join(' · ')));
    b.append(avatar(c), text);
    if (current && current.role === 'player' && current.characterId === c.id) {
      b.classList.add('current');
      b.appendChild(el('span', 'join-you', 'You'));
    }
    b.addEventListener('click', () => choose({ role: 'player', characterId: c.id }));
    return b;
  };
  // Campaign heading: name, count, and "+ New" to create a character in it.
  const heading = (g) => {
    const h = el('div', 'join-group' + (g.active ? ' active' : ''));
    h.appendChild(el('span', 'join-group-name', (g.active ? '★ ' : '') + g.name));
    h.appendChild(el('span', 'join-count', String(g.characters.length)));
    if (g.id) {
      const add = el('button', 'join-new', '+ New');
      add.type = 'button';
      add.title = `Create a new character in ${g.name}`;
      add.addEventListener('click', () => createAndJoin(g.id));
      h.appendChild(add);
    }
    return h;
  };

  // Campaigns without characters still get a heading (with "+ New") so a
  // new player can start in one.
  const filled = groupByCampaign(chars, campaigns); // active first, "No campaign" last
  const none = filled.filter((g) => !g.id);
  const groups = [
    ...[...campaigns.filter((c) => c.active), ...campaigns.filter((c) => !c.active)]
      .map((c) => filled.find((g) => g.id === c.id) || { id: c.id, name: c.name, active: !!c.active, characters: [] }),
    ...none,
  ];
  const headers = campaigns.length > 0;
  const draw = (target, g) => {
    if (headers) target.appendChild(heading(g));
    g.characters.forEach((c) => target.appendChild(option(c)));
  };
  if (active) {
    // The campaign being played first; the rest folded away.
    groups.filter((g) => g.active).forEach((g) => draw(list, g));
    const rest = groups.filter((g) => !g.active);
    if (rest.length) {
      const others = el('details', 'join-others');
      const n = new Set(rest.flatMap((g) => g.characters.map((c) => c.id))).size;
      others.appendChild(el('summary', '', `Other campaigns (${n} character${n === 1 ? '' : 's'})`));
      rest.forEach((g) => draw(others, g));
      // Your own character is in there: show it.
      if (current && rest.some((g) => g.characters.some((c) => c.id === current.characterId))
        && !groups.some((g) => g.active && g.characters.some((c) => c.id === current.characterId))) others.open = true;
      list.appendChild(others);
    }
  } else {
    groups.forEach((g) => draw(list, g));
  }
}

// Badge in the nav ("DM" / character name) that reopens the chooser.
export async function initIdentity(nav) {
  document.body.classList.toggle('is-dm', isDm());
  document.body.classList.toggle('is-player', !isDm());
  const id = getIdentity();

  const badge = el('button', 'id-badge');
  badge.type = 'button';
  badge.title = 'Switch who you are';
  badge.textContent = id ? (id.role === 'dm' ? '👑 DM' : '…') : 'Choose…';
  badge.addEventListener('click', () => showJoin({ dismissible: !!getIdentity() }));
  if (nav) nav.appendChild(badge); // the nav's right-hand area

  if (!id) { showJoin(); return; }
  if (id.role === 'player') {
    const chars = await fetchCharacters();
    const me = chars.find((c) => c.id === id.characterId);
    if (!me) { clearIdentity(); showJoin(); return; } // their character was deleted
    badge.textContent = '🧝 ' + (me.name || 'Unnamed');
  }
}
