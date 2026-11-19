// Maps a D&D Beyond inventory onto the item library. Pure: takes the D&D
// Beyond payload and the current library, returns what to do.
//
//   planInventory(data, library, newId) -> {
//     inventory:  [{ id, itemId, name, qty, equipped }]  for the character
//     newItems:   [{ id, patch }]  magic/homebrew weapons and armor that
//                 aren't in the library yet — created as custom items
//     otherText:  other gear not in the library, for "Other equipment"
//   }
//
// D&D Beyond's character JSON is unofficial; fields are read defensively.
// An item in both SRD editions ("Longsword" 2024, "Longsword (2014)") is
// taken in the character's edition, then custom, then the other edition.
const { detectEdition } = require('./modifiers');

const ARMOR_TYPE_BY_ID = { 1: 'light', 2: 'medium', 3: 'heavy', 4: 'shield' };
const PROPERTY_NAMES = ['ammunition', 'finesse', 'heavy', 'light', 'loading', 'reach', 'special', 'thrown', 'two-handed'];

const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9+]+/g, ' ').trim();

// Names D&D Beyond might use for a library item: "Crossbow, Light" is the
// library's "Light Crossbow"; "Leather" is "Leather Armor".
function nameKeys(name) {
  const n = norm(name);
  const keys = new Set([n]);
  const parts = String(name || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2 && !/^\+\d$/.test(parts[1])) keys.add(norm(parts[1] + ' ' + parts[0]));
  keys.add(n.replace(/ armor$/, ''));
  keys.add(n + ' armor');
  return [...keys].filter(Boolean);
}

// Index the library by normalised name (also without "(20)" bundles and
// without a trailing "armor"): key -> [items].
function indexLibrary(library) {
  const idx = new Map();
  library.forEach((it) => {
    const n = norm(it.name);
    new Set([n, n.replace(/ armor$/, '')]).forEach((k) => {
      if (!k) return;
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(it);
    });
  });
  return idx;
}

// D&D Beyond weapons/armor only match library items of the same type: the
// SRD lists e.g. "Flame Tongue" as a (dice-less) magic item, and matching
// a flame tongue longsword to it would lose its attack.
const WANT_TYPE = { Weapon: 'weapon', Armor: 'armor' };
function findInLibrary(idx, name, filterType, edition = '2024') {
  const want = WANT_TYPE[filterType];
  const rank = (it) => (it.edition === edition ? 0 : !it.edition ? 1 : 2);
  const candidates = nameKeys(name).flatMap((k) => idx.get(k) || []).sort((a, b) => rank(a) - rank(b));
  return want ? candidates.find((it) => it.type === want) : candidates[0];
}

// Library items sold in bundles, e.g. "Arrows (20)": D&D Beyond counts
// single arrows, so 35 arrows = 2 bundles.
function bundleQty(item, qty) {
  const m = /\((\d+)\)/.exec(item.name);
  return m ? Math.max(1, Math.ceil(qty / parseInt(m[1], 10))) : qty;
}

const magicBonus = (def, subTypes) => (Array.isArray(def.grantedModifiers) ? def.grantedModifiers : [])
  .filter((m) => m && m.type === 'bonus' && subTypes.includes(m.subType))
  .reduce((sum, m) => sum + (Number(m.value) || 0), 0);

function costText(def) {
  return Number(def.cost) > 0 ? `${def.cost} gp` : '';
}

// A library item built from D&D Beyond's own data, for weapons and armor
// we don't have yet. Returns null if there isn't enough to go on.
function itemFromDefinition(def, library) {
  const filter = String(def.filterType || '');
  const notes = 'Imported from D&D Beyond.' + (def.magic ? ' Magic item.' : '');
  if (filter === 'Weapon') {
    const props = (Array.isArray(def.properties) ? def.properties : []).map((p) => String(p && p.name || '').toLowerCase());
    const versatile = (def.properties || []).find((p) => p && String(p.name).toLowerCase() === 'versatile');
    let damage = def.damage && def.damage.diceString;
    let damageType = String(def.damageType || '').toLowerCase();
    // Generic magic weapons may only name their base weapon.
    const base = (indexLibrary(library).get(norm(def.type)) || []).find((it) => it.type === 'weapon');
    if (!damage && base && base.type === 'weapon') { damage = base.damage; damageType = damageType || base.damageType; }
    if (!damage) return null;
    const ranged = def.attackType === 2;
    const range = def.longRange && (ranged || props.includes('thrown')) ? `${def.range || def.longRange}/${def.longRange}` : '';
    return {
      name: def.name,
      type: 'weapon',
      weaponCategory: def.categoryId === 2 ? 'martial' : 'simple',
      attackType: ranged ? 'ranged' : 'melee',
      damage,
      damageType: damageType || 'bludgeoning',
      versatileDamage: (versatile && versatile.notes) || (base && base.versatileDamage) || '',
      range,
      properties: PROPERTY_NAMES.filter((p) => props.includes(p)),
      magicBonus: magicBonus(def, ['magic']),
      cost: costText(def),
      weight: Number(def.weight) || 0,
      notes,
    };
  }
  if (filter === 'Armor') {
    const armorType = ARMOR_TYPE_BY_ID[def.armorTypeId];
    if (!armorType || !Number(def.armorClass)) return null;
    return {
      name: def.name,
      type: 'armor',
      armorType,
      baseAc: Number(def.armorClass),
      maxDex: armorType === 'medium' ? 2 : armorType === 'heavy' ? 0 : null,
      strengthReq: Number(def.strengthRequirement) || 0,
      stealthDisadvantage: def.stealthCheck === 2,
      magicBonus: magicBonus(def, ['magic', 'armor-class']),
      cost: costText(def),
      weight: Number(def.weight) || 0,
      notes,
    };
  }
  return null;
}

function planInventory(data, library, newId) {
  const ddbItems = Array.isArray(data.inventory) ? data.inventory : [];
  const idx = indexLibrary(library);
  const edition = detectEdition(data);
  const inventory = [];
  const newItems = [];
  const created = new Map(); // normalised name -> new item id (dedupe within one import)
  const other = [];

  ddbItems.forEach((entry) => {
    const def = entry && entry.definition;
    if (!def || !def.name) return;
    const qty = Math.max(1, parseInt(entry.quantity, 10) || 1);
    const equipped = !!entry.equipped;

    const lib = findInLibrary(idx, def.name, def.filterType, edition);
    if (lib) {
      inventory.push({ id: newId(), itemId: lib.id, name: lib.name, qty: bundleQty(lib, qty), equipped });
      return;
    }
    const key = norm(def.name);
    let itemId = created.get(key);
    if (!itemId) {
      const patch = itemFromDefinition(def, library);
      if (!patch) {
        other.push(qty > 1 ? `${def.name} x${qty}` : def.name);
        return;
      }
      // Don't clash with a same-named library entry of another type.
      if (nameKeys(def.name).some((k) => idx.has(k))) patch.name = `${def.name} (${def.type || patch.type})`;
      itemId = newId();
      created.set(key, itemId);
      newItems.push({ id: itemId, patch });
    }
    inventory.push({ id: newId(), itemId, name: def.name, qty, equipped });
  });

  return { inventory, newItems, otherText: other.join('\n') };
}

module.exports = { planInventory, nameKeys, itemFromDefinition, indexLibrary, findInLibrary, bundleQty };
