#!/usr/bin/env node
// Renders the app icon (public/icons/icon.svg) to the PNGs the web app
// manifest and iOS need. Dev-only: uses Playwright's Chromium
// (npx playwright install chromium). Run: node scripts/build-icons.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const DIR = path.join(__dirname, '..', 'public', 'icons');
const svg = fs.readFileSync(path.join(DIR, 'icon.svg'), 'utf8');
// Maskable: full-bleed background, the die shrunk into the 80 % safe zone
// (launchers crop it to a circle or squircle).
const maskable = svg
  .replace('rx="96"', 'rx="0"')
  .replace('<g stroke', '<g transform="translate(256 256) scale(0.78) translate(-256 -256)"><g stroke')
  .replace('</text>', '</text></g>');

const OUT = [
  ['icon-192.png', 192, svg],
  ['icon-512.png', 512, svg],
  ['icon-maskable-512.png', 512, maskable],
  ['apple-touch-icon.png', 180, maskable], // iOS rounds the corners itself
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, src] of OUT) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(DIR, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('wrote', name);
  }
  await browser.close();
})();
