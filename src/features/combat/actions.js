// Client -> server combat actions. Each takes a payload and mutates state.
const svc = require('./service');
const characters = require('../characters/service');
const { mod } = require('../characters/model');

const clampInit = (n) => Math.max(-10, Math.min(99, Math.round(n)));
const rollD20 = () => 1 + Math.floor(Math.random() * 20);

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
    const ch = characters.find(payload.characterId);
    if (!ch) return;
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
      type: 'pc',
      characterId: ch.id,
    });
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
    state.combatants.splice(idx, 1);
    if (idx < state.activeIndex) state.activeIndex--;
    if (state.activeIndex >= state.combatants.length) state.activeIndex = 0;
  },

  renameCombatant(payload) {
    const c = svc.findCombatant(payload.id);
    if (!c) return;
    c.name = String(payload.name || 'Unnamed').slice(0, 30);
  },

  adjustHP(payload) {
    const c = svc.findCombatant(payload.id);
    if (!c) return;
    c.hp = Math.max(0, Math.min(c.maxHp, c.hp + payload.delta));
    if (c.hp > 0) {
      c.deathSuccess = 0;
      c.deathFail = 0;
    }
  },

  addCondition(payload) {
    const c = svc.findCombatant(payload.id);
    if (!c || c.conditions.includes(payload.condition)) return;
    c.conditions.push(payload.condition);
  },

  removeCondition(payload) {
    const c = svc.findCombatant(payload.id);
    if (!c) return;
    c.conditions = c.conditions.filter((x) => x !== payload.condition);
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
