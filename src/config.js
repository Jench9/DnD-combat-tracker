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
};
