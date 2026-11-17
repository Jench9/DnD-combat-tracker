import { glyphFor } from './creatureIcons.js';

// Picture for a combatant: the portrait of the character sheet it came
// from, or the icon of its library monster. Looked up live (rather than
// copied into combat state) so edits show up immediately and combat
// broadcasts stay small.
//
//   const pics = createPortraitLookup();
//   pics.setCharacters(msg.characters); pics.setMonsters(msg.monsters);
//   pics.portraitFor(combatant)  // data URL or ''
//   pics.monsterFor(combatant)   // its library monster, or undefined
//   pics.characterFor(combatant) // its character sheet, or undefined
//   pics.glyphFor(combatant)     // what to show without a picture: a
//                                // monster's emoji (core/creatureIcons.js), else the initial
export function createPortraitLookup() {
  let characters = [];
  let monsters = [];
  return {
    setCharacters(list) { characters = list || []; },
    setMonsters(list) { monsters = list || []; },
    glyphFor(c) {
      return glyphFor(c, c.monsterId ? monsters.find((x) => x.id === c.monsterId) : undefined);
    },
    characterFor(c) {
      return c.characterId ? characters.find((x) => x.id === c.characterId) : undefined;
    },
    monsterFor(c) {
      return c.monsterId ? monsters.find((x) => x.id === c.monsterId) : undefined;
    },
    portraitFor(c) {
      if (c.characterId) {
        const ch = characters.find((x) => x.id === c.characterId);
        if (ch && ch.portrait) return ch.portrait;
      }
      if (c.monsterId) {
        const m = monsters.find((x) => x.id === c.monsterId);
        if (m && m.icon) return m.icon;
      }
      return '';
    },
  };
}
