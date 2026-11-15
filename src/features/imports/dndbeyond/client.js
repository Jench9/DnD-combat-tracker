// The only place that talks to D&D Beyond over the network.
// Unofficial endpoint used by most third-party D&D Beyond tools; only
// works for characters whose sharing is set to Public.
// Requires Node 18+ for global fetch.
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

module.exports = { fetchCharacter };
