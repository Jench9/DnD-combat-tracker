// Every page opens without script errors, as the DM, as a player and as
// someone who hasn't chosen yet (the "Who are you?" screen).
const { test, expect } = require('@playwright/test');
const { as, watchErrors, send, noErrors } = require('./helpers');

const PAGES = ['/', '/combat.html', '/characters.html', '/monsters.html', '/items.html', '/spells.html', '/map.html', '/tv'];

test.beforeAll(async () => {
  await send([
    ['setActiveCampaign', { id: '' }], // no current campaign: nothing folded away
    ['addCampaign', { id: 'smokecamp', name: 'Smoke Campaign' }],
    ['addCharacter', { id: 'smokepc', campaignId: 'smokecamp' }],
    ['updateCharacter', { id: 'smokepc', patch: { name: 'Smoky', class: 'Fighter 3', level: 3 } }],
    ['addCharacterToCombat', { characterId: 'smokepc', init: 12 }],
  ]);
});

for (const who of ['dm', 'smokepc']) {
  for (const url of PAGES) {
    test(`${url} as ${who === 'dm' ? 'the DM' : 'a player'}`, async ({ page }) => {
      const errors = watchErrors(page);
      await as(page, who);
      await page.goto(url);
      if (url !== '/tv') {
        await expect(page.locator('.app-nav .nav-tabs')).toBeVisible();
        await expect(page.locator('.id-badge:not(.dice-toggle)')).toHaveText(who === 'dm' ? /DM/ : /Smoky/);
        await expect(page.locator('.join-overlay')).toHaveCount(0);
      }
      await page.waitForTimeout(400); // let the first state frames render
      await noErrors(errors);
    });
  }
}

test('first visit: "Who are you?" lists the character under its campaign', async ({ page }) => {
  const errors = watchErrors(page);
  await as(page, null);
  await page.goto('/combat.html');
  const box = page.locator('.join-box');
  await expect(box).toBeVisible();
  await expect(box.locator('.join-group', { hasText: 'Smoke Campaign' })).toBeVisible();
  await expect(box.locator('.join-option', { hasText: 'Smoky' })).toBeVisible();
  await box.getByText("I'm the DM").click();
  await expect(page.locator('.id-badge:not(.dice-toggle)')).toHaveText(/DM/);
  await noErrors(errors);
});
