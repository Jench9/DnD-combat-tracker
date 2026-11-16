// Who this browser is: the DM, or a player playing one character. Chosen on
// the "Who are you?" screen (join.js) and remembered in localStorage. Sent
// to the server with the WebSocket URL and REST headers; the server decides
// what this browser may see and do.
//
//   { role: 'dm' }  or  { role: 'player', characterId: '<id>' }
const KEY = 'kit.identity';

export function getIdentity() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && v.role === 'dm') return { role: 'dm', characterId: '' };
    if (v && v.role === 'player' && typeof v.characterId === 'string' && v.characterId) return v;
  } catch { /* storage unavailable or corrupt */ }
  return null;
}

export function setIdentity(identity) {
  try { localStorage.setItem(KEY, JSON.stringify(identity)); } catch { /* storage unavailable */ }
}

export function clearIdentity() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export const isDm = () => getIdentity()?.role === 'dm';
export const myCharacterId = () => (getIdentity()?.role === 'player' ? getIdentity().characterId : '');
// Can this browser change things belonging to that character?
export const ownsCharacter = (characterId) => isDm() || (!!characterId && characterId === myCharacterId());

// For the WebSocket URL.
export function identityQuery() {
  const id = getIdentity();
  if (!id) return '';
  return id.role === 'dm' ? 'role=dm' : 'role=player&character=' + encodeURIComponent(id.characterId);
}

// For fetch() calls to the REST API.
export function identityHeaders() {
  const id = getIdentity();
  if (!id) return {};
  return id.role === 'dm' ? { 'X-Kit-Role': 'dm' } : { 'X-Kit-Role': 'player', 'X-Kit-Character': id.characterId };
}
