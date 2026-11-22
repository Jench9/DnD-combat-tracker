// Accounts, invite links and login sessions (AUTH_MODE 'accounts').
// No WebSocket or HTTP knowledge here.
//
//   accounts.json  [{ id, username, passHash, role: 'admin' | 'dm' | 'player',
//                    characterIds: [...], campaignIds: [...], disabled, createdAt }]
//     admin  runs the server: every account and campaign, DM everywhere
//     dm     may create campaigns and is DM only of the campaigns it runs
//            (campaign.dmIds); may also play characters elsewhere
//     player plays its characters
//     campaignIds: campaigns it plays in (as a player) even without a
//     character there yet (from an invite); see core/access.js
//   invites.json   [{ hash, role, characterIds, campaignIds, accountId, createdBy, expiresAt, createdAt }]
//                  accountId set = a password reset link for that account
//   sessions.json  [{ hash, accountId, createdAt, expiresAt }]
//
// Only hashes of invite codes and session tokens are saved (SHA-256 of a
// 32-byte random value), so the files can't be used to log in. Passwords
// are scrypt hashes with a per-password salt. These three files are not
// part of backups (features/backup) and a restore never replaces them.
//
// One account may play several characters (`characterIds`).
const crypto = require('crypto');
const { uid } = require('../../core/ids');
const { createJsonStore } = require('../../core/jsonStore');
const { SESSION_DAYS } = require('../../config');

const ROLES = ['admin', 'dm', 'player'];
const CAMPAIGN_RE = /^[a-z0-9]{1,20}$/;
const cleanCampaigns = (list) => [...new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && CAMPAIGN_RE.test(x)))].slice(0, 50);
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,28}[A-Za-z0-9]$/;
const CHAR_ID_RE = /^[A-Za-z0-9]{1,40}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const INVITE_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

const accountStore = createJsonStore('accounts', []);
const inviteStore = createJsonStore('invites', []);
const sessionStore = createJsonStore('sessions', []);

const cleanIds = (list) => [...new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && CHAR_ID_RE.test(x)))].slice(0, 50);

function loadAccounts() {
  const saved = accountStore.load();
  return (Array.isArray(saved) ? saved : [])
    .filter((a) => a && typeof a.id === 'string' && typeof a.username === 'string' && typeof a.passHash === 'string')
    .map((a) => ({
      id: a.id,
      username: a.username,
      passHash: a.passHash,
      role: ROLES.includes(a.role) ? a.role : 'player',
      characterIds: cleanIds(a.characterIds),
      campaignIds: cleanCampaigns(a.campaignIds),
      disabled: a.disabled === true,
      createdAt: a.createdAt || new Date().toISOString(),
    }));
}
// Accounts from before the admin role: the oldest DM becomes the admin.
function withAdmin(list) {
  if (!list.some((a) => a.role === 'admin')) {
    const first = list.filter((a) => a.role === 'dm').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
    if (first) first.role = 'admin';
  }
  return list;
}
const now = () => Date.now();
const live = (list) => (Array.isArray(list) ? list : []).filter((x) => x && typeof x.hash === 'string' && x.expiresAt > now());

let accounts = withAdmin(loadAccounts());
let invites = live(inviteStore.load());
let sessions = live(sessionStore.load());

function reload() {
  accounts = withAdmin(loadAccounts());
  invites = live(inviteStore.load());
  sessions = live(sessionStore.load());
}

const saveAccounts = () => accountStore.save(accounts);
const saveInvites = () => inviteStore.save(invites);
const saveSessions = () => sessionStore.save(sessions);

// ---- secrets
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) => {
      if (err) reject(err);
      else resolve(`scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`);
    });
  });
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return Promise.resolve(false);
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  return new Promise((resolve) => {
    crypto.scrypt(String(password), Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p }, (err, key) => {
      resolve(!err && key.length === expected.length && crypto.timingSafeEqual(key, expected));
    });
  });
}
// Same cost as a real check, for unknown usernames (no timing hint).
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

// ---- validation (returns an error message or '')
function usernameError(username) {
  const u = String(username || '').trim();
  if (!USERNAME_RE.test(u)) return 'Usernames are 3–30 letters, digits, spaces, dots, dashes or underscores.';
  if (findByUsername(u)) return 'That username is taken.';
  return '';
}
function passwordError(password) {
  const p = String(password || '');
  if (p.length < MIN_PASSWORD) return `Passwords need at least ${MIN_PASSWORD} characters.`;
  if (p.length > MAX_PASSWORD) return 'That password is too long.';
  return '';
}

// ---- accounts
const all = () => accounts;
const find = (id) => accounts.find((a) => a.id === id) || null;
const findByUsername = (username) => {
  const key = String(username || '').trim().toLowerCase();
  return accounts.find((a) => a.username.toLowerCase() === key) || null;
};
const needsSetup = () => !accounts.some((a) => a.role === 'admin' && !a.disabled);
const otherAdmins = (id) => accounts.some((x) => x.id !== id && x.role === 'admin' && !x.disabled);

// What the browser (and the DM's account list) may see: never the hash.
const publicView = (a) => a && ({
  id: a.id, username: a.username, role: a.role, characterIds: a.characterIds, campaignIds: a.campaignIds, disabled: a.disabled, createdAt: a.createdAt,
});

async function create({ username, password, role = 'player', characterIds = [], campaignIds = [] }) {
  const err = usernameError(username) || passwordError(password);
  if (err) return { error: err };
  const account = {
    id: uid() + uid(),
    username: String(username).trim(),
    passHash: await hashPassword(String(password)),
    role: ROLES.includes(role) ? role : 'player',
    characterIds: cleanIds(characterIds),
    campaignIds: cleanCampaigns(campaignIds),
    disabled: false,
    createdAt: new Date().toISOString(),
  };
  // Checked again after the (async) hash: two requests racing for a name.
  if (findByUsername(account.username)) return { error: 'That username is taken.' };
  accounts.push(account);
  saveAccounts();
  return { account };
}

// The account for a username + password, or null. Disabled accounts can't log in.
async function checkLogin(username, password) {
  const a = findByUsername(username);
  const ok = await verifyPassword(password, a ? a.passHash : DUMMY_HASH);
  return ok && a && !a.disabled ? a : null;
}

async function setPassword(id, password) {
  const a = find(id);
  const err = passwordError(password);
  if (!a || err) return { error: err || 'No such account.' };
  a.passHash = await hashPassword(String(password));
  saveAccounts();
  endSessions(id); // log out everywhere else; the caller starts a fresh one
  return { account: a };
}

// Edits: { role?, characterIds?, campaignIds?, disabled? } (who may change
// what is checked by the route). The last active admin can't be demoted
// or disabled (nobody could manage the server any more).
function update(id, patch) {
  const a = find(id);
  if (!a) return { error: 'No such account.' };
  const next = { ...a };
  if (ROLES.includes(patch.role)) next.role = patch.role;
  if (Array.isArray(patch.characterIds)) next.characterIds = cleanIds(patch.characterIds);
  if (Array.isArray(patch.campaignIds)) next.campaignIds = cleanCampaigns(patch.campaignIds);
  if (typeof patch.disabled === 'boolean') next.disabled = patch.disabled;
  if (a.role === 'admin' && !a.disabled && (next.role !== 'admin' || next.disabled) && !otherAdmins(id)) {
    return { error: 'This is the only admin account: make another admin first.' };
  }
  Object.assign(a, next);
  saveAccounts();
  if (a.disabled) endSessions(id);
  return { account: a };
}

function remove(id) {
  const a = find(id);
  if (!a) return { error: 'No such account.' };
  if (a.role === 'admin' && !otherAdmins(id)) {
    return { error: 'This is the only admin account: make another admin first.' };
  }
  accounts = accounts.filter((x) => x.id !== id);
  saveAccounts();
  endSessions(id);
  invites = invites.filter((i) => i.accountId !== id);
  saveInvites();
  return { ok: true };
}

// A character created by a player belongs to their account.
function linkCharacter(accountId, characterId) {
  const a = find(accountId);
  if (!a || !CHAR_ID_RE.test(String(characterId)) || a.characterIds.includes(characterId)) return;
  a.characterIds.push(characterId);
  saveAccounts();
}
// A deleted campaign leaves every account.
function leaveCampaign(campaignId) {
  let changed = false;
  accounts.forEach((a) => {
    if (a.campaignIds.includes(campaignId)) { a.campaignIds = a.campaignIds.filter((x) => x !== campaignId); changed = true; }
  });
  if (changed) saveAccounts();
}
// A deleted character leaves every account.
function unlinkCharacter(characterId) {
  let changed = false;
  accounts.forEach((a) => {
    if (a.characterIds.includes(characterId)) { a.characterIds = a.characterIds.filter((x) => x !== characterId); changed = true; }
  });
  if (changed) saveAccounts();
}

// ---- invites: { role, characterIds } for a new account, or { accountId }
// for a password reset. Returns the code (shown once; only its hash is kept).
function createInvite({ role = 'player', characterIds = [], campaignIds = [], accountId = '', createdBy = '' } = {}) {
  const code = token();
  invites.push({
    hash: sha256(code),
    role: ROLES.includes(role) ? role : 'player',
    characterIds: cleanIds(characterIds),
    campaignIds: cleanCampaigns(campaignIds),
    createdBy: String(createdBy || ''),
    accountId: accountId && find(accountId) ? accountId : '',
    createdAt: new Date().toISOString(),
    expiresAt: now() + INVITE_DAYS * DAY,
  });
  saveInvites();
  return { code, expiresAt: invites[invites.length - 1].expiresAt };
}
function findInvite(code) {
  const h = sha256(code);
  return invites.find((i) => i.hash === h && i.expiresAt > now()) || null;
}
function useInvite(code) {
  const h = sha256(code);
  invites = invites.filter((i) => i.hash !== h);
  saveInvites();
}
// Open invites for the DM's list (no codes: those were shown once).
const pendingInvites = () => invites.filter((i) => i.expiresAt > now()).map((i) => ({
  id: i.hash.slice(0, 12), role: i.role, characterIds: i.characterIds, campaignIds: i.campaignIds || [], accountId: i.accountId,
  createdBy: i.createdBy || '', createdAt: i.createdAt, expiresAt: i.expiresAt,
}));
function revokeInvite(id) {
  invites = invites.filter((i) => i.hash.slice(0, 12) !== id);
  saveInvites();
}

// ---- sessions
function startSession(accountId) {
  const t = token();
  sessions.push({ hash: sha256(t), accountId, createdAt: new Date().toISOString(), expiresAt: now() + SESSION_DAYS * DAY });
  saveSessions();
  return { token: t, maxAge: SESSION_DAYS * DAY };
}
// The (enabled) account behind a session token, or null.
function accountForSession(t) {
  if (!t) return null;
  const h = sha256(t);
  const s = sessions.find((x) => x.hash === h);
  if (!s) return null;
  if (s.expiresAt <= now()) { endSession(t); return null; }
  const a = find(s.accountId);
  return a && !a.disabled ? a : null;
}
function endSession(t) {
  const h = sha256(t);
  sessions = sessions.filter((x) => x.hash !== h);
  saveSessions();
}
// Listeners (the hub) close live connections of an account that was logged out.
const endListeners = new Set();
function onSessionsEnded(fn) { endListeners.add(fn); }
function endSessions(accountId, { except = '' } = {}) {
  const keep = except ? sha256(except) : '';
  sessions = sessions.filter((x) => x.accountId !== accountId || x.hash === keep);
  saveSessions();
  endListeners.forEach((fn) => fn(accountId));
}

// The one-time code that allows creating the first DM account; printed in
// the server log while there is no DM (or set with KIT_SETUP_CODE).
let setupCode = process.env.KIT_SETUP_CODE || '';
function getSetupCode() {
  if (!setupCode) setupCode = crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
  return setupCode;
}
function checkSetupCode(code) {
  const a = Buffer.from(String(code || '').trim().toUpperCase());
  const b = Buffer.from(getSetupCode().toUpperCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  reload, all, find, findByUsername, needsSetup, publicView, create, checkLogin, setPassword, update, remove,
  linkCharacter, unlinkCharacter, leaveCampaign, usernameError, passwordError,
  createInvite, findInvite, useInvite, pendingInvites, revokeInvite,
  startSession, accountForSession, endSession, endSessions, onSessionsEnded,
  getSetupCode, checkSetupCode, MIN_PASSWORD,
};
