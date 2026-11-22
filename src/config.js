// Central place for runtime settings and limits.
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
  // Where saved state (e.g. characters.json) lives between restarts.
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  JSON_BODY_LIMIT: '2mb',
  MAX_PDF_BYTES: 15 * 1024 * 1024, // 15MB
  // Largest portrait image (uploaded or imported). Stored as a base64 data
  // URL, which is ~4/3 the size; see MAX_PORTRAIT_CHARS in characters/model.
  MAX_PORTRAIT_BYTES: 200 * 1024, // 200KB
  MAX_MAP_BYTES: 20 * 1024 * 1024, // 20MB — battle map background uploads
  MAP_MAX_SIDE: 2560, // px — larger backgrounds are shrunk (when sharp is available)
  MAX_BACKUP_BYTES: 500 * 1024 * 1024, // 500MB — a restore upload (map images included)
  // Who may connect (core/identity.js):
  //   'accounts' (default) — log in with a username and password; the DM
  //     account is created on first start with a one-time setup code
  //     printed in the server log.
  //   'open' — no login: each browser says whether it's the DM or which
  //     character it plays (trusted home network only; also the tests).
  AUTH_MODE: process.env.KIT_AUTH === 'open' ? 'open' : 'accounts',
  // Behind an HTTPS proxy (Caddy, nginx, a tunnel): how many proxies to
  // trust for X-Forwarded-Proto/For (Express "trust proxy"). 0 = none.
  TRUST_PROXY: Number.parseInt(process.env.TRUST_PROXY || '0', 10) || 0,
  // Session cookie lifetime; also forces the Secure flag when set to 1
  // (otherwise Secure is used whenever the request came over HTTPS).
  SESSION_DAYS: Number.parseInt(process.env.SESSION_DAYS || '30', 10) || 30,
  COOKIE_SECURE: process.env.COOKIE_SECURE === '1',
  // Automatic backups to DATA_DIR/backups/ (features/backup): every N days
  // (0 = off), keeping the newest K.
  AUTO_BACKUP_DAYS: Number.parseFloat(process.env.AUTO_BACKUP_DAYS ?? '7') || 0,
  AUTO_BACKUP_KEEP: Math.max(1, Number.parseInt(process.env.AUTO_BACKUP_KEEP || '2', 10) || 2),
  MAX_WS_MESSAGE_BYTES: 4 * 1024 * 1024, // a sheet patch with a portrait fits easily
};
