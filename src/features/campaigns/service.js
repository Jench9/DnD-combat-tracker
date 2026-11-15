// Campaigns: named groups that characters belong to (character.campaignId).
// Saved to data/campaigns.json. No WebSocket knowledge here.
const { createJsonStore } = require('../../core/jsonStore');

const ID_RE = /^[a-z0-9]{1,20}$/;
const store = createJsonStore('campaigns', []);

function cleanName(name) {
  return String(name || '').trim().slice(0, 60);
}

const saved = store.load();
let campaigns = (Array.isArray(saved) ? saved : [])
  .filter((c) => c && ID_RE.test(c.id) && cleanName(c.name))
  .map((c) => ({ id: c.id, name: cleanName(c.name) }));

function persist() {
  store.save(campaigns);
}

function all() {
  return campaigns;
}

function find(id) {
  return campaigns.find((c) => c.id === id);
}

// Client picks the id (so it can select the new campaign right away).
function add(id, name) {
  const n = cleanName(name);
  if (!ID_RE.test(String(id)) || !n || find(id)) return false;
  campaigns.push({ id, name: n });
  persist();
  return true;
}

function rename(id, name) {
  const c = find(id);
  const n = cleanName(name);
  if (!c || !n) return;
  c.name = n;
  persist();
}

function remove(id) {
  campaigns = campaigns.filter((c) => c.id !== id);
  persist();
}

module.exports = { ID_RE, all, find, add, rename, remove };
