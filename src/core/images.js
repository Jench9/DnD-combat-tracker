// Validation for small images stored inline as data URLs (character
// portraits, monster icons).
const { MAX_PORTRAIT_BYTES } = require('../config');

// Base64 length of a MAX_PORTRAIT_BYTES image plus room for the
// "data:image/jpeg;base64," prefix.
const MAX_PORTRAIT_CHARS = Math.ceil(MAX_PORTRAIT_BYTES / 3) * 4 + 32;

function isImageDataUrl(s) {
  return typeof s === 'string'
    && s.length <= MAX_PORTRAIT_CHARS
    && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
}

// For patches: '' clears, a valid image replaces, anything else keeps `current`.
function sanitizeImage(value, current) {
  if (value === '') return '';
  return isImageDataUrl(value) ? value : current;
}

module.exports = { MAX_PORTRAIT_CHARS, isImageDataUrl, sanitizeImage };
