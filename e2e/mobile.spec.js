// Phones: the pages move to a bottom bar (core/nav.js phoneNav), the top bar
// keeps 🏠 + the current page + the badges, and touch screens get 16 px
// fields (no iOS zoom on focus) and ≥ 44 px tap targets.
const { test, expect } = require('@playwright/test');
const { as, watchErrors, send, snapshot, noErrors } = require('./helpers');

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

test.describe('phone: combat strip, sheet tabs, dialogs', () => {
  test.use(PHONE);
  test.beforeAll(async () => {
    await send([
      ['clearAll', {}],
      ['addCharacterToCombat', { characterId: 'mobpc', init: 20 }],
      ['addCombatant', { name: 'Bandit', init: 5, hp: 11, maxHp: 11, ac: 12, type: 'monster' }],
    ]);
  });

  test('player: your turn + HP strip above the bar', async ({ page }) => {
    const errors = watchErrors(page);
    await as(page, 'mobpc');
    await page.goto('/combat.html');
    const strip = page.locator('#meStrip');
    await expect(strip).toBeVisible();
    const before = (await snapshot('state')).state.combatants.find((c) => c.characterId === 'mobpc').hp;
    await strip.getByRole('button', { name: '1 damage' }).tap();
    await expect(strip.locator('.me-hp-val')).toHaveText(new RegExp('^' + (before - 1) + '/'));
    await strip.getByRole('button', { name: 'Heal 1' }).tap();
    await expect(strip.locator('.me-hp-val')).toHaveText(new RegExp('^' + before + '/'));
    // The strip and the bar don't cover each other.
    const s = await strip.boundingBox();
    const b = await page.locator('.phone-nav').boundingBox();
    expect(s.y + s.height).toBeLessThanOrEqual(b.y + 1);
    await noErrors(errors);
  });

  test('DM: no strip', async ({ page }) => {
    await as(page, 'dm');
    await page.goto('/combat.html');
    await expect(page.locator('.row').first()).toBeVisible();
    await expect(page.locator('#meStrip')).toHaveCount(0);
  });

  test('"Who are you?" rises from the bottom', async ({ page }) => {
    await page.goto('/combat.html');
    const box = page.locator('.join-box');
    await expect(box).toBeVisible();
    const r = await box.boundingBox();
    expect(Math.round(r.y + r.height)).toBeGreaterThanOrEqual(740 - 1);
  });

  test('sheet tabs stay at the top while scrolling', async ({ page }) => {
    await as(page, 'mobpc');
    await page.goto('/characters.html');
    const tabs = page.locator('#sheetTabs');
    await expect(tabs).toBeVisible();
    await page.mouse.wheel(0, 2500);
    await expect.poll(async () => (await tabs.boundingBox()).y).toBeLessThanOrEqual(1);
    await tabs.locator('[data-tab=notes]').tap();
    await expect(page.locator('#tab-notes')).toBeVisible();
  });
});

test.describe('phone: pages fit, app install', () => {
  test.use(PHONE);

  for (const url of ['/', '/combat.html', '/characters.html', '/monsters.html', '/items.html', '/spells.html', '/map.html', '/content.html']) {
    test(`${url} is no wider than the phone`, async ({ page }) => {
      await as(page, 'dm');
      await page.goto(url);
      await expect(page.locator('.phone-nav')).toBeVisible();
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });
  }

  test('sheet tabs fade where more tabs are off-screen', async ({ page }) => {
    await as(page, 'mobpc');
    await page.goto('/characters.html');
    const tabs = page.locator('#sheetTabs');
    await expect(tabs).toHaveClass(/more-right/);
    await tabs.locator('[data-tab=notes]').tap();
    await expect(tabs).toHaveClass(/more-left/);
    await expect(tabs).not.toHaveClass(/more-right/);
  });

  test('installable: manifest and icons', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    const res = await request.get('/' + href);
    expect(res.headers()['content-type']).toContain('application/manifest+json');
    const m = await res.json();
    expect(m.display).toBe('standalone');
    const sizes = m.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const i of m.icons) expect((await request.get('/' + i.src)).ok()).toBe(true);
    expect((await request.get('/' + await page.locator('link[rel=apple-touch-icon]').getAttribute('href'))).ok()).toBe(true);
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
