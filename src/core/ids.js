const crypto = require('crypto');

function uid() {
  return crypto.randomBytes(4).toString('hex');
}

module.exports = { uid };
