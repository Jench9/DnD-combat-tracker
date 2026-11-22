// Browser smoke tests (npm run test:e2e). Starts the app on its own port
// with an empty, temporary data folder, so the real data/ is never touched.
// Dev-only: the Docker image installs with --omit=dev.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { defineConfig } = require('@playwright/test');

const PORT = process.env.E2E_PORT || 3199;
// One folder per run (the config is loaded by every worker: reuse it).
if (!process.env.E2E_DATA_DIR) process.env.E2E_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-e2e-'));
// A second server with accounts (login) for e2e/auth.spec.js; the others
// run without login (KIT_AUTH=open) so they can pick an identity directly.
const AUTH_PORT = process.env.E2E_AUTH_PORT || 3198;
if (!process.env.E2E_AUTH_DATA_DIR) process.env.E2E_AUTH_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-e2e-auth-'));

module.exports = defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.js',
  workers: 1, // one shared server: tests change its state
  fullyParallel: false,
  timeout: 30000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 900 },
  },
  webServer: [
    {
      command: 'node server.js',
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      env: { PORT: String(PORT), DATA_DIR: process.env.E2E_DATA_DIR, KIT_AUTH: 'open' },
      timeout: 20000,
    },
    {
      command: 'node server.js',
      url: `http://localhost:${AUTH_PORT}/login.html`,
      reuseExistingServer: false,
      env: { PORT: String(AUTH_PORT), DATA_DIR: process.env.E2E_AUTH_DATA_DIR, KIT_AUTH: 'accounts', KIT_SETUP_CODE: 'E2E-SETUP-CODE' },
      timeout: 20000,
    },
  ],
});
