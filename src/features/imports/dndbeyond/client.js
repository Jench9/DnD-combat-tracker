// The only place that talks to D&D Beyond over the network.
// Unofficial endpoint used by most third-party D&D Beyond tools; only
// works for characters whose sharing is set to Public.
// Uses global fetch; avatar resizing needs sharp (Node >= 20.9).
const DDB_URL = 'https://character-service.dndbeyond.com/character/v5/character';

// Resolves to { ok, status, json, bodyPreview }. `json` is null when the
// body isn't valid JSON; `bodyPreview` is the first chunk of the raw
// response, kept for logging when something looks wrong.
async function fetchCharacter(ddbId) {
  const resp = await fetch(`${DDB_URL}/${ddbId}`);
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: resp.ok, status: resp.status, json, bodyPreview: text.slice(0, 300) };
}

const { MAX_PORTRAIT_BYTES } = require('../../../config');

const AVATAR_SIZE = 256; // px, square — same as portraits uploaded in the app
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024; // refuse to even decode anything bigger

// sharp is loaded on first use so the rest of the app still runs where it
// can't load (it needs Node >= 20.9); avatars are then just skipped.
let sharp;
function loadSharp() {
  if (sharp === undefined) {
    try {
      sharp = require('sharp');
    } catch (err) {
      sharp = null;
      console.warn('D&D Beyond avatar: image resizing unavailable, avatars will be skipped:', err.message.split('\n')[0]);
    }
  }
  return sharp;
}

// Crops/resizes any image sharp can decode to a small square JPEG.
// Resolves to a Buffer, or rejects if the bytes aren't an image.
async function shrinkAvatar(bytes) {
  return loadSharp()(bytes, { limitInputPixels: 50e6 })
    .rotate() // honour EXIF orientation
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'attention' })
    .flatten({ background: '#ffffff' }) // transparent PNGs get a white, not black, background
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

// D&D Beyond avatars live on its own CDN. Only those hosts are fetched, so
// a crafted payload can't make the server request arbitrary URLs.
function isDdbImageUrl(u) {
  return u.protocol === 'https:' && (u.hostname === 'dndbeyond.com' || u.hostname.endsWith('.dndbeyond.com'));
}

// Fetches a character's avatar as a small JPEG data URL, or '' if there is
// none or it can't be used. Never throws: a missing portrait shouldn't
// fail the import. We ask the CDN for a small version, but it doesn't
// always honour that, so the image is always resized here as well.
async function fetchAvatar(avatarUrl) {
  let url;
  try {
    url = new URL(avatarUrl);
  } catch {
    return '';
  }
  if (!isDdbImageUrl(url) || !loadSharp()) return '';
  url.searchParams.set('width', String(AVATAR_SIZE));
  url.searchParams.set('height', String(AVATAR_SIZE));
  url.searchParams.set('fit', 'crop');
  url.searchParams.set('quality', '85');
  try {
    const resp = await fetch(url, { headers: { Accept: 'image/*' } });
    const type = String(resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!resp.ok || !type.startsWith('image/')) {
      console.warn(`D&D Beyond avatar: skipped (HTTP ${resp.status}, ${type || 'no type'}) ${url}`);
      return '';
    }
    if (Number(resp.headers.get('content-length')) > MAX_DOWNLOAD_BYTES) {
      console.warn(`D&D Beyond avatar: skipped, download too large ${url}`);
      return '';
    }
    const bytes = Buffer.from(await resp.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) {
      console.warn(`D&D Beyond avatar: skipped, download too large (${bytes.length} bytes) ${url}`);
      return '';
    }
    const jpeg = await shrinkAvatar(bytes);
    if (jpeg.length > MAX_PORTRAIT_BYTES) { // practically impossible at 256px, but stay within the model's limit
      console.warn(`D&D Beyond avatar: skipped, still too large after resizing (${jpeg.length} bytes) ${url}`);
      return '';
    }
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch (err) {
    console.warn('D&D Beyond avatar: skipped:', err.message);
    return '';
  }
}

module.exports = { fetchCharacter, fetchAvatar };
