// Who a connection is. There are no accounts: when someone joins they pick
// "DM" or one of the characters, and the browser sends that choice with
// every WebSocket connection (query string) and REST call (headers).
// It's trust-based — the point is that players' browsers never *receive*
// DM-only information, not to stop someone choosing to be the DM.
//
//   { role: 'dm' | 'player', characterId: '' | '<character id>' }
// Anything missing or unknown is a player with no character (view only).

const ID_RE = /^[A-Za-z0-9]{1,40}$/;

function make(role, characterId) {
  if (role === 'dm') return { role: 'dm', characterId: '' };
  return { role: 'player', characterId: ID_RE.test(String(characterId || '')) ? String(characterId) : '' };
}

// From a WebSocket upgrade request: ws://host/?role=dm  or  ?role=player&character=<id>
function identityFromUrl(url) {
  try {
    const u = new URL(url || '/', 'http://localhost');
    return make(u.searchParams.get('role'), u.searchParams.get('character'));
  } catch {
    return make();
  }
}

// From a REST request: X-Kit-Role / X-Kit-Character headers.
function identityFromHeaders(req) {
  return make(req.get('x-kit-role'), req.get('x-kit-character'));
}

const isDm = (identity) => !!identity && identity.role === 'dm';
// True if `characterId` is the player's own character (the DM owns everything).
const owns = (identity, characterId) => isDm(identity)
  || (!!identity && !!identity.characterId && identity.characterId === characterId);

module.exports = { identityFromUrl, identityFromHeaders, isDm, owns };
