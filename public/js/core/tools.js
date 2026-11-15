// Registry of the app's tools. The nav bar and the home page cards are
// both generated from this list — to add a tool, add an entry here and
// create its page (public/<page>.html + js/<id>/ + css/pages/<id>.css).
export const TOOLS = [
  {
    id: 'combat',
    href: 'combat.html',
    icon: '⚔️',
    title: 'Combat Tracker',
    description: 'Initiative order, HP, AC, and conditions — shared live with everyone connected.',
  },
  {
    id: 'characters',
    href: 'characters.html',
    icon: '📜',
    title: 'Character Sheets',
    description: 'Build and store full character sheets, with ability scores, saves, and skills.',
  },
  {
    id: 'monsters',
    href: 'monsters.html',
    icon: '🐉',
    title: 'Monsters',
    description: 'Save monsters with their stats and an icon, then add them to fights in a click.',
  },
  {
    id: 'map',
    href: 'map.html',
    icon: '🗺️',
    title: 'Battle Map',
    description: 'A grid with a token for everyone in the fight — drag them around to track positions.',
  },
];
