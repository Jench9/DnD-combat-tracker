// Registry of the app's tools. The nav bar and the home page cards are
// both generated from this list — to add a tool, add an entry here and
// create its page (public/<page>.html + js/<id>/ + css/pages/<id>.css).
// `dmOnly` tools are hidden from players (the server doesn't send them the data either).
// `short`: the name in the top bar (defaults to `title`); home cards use `title`.
export const TOOLS = [
  {
    id: 'combat',
    href: 'combat.html',
    icon: '⚔️',
    title: 'Combat Tracker',
    short: 'Combat', // top bar
    description: 'Initiative order, HP, AC, and conditions — shared live with everyone connected.',
  },
  {
    id: 'characters',
    href: 'characters.html',
    icon: '📜',
    title: 'Character Sheets',
    short: 'Characters',
    description: 'Build and store full character sheets, with ability scores, saves, and skills.',
  },
  {
    id: 'monsters',
    href: 'monsters.html',
    icon: '🐉',
    title: 'Monsters',
    dmOnly: true,
    description: 'Save monsters with their stats and an icon, then add them to fights in a click.',
  },
  {
    id: 'items',
    href: 'items.html',
    icon: '🗡️',
    title: 'Items',
    description: 'Weapons, armor and gear with their damage dice and AC — plus custom magic items.',
  },
  {
    id: 'spells',
    href: 'spells.html',
    icon: '✨',
    title: 'Spells',
    description: 'Cantrips and spells with their attacks, saves, damage and healing — plus your own.',
  },
  {
    id: 'map',
    href: 'map.html',
    icon: '🗺️',
    title: 'Battle Map',
    short: 'Map',
    description: 'A grid with a token for everyone in the fight — drag them around to track positions.',
  },
];
