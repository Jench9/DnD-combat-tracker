// Accounts mode in a real browser: first-start setup, invite link, a
// player's first visit, live account updates, logout and login. Runs
// against the second server (port 3198, KIT_AUTH=accounts), in order.
const { test, expect } = require('@playwright/test');
const { watchErrors, noErrors } = require('./helpers');

// An account's card on the Players page, by its exact username.
const card = (page, name) => page.locator('.pl-acc', { has: page.locator('.pl-name', { hasText: new RegExp(`^${name}$`) }) });

const BASE = `http://localhost:${process.env.E2E_AUTH_PORT || 3198}`;
test.describe.configure({ mode: 'serial' });

let dmState; // the DM's cookies, reused by later tests
let inviteUrl = '';

test('first start: any page leads to setup; the DM account is created', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.goto(BASE + '/combat.html');
  await expect(page).toHaveURL(/\/login\.html\?next=%2Fcombat\.html/);
  await expect(page.locator('#setupForm')).toBeVisible();
  await page.fill('#setupCode', 'wrong');
  await page.fill('#setupUser', 'Dungeon Master');
  await page.fill('#setupPass', 'dm-password-1');
  await page.fill('#setupPass2', 'dm-password-1');
  await page.click('#setupForm button[type=submit]');
  await expect(page.locator('#setupMsg')).toContainText('setup code');
  await page.fill('#setupCode', 'e2e-setup-code');
  await page.click('#setupForm button[type=submit]');
  await expect(page).toHaveURL(/\/players\.html$/);
  await expect(card(page, 'Dungeon Master')).toContainText('You');
  await expect(card(page, 'Dungeon Master')).toContainText('Admin');
  await expect(page.locator('.id-badge:not(.dice-toggle)')).toHaveText(/DM/);
  dmState = await context.storageState();
  await noErrors(errors);
});

test('the DM invites a player; the player joins, creates a character; the DM sees it live', async ({ browser }) => {
  const dmCtx = await browser.newContext({ storageState: dmState });
  const dm = await dmCtx.newPage();
  const errors = watchErrors(dm);
  await dm.goto(BASE + '/players.html');
  await dm.click('#invBtn');
  await expect(dm.locator('#invResult')).toBeVisible();
  inviteUrl = await dm.inputValue('#invUrl');
  expect(inviteUrl).toMatch(/\/join\.html#invite=/);
  await expect(dm.locator('#invList .pl-inv')).toHaveCount(1);

  const plCtx = await browser.newContext();
  const pl = await plCtx.newPage();
  const plErrors = watchErrors(pl);
  await pl.goto(inviteUrl);
  await expect(pl.locator('#inviteForm')).toBeVisible();
  await pl.fill('#inviteUser', 'Lyra');
  await pl.fill('#invitePass', 'lyra-password');
  await pl.fill('#invitePass2', 'lyra-password');
  await pl.click('#inviteSubmit');
  await expect(pl).toHaveURL(BASE + '/');
  const box = pl.locator('.join-box');
  await expect(box.locator('.join-title')).toHaveText('Who are you playing?');
  await expect(box.getByText("I'm the DM")).toHaveCount(0); // a player account
  await expect(box.locator('.join-account')).toContainText('Signed in as Lyra');
  await expect(box).toContainText('You have no character here yet');
  await box.locator('.join-new').first().click();
  await expect(pl).toHaveURL(/characters\.html/);
  await expect(pl.locator('#creatorDlg')).toBeVisible();
  await pl.locator('#creatorDlg .b-close').click();
  await pl.fill('#csName', 'Lyra the Bold');
  await pl.locator('#csName').blur();

  // The DM's Players page updates by itself; the invite is used up.
  await expect(card(dm, 'Lyra').locator('.pl-chip')).toContainText('Lyra the Bold');
  await expect(dm.locator('#invList')).toContainText('No open invites');
  // The used link no longer works.
  const again = await (await browser.newContext()).newPage();
  await again.goto(inviteUrl);
  await expect(again.locator('#inviteBad')).toBeVisible();

  // Monsters (DM only) isn't in the player's top bar.
  await expect(pl.locator('.nav-tabs a[href="monsters.html"]')).toHaveCount(0);
  await expect(pl.locator('.nav-tabs a[href="players.html"]')).toHaveCount(0);
  await noErrors(errors);
  await noErrors(plErrors);
  await plCtx.close();
  await dmCtx.close();
});

test('log out, wrong password, log in again (back to the page asked for)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(BASE + '/login.html?next=%2Fmap.html');
  await page.fill('#loginUser', 'lyra');
  await page.fill('#loginPass', 'not-it-at-all');
  await page.click('#loginForm button[type=submit]');
  await expect(page.locator('#loginMsg')).toHaveText('Wrong username or password.');
  await page.fill('#loginPass', 'lyra-password');
  await page.click('#loginForm button[type=submit]');
  await expect(page).toHaveURL(BASE + '/map.html');
  await expect(page.locator('.id-badge:not(.dice-toggle)')).toHaveText(/Lyra the Bold/); // their only character, picked for them
  await page.locator('.id-badge:not(.dice-toggle)').click();
  await page.locator('.join-account').getByText('Log out').click();
  await expect(page).toHaveURL(/\/login\.html/);
  await page.goto(BASE + '/characters.html');
  await expect(page).toHaveURL(/\/login\.html\?next=/);
  await noErrors(errors);
});

test('the DM disables the player: their open page goes to the login page', async ({ browser }) => {
  const plCtx = await browser.newContext();
  const pl = await plCtx.newPage();
  await pl.goto(BASE + '/login.html?next=%2Fcombat.html'); // a page with a live connection
  await pl.fill('#loginUser', 'Lyra');
  await pl.fill('#loginPass', 'lyra-password');
  await pl.click('#loginForm button[type=submit]');
  await expect(pl).toHaveURL(BASE + '/combat.html');
  await expect(pl.locator('#alliesPanel')).toBeVisible();

  const dmCtx = await browser.newContext({ storageState: dmState });
  const dm = await dmCtx.newPage();
  await dm.goto(BASE + '/players.html');
  await card(dm, 'Lyra').getByRole('button', { name: 'Disable' }).click();
  await expect(card(dm, 'Lyra')).toContainText('Disabled');
  await expect(pl).toHaveURL(/\/login\.html/, { timeout: 10000 });
  await plCtx.close();
  await dmCtx.close();
});

test('a second DM creates a campaign: its own fight, its own players', async ({ browser }) => {
  // The admin invites a DM.
  const adminCtx = await browser.newContext({ storageState: dmState });
  const admin = await adminCtx.newPage();
  const adminErrors = watchErrors(admin);
  await admin.goto(BASE + '/players.html');
  await admin.selectOption('#invRole', 'dm');
  await admin.click('#invBtn');
  await expect(admin.locator('#invResult')).toBeVisible();
  const dmInvite = await admin.inputValue('#invUrl');

  const anaCtx = await browser.newContext();
  const ana = await anaCtx.newPage();
  const errors = watchErrors(ana);
  await ana.goto(dmInvite);
  await ana.fill('#inviteUser', 'Ana');
  await ana.fill('#invitePass', 'ana-password');
  await ana.fill('#invitePass2', 'ana-password');
  await ana.click('#inviteSubmit');
  const box = ana.locator('.join-box');
  await expect(box).toContainText('You have no campaign yet');
  ana.once('dialog', (d) => d.accept('Ana Campaign'));
  await box.getByText('New campaign (you are its DM)').click();
  await expect(ana.locator('.id-badge:not(.dice-toggle)')).toHaveText(/DM/);

  // Her fight: a goblin the admin's table doesn't have.
  await ana.goto(BASE + '/combat.html');
  const enemies = ana.locator('#enemiesPanel');
  await enemies.locator('#qa-enemy-name').fill('Ana Goblin');
  await enemies.locator('#qa-enemy-initiative').fill('12');
  await enemies.locator('.add-form .btn').click();
  await expect(ana.getByLabel('Initiative for Ana Goblin')).toBeVisible();

  // The admin now has two tables: it picks "No campaign" — no goblin there.
  await admin.goto(BASE + '/combat.html');
  const ab = admin.locator('.join-box');
  await ab.locator('.join-group', { hasText: 'Ana Campaign' }).waitFor();
  await ab.locator('.join-option.dm').nth(1).click(); // tables: Ana Campaign first, then No campaign
  await expect(admin.locator('.id-badge:not(.dice-toggle)')).toHaveText(/DM · No campaign/);
  await admin.waitForTimeout(400);
  await expect(admin.getByLabel('Initiative for Ana Goblin')).toHaveCount(0);

  // It switches to Ana's table and sees her fight.
  await admin.locator('.id-badge:not(.dice-toggle)').click();
  await ab.locator('.join-option.dm').nth(0).click();
  await expect(admin.locator('.id-badge:not(.dice-toggle)')).toHaveText(/DM · Ana Campaign/);
  await expect(admin.getByLabel('Initiative for Ana Goblin')).toBeVisible();

  // Ana's Players page: she invites players into her campaign only; no admin tools.
  await ana.goto(BASE + '/players.html');
  await expect(ana.locator('#invRoleField')).toBeHidden();
  await expect(ana.locator('#invCamps .pl-check')).toHaveText(['Ana Campaign']);
  await expect(ana.getByRole('button', { name: 'Password reset link' })).toHaveCount(0);
  await expect(card(ana, 'Lyra')).toHaveCount(0); // not her player
  await noErrors(errors);
  await noErrors(adminErrors);
  await anaCtx.close();
  await adminCtx.close();
});

test('one account, two roles: a player made DM of a campaign runs it and plays elsewhere', async ({ browser }) => {
  const adminCtx = await browser.newContext({ storageState: dmState });
  const admin = await adminCtx.newPage();
  // Two tables now: the admin picks "No campaign" as its DM.
  await admin.addInitScript(() => localStorage.setItem('kit.identity', JSON.stringify({ role: 'dm', characterId: '', tableId: '' })));
  const errors = watchErrors(admin);
  await admin.goto(BASE + '/players.html');
  const lyraCard = admin.locator('.pl-acc', { has: admin.locator('.pl-name', { hasText: /^Lyra$/ }) });
  await lyraCard.getByRole('button', { name: 'Enable' }).click();
  await expect(lyraCard.locator('.pl-acc-head')).not.toContainText('Disabled');
  // Manage campaigns → Ana Campaign → Run by: tick Lyra (a player account).
  await admin.goto(BASE + '/characters.html');
  await admin.locator('#campaignManageBtn').click();
  const dlg = admin.locator('#campaignDlg');
  await dlg.locator('.cm-camp', { hasText: 'Ana Campaign' }).click();
  await dlg.locator('.cm-dm', { hasText: 'Lyra' }).locator('input').check();
  await expect(dlg.locator('.cm-dm', { hasText: 'Lyra' })).toContainText('(player)');

  const lyraCtx = await browser.newContext();
  const lyra = await lyraCtx.newPage();
  const lyraErrors = watchErrors(lyra);
  await lyra.goto(BASE + '/login.html');
  await lyra.fill('#loginUser', 'Lyra');
  await lyra.fill('#loginPass', 'lyra-password');
  await lyra.click('#loginForm button[type=submit]');
  const box = lyra.locator('.join-box');
  await expect(box.locator('.join-group', { hasText: 'Ana Campaign' })).toContainText('You DM');
  await expect(box.locator('.join-option.dm')).toHaveCount(1);
  await expect(box.locator('.join-option', { hasText: 'Lyra the Bold' })).toBeVisible(); // her character, at No campaign
  await box.locator('.join-option.dm').click();
  await expect(lyra.locator('.id-badge:not(.dice-toggle)')).toHaveText(/DM · Ana Campaign/);
  await lyra.goto(BASE + '/combat.html');
  await expect(lyra.getByLabel('Initiative for Ana Goblin')).toBeVisible();
  await expect(lyra.locator('#enemiesPanel')).toBeVisible(); // DM tools at this table
  // Switch to playing her character: a player at the other table.
  await lyra.locator('.id-badge:not(.dice-toggle)').click();
  await box.locator('.join-option', { hasText: 'Lyra the Bold' }).click();
  await expect(lyra.locator('.id-badge:not(.dice-toggle)')).toHaveText(/Lyra the Bold · No campaign/);
  await expect(lyra.locator('#enemiesPanel')).toBeHidden();
  await expect(lyra.getByLabel('Initiative for Ana Goblin')).toHaveCount(0);
  await noErrors(errors);
  await noErrors(lyraErrors);
  await lyraCtx.close();
  await adminCtx.close();
});

test('the admin plays a character in a campaign and switches between DM view and player view', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dmState });
  const admin = await ctx.newPage();
  const errors = watchErrors(admin);
  await admin.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('kit.identity', JSON.stringify({ role: 'dm', characterId: '', tableId: '' }));
    }
  });
  await admin.goto(BASE + '/combat.html');
  // "+ New character" at Ana's table: made from a player view, so it's the admin's.
  await admin.locator('.id-badge:not(.dice-toggle):not(.view-switch)').click();
  const box = admin.locator('.join-box');
  await box.locator('.join-group', { hasText: 'Ana Campaign' }).locator('.join-new').click();
  await expect(admin.locator('#creatorDlg')).toBeVisible();
  await admin.locator('#creatorDlg .b-close').click();
  await admin.fill('#csName', 'Admin the Bard');
  await admin.locator('#csName').blur();
  await admin.waitForTimeout(500); // the edit reaches the server before we leave

  await admin.goto(BASE + '/combat.html');
  const badge = admin.locator('.id-badge:not(.dice-toggle):not(.view-switch)');
  const toggle = admin.locator('.view-switch');
  await expect(badge).toHaveText(/Admin the Bard · Ana Campaign/);
  await expect(admin.locator('#enemiesPanel')).toBeHidden(); // a player here
  await expect(toggle).toHaveText(/DM view/);
  await toggle.click();
  await expect(badge).toHaveText(/DM · Ana Campaign/);
  await expect(admin.locator('#enemiesPanel')).toBeVisible();
  await expect(toggle).toHaveText(/Player view/);
  await toggle.click();
  await expect(badge).toHaveText(/Admin the Bard · Ana Campaign/); // back to the same character
  await noErrors(errors);
  await ctx.close();
});

test('the admin gives itself an existing character on the Players page', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dmState });
  const admin = await ctx.newPage();
  const errors = watchErrors(admin);
  await admin.addInitScript(() => localStorage.setItem('kit.identity', JSON.stringify({ role: 'dm', characterId: '', tableId: '' })));
  await admin.goto(BASE + '/players.html');
  const me = admin.locator('.pl-acc', { has: admin.locator('.pl-tag.you') });
  const row = me.locator('.pl-acc-row', { hasText: 'Characters' });
  await expect(row).toBeVisible();
  const pick = row.locator('select.pl-give');
  const value = await pick.locator('option', { hasText: 'Lyra the Bold' }).getAttribute('value');
  await pick.selectOption(value);
  await expect(row.locator('.pl-chip', { hasText: 'Lyra the Bold' })).toBeVisible();
  await noErrors(errors);
  await ctx.close();
});

test('an invite with "Runs": the new account runs one campaign and plays in another', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dmState });
  const admin = await ctx.newPage();
  const errors = watchErrors(admin);
  await admin.addInitScript(() => localStorage.setItem('kit.identity', JSON.stringify({ role: 'dm', characterId: '', tableId: '' })));
  // A second campaign to play in (the admin runs every table, so it creates one).
  await admin.goto(BASE + '/characters.html');
  admin.once('dialog', (d) => d.accept('Side Quest'));
  await admin.locator('#campaignManageBtn').click();
  await admin.locator('#campaignDlg').getByRole('button', { name: '+ New campaign' }).click();
  await expect(admin.locator('#campaignDlg .cm-title')).toHaveText('Side Quest');

  await admin.goto(BASE + '/players.html');
  await admin.locator('#invCamps .pl-check', { hasText: 'Side Quest' }).locator('input').check();
  await admin.locator('#invRuns .pl-check', { hasText: 'Ana Campaign' }).locator('input').check();
  await admin.click('#invBtn');
  await expect(admin.locator('#invNote')).toContainText('playing in Side Quest, running Ana Campaign');
  await expect(admin.locator('#invList')).toContainText('running Ana Campaign');
  const url = await admin.inputValue('#invUrl');

  const newCtx = await browser.newContext();
  const rowan = await newCtx.newPage();
  const rErrors = watchErrors(rowan);
  await rowan.goto(url);
  await rowan.fill('#inviteUser', 'Rowan');
  await rowan.fill('#invitePass', 'rowan-password');
  await rowan.fill('#invitePass2', 'rowan-password');
  await rowan.click('#inviteSubmit');
  const box = rowan.locator('.join-box');
  await expect(box.locator('.join-group', { hasText: 'Ana Campaign' })).toContainText('You DM');
  await expect(box.locator('.join-group', { hasText: 'Side Quest' })).not.toContainText('You DM');
  await noErrors(errors);
  await noErrors(rErrors);
  await newCtx.close();
  await ctx.close();
});
