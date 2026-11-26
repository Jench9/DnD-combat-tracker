// Phones: the pages move to a bottom bar (core/nav.js phoneNav), the top bar
// keeps 🏠 + the current page + the badges, and touch screens get 16 px
// fields (no iOS zoom on focus) and ≥ 44 px tap targets.
const { test, expect } = require('@playwright/test');
const { as, watchErrors, send, noErrors } = require('./helpers');

const PHONE = { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true };

test.beforeAll(async () => {
  await send([
    ['setActiveCampaign', { id: '' }],
    ['addCampaign', { id: 'mobcamp', name: 'Mobile Campaign' }],
    ['addCharacter', { id: 'mobpc', campaignId: 'mobcamp' }],
    ['updateCharacter', { id: 'mobpc', patch: { name: 'Pocket', class: 'Rogue 2', level: 2 } }],
  ]);
});

test.describe('phone', () => {
  test.use(PHONE);

  test('DM: four pages + More in the bottom bar, the rest in the sheet', async ({ page }) => {
    const errors = watchErrors(page);
    await as(page, 'dm');
    await page.goto('/combat.html');
    const bar = page.locator('.phone-nav');
    await expect(bar).toBeVisible();
    await expect(bar.locator('a.pn-btn')).toHaveText([/Combat/i, /Characters/i, /Monsters/i, /Map/i]);
    await expect(bar.locator('a.pn-btn.active')).toHaveText(/Combat/i);
    // Top bar: only 🏠 and the current page are left.
    await expect(page.locator('.nav-tabs .nav-btn:visible')).toHaveCount(2);

    const more = bar.locator('.pn-more');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.tap();
    const sheet = page.locator('.pn-sheet');
    await expect(sheet).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(sheet.locator('a')).toHaveText([/Items/, /Spells/, /Content/]); // no Players: open mode
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();

    // A page from the sheet: More is lit, and the sheet item is the current one.
    await more.tap();
    await sheet.locator('a[href="spells.html"]').tap();
    await expect(page).toHaveURL(/spells\.html/);
    await expect(page.locator('.phone-nav .pn-more')).toHaveClass(/active/);
    await page.locator('.phone-nav .pn-more').tap();
    await expect(page.locator('.pn-sheet a[aria-current="page"]')).toHaveText(/Spells/);
    await page.locator('.pn-sheet-backdrop').tap({ position: { x: 10, y: 10 } });
    await expect(page.locator('.pn-sheet')).toBeHidden();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await noErrors(errors);
  });

  test('player: every page fits, no More', async ({ page }) => {
    const errors = watchErrors(page);
    await as(page, 'mobpc');
    await page.goto('/characters.html');
    const bar = page.locator('.phone-nav');
    await expect(bar.locator('a.pn-btn')).toHaveText([/Combat/i, /Characters/i, /Items/i, /Spells/i, /Map/i]);
    await expect(bar.locator('.pn-more')).toHaveCount(0);
    await noErrors(errors);
  });

  test('touch: 16 px fields, 44 px buttons, the bar steps aside while typing', async ({ page }) => {
    await as(page, 'dm');
    await page.goto('/monsters.html');
    const field = page.locator('input[type=text]:visible, input[type=search]:visible').first();
    await expect(field).toBeVisible();
    expect(await field.evaluate((n) => getComputedStyle(n).fontSize)).toBe('16px');
    const btn = page.locator('.btn:visible').first();
    expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(44);

    await field.focus();
    await expect(page.locator('.phone-nav')).toBeHidden();
    await field.blur();
    await expect(page.locator('.phone-nav')).toBeVisible();
  });
});

test('desktop: no bottom bar, all tabs at the top', async ({ page }) => {
  await as(page, 'dm');
  await page.goto('/combat.html');
  await expect(page.locator('.app-nav .nav-tabs')).toBeVisible();
  await expect(page.locator('.phone-nav')).toBeHidden();
  await expect(page.locator('.nav-tabs .nav-btn:visible')).toHaveCount(8); // 🏠 + 7 tools (no Players in open mode)
  const field = page.locator('.field input').first();
  if (await field.count()) expect(await field.evaluate((n) => getComputedStyle(n).fontSize)).toBe('14px');
});
