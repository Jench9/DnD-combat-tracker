// Who a connection or request is.
//
//   { role: 'dm' | 'player', tableId, characterId, characterIds, accountId, accountRole }
//     role          at this table: 'dm' if the account runs it (core/access.js)
//     tableId       the campaign being played ('' = no campaign; null = none yet)
//     characterId   the character this browser is playing now ('' = none)
//     characterIds  every character it may act for (its account's)
//
// Two modes (config AUTH_MODE):
//  - 'accounts': the `kit_session` cookie names a login session
//    (features/accounts). The role comes from the account; a browser may
//    ask for less (a DM's TV view connects as a player). It picks which of
//    its account's characters it is playing (`?character=` / X-Kit-Character).
//    No valid session = null: the caller refuses the request.
//  - 'open': no login. The browser says who it is — ?role=dm or
//    ?role=player&character=<id> on the WebSocket, X-Kit-Role /
//    X-Kit-Character on REST — and is believed. Only for a trusted home
//    network (and the tests).
const { AUTH_MODE } = require('../config');

const ID_RE = /^[A-Za-z0-9]{1,40}$/;
const SESSION_COOKIE = 'kit_session';
const validId = (id) => (ID_RE.test(String(id || '')) ? String(id) : '');

function openIdentity(role, characterId) {
  const id = validId(characterId);
  if (role === 'dm') return { role: 'dm', tableId: '', characterId: '', characterIds: [], accountId: '' };
  return { role: 'player', tableId: '', characterId: id, characterIds: id ? [id] : [], accountId: '' };
}

function cookieValue(req, name) {
  const header = (req.headers && req.headers.cookie) || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ''; }
    }
  }
  return '';
}

// The account's identity at a table. `want*` are what the browser asked
// for: the table (campaign id, '' = no campaign), the DM view or a player
// view, and which character. Only what the account allows is granted
// (core/access.js); characterIds is read live, so a character linked or
// created after connecting counts at once.
function accountIdentity(account, wantRole, wantCharacter, wantTable) {
  const accounts = require('../features/accounts/service');
  const access = require('./access');
  const characters = require('../features/characters/service');
  const tables = access.tablesFor(account);
  const want = validId(wantCharacter);
  const ids = () => (accounts.find(account.id) || { characterIds: [] }).characterIds;
  const ownAt = (t) => ids().filter((id) => access.tablesOfCharacter(characters.find(id)).includes(t));

  // The table: the one asked for if allowed; else the asked-for character's;
  // else the first one the account DMs (when it wants the DM view); else
  // its first table; none (null) if it has none.
  const has = (t) => tables.some((x) => x.id === t);
  let tableId = typeof wantTable === 'string' && has(wantTable) ? wantTable : undefined;
  if (tableId === undefined && want && ids().includes(want)) tableId = access.tablesOfCharacter(characters.find(want)).find(has);
  if (tableId === undefined && wantRole !== 'player') tableId = (tables.find((t) => t.dm) || {}).id;
  if (tableId === undefined) tableId = tables.length ? tables[0].id : null;
  const dmHere = tableId !== null && access.dmTables(account).includes(tableId);

  const role = dmHere && wantRole !== 'player' ? 'dm' : 'player';
  // A DM looking through a character's eyes may pick any character it runs.
  let characterId = '';
  if (role === 'player') {
    const mine = tableId === null ? ids() : ownAt(tableId);
    if (want && (mine.includes(want) || (dmHere && access.canDmCharacter(account, characters.find(want))))) characterId = want;
    else characterId = mine[0] || '';
  }
  // Checked again on every action and frame: a campaign deleted, or the
  // account taken off it, and this connection is at no table any more.
  const live = () => accounts.find(account.id) || account;
  const stillAt = () => tableId !== null && access.tablesFor(live()).some((t) => t.id === tableId);
  return {
    get role() { return role === 'dm' && stillAt() && access.dmTables(live()).includes(tableId) ? 'dm' : 'player'; },
    get tableId() { return stillAt() ? tableId : null; },
    characterId,
    get characterIds() { return role === 'dm' && characterId ? [...ids(), characterId] : ids(); },
    accountId: account.id,
    get accountRole() { return live().role; },
    username: account.username,
  };
}

function sessionAccount(req) {
  return require('../features/accounts/service').accountForSession(cookieValue(req, SESSION_COOKIE));
}

// From a WebSocket upgrade request (cookie + ?role=&character=). null = refuse.
function identityFromUpgrade(req) {
  let q;
  try { q = new URL(req.url || '/', 'http://localhost').searchParams; } catch { q = new URLSearchParams(); }
  if (AUTH_MODE === 'open') return openIdentity(q.get('role'), q.get('character'));
  const account = sessionAccount(req);
  return account ? accountIdentity(account, q.get('role'), q.get('character'), q.has('campaign') ? q.get('campaign') : undefined) : null;
}

// From a REST request (cookie + X-Kit-Role / X-Kit-Character). null = refuse.
function identityFromRequest(req) {
  if (AUTH_MODE === 'open') return openIdentity(req.get('x-kit-role'), req.get('x-kit-character'));
  const account = sessionAccount(req);
  const table = req.get('x-kit-campaign');
  return account ? accountIdentity(account, req.get('x-kit-role'), req.get('x-kit-character'), table === undefined ? undefined : table) : null;
}

// Routes written before accounts: a refused request counts as a player
// with no character, which they already turn away.
const identityFromHeaders = (req) => req.identity || identityFromRequest(req) || openIdentity('player', '');

// The DM of the table this identity is at (open mode: whoever said so).
const isDm = (identity) => !!identity && identity.role === 'dm';
// May the identity act for `characterId`? A player: one of its account's
// characters. A DM: any character in a campaign it runs (the admin: all;
// open mode: all).
function owns(identity, characterId) {
  if (!identity || !characterId) return false;
  if (isDm(identity)) {
    if (!identity.accountId) return true; // open mode
    const access = require('./access');
    return access.canDmCharacter(access.accountOf(identity), require('../features/characters/service').find(characterId));
  }
  return (identity.characterIds || []).includes(characterId);
}

module.exports = {
  SESSION_COOKIE, cookieValue, identityFromUpgrade, identityFromRequest, identityFromHeaders, isDm, owns,
};
