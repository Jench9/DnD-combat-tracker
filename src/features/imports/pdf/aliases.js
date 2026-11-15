// Aliases per target field, checked case/punctuation-insensitively
// against the PDF's form field names. Covers the official WotC
// fillable 5e sheet plus a few common community variants.
const PDF_FIELD_ALIASES = {
  name: ['charactername', 'name'],
  race: ['race'],
  class: ['classlevel', 'class'],
  level: ['level', 'characterlevel', 'totallevel'],
  background: ['background'],
  alignment: ['alignment'],
  ac: ['ac', 'armorclass'],
  speed: ['speed'],
  hitDice: ['hd', 'hitdice', 'hitdicetotal'],
  hpMax: ['hpmax', 'maxhp', 'hitpointmaximum'],
  hpCurrent: ['hpcurrent', 'currenthp', 'currenthitpoints'],
  hpTemp: ['hptemp', 'temphp', 'temporaryhitpoints'],
  equipment: ['equipment'],
  features: ['featuresandtraits', 'features'],
  notes: ['notes', 'backstory'],
};

// Fields stored as numbers rather than text.
const PDF_NUMERIC_FIELDS = ['ac', 'speed', 'hpMax', 'hpCurrent', 'hpTemp', 'level'];

const PDF_ABILITY_ALIASES = {
  str: ['str', 'strength', 'strscore'],
  dex: ['dex', 'dexterity', 'dexscore'],
  con: ['con', 'constitution', 'conscore'],
  int: ['int', 'intelligence', 'intscore'],
  wis: ['wis', 'wisdom', 'wisscore'],
  cha: ['cha', 'charisma', 'chascore'],
};

const PDF_SKILL_ALIASES = {
  Acrobatics: 'acrobatics', 'Animal Handling': 'animalhandling', Arcana: 'arcana',
  Athletics: 'athletics', Deception: 'deception', History: 'history',
  Insight: 'insight', Intimidation: 'intimidation', Investigation: 'investigation',
  Medicine: 'medicine', Nature: 'nature', Perception: 'perception',
  Performance: 'performance', Persuasion: 'persuasion', Religion: 'religion',
  'Sleight of Hand': 'sleightofhand', Stealth: 'stealth', Survival: 'survival',
};

module.exports = { PDF_FIELD_ALIASES, PDF_NUMERIC_FIELDS, PDF_ABILITY_ALIASES, PDF_SKILL_ALIASES };
