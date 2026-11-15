// Lookup tables for the D&D Beyond character payload.
const DDB_ALIGNMENTS = {
  1: 'Lawful Good', 2: 'Neutral Good', 3: 'Chaotic Good',
  4: 'Lawful Neutral', 5: 'Neutral', 6: 'Chaotic Neutral',
  7: 'Lawful Evil', 8: 'Neutral Evil', 9: 'Chaotic Evil',
};

const DDB_STAT_NAMES = {
  1: 'strength', 2: 'dexterity', 3: 'constitution',
  4: 'intelligence', 5: 'wisdom', 6: 'charisma',
};

const DDB_ABILITY_SHORT = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};

const DDB_SKILL_BY_SUBTYPE = {
  acrobatics: 'Acrobatics', 'animal-handling': 'Animal Handling', arcana: 'Arcana',
  athletics: 'Athletics', deception: 'Deception', history: 'History',
  insight: 'Insight', intimidation: 'Intimidation', investigation: 'Investigation',
  medicine: 'Medicine', nature: 'Nature', perception: 'Perception',
  performance: 'Performance', persuasion: 'Persuasion', religion: 'Religion',
  'sleight-of-hand': 'Sleight of Hand', stealth: 'Stealth', survival: 'Survival',
};

module.exports = { DDB_ALIGNMENTS, DDB_STAT_NAMES, DDB_ABILITY_SHORT, DDB_SKILL_BY_SUBTYPE };
