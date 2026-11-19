// The builder's rules data (src/srd/rules-2024.json, made by
// scripts/build-rules.js from SRD 5.2) plus lookups. Loaded once, read-only.
const path = require('path');
const fs = require('fs');

const FILE = path.join(__dirname, '..', '..', '..', 'srd', 'rules-2024.json');
let rules = null;

function getRules() {
  if (!rules) {
    rules = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    rules.classByKey = new Map(rules.classes.map((c) => [c.key, c]));
    rules.featByKey = new Map(rules.feats.map((f) => [f.key, f]));
    rules.speciesByKey = new Map(rules.species.map((s) => [s.key, s]));
    rules.backgroundByKey = new Map(rules.backgrounds.map((b) => [b.key, b]));
  }
  return rules;
}

// The raw JSON for the browser (without the lookup maps).
function rulesFile() {
  return FILE;
}

module.exports = { getRules, rulesFile };
