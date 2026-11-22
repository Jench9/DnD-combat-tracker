// Players page (accounts mode). The admin manages every account: roles
// (player / DM / admin), campaigns, characters, disable, reset links,
// delete. A DM manages the players of the campaigns it runs: invite them,
// add them to or take them off its campaigns, give or take its campaigns'
// characters. The server enforces all of this (src/features/accounts/route.js);
// this page only shows what applies. Lists come live over the WebSocket
// (accountState, charState, campaignState); changes go through REST.
import { $ } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { isDm, isAdmin, authMode, currentAccount, myTables } from '../core/identity.js';

renderNav();

let accounts = [];
let invites = [];
let characters = [];
let campaigns = [];

const admin = isAdmin();
if (authMode() !== 'accounts') $('openMode').hidden = false;
else if (!isDm()) $('notDm').hidden = false; // the admin, or the DM of this table
else $('dmView').hidden = false;
if (!admin) $('invRoleField').hidden = true; // DMs invite players

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const btn = (text, cls, fn) => {
  const b = el('button', 'btn small ' + (cls || ''), text);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
};
const ROLE_LABEL = { admin: '🔑 Admin', dm: '👑 DM', player: 'Player' };
const charName = (id) => (characters.find((c) => c.id === id) || {}).name || 'Unnamed character';
const campName = (id) => (campaigns.find((c) => c.id === id) || {}).name || 'a deleted campaign';
const ownerOf = (id) => accounts.find((a) => a.characterIds.includes(id));
const when = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
// The campaigns this account may hand out: the admin all, a DM its own.
const myCampaigns = () => (admin ? campaigns : campaigns.filter((c) => myTables().some((t) => t.dm && t.id === c.id)));
const runsCampaign = (id) => admin || myCampaigns().some((c) => c.id === id);
// Characters it may give: the admin all; a DM those in its campaigns.
const runsCharacter = (ch) => admin || (ch.campaignIds || []).some(runsCampaign);

async function api(method, url, body) {
  $('accMsg').textContent = '';
  let r;
  try {
    r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    $('accMsg').textContent = 'Could not reach the server.';
    return null;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { $('accMsg').textContent = data.error || `Something went wrong (${r.status}).`; return null; }
  return data;
}

// Show a fresh link (invite or password reset): it's only shown once.
function showLink(data, note) {
  $('invUrl').value = location.origin + data.path;
  $('invNote').textContent = `${note} Valid until ${when(data.expiresAt)}, once. It's only shown now — copy it before leaving the page.`;
  $('invResult').hidden = false;
  $('invUrl').select();
  $('invResult').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---- invite form: campaigns and characters as tick boxes
function checks(box, items, label, extra) {
  const ticked = new Set([...box.querySelectorAll('input:checked')].map((i) => i.value));
  box.innerHTML = '';
  if (!items.length) { box.appendChild(el('span', 'pl-none', extra)); return; }
  items.forEach((it) => {
    const l = el('label', 'pl-check');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.value = it.id;
    cb.checked = ticked.has(it.id);
    l.append(cb, document.createTextNode(label(it)));
    if (it.note) l.appendChild(el('span', 'pl-owner', it.note));
    box.appendChild(l);
  });
}
function drawInviteForm() {
  checks($('invCamps'), myCampaigns(), (c) => c.name, admin ? 'No campaigns yet.' : 'Create a campaign first (the badge in the top bar → New campaign).');
  const chars = characters.filter(runsCharacter).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((c) => ({ ...c, note: ownerOf(c.id) ? `(${ownerOf(c.id).username})` : '' }));
  checks($('invChars'), chars, (c) => c.name || 'Unnamed character', 'No characters — they can create their own after joining.');
}

$('invBtn').addEventListener('click', async () => {
  const ticked = (box) => [...$(box).querySelectorAll('input:checked')].map((i) => i.value);
  const characterIds = ticked('invChars');
  const campaignIds = ticked('invCamps');
  const role = admin ? $('invRole').value : 'player';
  const data = await api('POST', '/api/accounts/invites', { role, characterIds, campaignIds });
  if (!data) return;
  const what = [campaignIds.length ? 'in ' + campaignIds.map(campName).join(', ') : '', characterIds.length ? 'with ' + characterIds.map(charName).join(', ') : ''].filter(Boolean).join(', ');
  showLink(data, `Invite for a new ${role === 'admin' ? 'admin' : role === 'dm' ? 'DM' : 'player'}${what ? ' ' + what : ''}.`);
  document.querySelectorAll('#invCamps input, #invChars input').forEach((i) => { i.checked = false; });
});
$('invCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('invUrl').value); $('invCopy').textContent = 'Copied'; } catch { $('invUrl').select(); }
  setTimeout(() => { $('invCopy').textContent = 'Copy'; }, 1500);
});

// ---- accounts
// A row of chips with × and a "+ …" picker (campaigns or characters).
function chipRow(label, ids, nameOf, mayChange, options, onChange, cls = '') {
  const row = el('div', 'pl-acc-row');
  row.appendChild(el('span', 'pl-label', label));
  ids.forEach((id) => {
    const chip = el('span', 'pl-chip ' + cls, nameOf(id));
    if (mayChange(id)) {
      const x = el('button', '', '×');
      x.type = 'button';
      x.title = `Remove ${nameOf(id)}`;
      x.setAttribute('aria-label', x.title);
      x.addEventListener('click', () => onChange(ids.filter((i) => i !== id)));
      chip.appendChild(x);
    }
    row.appendChild(chip);
  });
  if (!ids.length) row.appendChild(el('span', 'pl-none', 'none'));
  if (options.length) {
    const pick = el('select', 'pl-give');
    pick.setAttribute('aria-label', label);
    const ph = el('option', '', '+ Add…');
    ph.value = '';
    pick.appendChild(ph);
    options.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; pick.appendChild(o); });
    pick.addEventListener('change', () => { if (pick.value) onChange([...ids, pick.value]); });
    row.appendChild(pick);
  }
  return row;
}

function drawAccounts() {
  const list = $('accList');
  list.innerHTML = '';
  const me = currentAccount();
  const order = { admin: 0, dm: 1, player: 2 };
  [...accounts].sort((a, b) => (order[a.role] - order[b.role]) || a.username.localeCompare(b.username)).forEach((a) => {
    const card = el('div', 'pl-acc' + (a.disabled ? ' off' : ''));
    const head = el('div', 'pl-acc-head');
    head.appendChild(el('span', 'pl-name', a.username));
    if (admin && a.id !== me.id) {
      const role = el('select', 'pl-role');
      role.setAttribute('aria-label', `Role of ${a.username}`);
      ['player', 'dm', 'admin'].forEach((r) => { const o = el('option', '', ROLE_LABEL[r]); o.value = r; role.appendChild(o); });
      role.value = a.role;
      role.addEventListener('change', () => api('PATCH', `/api/accounts/${a.id}`, { role: role.value }));
      head.appendChild(role);
    } else {
      head.appendChild(el('span', 'pl-tag ' + a.role, ROLE_LABEL[a.role]));
    }
    if (a.id === me.id) head.appendChild(el('span', 'pl-tag you', 'You'));
    if (a.disabled) head.appendChild(el('span', 'pl-tag', 'Disabled'));
    const tools = el('div', 'pl-acc-tools');
    if (admin) {
      if (a.id !== me.id) tools.appendChild(btn(a.disabled ? 'Enable' : 'Disable', 'secondary', () => api('PATCH', `/api/accounts/${a.id}`, { disabled: !a.disabled })));
      tools.append(
        btn('Password reset link', 'secondary', async () => {
          const data = await api('POST', `/api/accounts/${a.id}/reset`);
          if (data) showLink(data, `Password reset for ${a.username}.`);
        }),
        btn('Log out everywhere', 'secondary', () => api('POST', `/api/accounts/${a.id}/logout`)),
      );
      if (a.id !== me.id) {
        tools.appendChild(btn('Delete', 'secondary', () => {
          if (confirm(`Delete the account "${a.username}"? Their characters are kept.`)) api('DELETE', `/api/accounts/${a.id}`);
        }));
      }
    }
    head.appendChild(tools);
    card.appendChild(head);

    // Characters: the admin manages everyone's, its own too (to play them:
    // 🧝 Player view at their table). A DM only its players'.
    if (admin || (a.role !== 'admin' && a.id !== me.id)) {
      // Campaigns it plays in (an admin sits at every table anyway).
      if (a.role !== 'admin') {
        const campIds = (a.campaignIds || []).filter((id) => campaigns.some((c) => c.id === id));
        card.appendChild(chipRow('Plays in', campIds, campName, runsCampaign,
          myCampaigns().filter((c) => !campIds.includes(c.id)).map((c) => [c.id, c.name]),
          (ids) => api('PATCH', `/api/accounts/${a.id}`, { campaignIds: ids }), 'camp'));
      }
      const charIds = a.characterIds.filter((id) => characters.some((c) => c.id === id));
      card.appendChild(chipRow('Characters', charIds, charName, (id) => runsCharacter(characters.find((c) => c.id === id) || {}),
        characters.filter((c) => runsCharacter(c) && !charIds.includes(c.id)).sort((x, y) => (x.name || '').localeCompare(y.name || ''))
          .map((c) => [c.id, (c.name || 'Unnamed character') + (ownerOf(c.id) ? ` (also ${ownerOf(c.id).username})` : '')]),
        (ids) => api('PATCH', `/api/accounts/${a.id}`, { characterIds: ids })));
    }
    list.appendChild(card);
  });
}

function drawInvites() {
  const list = $('invList');
  list.innerHTML = '';
  if (!invites.length) { list.appendChild(el('div', 'pl-none', 'No open invites.')); return; }
  invites.forEach((i) => {
    const row = el('div', 'pl-inv');
    const target = i.accountId && accounts.find((a) => a.id === i.accountId);
    const what = [
      (i.campaignIds || []).length ? 'in ' + i.campaignIds.map(campName).join(', ') : '',
      i.characterIds.length ? 'with ' + i.characterIds.map(charName).join(', ') : '',
    ].filter(Boolean).join(', ');
    row.appendChild(el('span', '', target
      ? `Password reset for ${target.username}`
      : `New ${i.role === 'admin' ? 'admin' : i.role === 'dm' ? 'DM' : 'player'}${what ? ' — ' + what : ''}`));
    row.appendChild(el('span', 'pl-tag', `until ${when(i.expiresAt)}`));
    row.appendChild(btn('Revoke', 'secondary', () => api('DELETE', `/api/accounts/invites/${i.id}`)));
    list.appendChild(row);
  });
}

function draw() {
  if ($('dmView').hidden) return;
  drawInviteForm();
  drawAccounts();
  drawInvites();
}

connectSocket({
  handlers: {
    accountState: (msg) => {
      accounts = msg.accounts.list || [];
      invites = msg.accounts.invites || [];
      draw();
    },
    charState: (msg) => { characters = msg.characters; draw(); },
    campaignState: (msg) => { campaigns = msg.campaigns; draw(); },
  },
});
