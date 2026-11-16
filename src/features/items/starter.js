// Basic items from the D&D 5e SRD 5.1 (CC-BY-4.0): every standard weapon
// and armor, plus some common gear. Loaded into the item library the first
// time the server starts (when there's no items.json yet).

// Weapons: [name, category, attackType, damage, damageType, properties, range, versatile, cost, weight]
const WEAPONS = [
  // Simple melee
  ['Club', 'simple', 'melee', '1d4', 'bludgeoning', ['light'], '', '', '1 sp', 2],
  ['Dagger', 'simple', 'melee', '1d4', 'piercing', ['finesse', 'light', 'thrown'], '20/60', '', '2 gp', 1],
  ['Greatclub', 'simple', 'melee', '1d8', 'bludgeoning', ['two-handed'], '', '', '2 sp', 10],
  ['Handaxe', 'simple', 'melee', '1d6', 'slashing', ['light', 'thrown'], '20/60', '', '5 gp', 2],
  ['Javelin', 'simple', 'melee', '1d6', 'piercing', ['thrown'], '30/120', '', '5 sp', 2],
  ['Light Hammer', 'simple', 'melee', '1d4', 'bludgeoning', ['light', 'thrown'], '20/60', '', '2 gp', 2],
  ['Mace', 'simple', 'melee', '1d6', 'bludgeoning', [], '', '', '5 gp', 4],
  ['Quarterstaff', 'simple', 'melee', '1d6', 'bludgeoning', [], '', '1d8', '2 sp', 4],
  ['Sickle', 'simple', 'melee', '1d4', 'slashing', ['light'], '', '', '1 gp', 2],
  ['Spear', 'simple', 'melee', '1d6', 'piercing', ['thrown'], '20/60', '1d8', '1 gp', 3],
  // Simple ranged
  ['Light Crossbow', 'simple', 'ranged', '1d8', 'piercing', ['ammunition', 'loading', 'two-handed'], '80/320', '', '25 gp', 5],
  ['Dart', 'simple', 'ranged', '1d4', 'piercing', ['finesse', 'thrown'], '20/60', '', '5 cp', 0.25],
  ['Shortbow', 'simple', 'ranged', '1d6', 'piercing', ['ammunition', 'two-handed'], '80/320', '', '25 gp', 2],
  ['Sling', 'simple', 'ranged', '1d4', 'bludgeoning', ['ammunition'], '30/120', '', '1 sp', 0],
  // Martial melee
  ['Battleaxe', 'martial', 'melee', '1d8', 'slashing', [], '', '1d10', '10 gp', 4],
  ['Flail', 'martial', 'melee', '1d8', 'bludgeoning', [], '', '', '10 gp', 2],
  ['Glaive', 'martial', 'melee', '1d10', 'slashing', ['heavy', 'reach', 'two-handed'], '', '', '20 gp', 6],
  ['Greataxe', 'martial', 'melee', '1d12', 'slashing', ['heavy', 'two-handed'], '', '', '30 gp', 7],
  ['Greatsword', 'martial', 'melee', '2d6', 'slashing', ['heavy', 'two-handed'], '', '', '50 gp', 6],
  ['Halberd', 'martial', 'melee', '1d10', 'slashing', ['heavy', 'reach', 'two-handed'], '', '', '20 gp', 6],
  ['Lance', 'martial', 'melee', '1d12', 'piercing', ['reach', 'special'], '', '', '10 gp', 6],
  ['Longsword', 'martial', 'melee', '1d8', 'slashing', [], '', '1d10', '15 gp', 3],
  ['Maul', 'martial', 'melee', '2d6', 'bludgeoning', ['heavy', 'two-handed'], '', '', '10 gp', 10],
  ['Morningstar', 'martial', 'melee', '1d8', 'piercing', [], '', '', '15 gp', 4],
  ['Pike', 'martial', 'melee', '1d10', 'piercing', ['heavy', 'reach', 'two-handed'], '', '', '5 gp', 18],
  ['Rapier', 'martial', 'melee', '1d8', 'piercing', ['finesse'], '', '', '25 gp', 2],
  ['Scimitar', 'martial', 'melee', '1d6', 'slashing', ['finesse', 'light'], '', '', '25 gp', 3],
  ['Shortsword', 'martial', 'melee', '1d6', 'piercing', ['finesse', 'light'], '', '', '10 gp', 2],
  ['Trident', 'martial', 'melee', '1d6', 'piercing', ['thrown'], '20/60', '1d8', '5 gp', 4],
  ['War Pick', 'martial', 'melee', '1d8', 'piercing', [], '', '', '5 gp', 2],
  ['Warhammer', 'martial', 'melee', '1d8', 'bludgeoning', [], '', '1d10', '15 gp', 2],
  ['Whip', 'martial', 'melee', '1d4', 'slashing', ['finesse', 'reach'], '', '', '2 gp', 3],
  // Martial ranged
  ['Blowgun', 'martial', 'ranged', '1', 'piercing', ['ammunition', 'loading'], '25/100', '', '10 gp', 1],
  ['Hand Crossbow', 'martial', 'ranged', '1d6', 'piercing', ['ammunition', 'light', 'loading'], '30/120', '', '75 gp', 3],
  ['Heavy Crossbow', 'martial', 'ranged', '1d10', 'piercing', ['ammunition', 'heavy', 'loading', 'two-handed'], '100/400', '', '50 gp', 18],
  ['Longbow', 'martial', 'ranged', '1d8', 'piercing', ['ammunition', 'heavy', 'two-handed'], '150/600', '', '50 gp', 2],
].map(([name, weaponCategory, attackType, damage, damageType, properties, range, versatileDamage, cost, weight]) => ({
  name, type: 'weapon', weaponCategory, attackType, damage, damageType, properties, range, versatileDamage, cost, weight,
}));

// Armor: [name, armorType, baseAc, maxDex (null = no limit), strengthReq, stealthDisadvantage, cost, weight]
const ARMOR = [
  ['Padded Armor', 'light', 11, null, 0, true, '5 gp', 8],
  ['Leather Armor', 'light', 11, null, 0, false, '10 gp', 10],
  ['Studded Leather Armor', 'light', 12, null, 0, false, '45 gp', 13],
  ['Hide Armor', 'medium', 12, 2, 0, false, '10 gp', 12],
  ['Chain Shirt', 'medium', 13, 2, 0, false, '50 gp', 20],
  ['Scale Mail', 'medium', 14, 2, 0, true, '50 gp', 45],
  ['Breastplate', 'medium', 14, 2, 0, false, '400 gp', 20],
  ['Half Plate', 'medium', 15, 2, 0, true, '750 gp', 40],
  ['Ring Mail', 'heavy', 14, 0, 0, true, '30 gp', 40],
  ['Chain Mail', 'heavy', 16, 0, 13, true, '75 gp', 55],
  ['Splint Armor', 'heavy', 17, 0, 15, true, '200 gp', 60],
  ['Plate Armor', 'heavy', 18, 0, 15, true, '1,500 gp', 65],
  ['Shield', 'shield', 2, null, 0, false, '10 gp', 6],
].map(([name, armorType, baseAc, maxDex, strengthReq, stealthDisadvantage, cost, weight]) => ({
  name, type: 'armor', armorType, baseAc, maxDex, strengthReq, stealthDisadvantage, cost, weight,
}));

// Gear: [name, cost, weight, effectDice, effect, notes]
const GEAR = [
  ['Potion of Healing', '50 gp', 0.5, '2d4+2', 'healing', 'Drinking it (an action) restores the hit points shown.'],
  ['Arrows (20)', '1 gp', 1, '', '', 'Ammunition for bows.'],
  ['Crossbow Bolts (20)', '1 gp', 1.5, '', '', 'Ammunition for crossbows.'],
  ['Sling Bullets (20)', '4 cp', 1.5, '', '', 'Ammunition for slings.'],
  ["Healer's Kit", '5 gp', 3, '', '', 'Ten uses. As an action, stabilize a creature at 0 HP without a Medicine check.'],
  ['Rope, Hempen (50 ft)', '1 gp', 10, '', '', ''],
  ['Torch', '1 cp', 1, '', '', 'Burns for 1 hour: bright light 20 ft, dim light 20 ft more. As an improvised weapon, 1 fire damage.'],
  ['Rations (1 day)', '5 sp', 2, '', '', ''],
  ['Backpack', '2 gp', 5, '', '', ''],
  ['Bedroll', '1 gp', 7, '', '', ''],
  ["Thieves' Tools", '25 gp', 1, '', '', 'Needed to pick locks and disarm traps.'],
  ['Holy Symbol', '5 gp', 1, '', '', 'A cleric or paladin spellcasting focus.'],
  ['Arcane Focus (Wand)', '10 gp', 1, '', '', 'A spellcasting focus for sorcerers, warlocks and wizards.'],
].map(([name, cost, weight, effectDice, effect, notes]) => ({
  name, type: 'gear', cost, weight, effectDice, effect, notes,
}));

const STARTER_ITEMS = [...WEAPONS, ...ARMOR, ...GEAR];

module.exports = { STARTER_ITEMS };
