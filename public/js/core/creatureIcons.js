// A representative emoji for a creature without a picture: by name first
// ("Owlbear" → 🦉, "Adult Red Dragon" → 🐉), then by creature type
// (undead → 💀). Shown on tokens, combat rows, the TV bar and the monster
// lists wherever a monster has no uploaded icon; characters keep their
// initial.
//
//   creatureIcon({ name, creatureType })  -> emoji
//   glyphFor(combatant, monster?)         -> emoji for monsters, initial for characters

// First match wins, so more specific words come first.
const BY_NAME = [
  [/owlbear/, '🦉'], [/beholder|spectator|gauth/, '👁️'], [/mind flayer|illithid/, '🦑'],
  [/gelatinous cube/, '🟩'], [/mimic/, '📦'], [/rug of smothering|animated rug/, '🧶'],
  [/animated armor|helmed horror/, '🛡️'], [/flying sword|animated .*sword/, '🗡️'],
  [/dracolich|dragon|wyrm|drake|wyvern|pseudodragon|faerie dragon/, '🐉'], [/hydra/, '🐉'],
  [/lich|demilich|skeleton/, '💀'], [/zombie|ghoul|ghast|mummy|flesh golem/, '🧟'],
  [/hobgoblin|goblin|bugbear/, '👺'], [/\borcs?\b|orog/, '👹'],
  [/troll|ogre|ettin|giant(?! (?:ape|badger|bat|boar|centipede|constrictor|crab|crocodile|eagle|elk|fire beetle|frog|goat|hyena|lizard|octopus|owl|poisonous|rat|scorpion|sea horse|seahorse|shark|spider|toad|vulture|wasp|weasel|wolf|insect|vulture|venomous))|cyclops|fomorian/, '🧌'],
  [/vampire/, '🧛'], [/ghost|specter|spectre|wraith|banshee|shadow|poltergeist|will-o/, '👻'],
  [/werewolf|wolf|worg|warg/, '🐺'], [/werebear|bear/, '🐻'], [/wererat|rat\b|rats\b/, '🐀'], [/weretiger|tiger/, '🐅'],
  [/wereboar|boar/, '🐗'], [/lion|sphinx|manticore/, '🦁'], [/panther|cat\b|displacer beast|leopard|jaguar/, '🐈'],
  [/spider|ettercap|phase spider|drider/, '🕷️'], [/scorpion/, '🦂'], [/crab/, '🦀'],
  [/snake|serpent|naga|constrictor|cobra|viper|yuan-ti|medusa/, '🐍'],
  [/octopus|kraken|squid|kuo-toa/, '🐙'], [/shark/, '🦈'], [/whale|orca/, '🐋'], [/fish|piranha|quipper/, '🐟'],
  [/crocodile|alligator/, '🐊'], [/lizard|basilisk|salamander|gecko/, '🦎'], [/frog|toad|bullywug/, '🐸'], [/turtle|dragon turtle|tortle/, '🐢'],
  [/bat\b|bats\b/, '🦇'], [/eagle|hawk|falcon|griffon|hippogriff|roc\b|vulture|harpy|axe beak/, '🦅'], [/owl/, '🦉'],
  [/raven|crow|blood hawk|bird|cockatrice|peryton/, '🐦'], [/horse|pony|nightmare|pegasus|warhorse|mule|donkey/, '🐴'],
  [/unicorn/, '🦄'], [/elephant|mammoth|mastodon/, '🐘'], [/rhinoceros/, '🦏'], [/hippo/, '🦛'],
  [/ape|baboon|gorilla/, '🦍'], [/deer|elk|stag/, '🦌'], [/goat/, '🐐'], [/ox\b|bull\b|cattle|cow|aurochs|minotaur|gorgon/, '🐂'],
  [/camel/, '🐫'], [/dog|hound|jackal|hyena|mastiff|cerberus/, '🐕'], [/badger|weasel|ferret/, '🦡'],
  [/wasp|bee\b|bees\b|insect|beetle|centipede|ankheg|stirge|swarm of (?:insects|beetles|centipedes|spiders|wasps)/, '🪲'],
  [/dinosaur|allosaurus|tyrannosaurus|triceratops|plesiosaurus|pteranodon|ankylosaurus|velociraptor/, '🦖'],
  [/fire elemental|fire snake|magmin|efreet|salamander|hell hound|phoenix/, '🔥'],
  [/water elemental|water weird/, '🌊'], [/air elemental|invisible stalker|djinni|wind/, '🌪️'],
  [/earth elemental|galeb duhr|xorn|gargoyle|stone golem|iron golem|clay golem|golem/, '🗿'],
  [/genie|djinni|efreeti|dao|marid/, '🧞'], [/mephit|imp\b|quasit|devil|demon|balor|pit fiend|erinyes|succubus|incubus|rakshasa|bone devil|horned devil|ice devil|barbed devil|bearded devil|chain devil|hezrou|glabrezu|nalfeshnee|marilith|vrock|dretch|lemure|hellfire/, '😈'],
  [/angel|deva|planetar|solar|couatl|empyrean/, '😇'],
  [/fairy|pixie|sprite|dryad|nymph|satyr|sea hag|green hag|night hag|hag\b/, '🧚'],
  [/treant|shambling|blight|awakened tree|awakened shrub|tree/, '🌳'], [/myconid|shrieker|violet fungus|fungus|mushroom/, '🍄'],
  [/ooze|pudding|jelly|slime/, '🟢'], [/centaur/, '🏹'], [/merfolk|merrow|mermaid|sahuagin/, '🧜'],
  [/elf|drow/, '🧝'], [/dwarf|duergar/, '⛏️'], [/gnoll/, '🐺'], [/kobold/, '🦎'], [/lizardfolk/, '🦎'],
  [/mage|archmage|wizard|warlock|sorcerer|cult fanatic|cultist|priest|acolyte|druid|necromancer|apprentice|evoker|illusionist/, '🧙'],
  [/knight|guard|soldier|veteran|gladiator|champion|warrior|berserker|captain|pirate|tough|warlord/, '⚔️'],
  [/bandit|thug|assassin|spy|scout|thief|brigand|cutthroat|rogue/, '🗡️'],
  [/noble|commoner|peasant|villager|merchant|tribal/, '🧑'], [/swarm/, '🐜'],
];

const BY_TYPE = {
  aberration: '👁️', beast: '🐾', celestial: '😇', construct: '🤖', dragon: '🐉', elemental: '🌪️',
  fey: '🧚', fiend: '😈', giant: '🧌', humanoid: '🧑', monstrosity: '👾', ooze: '🟢', plant: '🌿', undead: '💀',
};

export function creatureIcon({ name = '', creatureType = '' } = {}) {
  const n = String(name).toLowerCase().replace(/\s*\(\d{4}\)\s*$/, '').replace(/\s+\d+$/, '');
  const hit = BY_NAME.find(([re]) => re.test(n));
  if (hit) return hit[1];
  const t = String(creatureType).toLowerCase().split(/[\s(]/)[0];
  return BY_TYPE[t] || '👾';
}

const initial = (name) => ((name || '?').trim().charAt(0) || '?').toUpperCase();

// Combat rows / tokens: a monster's emoji (from its library entry when this
// browser has one), a character's initial. Players see disguised (aliased)
// monsters by their alias, so the emoji follows the alias too.
export function glyphFor(c, monster) {
  if (c.type !== 'monster') return initial(c.name);
  return creatureIcon({ name: (monster && monster.name) || c.name, creatureType: monster && monster.creatureType });
}
