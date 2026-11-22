// Client-side state for the characters page: the synced list, which
// character is open, and the pending-edit tracking.
//
// Pending-edit tracking: when you type, the change is sent after a short
// debounce, and the server then echoes the full state back. An echo
// caused by an EARLIER edit can arrive while a newer edit is still unsent,
// so without care it would overwrite what you just typed. We remember
// which fields were touched in the last couple of seconds and keep the
// local value for those when new state arrives.

const TOUCH_TTL = 2500;
const touched = new Map(); // key -> timestamp

export const store = {
  characters: [],
  activeCharId: null,
  campaigns: [],
  accounts: [], // the admin's account list (accounts mode: who runs each campaign)
  items: [], // the item library (for inventory and actions)
  spells: [], // the spell library (for the spellbook and actions)
  combat: null, // combat state (is the familiar in the fight?)
  // Campaign filter on the list view: ALL, NONE, or a campaign id.
  campaignFilter: 'all',
  // Set by main.js once the socket exists.
  send: () => {},
};

export const ALL = 'all';
export const NONE = 'none';

export function findChar(id) { return store.characters.find((c) => c.id === id); }
export function cur() { return findChar(store.activeCharId); }

export function patchChar(patch) {
  if (store.activeCharId) store.send('updateCharacter', { id: store.activeCharId, patch });
}

export function touch(key) { touched.set(key, Date.now()); }
export function clearTouched() { touched.clear(); }
// A server action (e.g. a rest) is about to change these fields: let its
// echo through instead of keeping recently edited local values.
export function untouch(...keys) { keys.forEach((k) => touched.delete(k)); }

function isRecent(key) {
  const t = touched.get(key);
  return t !== undefined && Date.now() - t < TOUCH_TTL;
}

// Keys: 'f:<prop>', 'a:<ability>', 'save:<ability>', 'skill:<name>', 'expert:<name>'.
export function mergePending(prev, next) {
  for (const [key] of touched) {
    if (!isRecent(key)) { touched.delete(key); continue; }
    const kind = key.slice(0, key.indexOf(':'));
    const name = key.slice(key.indexOf(':') + 1);
    if (kind === 'f') next[name] = prev[name];
    else if (kind === 'a') next.abilities[name] = prev.abilities[name];
    else if (kind === 'save') next.saveProf[name] = prev.saveProf[name];
    else if (kind === 'skill') next.skillProf[name] = prev.skillProf[name];
    else if (kind === 'expert') next.skillExpert = { ...(next.skillExpert || {}), [name]: !!(prev.skillExpert || {})[name] };
  }
}

export function blankCharacter(id) {
  return {
    id, portrait: '',
    name: '', race: '', class: '', level: 1, background: '', alignment: '',
    ac: 10, speed: 30, hitDice: '1d8',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    hpMax: 10, hpCurrent: 10, hpTemp: 0,
    saveProf: {}, skillProf: {},
    equipment: '', features: '', notes: '',
    ddbId: '',
    campaignIds: [],
    campaignId: '',
    inventory: [],
    acAuto: true,
    weaponProf: { simple: true, martial: false },
    spellAbility: '',
    spellSlots: Array.from({ length: 9 }, () => ({ max: 0, used: 0 })),
    spells: [],
    modifiers: [],
    hitDiceUsed: { d6: 0, d8: 0, d10: 0, d12: 0 },
    pactMagic: { level: 0, count: 0 },
    resources: [],
    rulesEdition: '2024',
    inspiration: false,
    exhaustion: 0,
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    classes: [], skillExpert: {}, feats: [],
  };
}
