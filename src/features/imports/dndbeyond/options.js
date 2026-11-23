// Class options and subclasses from a D&D Beyond character, in the shapes
// the builder uses, so a synced character levels up like one built here:
//
//   optionFeats(data)                  -> ['invocation:Agonizing Blast', 'metamagic:Quickened Spell', …]
//   mergeOptionFeats(feats, data)      the sheet's `feats` with those replaced
//   classesFrom(data, rules, existing) -> the sheet's `classes` (subclass keys)
//   applyOptionContent(patch, data, rules, newId)
//                                      Content-page options' attack modifiers
//                                      and actions onto the patch
// Pure. D&D Beyond's JSON is unofficial; read defensively.
//
// D&D Beyond lists chosen options under data.options.class, each tied to
// the class feature that grants it (componentId = the feature's id) — e.g.
// "Agonizing Blast (Eldritch Blast)" under "Eldritch Invocations".
const OPTION_FEATURES = [
  [/^eldritch invocations?$/i, 'invocation'],
  [/^metamagic(?: options)?$/i, 'metamagic'],
];
// "Agonizing Blast (Eldritch Blast)" -> "Agonizing Blast" (the cantrip /
// feat it's tied to is D&D Beyond's detail).
const baseName = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const nameOf = (x) => (x && x.definition && x.definition.name) || '';

// Feature id -> option type, for the features that grant options.
function optionFeatureIds(data) {
  const out = new Map();
  (Array.isArray(data.classes) ? data.classes : []).forEach((c) => {
    const feats = [...(c.classFeatures || []), ...((c.subclassDefinition && c.subclassDefinition.classFeatures) || [])];
    feats.forEach((f) => {
      const def = (f && f.definition) || f || {};
      const hit = OPTION_FEATURES.find(([re]) => re.test(String(def.name || '').trim()));
      if (hit && def.id !== undefined) out.set(String(def.id), hit[1]);
    });
  });
  return out;
}

// The option types this character has the feature for (so an empty list
// from D&D Beyond means "none chosen", not "unknown").
function optionTypes(data) {
  return new Set(optionFeatureIds(data).values());
}

function optionFeats(data) {
  const ids = optionFeatureIds(data);
  const list = data.options && Array.isArray(data.options.class) ? data.options.class : [];
  const out = [];
  list.forEach((o) => {
    const type = ids.get(String(o && o.componentId));
    const name = baseName(nameOf(o));
    if (!type || !name) return;
    const tag = `${type}:${name}`.slice(0, 60);
    if (!out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  });
  return out;
}

// D&D Beyond is the source of truth for the option types it has the
// feature for: those tags are replaced; every other feat is kept.
function mergeOptionFeats(feats, data) {
  const types = optionTypes(data);
  const kept = (Array.isArray(feats) ? feats : []).filter((f) => !types.has(String(f).split(':')[0].toLowerCase()));
  return [...kept, ...optionFeats(data)];
}

const norm = (s) => baseName(s).toLowerCase().replace(/^the\s+/, '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

// The sheet's classes with subclass keys: D&D Beyond's subclass matched by
// name to the SRD one or a Content-page one ("The Great Old One" =
// "Great Old One" = "Great Old One Patron"); a subclass chosen here before
// is kept when D&D Beyond names none, or the same one.
function classesFrom(data, rules, existing) {
  const old = new Map((Array.isArray(existing) ? existing : []).map((c) => [c.key, c]));
  return (Array.isArray(data.classes) ? data.classes : []).map((c) => {
    const name = String((c.definition && c.definition.name) || '').trim();
    const def = rules.classes.find((d) => d.name.toLowerCase() === name.toLowerCase());
    const key = def ? def.key : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'class';
    const level = Math.max(1, Math.min(20, parseInt(c.level, 10) || 1));
    const prev = old.get(key) || {};
    const subName = String((c.subclassDefinition && c.subclassDefinition.name) || '').trim();
    let subclass = prev.subclass || '';
    let subclassName = prev.subclassName || '';
    if (subName) {
      const want = norm(subName);
      const strip = (s) => s.replace(/\s+(patron|domain|circle|college|oath|path|tradition|archetype|origin|subclass)$/, '').replace(/^(path|oath|circle|college|school|way) of (the )?/, '');
      const match = def && def.subclasses.find((s) => norm(s.name) === want || strip(norm(s.name)) === strip(want));
      subclass = match ? match.key : '';
      subclassName = match ? match.name : subName.slice(0, 60);
    }
    return { key, name: def ? def.name : name.slice(0, 40), level, subclass, subclassName };
  });
}

// Options known to the Content page bring their attack modifier (e.g.
// Agonizing Blast) and, when used in play, their action — as level up does.
function applyOptionContent(patch, data, rules, newId) {
  const tags = optionFeats(data);
  const options = rules.options || [];
  const modifiers = Array.isArray(patch.modifiers) ? [...patch.modifiers] : [];
  const actions = Array.isArray(patch.customActions) ? [...patch.customActions] : null;
  tags.forEach((tag) => {
    const [type, ...rest] = tag.split(':');
    const name = rest.join(':').toLowerCase();
    const o = options.find((x) => x.optionType === type && x.name.toLowerCase() === name);
    if (!o) return;
    if (o.preset && !modifiers.some((m) => m.preset === o.preset)) modifiers.push({ id: newId(), preset: o.preset, active: true, only: '' });
    if (o.action && actions && !actions.some((a) => a.name.toLowerCase() === o.name.toLowerCase())) {
      actions.push({
        id: newId(), name: o.name, type: o.action, text: String(o.desc || '').slice(0, 1500),
        resource: type === 'metamagic' && o.cost ? 'Sorcery Points' : '', cost: o.cost || 1, source: o.source || '',
      });
    }
  });
  patch.modifiers = modifiers;
  if (actions) patch.customActions = actions;
}

module.exports = { optionFeats, mergeOptionFeats, classesFrom, applyOptionContent, baseName };
