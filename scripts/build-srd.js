#!/usr/bin/env node
// Builds the app's SRD content (src/srd/*.json) from the open 5e-bits
// "5e-database" JSON (https://github.com/5e-bits/5e-database, MIT), which
// contains the D&D 5e System Reference Documents 5.1 (2014 rules) and 5.2
// (2024 rules) by Wizards of the Coast, licensed CC-BY-4.0.
//
//   node scripts/build-srd.js <dir>
//
// <dir> holds the downloaded source files, named <edition>-<File>.json:
//   2014-Spells.json 2014-Equipment.json 2014-Magic-Items.json 2014-Monsters.json
//   2024-Spells.json 2024-Equipment.json 2024-Magic-Items.json 2024-Monsters.json
// (from src/<edition>/en/5e-SRD-<File>.json in that repository).
//
// Output entries are already in the app's item / spell / monster shapes;
// the libraries validate them again when loading. When a name exists in
// both editions, the 2014 version keeps the plain name and the 2024 one is
// "Name (2024)", so names stay unique (D&D Beyond imports and pickers
// match by name).
'use strict';
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/build-srd.js <dir with 2014-Spells.json, …>');
  process.exit(1);
}
const OUT = path.join(__dirname, '..', 'src', 'srd');
const read = (edition, file) => JSON.parse(fs.readFileSync(path.join(dir, `${edition}-${file}.json`), 'utf8'));

const ABILITY = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const PROPERTIES = ['ammunition', 'finesse', 'heavy', 'light', 'loading', 'reach', 'special', 'thrown', 'two-handed'];

const lower = (s) => String(s || '').trim().toLowerCase();
const text = (v) => (Array.isArray(v) ? v.join('\n') : String(v || '')).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
// "2d6 + 2" -> "2d6+2"; "1d4 + MOD" -> "1d4" (MOD handled by addMod)
const dice = (s) => String(s || '').replace(/\+\s*MOD/i, '').replace(/\s+/g, '').replace(/\+$/, '');
const parseDice = (s) => {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(dice(s));
  return m ? { count: +m[1], sides: +m[2], mod: m[3] ? +m[3] : 0 } : null;
};
const costText = (c) => (c && c.quantity ? `${c.quantity.toLocaleString('en-US')} ${c.unit}` : '');
const feet = (s) => String(s || '').replace(/\bfeet\b|\bfoot\b/gi, 'ft').replace(/ft\./g, 'ft');

// Disambiguate names shared by both editions: the 2024 entry gets " (2024)".
function nameEditions(list2014, list2024) {
  const in2014 = new Set(list2014.map((e) => lower(e.name)));
  list2024.forEach((e) => { if (in2014.has(lower(e.name))) e.name = `${e.name} (2024)`; });
  return [...list2014, ...list2024];
}

// ---------------------------------------------------------------- spells
const CAST = { action: '1 action', 'bonus action': '1 bonus action', reaction: '1 reaction' };
// Returns [castingTime, trigger or ''] — a reaction's or bonus action's
// trigger ("which you take when…") goes into the description so the
// casting time stays short.
function castingTime(s) {
  const raw = String(s || '').trim();
  const t = lower(raw);
  if (CAST[t]) return [CAST[t], ''];
  const m = /^(?:1 )?(reaction|bonus action),?\s*(.*)$/i.exec(raw);
  if (m) return [`1 ${lower(m[1])}`, m[2].trim()];
  return [raw, ''];
}

function spellRange(sp) {
  const r = feet(sp.range);
  const aoe = sp.area_of_effect;
  return aoe && /^self/i.test(r) ? `Self (${aoe.size}-ft ${aoe.type})` : r;
}

// Damage entry as an object (2014 has a list, 2024 an object).
const damageOf = (sp) => (Array.isArray(sp.damage) ? sp.damage[0] : sp.damage) || null;

function spell(sp, edition) {
  const level = sp.level;
  const desc = text(sp.desc || sp.description);
  const higher = text(sp.higher_level);
  const all = `${desc}\n${higher}`;
  const dmg = damageOf(sp);

  let mechanic = 'none';
  let saveAbility = '';
  let saveSuccess = 'half';
  const saveText = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(desc);
  if (sp.attack_type) mechanic = 'attack';
  else if (sp.dc && sp.dc.dc_type) {
    mechanic = 'save';
    saveAbility = sp.dc.dc_type.index;
    saveSuccess = sp.dc.dc_success === 'half' ? 'half' : 'none';
  } else if (saveText) {
    mechanic = 'save';
    saveAbility = ABILITY[lower(saveText[1])];
    saveSuccess = /half as much damage/i.test(desc) ? 'half' : 'none';
  }

  let baseDice = '';
  let addMod = false;
  let higherLevelDice = '';
  let cantripScaling = false;
  let damageType = dmg && dmg.damage_type ? dmg.damage_type.index : '';

  if (sp.heal_at_slot_level) {
    const levels = Object.keys(sp.heal_at_slot_level).map(Number).sort((a, b) => a - b);
    const base = sp.heal_at_slot_level[levels[0]];
    baseDice = dice(base);
    addMod = /MOD/i.test(base);
    const next = parseDice(sp.heal_at_slot_level[levels[1]]);
    const cur = parseDice(base);
    if (cur && next && next.sides === cur.sides && next.count > cur.count) higherLevelDice = `${next.count - cur.count}d${cur.sides}`;
    if (mechanic === 'none') mechanic = 'heal';
    damageType = '';
  } else if (dmg && (dmg.damage_at_slot_level || dmg.damage_at_character_level)) {
    if (dmg.damage_at_character_level) {
      baseDice = dice(dmg.damage_at_character_level[1] || Object.values(dmg.damage_at_character_level)[0]);
      cantripScaling = level === 0;
    } else {
      const levels = Object.keys(dmg.damage_at_slot_level).map(Number).sort((a, b) => a - b);
      baseDice = dice(dmg.damage_at_slot_level[levels[0]]);
      const cur = parseDice(dmg.damage_at_slot_level[levels[0]]);
      const next = parseDice(dmg.damage_at_slot_level[levels[1]]);
      if (cur && next && next.sides === cur.sides && next.count > cur.count) {
        const mod = next.mod - cur.mod;
        higherLevelDice = `${next.count - cur.count}d${cur.sides}${mod ? (mod > 0 ? '+' : '') + mod : ''}`;
      }
    }
    if (mechanic === 'none') mechanic = 'auto';
  } else {
    // 2024 healing: "regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier"
    const heal = /regains? (?:a number of )?Hit Points equal to (\d+d\d+(?:\s*\+\s*\d+)?)( plus your spellcasting ability modifier)?/i.exec(desc)
      || /regains? (\d+d\d+(?:\s*\+\s*\d+)?) Hit Points/i.exec(desc);
    if (heal) {
      baseDice = dice(heal[1]);
      addMod = !!heal[2];
      if (mechanic === 'none') mechanic = 'heal';
    }
  }
  // Damage only described in the text ("takes 3d8 Radiant damage",
  // "3d8 damage of a type you choose").
  const DMG_RE = /(\d+d\d+(?:\s*\+\s*\d+)?) (acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)? ?damage/i;
  if (!baseDice && mechanic !== 'heal') {
    const m = DMG_RE.exec(desc);
    if (m) {
      baseDice = dice(m[1]);
      if (m[2]) damageType = lower(m[2]);
      if (mechanic === 'none') mechanic = 'auto';
    }
  }
  // A second damage type: "2d8 Bludgeoning damage and 4d6 Cold damage".
  let extraDice = '';
  let extraDamageType = '';
  const both = /(\d+d\d+) (\w+) damage (?:and|plus) (\d+d\d+) (\w+) damage/i.exec(desc);
  if (both && DAMAGE_TYPES.includes(lower(both[4])) && lower(both[4]) !== lower(both[2])) {
    extraDice = both[3];
    extraDamageType = lower(both[4]);
  }
  if (!higherLevelDice && level > 0) {
    const m = /(?:damage|healing) increases by (\d+d\d+) for each (?:spell )?slot level above/i.exec(all);
    if (m) higherLevelDice = m[1];
  }
  if (level === 0 && !cantripScaling && baseDice && /Cantrip Upgrade|when you reach (?:5th level|level 5)/i.test(all)) cantripScaling = true;
  if (!DAMAGE_TYPES.includes(damageType)) damageType = '';
  if (mechanic === 'auto' && !baseDice) mechanic = 'none';

  const material = sp.material ? `Material: ${String(sp.material).trim()}\n` : '';
  const [cast, trigger] = castingTime(sp.casting_time);
  const reaction = trigger ? `${cast === '1 reaction' ? 'Reaction' : 'Bonus action'}: ${trigger[0].toUpperCase()}${trigger.slice(1)}\n` : '';
  return {
    name: sp.name,
    edition,
    level,
    school: sp.school ? sp.school.index : 'evocation',
    castingTime: cast,
    range: spellRange(sp),
    components: (sp.components || []).join(', '),
    duration: String(sp.duration || ''),
    concentration: !!sp.concentration,
    ritual: !!sp.ritual,
    classes: (sp.classes || []).map((c) => c.index),
    mechanic,
    saveAbility,
    saveSuccess,
    dice: baseDice,
    damageType: mechanic === 'heal' ? '' : damageType,
    addMod,
    extraDice,
    extraDamageType,
    higherLevelDice,
    cantripScaling,
    description: (reaction + material + desc + (higher ? `\nAt higher levels: ${higher}` : '')).slice(0, 8000),
  };
}

// ---------------------------------------------------------------- items
// "Crossbow, light" -> "Light Crossbow" (weapons only; gear keeps D&D's comma names).
const weaponName = (n) => (/^(\w+), (\w+)$/.test(n) ? n.replace(/^(\w+), (\w+)$/, (_, a, b) => `${b[0].toUpperCase()}${b.slice(1)} ${a}`) : n);
const plural = (n) => (/s$/i.test(n) ? n : `${n}s`);

function categories2024(e) {
  return new Set((e.equipment_categories || []).map((c) => c.index));
}

function equipment(e, edition) {
  const cats2024 = categories2024(e);
  const cat = e.equipment_category ? e.equipment_category.index : '';
  const isWeapon = cat === 'weapon' || cats2024.has('weapons');
  const isArmor = cat === 'armor' || cats2024.has('armor') || cats2024.has('shields');
  const base = {
    edition,
    cost: costText(e.cost),
    weight: Number(e.weight) || 0,
    notes: text(e.desc || e.description).slice(0, 8000),
  };
  if (isWeapon && e.damage) {
    const props = (e.properties || []).map((p) => p.index);
    const ranged = e.weapon_range === 'Ranged' || cats2024.has('ranged-weapons');
    const range = e.range && e.range.long ? `${e.range.normal}/${e.range.long}`
      : (e.throw_range ? `${e.throw_range.normal}/${e.throw_range.long}` : '');
    return {
      ...base,
      name: weaponName(e.name),
      type: 'weapon',
      weaponCategory: lower(e.weapon_category) === 'martial' || cats2024.has('martial-weapons') ? 'martial' : 'simple',
      attackType: ranged ? 'ranged' : 'melee',
      damage: dice(e.damage.damage_dice) || '1',
      damageType: e.damage.damage_type ? e.damage.damage_type.index : 'bludgeoning',
      versatileDamage: e.two_handed_damage ? dice(e.two_handed_damage.damage_dice) : '',
      range,
      properties: PROPERTIES.filter((p) => props.includes(p)),
      mastery: e.mastery ? lower(e.mastery.name) : '',
    };
  }
  if (isArmor && e.armor_class) {
    const shield = e.armor_category === 'Shield' || cats2024.has('shields');
    const ac = e.armor_class;
    const type = shield ? 'shield'
      : lower(e.armor_category) || ['light', 'medium', 'heavy'].find((t) => cats2024.has(`${t}-armor`)) || 'light';
    let maxDex = null;
    if (!shield) maxDex = !ac.dex_bonus ? 0 : (ac.max_bonus !== undefined && ac.max_bonus !== null ? ac.max_bonus : null);
    return {
      ...base,
      name: e.name,
      type: 'armor',
      armorType: type,
      baseAc: ac.base,
      maxDex,
      strengthReq: e.str_minimum || 0,
      stealthDisadvantage: !!e.stealth_disadvantage,
    };
  }
  // Gear, tools, ammunition, mounts…; bundles get their size in the name.
  const qty = Number(e.quantity) || 1;
  const name = qty > 1 && !/\(/.test(e.name) ? `${plural(e.name)} (${qty})` : e.name;
  const heal = /regains? (\d+d\d+(?:\s*\+\s*\d+)?) (?:hit points|Hit Points)/.exec(base.notes);
  return { ...base, name, type: 'gear', effectDice: heal ? dice(heal[1]) : '', effect: heal ? 'healing' : '' };
}

// "Armor, +1, +2, or +3" just lists its variants ("Armor, +1", …), which
// are separate entries: keep those, skip the umbrella entry.
const isConcreteMagicItem = (m) => !(m.variants || []).length;

function magicItem(m, edition) {
  const desc = text(m.desc);
  const rarity = m.rarity && m.rarity.name ? m.rarity.name : '';
  const header = rarity && !desc.toLowerCase().includes(lower(rarity)) ? `${rarity}${m.attunement ? ' (requires attunement)' : ''}\n` : '';
  const heal = /regains? (\d+d\d+(?:\s*\+\s*\d+)?) (?:hit points|Hit Points)/.exec(desc);
  return {
    name: m.name,
    edition,
    type: 'gear',
    cost: '',
    weight: 0,
    notes: (header + desc).slice(0, 8000),
    effectDice: heal ? dice(heal[1]) : '',
    effect: heal ? 'healing' : '',
  };
}

// ---------------------------------------------------------------- monsters
const crText = (cr) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr));
const abilityMod = (n) => Math.floor((n - 10) / 2);
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

function monster(m, edition) {
  const cr = crText(m.challenge_rating);
  const type = `${m.size} ${m.type}${m.subtype ? ` (${m.subtype})` : ''}`;
  const speed = Object.entries(m.speed || {}).map(([k, v]) => (k === 'walk' ? feet(v) : k === 'hover' ? 'hover' : `${k} ${feet(v)}`)).join(', ');
  const senses = Object.entries(m.senses || {}).map(([k, v]) => (k === 'passive_perception' ? `passive Perception ${v}` : `${k.replace(/_/g, ' ')} ${feet(v)}`)).join(', ');
  const abil = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
    .map((a) => `${ABILITY[a].toUpperCase()} ${m[a]} (${signed(abilityMod(m[a]))})`).join(' · ');
  const saves = (m.proficiencies || []).filter((p) => /^Saving Throw/.test(p.proficiency.name));
  const skills = (m.proficiencies || []).filter((p) => /^Skill/.test(p.proficiency.name));
  const list = (label, arr) => (arr && arr.length ? `${label}: ${arr.map((x) => (typeof x === 'string' ? x : x.name)).join(', ')}` : '');
  // "Fire Breath (Recharge 5–6)", "Fireball (3/Day)": the monster action
  // buttons (public/js/core/monsterActions.js) read the recharge from it.
  const usage = (u) => {
    if (!u || !u.type) return '';
    if (/recharge on roll/i.test(u.type) && u.min_value) return u.min_value >= 6 ? ' (Recharge 6)' : ` (Recharge ${u.min_value}–6)`;
    if (/per day/i.test(u.type) && u.times) return ` (${u.times}/Day)`;
    if (/recharge after rest/i.test(u.type)) return ` (Recharges after a ${(u.rest_types || ['long']).map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(' or ')} Rest)`;
    return '';
  };
  const named = (a) => (/\((recharge|\d+\/day)/i.test(a.name) ? a.name : a.name + usage(a.usage));
  const block = (title, arr) => (arr && arr.length ? [title ? `— ${title} —` : '', ...arr.map((a) => `${named(a)}: ${a.desc}`)].filter(Boolean) : []);
  const lines = [
    `CR ${cr} · ${type}`,
    `AC ${(m.armor_class || []).map((a) => a.value + (a.type && a.type !== 'dex' ? ` (${a.type})` : '')).join(', ')} · HP ${m.hit_points} (${m.hit_points_roll || m.hit_dice}) · Speed ${speed}`,
    abil,
    saves.length ? `Saving throws: ${saves.map((p) => `${p.proficiency.name.replace('Saving Throw: ', '')} ${signed(p.value)}`).join(', ')}` : '',
    skills.length ? `Skills: ${skills.map((p) => `${p.proficiency.name.replace('Skill: ', '')} ${signed(p.value)}`).join(', ')}` : '',
    list('Vulnerable', m.damage_vulnerabilities), list('Resistant', m.damage_resistances),
    list('Immune', m.damage_immunities), list('Condition immunities', m.condition_immunities),
    senses ? `Senses: ${senses}` : '',
    m.languages ? `Languages: ${m.languages}` : '',
    ...block('', m.special_abilities),
    ...block('Actions', m.actions),
    ...block('Bonus actions', m.bonus_actions),
    ...block('Reactions', m.reactions),
    ...block('Legendary actions', m.legendary_actions),
  ].filter(Boolean);
  return {
    name: m.name,
    edition,
    creatureType: lower(m.type),
    cr,
    ac: (m.armor_class && m.armor_class[0] && m.armor_class[0].value) || 10,
    hpMax: m.hit_points || 1,
    initBonus: abilityMod(m.dexterity || 10),
    notes: lines.join('\n').slice(0, 12000),
  };
}

// ---------------------------------------------------------------- build
function build() {
  const spells = nameEditions(read('2014', 'Spells').map((s) => spell(s, '2014')), read('2024', 'Spells').map((s) => spell(s, '2024')));
  // Weapon masteries are a 2024 rule, but the same weapons from the 2014
  // list have the same mastery (a 2024-rules character may wield them).
  const masteryOf = new Map(read('2024', 'Equipment').filter((e) => e.mastery).map((e) => [lower(weaponName(e.name)), lower(e.mastery.name)]));
  const withMastery = (it) => (it.type === 'weapon' && !it.mastery && masteryOf.has(lower(it.name)) ? { ...it, mastery: masteryOf.get(lower(it.name)) } : it);
  const items = nameEditions(
    [...read('2014', 'Equipment').map((e) => withMastery(equipment(e, '2014'))), ...read('2014', 'Magic-Items').filter(isConcreteMagicItem).map((m) => magicItem(m, '2014'))],
    [...read('2024', 'Equipment').map((e) => equipment(e, '2024')), ...read('2024', 'Magic-Items').filter(isConcreteMagicItem).map((m) => magicItem(m, '2024'))],
  );
  const monsters = nameEditions(read('2014', 'Monsters').map((m) => monster(m, '2014')), read('2024', 'Monsters').map((m) => monster(m, '2024')));

  // Names must be unique within each list (they're matched by name): a
  // repeat within one edition (e.g. a potion listed as gear and as a magic
  // item) is dropped, keeping the first.
  const unique = (label, list) => {
    const seen = new Set();
    const out = list.filter((e) => {
      const k = lower(e.name);
      if (seen.has(k)) { console.log(`  ${label}: dropped duplicate "${e.name}" (${e.edition})`); return false; }
      seen.add(k);
      return true;
    });
    console.log(`${label}: ${out.length}`);
    return out;
  };

  fs.mkdirSync(OUT, { recursive: true });
  const write = (file, data) => fs.writeFileSync(path.join(OUT, file), JSON.stringify(data));
  const out = { spells: unique('spells', spells), items: unique('items', items), monsters: unique('monsters', monsters) };
  write('spells.json', out.spells);
  write('items.json', out.items);
  write('monsters.json', out.monsters);
  // Libraries merge new SRD content into existing installs once per version.
  const version = require('crypto').createHash('sha1').update(JSON.stringify(out)).digest('hex').slice(0, 12);
  write('version.json', { version, built: new Date().toISOString().slice(0, 10) });
  console.log(`version ${version}`);
}

build();
