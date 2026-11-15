// Central place for runtime settings and limits.
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
  // Where saved state (e.g. characters.json) lives between restarts.
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  JSON_BODY_LIMIT: '2mb',
  MAX_PDF_BYTES: 15 * 1024 * 1024, // 15MB
};
