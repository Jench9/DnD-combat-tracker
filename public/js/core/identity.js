// Who this browser is: the DM, or a player playing one character.
//
//   { role: 'dm', tableId }  or  { role: 'player', characterId: '<id>', tableId }
//   tableId: the campaign being played ('' = no campaign) — accounts mode;
//   each campaign has its own fight and map, and its own DM(s).
//
// The server decides what each browser may see and do (src/core/identity.js);
// this module only knows what to ask for and what to show.
//
// Two modes, from GET /api/auth/status when the page loads (this module
// waits for it — top-level await — so every page has it before running):
//  - 'accounts': you're logged in (else this page goes to the login page).
//    The account says whether you may be the DM and which characters are
//    yours; the choice made on the "Who are you?" screen (localStorage)
//    picks the DM view or one of your characters.
//  - 'open': no login; the choice on the "Who are you?" screen is all there is.
const KEY = 'kit.identity';

async function loadStatus() {
  try {
    const r = await fetch('/api/auth/status', { credentials: 'same-origin' });
    return await r.json();
  } catch {
    return { mode: 'open', account: null }; // server unreachable: pages show "Connecting…"
  }
}
const status = await loadStatus();
let account = status.account; // { id, username, role, characterIds } | null

export const authMode = () => status.mode;
export const currentAccount = () => account;
// The account's tables: [{ id, name, dm }] (accounts mode).
export const myTables = () => (account && account.tables) || [];
// The server sent a newer copy of our account (accountState): characters
// linked or created since, campaigns added. If this browser's table is
// gone (campaign deleted, taken off it), start again on the join screen.
export function setAccount(next) {
  if (!next) return;
  const before = getIdentity();
  account = next;
  const now = getIdentity();
  if (before && (!now || now.tableId !== before.tableId || now.role !== before.role)) location.reload();
}

// Not logged in: off to the login page, then back here. Never resolves, so
// the page's own code doesn't run behind the redirect.
export function toLogin() {
  const next = location.pathname + location.search + location.hash;
  location.href = '/login.html?next=' + encodeURIComponent(next);
  return new Promise(() => {});
}
if (status.mode === 'accounts' && !account) await toLogin();

function stored() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export function getIdentity() {
  const v = stored();
  if (status.mode === 'accounts') {
    const tables = myTables();
    if (!tables.length) return null; // nothing yet: the join screen says what to do
    // The table chosen before, if still ours; else (a first visit) the only one.
    const table = v && tables.find((t) => t.id === v.tableId) || (tables.length === 1 ? tables[0] : null);
    if (!table) return null;
    const mine = account.characterIds || [];
    if (v && v.tableId === table.id && v.role === 'dm' && table.dm) return { role: 'dm', characterId: '', tableId: table.id };
    if (v && v.tableId === table.id && v.role === 'player' && v.characterId && (table.dm || mine.includes(v.characterId))) {
      return { role: 'player', characterId: v.characterId, tableId: table.id };
    }
    // Not chosen yet at this table: its DM runs it; a player with one character plays it.
    if (table.dm && !(v && v.role === 'player')) return { role: 'dm', characterId: '', tableId: table.id };
    if (!table.dm && mine.length === 1) return { role: 'player', characterId: mine[0], tableId: table.id };
    return null;
  }
  if (v && v.role === 'dm') return { role: 'dm', characterId: '' };
  if (v && v.role === 'player' && typeof v.characterId === 'string' && v.characterId) return v;
  return null;
}

export function setIdentity(identity) {
  try { localStorage.setItem(KEY, JSON.stringify(identity)); } catch { /* storage unavailable */ }
}

export function clearIdentity() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export const isDm = () => getIdentity()?.role === 'dm';
// May this browser choose the DM view? (accounts: at a table it runs)
export const mayBeDm = () => status.mode !== 'accounts' || myTables().some((t) => t.dm);
export const isAdmin = () => status.mode === 'accounts' && account.role === 'admin';
// The table this browser is at ({ id, name, dm }), or null.
export const currentTable = () => {
  const id = getIdentity();
  return id ? myTables().find((t) => t.id === id.tableId) || null : null;
};
export const myCharacterId = () => (getIdentity()?.role === 'player' ? getIdentity().characterId : '');
// Can this browser change things belonging to that character? A player
// account: any of its characters (two PCs in one fight). A DM looking
// through a character's eyes: just that one.
export const ownsCharacter = (characterId) => isDm() || (!!characterId && (characterId === myCharacterId()
  || (status.mode === 'accounts' && (account.characterIds || []).includes(characterId))));

// For the WebSocket URL.
export function identityQuery() {
  const id = getIdentity();
  if (!id) return '';
  const table = id.tableId !== undefined ? '&campaign=' + encodeURIComponent(id.tableId) : '';
  return (id.role === 'dm' ? 'role=dm' : 'role=player&character=' + encodeURIComponent(id.characterId)) + table;
}
// The table part alone (the TV view connects as a player at this table).
export const tableQuery = () => {
  const id = getIdentity();
  return id && id.tableId !== undefined ? 'campaign=' + encodeURIComponent(id.tableId) : '';
};

// For fetch() calls to the REST API (the session cookie goes along by itself).
export function identityHeaders() {
  const id = getIdentity();
  if (!id) return {};
  const table = id.tableId !== undefined ? { 'X-Kit-Campaign': id.tableId } : {};
  return { ...(id.role === 'dm' ? { 'X-Kit-Role': 'dm' } : { 'X-Kit-Role': 'player', 'X-Kit-Character': id.characterId }), ...table };
}

export async function logout() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* offline: the cookie stays until it expires */ }
  clearIdentity();
  location.href = '/login.html';
}
