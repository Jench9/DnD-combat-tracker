// server.js — combat tracker + character sheets backend
//
// Serves the static frontend (from ./public) and keeps two shared
// "source of truth" state objects in memory: `state` (combat) and
// `characters` (character sheets). Every connected client sends small
// action messages over WebSocket; the server applies them and
// broadcasts the resulting state to everyone, including the sender.
// Clients never mutate state locally — they just render whatever the
// server last sent them. That's what keeps two people clicking (or
// typing) at once from fighting each other.

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');

const PORT = process.env.PORT || 3000;

// Requires Node 18+ for global fetch (used by the D&D Beyond importer).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

// ---------- combat state ----------
let state = {
  round: 1,
  activeIndex: 0,
  combatants: [], // { id, name, init, ac, hp, maxHp, type, conditions: [], deathSuccess, deathFail }
};

function uid() {
  return crypto.randomBytes(4).toString('hex');
}

function findCombatant(id) {
  return state.combatants.find((c) => c.id === id);
}

function sortByInitiative() {
  const activeId = state.combatants[state.activeIndex]
    ? state.combatants[state.activeIndex].id
    : null;
  state.combatants.sort((a, b) => b.init - a.init);
  if (activeId) {
    const newIdx = state.combatants.findIndex((c) => c.id === activeId);
    if (newIdx !== -1) state.activeIndex = newIdx;
  }
}

// ---------- combat action handlers ----------
const combatActions = {
  addCombatant(payload) {
    const { name, init, ac, hp, type } = payload;
    if (!name || typeof init !== 'number') return;
    state.combatants.push({
      id: uid(),
      name: String(name).slice(0, 30),
      init,
      ac: typeof ac === 'number' ? ac : 10,
      hp: typeof hp === 'number' ? hp : 1,
      maxHp: typeof hp === 'number' ? hp : 1,
      type: type === 'monster' ? 'monster' : 'pc',
      conditions: [],
      deathSuccess: 0,
      deathFail: 0,
    });
    sortByInitiative();
  },

  removeCombatant(payload) {
    const idx = state.combatants.findIndex((c) => c.id === payload.id);
    if (idx === -1) return;
    state.combatants.splice(idx, 1);
    if (idx < state.activeIndex) state.activeIndex--;
    if (state.activeIndex >= state.combatants.length) state.activeIndex = 0;
  },

  renameCombatant(payload) {
    const c = findCombatant(payload.id);
    if (!c) return;
    c.name = String(payload.name || 'Unnamed').slice(0, 30);
  },

  adjustHP(payload) {
    const c = findCombatant(payload.id);
    if (!c) return;
    c.hp = Math.max(0, Math.min(c.maxHp, c.hp + payload.delta));
    if (c.hp > 0) {
      c.deathSuccess = 0;
      c.deathFail = 0;
    }
  },

  addCondition(payload) {
    const c = findCombatant(payload.id);
    if (!c || c.conditions.includes(payload.condition)) return;
    c.conditions.push(payload.condition);
  },

  removeCondition(payload) {
    const c = findCombatant(payload.id);
    if (!c) return;
    c.conditions = c.conditions.filter((x) => x !== payload.condition);
  },

  toggleDeathSave(payload) {
    const c = findCombatant(payload.id);
    if (!c) return;
    const field = payload.kind === 'fail' ? 'deathFail' : 'deathSuccess';
    const i = payload.index; // 0,1,2
    c[field] = i + 1 === c[field] ? i : i + 1;
  },

  nextTurn() {
    if (state.combatants.length === 0) return;
    state.activeIndex++;
    if (state.activeIndex >= state.combatants.length) {
      state.activeIndex = 0;
      state.round++;
    }
  },

  sortInit() {
    sortByInitiative();
  },

  clearAll() {
    state = { round: 1, activeIndex: 0, combatants: [] };
  },
};

// ---------- character sheet state ----------
// One flat list, shared by everyone connected — same idea as the
// combatant list, just with a much bigger per-item shape.
let characters = [];
// { id, name, race, class, level, background, alignment,
//   ac, speed, hitDice,
//   abilities: { str, dex, con, int, wis, cha },
//   hpMax, hpCurrent, hpTemp,
//   saveProf: { str: bool, ... }, skillProf: { 'Stealth': bool, ... },
//   equipment, features, notes }

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

function findCharacter(id) {
  return characters.find((c) => c.id === id);
}

function blankCharacter(id) {
  return {
    id,
    name: '', race: '', class: '', level: 1, background: '', alignment: '',
    ac: 10, speed: 30, hitDice: '1d8',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    hpMax: 10, hpCurrent: 10, hpTemp: 0,
    saveProf: {}, skillProf: {},
    equipment: '', features: '', notes: '',
  };
}

function mod(score) {
  return Math.floor(((parseInt(score, 10) || 10) - 10) / 2);
}

// Merge an incoming patch onto an existing character, keeping the
// shape sane. Only known fields are copied over; everything is
// coerced/clamped so a malformed client message can't corrupt state
// for everyone else at the table.
function sanitizeCharacterPatch(existing, patch) {
  const next = { ...existing };

  if (typeof patch.name === 'string') next.name = patch.name.slice(0, 60);
  if (typeof patch.race === 'string') next.race = patch.race.slice(0, 40);
  if (typeof patch.class === 'string') next.class = patch.class.slice(0, 40);
  if (patch.level !== undefined) {
    next.level = Math.max(1, Math.min(20, parseInt(patch.level, 10) || 1));
  }
  if (typeof patch.background === 'string') next.background = patch.background.slice(0, 60);
  if (typeof patch.alignment === 'string') next.alignment = patch.alignment.slice(0, 40);
  if (patch.ac !== undefined) next.ac = parseInt(patch.ac, 10) || 10;
  if (patch.speed !== undefined) next.speed = parseInt(patch.speed, 10) || 30;
  if (typeof patch.hitDice === 'string') next.hitDice = patch.hitDice.slice(0, 20);
  if (patch.hpMax !== undefined) next.hpMax = Math.max(1, parseInt(patch.hpMax, 10) || 1);
  if (patch.hpCurrent !== undefined) next.hpCurrent = Math.max(0, parseInt(patch.hpCurrent, 10) || 0);
  if (patch.hpTemp !== undefined) next.hpTemp = Math.max(0, parseInt(patch.hpTemp, 10) || 0);
  if (typeof patch.equipment === 'string') next.equipment = patch.equipment.slice(0, 4000);
  if (typeof patch.features === 'string') next.features = patch.features.slice(0, 4000);
  if (typeof patch.notes === 'string') next.notes = patch.notes.slice(0, 4000);

  if (patch.abilities && typeof patch.abilities === 'object') {
    next.abilities = { ...existing.abilities };
    ABILITY_KEYS.forEach((k) => {
      if (patch.abilities[k] !== undefined) {
        next.abilities[k] = Math.max(1, Math.min(30, parseInt(patch.abilities[k], 10) || 10));
      }
    });
  }
  if (patch.saveProf && typeof patch.saveProf === 'object') {
    next.saveProf = { ...existing.saveProf };
    ABILITY_KEYS.forEach((k) => {
      if (patch.saveProf[k] !== undefined) next.saveProf[k] = !!patch.saveProf[k];
    });
  }
  if (patch.skillProf && typeof patch.skillProf === 'object') {
    next.skillProf = { ...existing.skillProf };
    Object.keys(patch.skillProf).forEach((k) => {
      next.skillProf[String(k).slice(0, 40)] = !!patch.skillProf[k];
    });
  }

  return next;
}

// ---------- character action handlers ----------
const characterActions = {
  // Client generates the id (so it can open the editor immediately
  // without waiting on a round trip) and just asks the server to
  // register it.
  addCharacter(payload) {
    const id = (payload && typeof payload.id === 'string' && payload.id) || uid();
    if (findCharacter(id)) return;
    characters.unshift(blankCharacter(id));
  },

  updateCharacter(payload) {
    const { id, patch } = payload || {};
    const idx = characters.findIndex((c) => c.id === id);
    if (idx === -1 || !patch || typeof patch !== 'object') return;
    characters[idx] = sanitizeCharacterPatch(characters[idx], patch);
  },

  deleteCharacter(payload) {
    characters = characters.filter((c) => c.id !== (payload && payload.id));
  },

  // Bridges the two tools: drop a saved character straight into the
  // combat tracker as a PC combatant. Reuses the same combatant shape
  // addCombatant builds, so it shows up exactly the same way.
  sendToCombat(payload) {
    const ch = findCharacter(payload && payload.id);
    if (!ch) return;
    const init = 10 + mod(ch.abilities.dex);
    state.combatants.push({
      id: uid(),
      name: ch.name || 'Unnamed',
      init,
      ac: typeof ch.ac === 'number' ? ch.ac : 10,
      hp: typeof ch.hpCurrent === 'number' ? ch.hpCurrent : (ch.hpMax || 1),
      maxHp: ch.hpMax || 1,
      type: 'pc',
      conditions: [],
      deathSuccess: 0,
      deathFail: 0,
    });
    sortByInitiative();
  },
};

// Used by both importers: builds a blank character, applies a mapped
// patch through the same sanitizer normal edits go through, registers
// it, and returns it so the route handler can respond immediately
// (rather than waiting on the next WS broadcast round-trip).
function addImportedCharacter(mappedPatch, extraNotesPrefix) {
  const id = uid();
  let ch = blankCharacter(id);
  ch = sanitizeCharacterPatch(ch, mappedPatch);
  if (extraNotesPrefix) {
    ch.notes = (extraNotesPrefix + (ch.notes ? '\n\n' + ch.notes : '')).slice(0, 4000);
  }
  characters.unshift(ch);
  return ch;
}

// ---------- D&D Beyond import ----------
// Unofficial endpoint used by most third-party D&D Beyond tools.
// Only works for characters whose D&D Beyond sharing is set to Public.
const DDB_ALIGNMENTS = {
  1: 'Lawful Good', 2: 'Neutral Good', 3: 'Chaotic Good',
  4: 'Lawful Neutral', 5: 'Neutral', 6: 'Chaotic Neutral',
  7: 'Lawful Evil', 8: 'Neutral Evil', 9: 'Chaotic Evil',
};
const DDB_STAT_INDEX = { 1: 'str', 2: 'dex', 3: 'con', 4: 'int', 5: 'wis', 6: 'cha' };
const DDB_SKILL_BY_SUBTYPE = {
  acrobatics: 'Acrobatics', 'animal-handling': 'Animal Handling', arcana: 'Arcana',
  athletics: 'Athletics', deception: 'Deception', history: 'History',
  insight: 'Insight', intimidation: 'Intimidation', investigation: 'Investigation',
  medicine: 'Medicine', nature: 'Nature', perception: 'Perception',
  performance: 'Performance', persuasion: 'Persuasion', religion: 'Religion',
  'sleight-of-hand': 'Sleight of Hand', stealth: 'Stealth', survival: 'Survival',
};

function extractDdbCharacterId(input) {
  const s = String(input || '').trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/characters\/(\d+)/);
  return m ? m[1] : null;
}

function ddbStatValue(data, statId) {
  const base = (data.stats || []).find((s) => s.id === statId);
  const bonus = (data.bonusStats || []).find((s) => s.id === statId);
  const override = (data.overrideStats || []).find((s) => s.id === statId);
  if (override && typeof override.value === 'number') return override.value;
  const baseVal = base && typeof base.value === 'number' ? base.value : 10;
  const bonusVal = bonus && typeof bonus.value === 'number' ? bonus.value : 0;
  return baseVal + bonusVal;
}

function mapDndBeyondData(data) {
  const abilities = {};
  ABILITY_KEYS.forEach((key, i) => {
    abilities[key] = ddbStatValue(data, i + 1);
  });

  const classes = Array.isArray(data.classes) ? data.classes : [];
  const level = classes.reduce((sum, c) => sum + (c.level || 0), 0) || 1;
  const classText = classes
    .map((c) => `${(c.definition && c.definition.name) || 'Class'} ${c.level || ''}`.trim())
    .join(' / ');

  // Proficiencies live scattered across several modifier arrays
  // (race/class/background/feat/item). We scan all of them for
  // 'proficiency' entries tied to a skill or to saving throws.
  const modifierGroups = data.modifiers && typeof data.modifiers === 'object'
    ? Object.values(data.modifiers).flat()
    : [];
  const saveProf = {};
  const skillProf = {};
  modifierGroups.forEach((m) => {
    if (!m || m.type !== 'proficiency') return;
    const subType = String(m.subType || '');
    if (subType.endsWith('-saving-throws')) {
      const abilKey = subType.replace('-saving-throws', '');
      const short = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' }[abilKey];
      if (short) saveProf[short] = true;
    } else if (DDB_SKILL_BY_SUBTYPE[subType]) {
      skillProf[DDB_SKILL_BY_SUBTYPE[subType]] = true;
    }
  });

  // AC has no single source field in the raw data — D&D Beyond
  // computes it client-side from equipped armor/shield/feats. This is
  // a best-effort approximation from equipped armor only; it will be
  // wrong for characters with AC-affecting feats or unarmored
  // defense builds, so it's always worth double-checking in the app.
  const dexMod = Math.floor((abilities.dex - 10) / 2);
  let ac = 10 + dexMod;
  const inventory = Array.isArray(data.inventory) ? data.inventory : [];
  const equippedArmor = inventory.find(
    (i) => i.equipped && i.definition && i.definition.filterType === 'Armor' && i.definition.armorTypeId !== 4
  );
  const equippedShield = inventory.find(
    (i) => i.equipped && i.definition && i.definition.armorTypeId === 4
  );
  if (equippedArmor && equippedArmor.definition.armorClass) {
    const maxDex = equippedArmor.definition.armorTypeId === 1 ? dexMod : Math.min(dexMod, 2);
    ac = equippedArmor.definition.armorClass + (equippedArmor.definition.armorTypeId === 3 ? 0 : maxDex);
  }
  if (equippedShield && equippedShield.definition.armorClass) {
    ac += equippedShield.definition.armorClass;
  }

  const equipmentText = inventory
    .map((i) => `${(i.definition && i.definition.name) || 'Item'}${i.quantity > 1 ? ` x${i.quantity}` : ''}`)
    .join('\n');

  const features = [];
  (data.classes || []).forEach((c) => {
    ((c.classFeatures) || []).forEach((f) => {
      if (f.definition && f.definition.name) features.push(f.definition.name);
    });
  });
  (data.feats || []).forEach((f) => {
    if (f.definition && f.definition.name) features.push(f.definition.name);
  });

  return {
    patch: {
      name: data.name || '',
      race: (data.race && (data.race.fullName || data.race.baseRaceName)) || '',
      class: classText,
      level,
      background: (data.background && data.background.definition && data.background.definition.name) || '',
      alignment: DDB_ALIGNMENTS[data.alignmentId] || '',
      ac,
      speed: (data.race && data.race.weightSpeeds && data.race.weightSpeeds.normal && data.race.weightSpeeds.normal.walk) || 30,
      hitDice: classes[0] ? `${level}d${(classes[0].definition && classes[0].definition.hitDice) || 8}` : '',
      abilities,
      hpMax: (data.baseHitPoints || 0) + (data.bonusHitPoints || 0),
      hpCurrent: Math.max(0, (data.baseHitPoints || 0) + (data.bonusHitPoints || 0) - (data.removedHitPoints || 0)),
      hpTemp: data.temporaryHitPoints || 0,
      saveProf,
      skillProf,
      equipment: equipmentText,
      features: features.join('\n'),
    },
    notesPrefix: 'Imported from D&D Beyond. AC and proficiencies are best-effort — please double-check them.',
  };
}

// ---------- PDF import ----------
// Aliases per target field, checked case/whitespace-insensitively
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

function normalizeFieldName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapPdfFormFields(fields) {
  // fields: [{ name, value, type: 'text'|'checkbox' }]
  const byNorm = new Map();
  fields.forEach((f) => byNorm.set(normalizeFieldName(f.name), f));

  const patch = { abilities: {}, saveProf: {}, skillProf: {} };
  const used = new Set();

  function take(aliasMap, targetKey, isNumber) {
    for (const alias of aliasMap) {
      const f = byNorm.get(alias);
      if (f && f.value !== '' && f.value != null) {
        patch[targetKey] = isNumber ? (parseInt(f.value, 10) || 0) : String(f.value);
        used.add(normalizeFieldName(f.name));
        return;
      }
    }
  }

  Object.entries(PDF_FIELD_ALIASES).forEach(([key, aliases]) => {
    const isNumber = ['ac', 'speed', 'hpMax', 'hpCurrent', 'hpTemp', 'level'].includes(key);
    take(aliases, key, isNumber);
  });

  // Most fillable sheets only have a combined "ClassLevel" field like
  // "Rogue 4" or "Fighter 3 / Wizard 2" and no separate level field —
  // sum any numbers found in the class text as a fallback.
  if (patch.level === undefined && typeof patch.class === 'string') {
    const nums = patch.class.match(/\d+/g);
    if (nums) patch.level = nums.reduce((sum, n) => sum + parseInt(n, 10), 0);
  }

  Object.entries(PDF_ABILITY_ALIASES).forEach(([abilKey, aliases]) => {
    for (const alias of aliases) {
      const f = byNorm.get(alias);
      if (f && f.value !== '' && f.value != null) {
        patch.abilities[abilKey] = parseInt(f.value, 10) || 10;
        used.add(normalizeFieldName(f.name));
        break;
      }
    }
  });

  Object.entries(PDF_SKILL_ALIASES).forEach(([label, alias]) => {
    const f = byNorm.get(alias);
    if (f && f.type === 'checkbox' && f.value) {
      patch.skillProf[label] = true;
      used.add(normalizeFieldName(f.name));
    }
  });

  // Anything we didn't recognize gets preserved as text rather than
  // silently dropped, so the user can still find and copy it in.
  const leftover = fields
    .filter((f) => !used.has(normalizeFieldName(f.name)) && f.value !== '' && f.value != null && f.value !== false)
    .map((f) => `${f.name}: ${f.value}`)
    .join('\n');

  return { patch, leftover };
}

// ---------- express + http + ws ----------
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/import/dndbeyond', async (req, res) => {
  const ddbId = extractDdbCharacterId(req.body && req.body.input);
  if (!ddbId) {
    return res.status(400).json({ error: 'Paste a D&D Beyond character URL or ID.' });
  }
  try {
    const resp = await fetch(`https://character-service.dndbeyond.com/character/v5/character/${ddbId}`);
    if (!resp.ok) {
      return res.status(502).json({ error: `D&D Beyond returned an error (${resp.status}).` });
    }
    const json = await resp.json();
    if (!json || json.success === false || !json.data) {
      return res.status(404).json({
        error: 'Could not load that character. Make sure its D&D Beyond sharing is set to "Public".',
      });
    }
    const { patch, notesPrefix } = mapDndBeyondData(json.data);
    const ch = addImportedCharacter(patch, notesPrefix);
    broadcastCharacters();
    res.json({ character: ch });
  } catch (err) {
    console.error('D&D Beyond import failed:', err);
    res.status(500).json({ error: 'Import failed — see server logs for details.' });
  }
});

app.post('/api/import/pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  try {
    let fields = [];
    try {
      const pdfDoc = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true });
      const form = pdfDoc.getForm();
      fields = form.getFields().map((f) => {
        const name = f.getName();
        const type = f.constructor && f.constructor.name === 'PDFCheckBox' ? 'checkbox' : 'text';
        let value = '';
        try {
          value = type === 'checkbox' ? f.isChecked() : f.getText();
        } catch {
          value = '';
        }
        return { name, value, type };
      });
    } catch (err) {
      console.warn('PDF has no readable form fields, falling back to raw text:', err.message);
    }

    if (fields.length > 0) {
      const { patch, leftover } = mapPdfFormFields(fields);
      const notesPrefix = 'Imported from a PDF form. Please double-check everything below.'
        + (leftover ? `\n\nOther fields found in the PDF that weren't auto-mapped:\n${leftover}` : '');
      const ch = addImportedCharacter(patch, notesPrefix);
      broadcastCharacters();
      return res.json({ character: ch, warning: 'Some fields may need manual review.' });
    }

    // No form fields at all — likely a flattened/scanned PDF. Fall
    // back to raw text extraction so at least something comes across.
    const parsed = await pdfParse(req.file.buffer);
    const notesPrefix = "Imported from a PDF with no fillable form fields, so nothing could be auto-mapped. "
      + "Here's the raw text Claude extracted — copy what you need into the fields above:\n\n" + parsed.text.slice(0, 3500);
    const ch = addImportedCharacter({}, notesPrefix);
    broadcastCharacters();
    res.json({ character: ch, warning: 'No fillable fields found — pasted raw text into Notes instead.' });
  } catch (err) {
    console.error('PDF import failed:', err);
    res.status(500).json({ error: 'Could not read that PDF.' });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcastState() {
  const msg = JSON.stringify({ type: 'state', state });
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(msg);
  });
}

function broadcastCharacters() {
  const msg = JSON.stringify({ type: 'charState', characters });
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(msg);
  });
}

wss.on('connection', (ws) => {
  // send current state immediately on connect — both slices, since
  // either page (combat.html or characters.html) might be the one
  // that just opened this socket.
  ws.send(JSON.stringify({ type: 'state', state }));
  ws.send(JSON.stringify({ type: 'charState', characters }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore malformed messages
    }

    if (combatActions[msg.type]) {
      combatActions[msg.type](msg.payload || {});
      broadcastState();
      return;
    }

    if (characterActions[msg.type]) {
      characterActions[msg.type](msg.payload || {});
      broadcastCharacters();
      // sendToCombat also touches combat state, so tell combat.html too
      if (msg.type === 'sendToCombat') broadcastState();
      return;
    }

    // unknown action type — ignore
  });
});

server.listen(PORT, () => {
  console.log(`Adventurer's Kit running at http://localhost:${PORT}`);
});