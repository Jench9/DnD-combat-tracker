// "Who are you?" screen and the identity badge in the nav. Shown on any
// page when this browser hasn't chosen yet, or its character is gone.
// Choosing reloads the page so the connection reopens as that identity.
import { getIdentity, setIdentity, clearIdentity, isDm } from './identity.js';

async function fetchCharacters() {
  try {
    const r = await fetch('/api/characters/summary');
    return (await r.json()).characters || [];
  } catch {
    return [];
  }
}

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
// sheet by hand instead).
function createAndJoin() {
  const id = Math.random().toString(36).slice(2, 9);
  const ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/?');
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'addCharacter', payload: { id } }));
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
  dm.append(el('span', 'join-pic dm', '🎲'), el('span', 'join-name', "I'm the DM"));
  dm.addEventListener('click', () => choose({ role: 'dm' }));
  box.appendChild(dm);

  const list = el('div', 'join-list');
  list.appendChild(el('div', 'join-loading', 'Loading characters…'));
  box.appendChild(list);

  const create = el('button', 'join-option new');
  create.type = 'button';
  create.append(el('span', 'join-pic', '+'), el('span', 'join-name', 'Create a new character'));
  create.addEventListener('click', createAndJoin);
  box.appendChild(create);

  if (dismissible) {
    const cancel = el('button', 'btn secondary small join-cancel', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => overlay.remove());
    box.appendChild(cancel);
  }

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const chars = await fetchCharacters();
  list.innerHTML = '';
  if (chars.length === 0) list.appendChild(el('div', 'join-loading', 'No characters yet.'));
  chars.forEach((c) => {
    const b = el('button', 'join-option');
    b.type = 'button';
    const text = el('span', 'join-text');
    text.append(el('span', 'join-name', c.name || 'Unnamed character'),
      el('span', 'join-meta', ['Lv ' + (c.level || 1), c.class].filter(Boolean).join(' · ')));
    b.append(avatar(c), text);
    b.addEventListener('click', () => choose({ role: 'player', characterId: c.id }));
    list.appendChild(b);
  });
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
