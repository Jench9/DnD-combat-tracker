// Shared bits for the browser tests: open a page as the DM / a player /
// nobody, collect page errors, and seed server state over WebSocket.
const WebSocket = require('ws');
const { expect } = require('@playwright/test');

const PORT = process.env.E2E_PORT || 3199;
const BASE = `http://localhost:${PORT}`;

// Identity as the browser stores it (core/identity.js), set before any script runs.
// `null`: nobody (a fresh browser context has empty storage already).
async function as(page, who) {
  if (!who) return;
  const value = who === 'dm' ? { role: 'dm' } : who ? { role: 'player', characterId: who } : null;
  await page.addInitScript((v) => {
    try {
      if (v) localStorage.setItem('kit.identity', JSON.stringify(v));
      else localStorage.removeItem('kit.identity');
    } catch { /* ignore */ }
  }, value);
}

// Uncaught errors and console.error on the page. Web fonts are blocked (no
// network in tests), and their load errors are ignored.
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
  });
  page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return errors;
}

// Send actions as the DM (or `who`) over WebSocket; resolves after the
// server has answered the last one.
function send(actions, who = 'role=dm') {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/?${who}`);
    ws.on('error', reject);
    ws.on('open', () => {
      actions.forEach(([type, payload]) => ws.send(JSON.stringify({ type, payload })));
      setTimeout(() => { ws.close(); resolve(); }, 300);
    });
  });
}

// The latest state of a feature, as the DM sees it.
function snapshot(wireType) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/?role=dm`);
    ws.on('error', reject);
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === wireType) { ws.close(); resolve(msg); }
    });
  });
}

const json = (body, headers = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Kit-Role': 'dm', ...headers }, body: JSON.stringify(body) });

async function noErrors(errors) {
  expect(errors, errors.join('\n')).toEqual([]);
}

module.exports = { BASE, as, watchErrors, send, snapshot, json, noErrors };
