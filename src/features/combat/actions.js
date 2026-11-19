// Client -> server combat actions. Each takes a payload and mutates state.
const svc = require('./service');
const characters = require('../characters/service');
const { withDerived } = require('../characters/derived');
const monsters = require('../monsters/service');
const { tokenSizeFromNotes } = require('../monsters/model');
const { mod } = require('../characters/model');
const { writeHpToSheet } = require('./characterSync');

const { isDm } = require('../../core/identity');

const clampInit = (n) => Math.max(-10, Math.min(99, Math.round(n)));
const rollD20 = () => 1 + Math.floor(Math.random() * 20);

// Valid, distinct targets of a spell (at most 20); hidden ones only for the DM.
function targetsOf(payload, identity) {
  if (!Array.isArray(payload.targets)) return [];
  return [...new Set(payload.targets)].slice(0, 20)
    .map((id) => svc.findCombatant(id))
    .filter((t) => t && (isDm(identity) || svc.visibleToPlayers(t)));
}

module.exports = {
  addCombatant(payload) {
    const { name, init, ac, hp, type } = payload;
    if (!name || typeof init !== 'number') return;
    svc.addCombatant({
      name: String(name).slice(0, 30),
      init,
      ac: typeof ac === 'number' ? ac : 10,
      hp: typeof hp === 'number' ? hp : 1,
      maxHp: typeof hp === 'number' ? hp : 1,
      type: type === 'monster' ? 'monster' : 'pc',
    });
  },

  // Add a saved character as a PC. `init` is the initiative roll result;
  // leave it out to have the server roll d20 + DEX modifier. A character
  // can only be in the fight once.
  addCharacterToCombat(payload) {
    const found = characters.find(payload.characterId);
    if (!found) return;
    const ch = withDerived(found); // e.g. AC from equipped armor
    if (svc.getState().combatants.some((c) => c.characterId === ch.id)) return;
    const init = typeof payload.init === 'number' && Number.isFinite(payload.init)
      ? payload.init
      : rollD20() + mod(ch.abilities.dex);
    svc.addCombatant({
      name: (ch.name || 'Unnamed').slice(0, 30),
      init: clampInit(init),
      ac: typeof ch.ac === 'number' ? ch.ac : 10,
      hp: typeof ch.hpCurrent === 'number' ? ch.hpCurrent : (ch.hpMax || 1),
      maxHp: ch.hpMax || 1,
      tempHp: ch.hpTemp || 0,
      type: 'pc',
      characterId: ch.id,
    });
  },

  // A character's familiar (from its sheet, characters/familiars.js) joins
  // the fight: its own initiative (d20 + the form's bonus), the sheet's HP,
  // controlled by that character's player. One per character.
  addFamiliarToCombat(payload) {
    const ch = characters.find(payload && payload.characterId);
    const fam = ch && ch.familiar;
    if (!fam) return;
    if (svc.getState().combatants.some((c) => c.type === 'familiar' && c.ownerId === ch.id)) return;
    const name = fam.name && fam.name.toLowerCase() !== fam.form.toLowerCase() ? `${fam.name} (${fam.form})` : (fam.name || fam.form);
    const init = typeof payload.init === 'number' && Number.isFinite(payload.init) ? payload.init : rollD20() + fam.initBonus;
    svc.addCombatant({
      name: name.slice(0, 30) || 'Familiar',
      init: clampInit(init),
      ac: fam.ac,
      hp: fam.hp,
      maxHp: fam.hpMax,
      type: 'familiar',
      ownerId: ch.id,
      monsterId: fam.monsterId,
      size: tokenSizeFromNotes(fam.notes),
    });
  },

  // Add `count` (1–20) copies of a library monster, each with its own
  // initiative roll (d20 + bonus) unless `init` is given. Copies are
  // numbered ("Goblin 1", "Goblin 2"…) when there's more than one of it.
  addMonsterToCombat(payload) {
    const hidden = payload.hidden === true; // e.g. an ambush: reveal later
    const m = monsters.find(payload.monsterId);
    if (!m) return;
    const count = Math.max(1, Math.min(20, parseInt(payload.count, 10) || 1));
    const already = svc.getState().combatants.filter((c) => c.monsterId === m.id).length;
    const name = (m.name || 'Monster').slice(0, 26);
    const size = tokenSizeFromNotes(m.notes);
    for (let i = 0; i < count; i++) {
      const init = typeof payload.init === 'number' && Number.isFinite(payload.init)
        ? payload.init
        : rollD20() + m.initBonus;
      svc.addCombatant({
        name: already + count > 1 ? `${name} ${already + i + 1}` : name,
        init: clampInit(init),
        ac: m.ac,
        hp: m.hpMax,
        maxHp: m.hpMax,
        type: 'monster',
        monsterId: m.id,
        hidden,
        size,
      });
    }
  },

  // DM-only fields: hide from players, a disguise name, private notes.
  setCombatantDm(payload) {
    const c = svc.findCombatant(payload.id);
    if (!c) return;
    if (typeof payload.hidden === 'boolean') c.hidden = payload.hidden;
    if (typeof payload.alias === 'string') c.alias = payload.alias.trim().slice(0, 30);
    if (typeof payload.dmNotes === 'string') c.dmNotes = payload.dmNotes.slice(0, 2000);
  },

  // Change a combatant's initiative (e.g. a re-roll or a typo) and re-sort.
  setInitiative(payload) {
    const c = svc.findCombatant(payload.id);
    if (!c || typeof payload.init !== 'number' || !Number.isFinite(payload.init)) return;
    c.init = clampInit(payload.init);
    svc.sortByInitiative();
  },

  removeCombatant(payload) {
    const state = svc.getState();
    const idx = state.combatants.findIndex((c) => c.id === payload.id);
    if (idx === -1) return;
    svc.endConcentration(state.combatants[idx]); // its spells on others end
    state.combatants.splice(idx, 1);
    if (idx < state.activeIndex) state.activeIndex--;
    if (state.activeIndex >= state.combatants.length) state.activeIndex = 0;
  },

  renameCombatant(payload) {
    const c = svc.findCombatant(payload.id);
    if (!c) return;
    c.name = String(payload.name || 'Unnamed').slice(0, 30);
  },

  // Damage uses up temporary HP first; healing never restores it.
  // Returns true when a character sheet changed too (a PC's HP is saved
  // on its sheet), so the hub knows to rebroadcast characters.
  adjustHP(payload) {
    const c = svc.findCombatant(payload.id);
    if (!c || typeof payload.delta !== 'number' || !Number.isFinite(payload.delta)) return false;
    let delta = Math.round(payload.delta);
    // Damage while concentrating calls for a CON save (temp HP or not).
    if (delta < 0 && c.concentration) c.concentrationDc = svc.concentrationDc(-delta);
    if (delta < 0 && c.tempHp > 0) {
      const absorbed = Math.min(c.tempHp, -delta);
      c.tempHp -= absorbed;
      delta += absorbed;
    }
    c.hp = Math.max(0, Math.min(c.maxHp, c.hp + delta));
    if (c.hp > 0) {
      c.deathSuccess = 0;
      c.deathFail = 0;
    } else {
      svc.endConcentration(c); // down: concentration ends
    }
    return writeHpToSheet(c);
  },

  // Temporary HP don't stack: a new source replaces the current value.
  setTempHp(payload) {
    const c = svc.findCombatant(payload.id);
    const value = parseInt(payload.value, 10);
    if (!c || !Number.isFinite(value)) return false;
    c.tempHp = Math.max(0, Math.min(999, value));
    return writeHpToSheet(c);
  },

  addCondition(payload) {
    const c = svc.findCombatant(payload.id);
    const cond = typeof payload.condition === 'string' ? payload.condition.trim().slice(0, 30) : '';
    if (!c || !cond || c.conditions.includes(cond) || c.conditions.length >= 20) return;
    c.conditions.push(cond);
    if (svc.ENDS_CONCENTRATION.includes(cond)) svc.endConcentration(c);
  },

  removeCondition(payload) {
    const c = svc.findCombatant(payload.id);
    if (!c) return;
    c.conditions = c.conditions.filter((x) => x !== payload.condition);
  },

  // Start concentrating on `spell` (ending any previous concentration and
  // its effects). `targets`: combatant ids that get the spell's effect
  // icon; players can only target combatants they can see.
  setConcentration(payload, identity) {
    const c = svc.findCombatant(payload.id);
    const spell = typeof payload.spell === 'string' ? payload.spell.trim().slice(0, 40) : '';
    if (!c || !spell) return;
    svc.endConcentration(c);
    c.concentration = spell;
    targetsOf(payload, identity).forEach((t) => svc.addEffect(t, { name: spell, casterId: c.id, concentration: true }));
  },

  endConcentration(payload) {
    svc.endConcentration(svc.findCombatant(payload.id));
  },

  // The CON save after damage: passed keeps the spell, failed ends it.
  resolveConcentration(payload) {
    const c = svc.findCombatant(payload.id);
    if (!c || !c.concentrationDc) return;
    if (payload.passed === true) c.concentrationDc = 0;
    else if (payload.passed === false) svc.endConcentration(c);
  },

  // A spell effect without concentration (Mage Armor, Shield…), or one the
  // DM adds by hand. `casterId` is optional.
  addEffect(payload) {
    const t = svc.findCombatant(payload.id);
    const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 40) : '';
    if (!t || !name) return;
    const caster = typeof payload.casterId === 'string' ? svc.findCombatant(payload.casterId) : null;
    svc.addEffect(t, { name, casterId: caster ? caster.id : '' });
  },

  removeEffect(payload) {
    const t = svc.findCombatant(payload.id);
    if (t) t.effects = t.effects.filter((e) => e.id !== payload.effectId);
  },

  toggleDeathSave(payload) {
    const c = svc.findCombatant(payload.id);
    if (!c) return;
    const field = payload.kind === 'fail' ? 'deathFail' : 'deathSuccess';
    const i = payload.index; // 0,1,2
    c[field] = i + 1 === c[field] ? i : i + 1;
  },

  nextTurn() {
    const state = svc.getState();
    if (state.combatants.length === 0) return;
    state.activeIndex++;
    if (state.activeIndex >= state.combatants.length) {
      state.activeIndex = 0;
      state.round++;
    }
  },

  sortInit() {
    svc.sortByInitiative();
  },

  clearAll() {
    svc.reset();
  },
};
