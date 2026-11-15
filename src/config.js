// Central place for runtime settings and limits.
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
  JSON_BODY_LIMIT: '2mb',
  MAX_PDF_BYTES: 15 * 1024 * 1024, // 15MB
};
