// Monster shape and validation. Pure functions.
//
// { id, name, ac, hpMax, initBonus, icon (data URL or ''), notes }
const { sanitizeImage } = require('../../core/images');

const ID_RE = /^[a-z0-9]{1,20}$/;

function blankMonster(id) {
  return { id, name: '', ac: 12, hpMax: 10, initBonus: 0, icon: '', notes: '' };
}

const int = (v, min, max, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

function sanitizeMonsterPatch(existing, patch) {
  const next = { ...existing };
  if (typeof patch.name === 'string') next.name = patch.name.slice(0, 40);
  if (patch.ac !== undefined) next.ac = int(patch.ac, 0, 40, existing.ac);
  if (patch.hpMax !== undefined) next.hpMax = int(patch.hpMax, 1, 9999, existing.hpMax);
  if (patch.initBonus !== undefined) next.initBonus = int(patch.initBonus, -10, 20, existing.initBonus);
  if (patch.icon !== undefined) next.icon = sanitizeImage(patch.icon, existing.icon);
  if (typeof patch.notes === 'string') next.notes = patch.notes.slice(0, 2000);
  return next;
}

module.exports = { ID_RE, blankMonster, sanitizeMonsterPatch };
