// Registry of the app's tools. The nav bar and the home page cards are
// both generated from this list — to add a tool, add an entry here and
// create its page (public/<page>.html + js/<id>/ + css/pages/<id>.css).
// `dmOnly` tools are hidden from players (the server doesn't send them the data either).
// `short`: the name in the top bar (defaults to `title`); home cards use `title`.
// `accountsOnly`: only when the server uses accounts (see core/identity.js).
// `phone`: priority in the phone bottom bar (core/nav.js) — when the visible
// tools don't all fit, the lowest numbers get a slot and the rest go under More.
export const TOOLS = [
  {
    id: 'combat',
    phone: 1,
    href: 'combat.html',
    icon: '⚔️',
    title: 'Combat Tracker',
    short: 'Combat', // top bar
    description: 'Initiative order, HP, AC, and conditions — shared live with everyone connected.',
  },
  {
    id: 'characters',
    phone: 2,
    href: 'characters.html',
    icon: '📜',
    title: 'Character Sheets',
    short: 'Characters',
    description: 'Build and store full character sheets, with ability scores, saves, and skills.',
  },
  {
    id: 'monsters',
    phone: 4,
    href: 'monsters.html',
    icon: '🐉',
    title: 'Monsters',
    dmOnly: true,
    description: 'Save monsters with their stats and an icon, then add them to fights in a click.',
  },
  {
    id: 'items',
    phone: 6,
    href: 'items.html',
    icon: '🗡️',
    title: 'Items',
    description: 'Weapons, armor and gear with their damage dice and AC — plus custom magic items.',
  },
  {
    id: 'spells',
    phone: 5,
    href: 'spells.html',
    icon: '✨',
    title: 'Spells',
    description: 'Cantrips and spells with their attacks, saves, damage and healing — plus your own.',
  },
  {
    id: 'map',
    phone: 3,
    href: 'map.html',
    icon: '🗺️',
    title: 'Battle Map',
    short: 'Map',
    description: 'A grid with a token for everyone in the fight — drag them around to track positions.',
  },
  {
    id: 'content',
    phone: 7,
    href: 'content.html',
    icon: '📚',
    title: 'Content',
    dmOnly: true,
    description: 'Add subclasses, species, backgrounds and feats from your books, with a source tag, for the guided creation.',
  },
  {
    id: 'players',
    phone: 8,
    href: 'players.html',
    icon: '🔑',
    title: 'Players',
    dmOnly: true,
    accountsOnly: true,
    description: 'Invite players, choose which characters each one plays, reset passwords.',
  },
];

// The tools this browser may see.
export const visibleTools = ({ isDm, accounts }) => TOOLS.filter((t) => (!t.dmOnly || isDm) && (!t.accountsOnly || accounts));
