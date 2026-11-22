// The main flows of the newer screens, clicked through in a real browser:
// the add panels (combat + map), resource chips, campaign manager,
// duplicate, guided creation, level up, capped library lists.
const { test, expect } = require('@playwright/test');
const { as, watchErrors, send, snapshot, noErrors } = require('./helpers');

const charById = async (id) => (await snapshot('charState')).characters.find((c) => c.id === id);
const combatants = async () => (await snapshot('state')).state.combatants;

test.beforeAll(async () => {
  await send([
    ['clearAll', {}],
    ['addCampaign', { id: 'flowa', name: 'Flow Main' }],
    ['addCampaign', { id: 'flowb', name: 'Flow Side' }],
    ['addCharacter', { id: 'flowpc', campaignId: 'flowa' }],
    ['updateCharacter', { id: 'flowpc', patch: {
      name: 'Brakka', class: 'Barbarian 3', level: 3, hpMax: 30, hpCurrent: 30,
      resources: [{ id: 'r1', name: 'Rage', max: 3, used: 0, recharge: 'long' }],
      spellSlots: [{ max: 2, used: 0 }, ...Array.from({ length: 8 }, () => ({ max: 0, used: 0 }))],
    } }],
    ['addCharacter', { id: 'sidepc', campaignId: 'flowb' }],
    ['updateCharacter', { id: 'sidepc', patch: { name: 'Sidney', class: 'Rogue 2', level: 2 } }],
    ['addCharacter', { id: 'mappc' }],
    ['updateCharacter', { id: 'mappc', patch: { name: 'Mapper', class: 'Ranger 1' } }],
    ['setActiveCampaign', { id: 'flowa' }],
  ]);
});

test('combat: Allies adds a character; its resource chips spend uses', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'dm');
  await page.goto('/combat.html');
  const allies = page.locator('#alliesPanel');
  await expect(allies).toHaveAttribute('open', '');
  // Current campaign first; the others folded away.
  await expect(allies.locator('.party-group-name').first()).toContainText('Flow Main');
  const others = allies.locator('.party-others');
  await expect(others).not.toHaveAttribute('open', '');
  await expect(others.locator('summary')).toContainText('other campaigns');
  await expect(others.locator('.party-name', { hasText: 'Sidney' })).toBeHidden();
  await others.locator('summary').click();
  await expect(others.locator('.party-name', { hasText: 'Sidney' })).toBeVisible();

  const row = allies.locator('.party-row', { hasText: 'Brakka' });
  await row.locator('.party-init').fill('15');
  await row.getByRole('button', { name: 'Add' }).click();
  const combatRow = page.locator('#list .row', { has: page.getByLabel('Initiative for Brakka') });
  await expect(combatRow).toBeVisible();
  const rage = combatRow.locator('.res-chip', { hasText: 'Rage' });
  await expect(rage).toContainText('3/3');
  await rage.getByRole('button', { name: /Spend one/ }).click();
  await expect(rage).toContainText('2/3');
  expect((await charById('flowpc')).resources[0].used).toBe(1);
  const slot = combatRow.locator('.res-chip', { hasText: '1st' });
  await slot.getByRole('button', { name: /Spend one/ }).click();
  await expect(slot).toContainText('1/2');
  await noErrors(errors);
});

test('combat: Enemies loads the SRD, searches and adds a monster', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'dm');
  await page.goto('/combat.html');
  const enemies = page.locator('#enemiesPanel');
  if (!(await enemies.getAttribute('open') !== null)) await enemies.locator('summary').click();
  const load = enemies.getByRole('button', { name: /Load the SRD monsters/ });
  if (await load.count()) await load.click();
  await enemies.locator('#bestiarySearch').fill('goblin warrior');
  const goblin = enemies.locator('.party-row', { hasText: /Goblin Warrior/i }).first();
  await expect(goblin).toBeVisible({ timeout: 10000 });
  await goblin.locator('input.count').fill('2');
  await goblin.getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('#list').getByLabel(/^Initiative for Goblin Warrior \d$/)).toHaveCount(2);

  // Quick add an enemy, hidden from players.
  await enemies.locator('#addHidden').check();
  await enemies.locator('#qa-enemy-name').fill('Lurker');
  await enemies.locator('#qa-enemy-initiative').fill('9');
  await enemies.locator('.add-form .btn').click();
  await expect(page.locator('#list .row.hidden-row', { has: page.getByLabel('Initiative for Lurker') })).toBeVisible();
  await noErrors(errors);
});

test('map: a player joins the battle from the map; the token waits in the tray', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'mappc');
  await page.goto('/map.html');
  const allies = page.locator('#alliesPanel');
  await expect(allies).toHaveAttribute('open', ''); // not in the fight yet: opens by itself
  await expect(page.locator('#enemiesPanel')).toBeHidden();
  await expect(allies.locator('.party-name')).toHaveText(['Mapper']);
  await allies.getByRole('button', { name: 'Add' }).click();
  await expect(allies).not.toHaveAttribute('open', ''); // in the fight: folds itself away
  await expect(page.locator('#tray .tray-name', { hasText: 'Mapper' })).toBeVisible();
  expect((await combatants()).some((c) => c.characterId === 'mappc')).toBe(true);
  await noErrors(errors);
});

test('characters: campaign manager creates a campaign and ticks members', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'dm');
  await page.goto('/characters.html');
  page.on('dialog', (d) => d.accept('Flow New'));
  await page.locator('#campaignManageBtn').click();
  const dlg = page.locator('#campaignDlg');
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: '+ New campaign' }).click();
  await expect(dlg.locator('.cm-title')).toHaveText('Flow New');
  await dlg.locator('.cm-char', { hasText: 'Sidney' }).locator('input').check();
  await expect(dlg.locator('.cm-camp.on .cm-count')).toHaveText('1');
  await expect.poll(async () => (await charById('sidepc')).campaignIds.length).toBe(2);
  // Untick: back to one campaign.
  await dlg.locator('.cm-char', { hasText: 'Sidney' }).locator('input').uncheck();
  await expect.poll(async () => (await charById('sidepc')).campaignIds).toEqual(['flowb']);
  await dlg.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('#csCampaigns')).toHaveCount(0); // no longer on the sheet
  await noErrors(errors);
});

test('characters: duplicate opens a copy', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'dm');
  await page.goto('/characters.html#edit=sidepc');
  await expect(page.locator('#csName')).toHaveValue('Sidney');
  await page.locator('#duplicateCharBtn').click();
  await expect(page.locator('#csName')).toHaveValue('Copy of Sidney');
  await expect.poll(async () => (await snapshot('charState')).characters.filter((c) => c.name === 'Copy of Sidney').length).toBe(1);
  await noErrors(errors);
});

test('characters: guided creation builds a level 1 Fighter', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'dm');
  await page.goto('/characters.html');
  await page.locator('#newCharBtn').click();
  const dlg = page.locator('#creatorDlg');
  await expect(dlg).toBeVisible();
  const next = async () => {
    await dlg.getByRole('button', { name: 'Next →' }).click();
    await expect(dlg.locator('.b-msg')).toHaveText('');
  };
  const card = (name) => dlg.locator('.b-card', { has: page.locator('.b-card-title', { hasText: new RegExp(`^${name}$`) }) });

  await card('Fighter').click();
  await next(); // species
  await card('Dwarf').click();
  await next(); // background
  await card('Soldier').click();
  const selects = dlg.locator('.b-select');
  await selects.nth(1).selectOption('str');
  await selects.nth(2).selectOption('con');
  await next(); // abilities
  await dlg.getByRole('button', { name: /Suggest for/ }).click();
  await next(); // skills (+ fighting style)
  // The step redraws after each tick: click the labels one at a time.
  const free = dlg.locator('.b-check:has(input:not(:disabled):not(:checked))');
  while (await dlg.locator('.b-count:not(.done)').count()) {
    await free.first().click();
  }
  const styleSelect = dlg.locator('.b-select');
  if (await styleSelect.count()) {
    const opts = await styleSelect.first().locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    if (opts.length) await styleSelect.first().selectOption(opts[0]);
  }
  await next(); // equipment
  await next(); // name & review
  await dlg.locator('input.b-text').first().fill('Tordek');
  await dlg.getByRole('button', { name: /Create character/ }).click();
  await expect(dlg).toBeHidden({ timeout: 10000 });
  await expect(page.locator('#csName')).toHaveValue('Tordek');
  const ch = (await snapshot('charState')).characters.find((c) => c.name === 'Tordek');
  expect(ch.class).toMatch(/Fighter 1/);
  expect(ch.hpMax).toBeGreaterThanOrEqual(10);
  await noErrors(errors);
});

test('characters: level up a Fighter to level 2', async ({ page }) => {
  const errors = watchErrors(page);
  const ch = (await snapshot('charState')).characters.find((c) => c.name === 'Tordek');
  test.skip(!ch, 'needs the character from the guided creation test');
  await as(page, 'dm');
  await page.goto(`/characters.html#edit=${ch.id}`);
  await page.locator('#levelUpBtn').click();
  const dlg = page.locator('#levelUpDlg');
  await expect(dlg).toBeVisible();
  const confirmBtn = dlg.getByRole('button', { name: /Become Fighter 2/ });
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();
  await expect(dlg).toBeHidden({ timeout: 10000 });
  await expect.poll(async () => (await charById(ch.id)).class).toMatch(/Fighter 2/);
  await noErrors(errors);
});

test('items and spells: long groups are capped with "Show all"', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'dm');
  for (const url of ['/items.html', '/spells.html']) {
    await page.goto(url);
    await expect(page.locator('.show-more').first()).toBeVisible();
    // Pin the group by position: after "Show all" it no longer matches :has(.show-more).
    const idx = await page.locator('.item-group').evaluateAll((gs) => gs.findIndex((g) => g.querySelector('.show-more')));
    const group = page.locator('.item-group').nth(idx);
    const more = group.locator('.show-more');
    await expect(more).toBeVisible();
    const before = await group.locator(':scope > *').count();
    expect(before).toBe(31); // 30 rows + the button
    await more.click();
    await expect(group.locator('.show-more')).toHaveCount(0);
    expect(await group.locator(':scope > *').count()).toBeGreaterThan(before);
  }
  await noErrors(errors);
});

test('content: a DM adds a species with a source tag; the guided creation shows it tagged', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, 'dm');
  await page.goto('/content.html');
  await page.click('#addBtn');
  const dlg = page.locator('#editDlg');
  await expect(dlg).toBeVisible();
  await dlg.locator('select').first().selectOption('species');
  await dlg.getByPlaceholder('e.g. Aasimar').fill('Aasimar');
  await dlg.locator('input[list="sourceList"]').fill("Player's Handbook (2024)");
  await dlg.getByRole('button', { name: '+ Add trait' }).click();
  await dlg.getByPlaceholder('Trait name').fill('Celestial Resistance');
  await dlg.getByPlaceholder('What it does').fill('Resistance to Necrotic and Radiant damage.');
  await dlg.locator('#saveBtn').click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('#kindTabs button.on')).toHaveText(/Species \(1\)/);
  const item = page.locator('.ct-item', { hasText: 'Aasimar' });
  await expect(item.locator('.ct-tag')).toHaveText("Player's Handbook (2024)");
  await expect(item).toContainText('Medium · speed 30 ft · 1 trait');

  // A missing name is refused with a message.
  await page.click('#addBtn');
  await dlg.locator('select').first().selectOption('feat');
  await dlg.locator('#saveBtn').click();
  await expect(page.locator('#editMsg')).toHaveText('Give it a name.');
  await dlg.locator('#cancelBtn').click();

  // In New character → Species: the card with its tag; SRD ones say SRD 5.2.
  await page.goto('/characters.html');
  await page.locator('#newCharBtn').click();
  const wiz = page.locator('#creatorDlg');
  await wiz.locator('.b-card', { hasText: /^Fighter/ }).click();
  await wiz.getByRole('button', { name: 'Next →' }).click();
  const card = wiz.locator('.b-card', { hasText: 'Aasimar' });
  await expect(card.locator('.b-card-tag')).toHaveText("Player's Handbook (2024)");
  await expect(wiz.locator('.b-card', { hasText: 'Dwarf' }).locator('.b-card-tag')).toHaveText('SRD 5.2');
  await card.click();
  await expect(wiz).toContainText('Celestial Resistance');
  await noErrors(errors);
});
