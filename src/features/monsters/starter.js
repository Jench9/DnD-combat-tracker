// Common monsters from the D&D 5e SRD 5.1 (CC-BY-4.0): AC, average HP,
// initiative bonus (= DEX modifier), and a compact stat block (traits,
// actions, reactions) as notes. Ordered by challenge rating.
// Added to the library on request by the `addStarterMonsters` action.
//
// [name, ac, hp, initBonus, summary, details]
// `summary` (CR · size type) is the first line of the notes. The first
// version of this list stored only that line, so a library monster whose
// notes are exactly the summary gets upgraded to the full notes.
const LIST = [
  ['Kobold', 12, 5, 2, 'CR 1/8 · Small humanoid', `
Speed 30 ft · Darkvision 60 ft
Sunlight Sensitivity: disadvantage on attacks and sight-based Perception in sunlight.
Pack Tactics: advantage on attacks against a creature if an ally is within 5 ft of it.
Dagger: +4, reach 5 ft, 1d4+2 piercing.
Sling: +4, range 30/120 ft, 1d4+2 bludgeoning.`],

  ['Giant Rat', 12, 7, 2, 'CR 1/8 · Small beast', `
Speed 30 ft · Darkvision 60 ft
Keen Smell: advantage on smell-based Perception.
Pack Tactics: advantage on attacks against a creature if an ally is within 5 ft of it.
Bite: +4, reach 5 ft, 1d4+2 piercing.`],

  ['Stirge', 14, 2, 3, 'CR 1/8 · Tiny beast', `
Speed 10 ft, fly 40 ft · Darkvision 60 ft
Blood Drain: +5, reach 5 ft, 1d4+3 piercing and the stirge attaches. While attached it doesn't attack; instead, at the start of each of its turns the target loses 1d4+3 HP. It detaches after draining 10 HP or when the target dies. A creature (incl. the target) can use its action to detach it.`],

  ['Bandit', 12, 11, 1, 'CR 1/8 · Medium humanoid', `
Speed 30 ft
Scimitar: +3, reach 5 ft, 1d6+1 slashing.
Light Crossbow: +3, range 80/320 ft, 1d8+1 piercing.`],

  ['Cultist', 12, 9, 1, 'CR 1/8 · Medium humanoid', `
Speed 30 ft
Dark Devotion: advantage on saves against being charmed or frightened.
Scimitar: +3, reach 5 ft, 1d6+1 slashing.`],

  ['Guard', 16, 11, 1, 'CR 1/8 · Medium humanoid', `
Speed 30 ft
Spear: +3, reach 5 ft or range 20/60 ft, 1d6+1 piercing (1d8+1 two-handed in melee).`],

  ['Goblin', 15, 7, 2, 'CR 1/4 · Small humanoid (goblinoid)', `
Speed 30 ft · Darkvision 60 ft
Nimble Escape: Disengage or Hide as a bonus action.
Scimitar: +4, reach 5 ft, 1d6+2 slashing.
Shortbow: +4, range 80/320 ft, 1d6+2 piercing.`],

  ['Skeleton', 13, 13, 2, 'CR 1/4 · Medium undead', `
Speed 30 ft · Darkvision 60 ft
Vulnerable: bludgeoning. Immune: poison; exhaustion, poisoned.
Shortsword: +4, reach 5 ft, 1d6+2 piercing.
Shortbow: +4, range 80/320 ft, 1d6+2 piercing.`],

  ['Zombie', 8, 22, -2, 'CR 1/4 · Medium undead', `
Speed 20 ft · Darkvision 60 ft
Immune: poison; poisoned.
Undead Fortitude: if damage drops it to 0 HP, it makes a CON save (DC 5 + damage taken) to drop to 1 HP instead, unless the damage is radiant or from a critical hit.
Slam: +3, reach 5 ft, 1d6+1 bludgeoning.`],

  ['Wolf', 13, 11, 2, 'CR 1/4 · Medium beast', `
Speed 40 ft
Keen Hearing and Smell: advantage on Perception relying on hearing or smell.
Pack Tactics: advantage on attacks against a creature if an ally is within 5 ft of it.
Bite: +4, reach 5 ft, 2d4+2 piercing. A creature hit must succeed on a DC 11 STR save or be knocked prone.`],

  ['Hobgoblin', 18, 11, 1, 'CR 1/2 · Medium humanoid (goblinoid)', `
Speed 30 ft · Darkvision 60 ft
Martial Advantage: once per turn, +2d6 damage to a creature it hits with a weapon attack if an ally is within 5 ft of that creature.
Longsword: +3, reach 5 ft, 1d8+1 slashing (1d10+1 two-handed).
Longbow: +3, range 150/600 ft, 1d8+1 piercing.`],

  ['Orc', 13, 15, 1, 'CR 1/2 · Medium humanoid', `
Speed 30 ft · Darkvision 60 ft
Aggressive: as a bonus action, move up to its speed toward a hostile creature it can see.
Greataxe: +5, reach 5 ft, 1d12+3 slashing.
Javelin: +5, reach 5 ft or range 30/120 ft, 1d6+3 piercing.`],

  ['Gnoll', 15, 22, 1, 'CR 1/2 · Medium humanoid', `
Speed 30 ft · Darkvision 60 ft
Rampage: when it reduces a creature to 0 HP with a melee attack on its turn, it can take a bonus action to move up to half its speed and make a bite attack.
Bite: +4, reach 5 ft, 1d4+2 piercing.
Spear: +4, reach 5 ft or range 20/60 ft, 1d6+2 piercing (1d8+2 two-handed in melee).
Longbow: +3, range 150/600 ft, 1d8+1 piercing.`],

  ['Lizardfolk', 15, 22, 0, 'CR 1/2 · Medium humanoid', `
Speed 30 ft, swim 30 ft
Hold Breath: can hold its breath for 15 minutes.
Multiattack: two melee attacks, each with a different weapon.
Bite: +4, reach 5 ft, 1d6+2 piercing.
Heavy Club: +4, reach 5 ft, 1d6+2 bludgeoning.
Javelin: +4, reach 5 ft or range 30/120 ft, 1d6+2 piercing.
Spiked Shield: +4, reach 5 ft, 1d6+2 piercing.`],

  ['Thug', 11, 32, 0, 'CR 1/2 · Medium humanoid', `
Speed 30 ft
Pack Tactics: advantage on attacks against a creature if an ally is within 5 ft of it.
Multiattack: two melee attacks.
Mace: +4, reach 5 ft, 1d6+2 bludgeoning.
Heavy Crossbow: +2, range 100/400 ft, 1d10 piercing.`],

  ['Bugbear', 16, 27, 2, 'CR 1 · Medium humanoid (goblinoid)', `
Speed 30 ft · Darkvision 60 ft
Brute: melee weapons deal one extra die of damage (included below).
Surprise Attack: if it surprises a creature and hits it in the first round, +2d6 damage.
Morningstar: +4, reach 5 ft, 2d8+2 piercing.
Javelin: +4, reach 5 ft or range 30/120 ft, 2d6+2 piercing in melee or 1d6+2 at range.`],

  ['Ghoul', 12, 22, 2, 'CR 1 · Medium undead', `
Speed 30 ft · Darkvision 60 ft
Immune: poison; charmed, exhaustion, poisoned.
Bite: +2, reach 5 ft, 2d6+2 piercing.
Claws: +4, reach 5 ft, 2d4+2 slashing. A target that isn't undead or an elf must succeed on a DC 10 CON save or be paralyzed for 1 minute (repeats the save at the end of each of its turns).`],

  ['Dire Wolf', 14, 37, 2, 'CR 1 · Large beast', `
Speed 50 ft
Keen Hearing and Smell: advantage on Perception relying on hearing or smell.
Pack Tactics: advantage on attacks against a creature if an ally is within 5 ft of it.
Bite: +5, reach 5 ft, 2d6+3 piercing. A creature hit must succeed on a DC 13 STR save or be knocked prone.`],

  ['Giant Spider', 14, 26, 3, 'CR 1 · Large beast', `
Speed 30 ft, climb 30 ft · Blindsight 10 ft, darkvision 60 ft
Spider Climb: climbs difficult surfaces, including ceilings, without a check.
Web Sense / Web Walker: knows the location of anything touching its web; ignores web movement restrictions.
Bite: +5, reach 5 ft, 1d8+3 piercing, and the target makes a DC 11 CON save: 2d8 poison on a fail, half on a success. If this drops the target to 0 HP, it is stable but poisoned (and paralyzed) for 1 hour.
Web (Recharge 5–6): +5, range 30/60 ft, target is restrained by webbing. Escape: DC 12 STR check. The web has AC 10, 5 HP, is vulnerable to fire and immune to bludgeoning, poison and psychic damage.`],

  ['Brown Bear', 11, 34, 0, 'CR 1 · Large beast', `
Speed 40 ft, climb 30 ft
Keen Smell: advantage on smell-based Perception.
Multiattack: one bite and one claws attack.
Bite: +6, reach 5 ft, 1d8+4 piercing.
Claws: +6, reach 5 ft, 2d6+4 slashing.`],

  ['Bandit Captain', 15, 65, 3, 'CR 2 · Medium humanoid', `
Speed 30 ft
Multiattack: three melee attacks (two scimitar, one dagger), or two ranged dagger attacks.
Scimitar: +5, reach 5 ft, 1d6+3 slashing.
Dagger: +5, reach 5 ft or range 20/60 ft, 1d4+3 piercing.
Parry (reaction): +2 AC against one melee attack that would hit it, if it can see the attacker and is wielding a melee weapon.`],

  ['Priest', 13, 27, 0, 'CR 2 · Medium humanoid', `
Speed 30 ft
Divine Eminence: as a bonus action, expend a spell slot so its melee weapon attacks deal +3d6 radiant on a hit until the end of the turn (+1d6 per slot level above 1st).
Spellcasting (5th level, WIS, save DC 13, +5 to hit):
• Cantrips: light, sacred flame, thaumaturgy
• 1st (4 slots): cure wounds, guiding bolt, sanctuary
• 2nd (3 slots): lesser restoration, spiritual weapon
• 3rd (2 slots): dispel magic, spirit guardians
Mace: +2, reach 5 ft, 1d6 bludgeoning.`],

  ['Ogre', 11, 59, -1, 'CR 2 · Large giant', `
Speed 40 ft · Darkvision 60 ft
Greatclub: +6, reach 5 ft, 2d8+4 bludgeoning.
Javelin: +6, reach 5 ft or range 30/120 ft, 2d6+4 piercing.`],

  ['Gargoyle', 15, 52, 0, 'CR 2 · Medium elemental', `
Speed 30 ft, fly 60 ft · Darkvision 60 ft
Resistant: bludgeoning, piercing and slashing from nonmagical attacks that aren't adamantine. Immune: poison; exhaustion, petrified, poisoned.
False Appearance: while motionless, indistinguishable from an inanimate statue.
Multiattack: one bite and one claws attack.
Bite: +4, reach 5 ft, 1d6+2 piercing.
Claws: +4, reach 5 ft, 1d6+2 slashing.`],

  ['Gelatinous Cube', 6, 84, -4, 'CR 2 · Large ooze', `
Speed 15 ft · Blindsight 60 ft (blind beyond)
Ooze Cube: fills its whole space; other creatures can enter it but are then subjected to Engulf (with disadvantage on the save). Engulfed creatures are visible but have total cover.
Transparent: noticing a cube that hasn't moved or attacked takes a DC 15 Perception check.
Pseudopod: +4, reach 5 ft, 3d6 acid.
Engulf: moves up to its speed into Large or smaller creatures' spaces. Each makes a DC 12 DEX save; on a success it is pushed 5 ft out of the way. On a fail it is engulfed: takes 3d6 acid, is restrained, can't breathe, and takes 6d6 acid at the start of each of the cube's turns. Escape: action, DC 12 STR check.`],

  ['Mimic', 12, 58, 1, 'CR 2 · Medium monstrosity (shapechanger)', `
Speed 15 ft · Darkvision 60 ft
Immune: acid; prone.
Shapechanger: can turn into an object or back to its true form as an action.
Adhesive (object form only): adheres to anything that touches it. A Huge or smaller creature adhered to it is also grappled (escape DC 13; ability checks to escape have disadvantage).
False Appearance (object form only): indistinguishable from an ordinary object.
Grappler: advantage on attacks against any creature grappled by it.
Pseudopod: +5, reach 5 ft, 1d8+3 bludgeoning. In object form, the target is subjected to Adhesive.
Bite: +5, reach 5 ft, 1d8+3 piercing plus 1d8 acid.`],

  ['Owlbear', 13, 59, 1, 'CR 3 · Large monstrosity', `
Speed 40 ft · Darkvision 60 ft
Keen Sight and Smell: advantage on Perception relying on sight or smell.
Multiattack: one beak and one claws attack.
Beak: +7, reach 5 ft, 1d10+5 piercing.
Claws: +7, reach 5 ft, 2d8+5 slashing.`],

  ['Minotaur', 14, 76, 0, 'CR 3 · Large monstrosity', `
Speed 40 ft · Darkvision 60 ft
Charge: if it moves at least 10 ft straight toward a target and then hits it with a gore attack on the same turn, +2d8 piercing, and the target must succeed on a DC 14 STR save or be pushed up to 10 ft and knocked prone.
Labyrinthine Recall: perfectly recalls any path it has travelled.
Reckless: at the start of its turn it can gain advantage on all melee attacks this turn, but attacks against it have advantage until its next turn.
Greataxe: +6, reach 5 ft, 2d12+4 slashing.
Gore: +6, reach 5 ft, 2d8+4 piercing.`],

  ['Basilisk', 15, 52, -1, 'CR 3 · Medium monstrosity', `
Speed 20 ft · Darkvision 60 ft
Petrifying Gaze: a creature that starts its turn within 30 ft and can see the basilisk's eyes must make a DC 12 CON save (if the basilisk isn't incapacitated and can see it). On a fail it starts turning to stone and is restrained, repeating the save at the end of its next turn: on a second fail it is petrified until freed by greater restoration or similar. A creature can avert its eyes (it can't see the basilisk until its next turn).
Bite: +5, reach 5 ft, 2d6+3 piercing plus 2d6 poison.`],

  ['Wight', 14, 45, 2, 'CR 3 · Medium undead', `
Speed 30 ft · Darkvision 60 ft
Resistant: necrotic; bludgeoning, piercing and slashing from nonmagical attacks that aren't silvered. Immune: poison; exhaustion, poisoned.
Sunlight Sensitivity: disadvantage on attacks and sight-based Perception in sunlight.
Multiattack: two longsword or two longbow attacks; it can use Life Drain in place of one longsword attack.
Life Drain: +4, reach 5 ft, 1d6+2 necrotic. The target must succeed on a DC 13 CON save or its HP maximum is reduced by the damage taken until a long rest; it dies if this reduces its maximum to 0. A humanoid slain this way rises 24 hours later as a zombie under the wight's control.
Longsword: +4, reach 5 ft, 1d8+2 slashing (1d10+2 two-handed).
Longbow: +4, range 150/600 ft, 1d8+2 piercing.`],

  ['Veteran', 17, 58, 1, 'CR 3 · Medium humanoid', `
Speed 30 ft
Multiattack: two longsword attacks; if it has a shortsword drawn, it can also make a shortsword attack.
Longsword: +5, reach 5 ft, 1d8+3 slashing (1d10+3 two-handed).
Shortsword: +5, reach 5 ft, 1d6+3 piercing.
Heavy Crossbow: +3, range 100/400 ft, 1d10+1 piercing.`],

  ['Ghost', 11, 45, 1, 'CR 4 · Medium undead', `
Speed 0 ft, fly 40 ft (hover) · Darkvision 60 ft
Resistant: acid, fire, lightning, thunder; bludgeoning, piercing and slashing from nonmagical attacks. Immune: cold, necrotic, poison; charmed, exhaustion, frightened, grappled, paralyzed, petrified, poisoned, prone, restrained.
Ethereal Sight: sees 60 ft into the Ethereal Plane when on the Material Plane, and vice versa.
Incorporeal Movement: moves through creatures and objects as difficult terrain; takes 1d10 force if it ends its turn inside an object.
Withering Touch: +5, reach 5 ft, 4d6+3 necrotic.
Etherealness: enters the Ethereal Plane from the Material Plane, or vice versa.
Horrifying Visage: each non-undead creature within 60 ft that can see it makes a DC 13 WIS save or is frightened for 1 minute (repeats the save at the end of each of its turns). On a fail by 5 or more, the target also ages 1d4 × 10 years. A creature that succeeds is immune for 24 hours.
Possession (Recharge 6): one humanoid within 5 ft makes a DC 13 CHA save or is possessed; the ghost disappears and controls the body (the target is incapacitated). Ends when the body drops to 0 HP, the ghost ends it as a bonus action, or it is turned or forced out.`],

  ['Troll', 15, 84, 1, 'CR 5 · Large giant', `
Speed 30 ft · Darkvision 60 ft
Keen Smell: advantage on smell-based Perception.
Regeneration: regains 10 HP at the start of its turn. If it takes acid or fire damage, this doesn't work at the start of its next turn. It dies only if it starts its turn with 0 HP and doesn't regenerate.
Multiattack: one bite and two claw attacks.
Bite: +7, reach 5 ft, 1d6+4 piercing.
Claw: +7, reach 5 ft, 2d6+4 slashing.`],

  ['Hill Giant', 13, 105, -1, 'CR 5 · Huge giant', `
Speed 40 ft
Multiattack: two greatclub attacks.
Greatclub: +8, reach 10 ft, 3d8+5 bludgeoning.
Rock: +8, range 60/240 ft, 3d10+5 bludgeoning.`],

  ['Mage', 12, 40, 2, 'CR 6 · Medium humanoid', `
Speed 30 ft · AC 15 with mage armor
Spellcasting (9th level, INT, save DC 14, +6 to hit):
• Cantrips: fire bolt, light, mage hand, prestidigitation
• 1st (4 slots): detect magic, mage armor, magic missile, shield
• 2nd (3 slots): misty step, suggestion
• 3rd (3 slots): counterspell, fireball, fly
• 4th (3 slots): greater invisibility, ice storm
• 5th (1 slot): cone of cold
Dagger: +5, reach 5 ft or range 20/60 ft, 1d4+2 piercing.`],

  ['Young Green Dragon', 18, 136, 1, 'CR 8 · Large dragon', `
Speed 40 ft, fly 80 ft, swim 40 ft · Blindsight 30 ft, darkvision 120 ft
Immune: poison; poisoned.
Amphibious: breathes air and water.
Multiattack: one bite and two claw attacks.
Bite: +7, reach 10 ft, 2d10+4 piercing plus 2d6 poison.
Claw: +7, reach 5 ft, 2d6+4 slashing.
Poison Breath (Recharge 5–6): 30-ft cone, DC 14 CON save, 12d6 poison on a fail, half on a success.`],

  ['Young Red Dragon', 18, 178, 0, 'CR 10 · Large dragon', `
Speed 40 ft, climb 40 ft, fly 80 ft · Blindsight 30 ft, darkvision 120 ft
Immune: fire.
Multiattack: one bite and two claw attacks.
Bite: +10, reach 10 ft, 2d10+6 piercing plus 1d6 fire.
Claw: +10, reach 5 ft, 2d6+6 slashing.
Fire Breath (Recharge 5–6): 30-ft cone, DC 17 DEX save, 16d6 fire on a fail, half on a success.`],
];

const STARTER_MONSTERS = LIST.map(([name, ac, hpMax, initBonus, summary, details]) => ({
  name, ac, hpMax, initBonus, summary, notes: `${summary}\n${details.trim()}`,
}));

module.exports = { STARTER_MONSTERS };
