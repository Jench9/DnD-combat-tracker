// Client -> server combat actions. Each takes a payload and mutates state.
const svc = require('./service');

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
