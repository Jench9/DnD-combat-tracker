// sharp (image resizing) is loaded on first use, so the rest of the app
// still runs where it can't load (it needs Node >= 20.9). Callers get null
// and fall back (skip avatars, keep uploaded maps as they are).
let sharp;

function loadSharp() {
  if (sharp === undefined) {
    try {
      sharp = require('sharp');
    } catch (err) {
      sharp = null;
      console.warn('Image resizing (sharp) unavailable — avatars are skipped and maps kept at original size:',
        err.message.split('\n')[0]);
    }
  }
  return sharp;
}

module.exports = { loadSharp };
