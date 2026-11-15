// Picture for a combatant: the portrait of the character sheet it came
// from, or the icon of its library monster. Looked up live (rather than
// copied into combat state) so edits show up immediately and combat
// broadcasts stay small.
//
//   const pics = createPortraitLookup();
//   pics.setCharacters(msg.characters); pics.setMonsters(msg.monsters);
//   pics.portraitFor(combatant)  // data URL or ''
export function createPortraitLookup() {
  let characters = [];
  let monsters = [];
  return {
    setCharacters(list) { characters = list || []; },
    setMonsters(list) { monsters = list || []; },
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
