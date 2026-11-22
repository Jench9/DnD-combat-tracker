// Login and account management over REST (errors must reach the browser).
//
// Public (no session needed):
//   GET  /api/auth/status                 { mode, needsSetup, account | null }
//   POST /api/auth/setup  { code, username, password }   first DM account (setup code from the log)
//   POST /api/auth/login  { username, password }
//   POST /api/auth/logout
//   GET  /api/auth/invite/:code           what the link is for (new account / password reset)
//   POST /api/auth/invite/:code { username?, password }  accept it: account (or new password) + logged in
// Logged in:
//   POST /api/auth/password { current, password }     change your own password (logs out other devices)
// Admin, or a DM within its own campaigns (core/access.js):
//   POST   /api/accounts/invites  { role, characterIds, campaignIds, dmCampaignIds }  -> { code, path } (shown once)
//          campaignIds: it plays in them; dmCampaignIds (admin only): it runs them
//          a DM: role player, into its campaigns, with characters it runs
//   DELETE /api/accounts/invites/:id                      a DM: its own invites
//   PATCH  /api/accounts/:id      { role?, characterIds?, campaignIds?, disabled? }
//          a DM: only characterIds / campaignIds, and only the ones it runs
// Admin only:
//   POST   /api/accounts/:id/reset                         -> { code, path } password reset link
//   POST   /api/accounts/:id/logout                        end all its sessions
//   DELETE /api/accounts/:id
// The account list itself travels over the WebSocket (accountState).
const express = require('express');
const accounts = require('./service');
const { AUTH_MODE, COOKIE_SECURE } = require('../../config');
const { SESSION_COOKIE, cookieValue, identityFromRequest } = require('../../core/identity');
const access = require('../../core/access');
const characters = require('../characters/service');
const campaigns = require('../campaigns/service');
const { createRateLimiter } = require('../../core/security');

// Failed logins: 10 per 15 minutes per username, 30 per address (behind a
// tunnel or proxy that hides the visitor's address everyone shares one;
// successful logins never count, so a table logging in at once is fine).
const loginLimit = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
const loginIpLimit = createRateLimiter({ max: 30, windowMs: 15 * 60 * 1000 });
// Invite / setup codes: 30 lookups per 15 minutes per address.
const codeLimit = createRateLimiter({ max: 30, windowMs: 15 * 60 * 1000 });

function setSessionCookie(req, res, { token, maxAge }) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge, secure: COOKIE_SECURE || req.secure,
  });
}
const clearSessionCookie = (req, res) => res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/', secure: COOKIE_SECURE || req.secure });

const tooMany = (res, wait) => res.status(429).json({ error: `Too many attempts — try again in ${Math.ceil(wait / 60000)} minute(s).` });
const body = (req) => (req.body && typeof req.body === 'object' ? req.body : {});

// onChanged(): accounts or invites changed (resend accountState);
// onRoleChanged(accountId): its live connections must reconnect.
function createAccountsRouter({ onChanged = () => {}, onRoleChanged = () => {} } = {}) {
  const router = express.Router();

  router.get('/auth/status', (req, res) => {
    if (AUTH_MODE === 'open') return res.json({ mode: 'open', needsSetup: false, account: null });
    const me = identityFromRequest(req);
    const account = me ? accounts.find(me.accountId) : null;
    const view = account ? { ...accounts.publicView(account), tables: access.tablesFor(account), mayCreateCampaigns: access.mayCreateCampaigns(account) } : null;
    res.json({ mode: 'accounts', needsSetup: accounts.needsSetup(), account: view });
  });

  // Everything below is about accounts: not in open mode.
  router.use(['/auth', '/accounts'], (req, res, next) => (AUTH_MODE === 'open' ? res.status(404).json({ error: 'Accounts are off (KIT_AUTH=open).' }) : next()));

  router.post('/auth/setup', async (req, res) => {
    const wait = codeLimit.hit('setup:' + req.ip);
    if (wait) return tooMany(res, wait);
    if (!accounts.needsSetup()) return res.status(409).json({ error: 'The DM account already exists — log in instead.' });
    const { code, username, password } = body(req);
    if (!accounts.checkSetupCode(code)) return res.status(403).json({ error: 'Wrong setup code — it is printed in the server log.' });
    const made = await accounts.create({ username, password, role: 'admin' });
    if (made.error) return res.status(400).json({ error: made.error });
    setSessionCookie(req, res, accounts.startSession(made.account.id));
    onChanged();
    res.json({ account: accounts.publicView(made.account) });
  });

  router.post('/auth/login', async (req, res) => {
    const { username, password } = body(req);
    const userKey = 'user:' + String(username || '').trim().toLowerCase();
    const wait = loginIpLimit.wait('ip:' + req.ip) || loginLimit.wait(userKey);
    if (wait) return tooMany(res, wait);
    const account = await accounts.checkLogin(username, password);
    if (!account) {
      loginIpLimit.hit('ip:' + req.ip);
      loginLimit.hit(userKey);
      return res.status(401).json({ error: 'Wrong username or password.' });
    }
    loginLimit.reset(userKey);
    setSessionCookie(req, res, accounts.startSession(account.id));
    res.json({ account: accounts.publicView(account) });
  });

  router.post('/auth/logout', (req, res) => {
    const t = cookieValue(req, SESSION_COOKIE);
    if (t) accounts.endSession(t);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  router.get('/auth/invite/:code', (req, res) => {
    const wait = codeLimit.hit('invite:' + req.ip);
    if (wait) return tooMany(res, wait);
    const inv = accounts.findInvite(req.params.code);
    if (!inv) return res.status(404).json({ error: 'This link is no longer valid — ask the DM for a new one.' });
    const target = inv.accountId && accounts.find(inv.accountId);
    res.json({ kind: target ? 'reset' : 'new', username: target ? target.username : '', role: inv.role, expiresAt: inv.expiresAt });
  });

  router.post('/auth/invite/:code', async (req, res) => {
    const wait = codeLimit.hit('invite:' + req.ip);
    if (wait) return tooMany(res, wait);
    const inv = accounts.findInvite(req.params.code);
    if (!inv) return res.status(404).json({ error: 'This link is no longer valid — ask the DM for a new one.' });
    const { username, password } = body(req);
    let result;
    if (inv.accountId) result = await accounts.setPassword(inv.accountId, password);
    else result = await accounts.create({ username, password, role: inv.role, characterIds: inv.characterIds, campaignIds: inv.campaignIds || [] });
    if (result.error) return res.status(400).json({ error: result.error });
    // "Runs": the new account becomes DM of those campaigns (that still exist).
    if (!inv.accountId) {
      (inv.dmCampaignIds || []).forEach((id) => {
        const c = campaigns.find(id);
        if (c && !c.dmIds.includes(result.account.id)) campaigns.setDms(id, [...c.dmIds, result.account.id]);
      });
    }
    accounts.useInvite(req.params.code);
    setSessionCookie(req, res, accounts.startSession(result.account.id));
    onChanged();
    res.json({ account: accounts.publicView(result.account) });
  });

  // ---- logged in
  router.use(['/auth/password', '/accounts'], (req, res, next) => {
    req.identity = identityFromRequest(req);
    if (!req.identity) return res.status(401).json({ error: 'Please log in.' });
    next();
  });

  router.post('/auth/password', async (req, res) => {
    const me = accounts.find(req.identity.accountId);
    const { current, password } = body(req);
    const wait = loginLimit.hit('pw:' + me.id);
    if (wait) return tooMany(res, wait);
    if (!(await accounts.checkLogin(me.username, current))) return res.status(403).json({ error: 'Your current password is wrong.' });
    const result = await accounts.setPassword(me.id, password);
    if (result.error) return res.status(400).json({ error: result.error });
    setSessionCookie(req, res, accounts.startSession(me.id)); // this device stays logged in
    res.json({ ok: true });
  });

  // ---- account management: the admin (everything) and DMs (their own
  // campaigns' players: invite them, give or take the characters they run).
  const meOf = (req) => accounts.find(req.identity.accountId);
  router.use('/accounts', (req, res, next) => {
    const me = meOf(req);
    if (me && (me.role === 'admin' || access.dmTables(me).length)) return next();
    res.status(403).json({ error: 'Only the admin and the DMs of a campaign can manage accounts.' });
  });
  const adminOnly = (req, res, next) => (access.isAdmin(meOf(req)) ? next() : res.status(403).json({ error: 'Only the admin can do that.' }));

  const invitePath = (code) => `/join.html#invite=${code}`;
  const inviteBody = (data) => ({ code: data.code, path: invitePath(data.code), expiresAt: data.expiresAt });

  router.post('/accounts/invites', (req, res) => {
    const me = meOf(req);
    const { role = 'player', characterIds = [], campaignIds = [], dmCampaignIds = [] } = body(req);
    if (!access.isAdmin(me) && Array.isArray(dmCampaignIds) && dmCampaignIds.length) {
      return res.status(403).json({ error: 'Only the admin can make someone a campaign\'s DM.' });
    }
    if (!access.isAdmin(me)) {
      // A DM invites players into the campaigns it runs, with characters it runs.
      if (role !== 'player') return res.status(403).json({ error: 'Only the admin can invite DMs.' });
      const mine = access.dmTables(me);
      if (!Array.isArray(campaignIds) || !campaignIds.length || campaignIds.some((id) => !mine.includes(id))) {
        return res.status(400).json({ error: 'Choose one of your campaigns for the invite.' });
      }
      if ((Array.isArray(characterIds) ? characterIds : []).some((id) => !access.canDmCharacter(me, characters.find(id)))) {
        return res.status(403).json({ error: 'You can only give characters from your own campaigns.' });
      }
    }
    const made = accounts.createInvite({ role, characterIds, campaignIds, dmCampaignIds, createdBy: me.id });
    onChanged();
    res.json(inviteBody(made));
  });

  router.delete('/accounts/invites/:id', (req, res) => {
    const me = meOf(req);
    const inv = accounts.pendingInvites().find((i) => i.id === req.params.id);
    if (inv && !access.isAdmin(me) && inv.createdBy !== me.id) return res.status(403).json({ error: 'That invite is not yours.' });
    accounts.revokeInvite(req.params.id);
    onChanged();
    res.json({ ok: true });
  });

  router.patch('/accounts/:id', (req, res) => {
    const me = meOf(req);
    const before = accounts.find(req.params.id);
    if (!before) return res.status(404).json({ error: 'No such account.' });
    let patch = body(req);
    if (!access.isAdmin(me)) {
      // A DM: only who plays which of its characters, and its campaigns' memberships.
      if (patch.role !== undefined || patch.disabled !== undefined) return res.status(403).json({ error: 'Only the admin can do that.' });
      if (before.role === 'admin') return res.status(403).json({ error: 'Only the admin can change the admin.' });
      const mine = new Set(access.dmTables(me));
      const out = {};
      if (Array.isArray(patch.characterIds)) {
        const runs = (id) => access.canDmCharacter(me, characters.find(id));
        out.characterIds = [...before.characterIds.filter((id) => !runs(id)), ...patch.characterIds.filter(runs)];
      }
      if (Array.isArray(patch.campaignIds)) {
        out.campaignIds = [...before.campaignIds.filter((id) => !mine.has(id)), ...patch.campaignIds.filter((id) => mine.has(id))];
      }
      patch = out;
    }
    const was = { role: before.role, disabled: before.disabled };
    const result = accounts.update(req.params.id, patch);
    if (result.error) return res.status(400).json({ error: result.error });
    if (result.account.role !== was.role || result.account.disabled !== was.disabled) onRoleChanged(result.account.id);
    onChanged();
    res.json({ account: accounts.publicView(result.account) });
  });

  router.post('/accounts/:id/reset', adminOnly, (req, res) => {
    if (!accounts.find(req.params.id)) return res.status(404).json({ error: 'No such account.' });
    const made = accounts.createInvite({ accountId: req.params.id, createdBy: req.identity.accountId });
    onChanged();
    res.json(inviteBody(made));
  });

  router.post('/accounts/:id/logout', adminOnly, (req, res) => {
    if (!accounts.find(req.params.id)) return res.status(404).json({ error: 'No such account.' });
    accounts.endSessions(req.params.id);
    res.json({ ok: true });
  });

  router.delete('/accounts/:id', adminOnly, (req, res) => {
    if (req.params.id === req.identity.accountId) return res.status(400).json({ error: "You can't delete your own account here." });
    const result = accounts.remove(req.params.id);
    if (result.error) return res.status(400).json({ error: result.error });
    onChanged();
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAccountsRouter };
