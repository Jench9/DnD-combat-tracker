// Accounts mode: setup, login, sessions, invites, multiple characters per
// account, and that nothing works without a login.
process.env.KIT_AUTH = 'accounts';
process.env.KIT_SETUP_CODE = 'TEST-CODE-1234';
const test = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { startServer, connect } = require('./helpers');

// A tiny cookie-keeping client.
function client(base) {
  let cookie = '';
  async function call(method, path, body, headers = {}) {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = r.headers.get('set-cookie');
    const m = set && /kit_session=([^;]*)/.exec(set);
    if (m) cookie = m[1] ? `kit_session=${m[1]}` : ''; // cleared on logout
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data, setCookie: set };
  }
  return { call, get cookie() { return cookie; } };
}

// Resolves with the HTTP status a WebSocket handshake gets (101 = opened).
function handshake(port, headers = {}, query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}/?${query}`, { headers });
    ws.on('open', () => { ws.close(); resolve(101); });
    ws.on('unexpected-response', (req, res) => resolve(res.statusCode));
    ws.on('error', () => {});
  });
}

test('accounts: setup, login, invites, several characters, permissions', async () => {
  const srv = await startServer();
  const base = `http://localhost:${srv.port}`;
  try {
    const dm = client(base);
    const anon = client(base);

    // Nothing without a login.
    assert.deepStrictEqual((await anon.call('GET', '/api/auth/status')).data, { mode: 'accounts', needsSetup: true, account: null });
    assert.strictEqual((await anon.call('GET', '/api/characters/summary')).status, 401);
    assert.strictEqual(await handshake(srv.port), 401);
    assert.strictEqual(await handshake(srv.port, {}, 'role=dm'), 401, 'asking to be the DM is not enough');

    // Setup needs the code from the log.
    assert.strictEqual((await dm.call('POST', '/api/auth/setup', { code: 'nope', username: 'Dee Em', password: 'secret-pass' })).status, 403);
    const setup = await dm.call('POST', '/api/auth/setup', { code: 'test-code-1234', username: 'Dee Em', password: 'secret-pass' });
    assert.strictEqual(setup.status, 200, JSON.stringify(setup.data));
    assert.match(setup.setCookie, /HttpOnly/i);
    assert.match(setup.setCookie, /SameSite=Lax/i);
    assert.strictEqual(setup.data.account.role, 'admin');
    assert.strictEqual(setup.data.account.passHash, undefined, 'never sent');
    assert.strictEqual((await anon.call('POST', '/api/auth/setup', { code: 'TEST-CODE-1234', username: 'Again', password: 'secret-pass' })).status, 409);

    // The DM's browser connects (cookie) and is the DM.
    const dmWs = connect(srv.port, '', { headers: { Cookie: dm.cookie } });
    await dmWs.opened;
    dmWs.send('addCharacter', { id: 'hero1' });
    dmWs.send('addCharacter', { id: 'hero2' });
    dmWs.send('addCharacter', { id: 'other' });
    await dmWs.next('charState', (m) => m.characters.length === 3);
    const acc = await dmWs.next('accountState', (m) => m.accounts.list);
    assert.strictEqual(acc.accounts.list.length, 1);

    // Invite a player with two characters; the link works once.
    const inv = await dm.call('POST', '/api/accounts/invites', { role: 'player', characterIds: ['hero1', 'hero2'] });
    assert.match(inv.data.path, /^\/join\.html#invite=/);
    const player = client(base);
    assert.strictEqual((await player.call('GET', `/api/auth/invite/${inv.data.code}`)).data.kind, 'new');
    assert.strictEqual((await player.call('POST', `/api/auth/invite/${inv.data.code}`, { username: 'pl', password: 'short' })).status, 400);
    assert.strictEqual((await player.call('POST', `/api/auth/invite/${inv.data.code}`, { username: 'dee em', password: 'long-enough' })).data.error, 'That username is taken.');
    const joined = await player.call('POST', `/api/auth/invite/${inv.data.code}`, { username: 'Lyra', password: 'long-enough' });
    assert.strictEqual(joined.status, 200);
    assert.deepStrictEqual(joined.data.account.characterIds, ['hero1', 'hero2']);
    assert.strictEqual((await anon.call('POST', `/api/auth/invite/${inv.data.code}`, { username: 'Mallory', password: 'long-enough' })).status, 404, 'used up');

    // The player may act for both characters, not for the third, and not as the DM.
    const p1 = connect(srv.port, 'role=dm&character=hero2', { headers: { Cookie: player.cookie } });
    await p1.opened;
    p1.send('updateCharacter', { id: 'hero1', patch: { name: 'One' } });
    p1.send('updateCharacter', { id: 'hero2', patch: { name: 'Two' } });
    p1.send('updateCharacter', { id: 'other', patch: { name: 'Hacked' } });
    p1.send('addCampaign', { id: 'nope', name: 'Not a DM' });
    const cs = await dmWs.next('charState', (m) => m.characters.find((c) => c.id === 'hero2')?.name === 'Two');
    assert.strictEqual(cs.characters.find((c) => c.id === 'hero1').name, 'One');
    assert.strictEqual(cs.characters.find((c) => c.id === 'other').name, '');
    const me = await p1.next('accountState');
    assert.strictEqual(me.accounts.me.username, 'Lyra');
    assert.strictEqual(me.accounts.list, undefined, 'players get only their own account');
    // A player's new character joins their account.
    p1.send('addCharacter', { id: 'hero3' });
    await p1.next('accountState', (m) => m.accounts.me.characterIds.includes('hero3'));
    p1.send('addCharacter', { id: 'other' }); // an existing id: not theirs
    const summary = await player.call('GET', '/api/characters/summary');
    assert.deepStrictEqual(summary.data.characters.map((c) => c.id).sort(), ['hero1', 'hero2', 'hero3'], 'only their own');
    assert.strictEqual((await player.call('POST', '/api/accounts/invites', {})).status, 403);
    assert.strictEqual((await player.call('GET', '/api/backup')).status, 403);

    // Login / wrong password / logout.
    const again = client(base);
    assert.strictEqual((await again.call('POST', '/api/auth/login', { username: 'lyra', password: 'wrong-one' })).status, 401);
    assert.strictEqual((await again.call('POST', '/api/auth/login', { username: 'lyra', password: 'long-enough' })).status, 200);
    assert.strictEqual((await again.call('GET', '/api/auth/status')).data.account.username, 'Lyra');
    await again.call('POST', '/api/auth/logout');
    assert.strictEqual(await handshake(srv.port, { Cookie: again.cookie }), 401);

    // Password change: needs the current one; logs out the other devices.
    const other = client(base);
    await other.call('POST', '/api/auth/login', { username: 'Lyra', password: 'long-enough' });
    assert.strictEqual((await player.call('POST', '/api/auth/password', { current: 'nope', password: 'brand-new-pass' })).status, 403);
    assert.strictEqual((await player.call('POST', '/api/auth/password', { current: 'long-enough', password: 'brand-new-pass' })).status, 200);
    assert.strictEqual((await other.call('GET', '/api/characters/summary')).status, 401, 'other device logged out');
    assert.strictEqual((await player.call('GET', '/api/characters/summary')).status, 200, 'this device stays in');

    // DM: disable → its connections close and it can't log in.
    const lyra = (await dmWs.next('accountState', (m) => m.accounts.list?.some((a) => a.username === 'Lyra'))).accounts.list.find((a) => a.username === 'Lyra');
    // (The password change already closed p1: a fresh connection.)
    const p2 = connect(srv.port, 'role=player', { headers: { Cookie: player.cookie } });
    await p2.opened;
    const closed = new Promise((resolve) => p2.ws.on('close', (code) => resolve(code)));
    assert.strictEqual((await dm.call('PATCH', `/api/accounts/${lyra.id}`, { disabled: true })).status, 200);
    assert.strictEqual(await closed, 4401);
    assert.strictEqual((await client(base).call('POST', '/api/auth/login', { username: 'Lyra', password: 'brand-new-pass' })).status, 401);
    // The only admin can't be demoted or deleted.
    const dmAcc = setup.data.account;
    assert.match((await dm.call('PATCH', `/api/accounts/${dmAcc.id}`, { role: 'player' })).data.error, /only admin/);

    // Reset link for a forgotten password.
    await dm.call('PATCH', `/api/accounts/${lyra.id}`, { disabled: false });
    const reset = await dm.call('POST', `/api/accounts/${lyra.id}/reset`);
    const r = client(base);
    assert.strictEqual((await r.call('GET', `/api/auth/invite/${reset.data.code}`)).data.kind, 'reset');
    assert.strictEqual((await r.call('POST', `/api/auth/invite/${reset.data.code}`, { password: 'after-reset-1' })).status, 200);
    assert.strictEqual((await client(base).call('POST', '/api/auth/login', { username: 'Lyra', password: 'after-reset-1' })).status, 200);

    // Cross-site requests are refused.
    assert.strictEqual((await dm.call('POST', '/api/accounts/invites', {}, { Origin: 'https://evil.example' })).status, 403);
    assert.strictEqual(await handshake(srv.port, { Cookie: dm.cookie, Origin: 'https://evil.example' }), 403);
    dmWs.close();
  } finally {
    await srv.close();
  }
});

test('accounts: security headers, login rate limit', async () => {
  const srv = await startServer();
  const base = `http://localhost:${srv.port}`;
  try {
    const page = await fetch(`${base}/combat.html`);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    assert.strictEqual(page.headers.get('x-frame-options'), 'DENY');
    assert.strictEqual(page.headers.get('x-powered-by'), null);
    const c = client(base);
    let status = 0;
    for (let i = 0; i < 12; i++) status = (await c.call('POST', '/api/auth/login', { username: 'ratelimit', password: 'whatever-1' })).status;
    assert.strictEqual(status, 429);
  } finally {
    await srv.close();
  }
});
