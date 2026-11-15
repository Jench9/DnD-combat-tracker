// Pure mapping: PDF form fields -> our character patch.
const {
  PDF_FIELD_ALIASES, PDF_NUMERIC_FIELDS, PDF_ABILITY_ALIASES, PDF_SKILL_ALIASES,
} = require('./aliases');

function normalizeFieldName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// fields: [{ name, value, type: 'text'|'checkbox' }]
function mapPdfFormFields(fields) {
  const byNorm = new Map();
  fields.forEach((f) => byNorm.set(normalizeFieldName(f.name), f));

  const patch = { abilities: {}, saveProf: {}, skillProf: {} };
  const used = new Set();

  function take(aliasList, targetKey, isNumber) {
    for (const alias of aliasList) {
      const f = byNorm.get(alias);
      if (f && f.value !== '' && f.value != null) {
        patch[targetKey] = isNumber ? (parseInt(f.value, 10) || 0) : String(f.value);
        used.add(normalizeFieldName(f.name));
        return;
      }
    }
  }

  Object.entries(PDF_FIELD_ALIASES).forEach(([key, aliases]) => {
    take(aliases, key, PDF_NUMERIC_FIELDS.includes(key));
  });

  // Most fillable sheets only have a combined "ClassLevel" field like
  // "Rogue 4" or "Fighter 3 / Wizard 2" and no separate level field —
  // sum any numbers found in the class text as a fallback.
  if (patch.level === undefined && typeof patch.class === 'string') {
    const nums = patch.class.match(/\d+/g);
    if (nums) patch.level = nums.reduce((sum, n) => sum + parseInt(n, 10), 0);
  }

  Object.entries(PDF_ABILITY_ALIASES).forEach(([abilKey, aliases]) => {
    for (const alias of aliases) {
      const f = byNorm.get(alias);
      if (f && f.value !== '' && f.value != null) {
        patch.abilities[abilKey] = parseInt(f.value, 10) || 10;
        used.add(normalizeFieldName(f.name));
        break;
      }
    }
  });

  Object.entries(PDF_SKILL_ALIASES).forEach(([label, alias]) => {
    const f = byNorm.get(alias);
    if (f && f.type === 'checkbox' && f.value) {
      patch.skillProf[label] = true;
      used.add(normalizeFieldName(f.name));
    }
  });

  // Anything we didn't recognize gets preserved as text rather than
  // silently dropped, so the user can still find and copy it in.
  const leftover = fields
    .filter((f) => !used.has(normalizeFieldName(f.name)) && f.value !== '' && f.value != null && f.value !== false)
    .map((f) => `${f.name}: ${f.value}`)
    .join('\n');

  return { patch, leftover };
}

module.exports = { normalizeFieldName, mapPdfFormFields };
