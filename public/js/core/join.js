// "Who are you?" screen and the identity badge in the nav. Shown on any
// page when this browser hasn't chosen yet, or its character is gone.
// Choosing reloads the page so the connection reopens as that identity.
import { getIdentity, setIdentity, clearIdentity, isDm, mayBeDm, authMode, currentAccount, logout, myTables, currentTable } from './identity.js';
import { groupByCampaign } from './campaigns.js';

async function fetchSummary() {
  try {
    const r = await fetch('/api/characters/summary');
    const data = await r.json();
    // Retired characters (dead, left the party) aren't offered.
    return { characters: (data.characters || []).filter((c) => !c.retired), campaigns: data.campaigns || [] };
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
// `tableId` (accounts): the table to play it at — the new character joins it.
function createAndJoin(campaignId = '', tableId) {
  const id = Math.random().toString(36).slice(2, 9);
  const q = tableId !== undefined ? 'role=player&campaign=' + encodeURIComponent(tableId) : '';
  const ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/?' + q);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'addCharacter', payload: { id, campaignId } }));
    setTimeout(() => {
      ws.close();
      choose({ role: 'player', characterId: id, ...(tableId !== undefined ? { tableId } : {}) }, 'characters.html#create=' + id);
    }, 250);
  };
  ws.onerror = () => alert('Could not reach the server.');
}

// A DM account's new campaign: it runs it at once.
function createCampaign() {
  const name = (prompt('Name of the new campaign:') || '').trim();
  if (!name) return;
  const id = Math.random().toString(36).slice(2, 10);
  const ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/?role=dm');
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'addCampaign', payload: { id, name } }));
    setTimeout(() => { ws.close(); choose({ role: 'dm', characterId: '', tableId: id }); }, 250);
  };
  ws.onerror = () => alert('Could not reach the server.');
}

// Accounts: one section per table (campaign) this account sits at — run it
// as its DM, play one of your characters there, or create one there.
function drawTables(list, chars, campaigns) {
  const me = currentAccount();
  const current = getIdentity();
  const known = new Set(campaigns.map((c) => c.id));
  const tablesOf = (c) => {
    const ids = (c.campaignIds || []).filter((id) => known.has(id));
    return ids.length ? ids : [''];
  };
  const tables = myTables();
  list.innerHTML = '';
  if (!tables.length) {
    list.appendChild(el('div', 'join-loading', me.mayCreateCampaigns
      ? 'You have no campaign yet. Create one below — you will be its DM — or ask the admin to make you a DM of one.'
      : 'You are not at any table yet — ask your DM for an invite.'));
  }
  tables.forEach((t) => {
    const h = el('div', 'join-group' + (t.dm ? ' active' : ''));
    h.appendChild(el('span', 'join-group-name', t.name));
    if (t.dm) h.appendChild(el('span', 'join-count', 'You DM'));
    const add = el('button', 'join-new', '+ New character');
    add.type = 'button';
    add.title = `Create a new character at ${t.name}`;
    add.addEventListener('click', () => createAndJoin(t.id, t.id));
    h.appendChild(add);
    list.appendChild(h);
    // Is this what the browser is now (nothing chosen yet on a first visit)?
    const here = (test) => !!current && current.tableId === t.id && test(current);
    if (t.dm) {
      const dm = el('button', 'join-option dm');
      dm.type = 'button';
      dm.append(el('span', 'join-pic dm', '👑'), el('span', 'join-name', 'Run this table as the DM'));
      if (here((c) => c.role === 'dm')) { dm.classList.add('current'); dm.appendChild(el('span', 'join-you', 'Now')); }
      dm.addEventListener('click', () => choose({ role: 'dm', characterId: '', tableId: t.id }));
      list.appendChild(dm);
    }
    const mineHere = chars.filter((c) => (me.characterIds || []).includes(c.id) && tablesOf(c).includes(t.id));
    if (!t.dm && !mineHere.length) list.appendChild(el('div', 'join-loading', 'You have no character here yet — + New character, or ask your DM to give you one.'));
    mineHere.forEach((c) => {
      const b = el('button', 'join-option');
      b.type = 'button';
      const text = el('span', 'join-text');
      text.append(el('span', 'join-name', c.name || 'Unnamed character'),
        el('span', 'join-meta', ['Lv ' + (c.level || 1), c.class].filter(Boolean).join(' · ')));
      b.append(avatar(c), text);
      if (here((cur) => cur.role === 'player' && cur.characterId === c.id)) { b.classList.add('current'); b.appendChild(el('span', 'join-you', 'You')); }
      b.addEventListener('click', () => choose({ role: 'player', characterId: c.id, tableId: t.id }));
      list.appendChild(b);
    });
  });
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

// "Signed in as Lyra · Change password · Log out" (+ the DM's Players page).
function accountFooter() {
  const me = currentAccount();
  const foot = el('div', 'join-account');
  foot.appendChild(el('span', 'join-account-name', `Signed in as ${me.username}${me.role === 'admin' ? ' (admin)' : me.role === 'dm' ? ' (DM)' : ''}`));
  const link = (text, fn) => {
    const b = el('button', 'join-link', text);
    b.type = 'button';
    b.addEventListener('click', fn);
    foot.appendChild(b);
  };
  if (me.role === 'admin' || myTables().some((t) => t.dm)) link('Players', () => { location.href = 'players.html'; });
  link('Change password', changePassword);
  link('Log out', logout);
  return foot;
}

function changePassword() {
  const overlay = el('div', 'join-overlay pw-overlay');
  const box = el('form', 'join-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.appendChild(el('h2', 'join-title', 'Change password'));
  const field = (label, name, auto) => {
    const l = el('label', 'join-field');
    l.appendChild(el('span', '', label));
    const i = el('input');
    i.type = 'password';
    i.name = name;
    i.autocomplete = auto;
    i.required = true;
    l.appendChild(i);
    box.appendChild(l);
    return i;
  };
  const cur = field('Current password', 'current', 'current-password');
  const next = field('New password (8+ characters)', 'password', 'new-password');
  const again = field('New password again', 'again', 'new-password');
  const msg = el('div', 'join-msg');
  msg.setAttribute('role', 'alert');
  box.appendChild(msg);
  const row = el('div', 'join-btns');
  const cancel = el('button', 'btn secondary small', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => overlay.remove());
  const ok = el('button', 'btn small', 'Change password');
  ok.type = 'submit';
  row.append(cancel, ok);
  box.appendChild(row);
  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (next.value !== again.value) { msg.textContent = 'The new passwords are different.'; return; }
    ok.disabled = true;
    try {
      const r = await fetch('/api/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: cur.value, password: next.value }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Could not change the password.');
      msg.textContent = 'Password changed. Your other devices were logged out.';
      setTimeout(() => overlay.remove(), 1500);
    } catch (err) {
      msg.textContent = err.message === 'Failed to fetch' ? 'Could not reach the server.' : err.message;
      ok.disabled = false;
    }
  });
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  cur.focus();
}

export async function showJoin({ dismissible = false } = {}) {
  if (document.querySelector('.join-overlay')) return;
  const overlay = el('div', 'join-overlay');
  const box = el('div', 'join-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const accounts = authMode() === 'accounts';
  box.appendChild(el('h2', 'join-title', accounts ? 'Who are you playing?' : 'Who are you?'));
  if (accounts) {
    // Tables (campaigns): each with its DM option, your characters, + New.
    box.appendChild(el('p', 'join-sub', 'Choose a table and who you are there. You can switch later from the badge in the top bar.'));
    const list = el('div', 'join-list');
    list.appendChild(el('div', 'join-loading', 'Loading…'));
    box.appendChild(list);
    if (currentAccount().mayCreateCampaigns) {
      const camp = el('button', 'join-option new');
      camp.type = 'button';
      camp.append(el('span', 'join-pic', '+'), el('span', 'join-name', 'New campaign (you are its DM)'));
      camp.addEventListener('click', createCampaign);
      box.appendChild(camp);
    }
    if (dismissible) {
      const cancel = el('button', 'btn secondary small join-cancel', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', () => overlay.remove());
      box.appendChild(cancel);
    }
    box.appendChild(accountFooter());
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
    drawTables(list, chars, campaigns);
    return;
  }
  box.appendChild(el('p', 'join-sub', accounts
    ? (mayBeDm() ? 'Run the table as the DM, or look through one of the characters\' eyes.' : 'Pick which of your characters you are playing. You can switch later from the badge in the top bar.')
    : 'Pick your character, or join as the DM. You can switch later from the badge in the top bar.'));

  if (mayBeDm()) {
    const dm = el('button', 'join-option dm');
    dm.type = 'button';
    dm.append(el('span', 'join-pic dm', '👑'), el('span', 'join-name', "I'm the DM"));
    dm.addEventListener('click', () => choose({ role: 'dm' }));
    box.appendChild(dm);
  }

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
  if (accounts) box.appendChild(accountFooter());

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
  if (chars.length === 0) {
    list.appendChild(el('div', 'join-loading', accounts && !mayBeDm()
      ? 'You have no character yet — create one, or ask the DM to give you one.'
      : 'No characters yet.'));
  }

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
  // Accounts: which table too, when there's more than one.
  const table = authMode() === 'accounts' ? currentTable() : null;
  const at = table && myTables().length > 1 ? ` · ${table.name}` : '';
  badge.title = authMode() === 'accounts'
    ? `Signed in as ${currentAccount().username}${table ? ` — at ${table.name}` : ''}. Click to switch table or character, change password, log out`
    : 'Switch who you are';
  badge.textContent = id ? (id.role === 'dm' ? '👑 DM' + at : '…') : 'Choose…';
  badge.addEventListener('click', () => showJoin({ dismissible: !!getIdentity() }));
  if (nav) nav.appendChild(badge); // the nav's right-hand area

  if (!id) { showJoin(); return; }
  const needChars = id.role === 'player' || (table && table.dm);
  const { characters: chars, campaigns } = needChars ? await fetchSummary() : { characters: [], campaigns: [] };
  if (id.role === 'player') {
    const me = chars.find((c) => c.id === id.characterId);
    if (!me) { clearIdentity(); showJoin(); return; } // their character was deleted
    badge.textContent = '🧝 ' + (me.name || 'Unnamed') + at;
  }
  if (table && table.dm && nav) addViewSwitch(nav, badge, id, table, chars, campaigns);
}

// At a table you run where you also play a character (the admin, a DM
// joining its own game): one click between the DM view and that character.
function addViewSwitch(nav, badge, id, table, chars, campaigns) {
  const known = new Set(campaigns.map((c) => c.id));
  const atTable = (c) => {
    const ids = (c.campaignIds || []).filter((x) => known.has(x));
    return (ids.length ? ids : ['']).includes(table.id);
  };
  const mine = chars.filter((c) => (currentAccount().characterIds || []).includes(c.id) && atTable(c));
  if (!mine.length) return;
  const toPlayer = id.role === 'dm';
  // Back to the character played last at this table, else the first one.
  let last = '';
  try { last = localStorage.getItem('kit.lastPlayed.' + table.id) || ''; } catch { /* storage blocked */ }
  if (!toPlayer) { try { localStorage.setItem('kit.lastPlayed.' + table.id, id.characterId); } catch { /* storage blocked */ } }
  const next = mine.find((c) => c.id === last) || mine[0];
  const b = el('button', 'id-badge view-switch');
  b.type = 'button';
  b.textContent = toPlayer ? '🧝 Player view' : '👑 DM view';
  b.title = toPlayer ? `Play ${next.name || 'your character'} (what the players see)` : `Back to running ${table.name} as the DM`;
  b.addEventListener('click', () => choose(toPlayer
    ? { role: 'player', characterId: next.id, tableId: table.id }
    : { role: 'dm', characterId: '', tableId: table.id }));
  nav.insertBefore(b, badge);
}
