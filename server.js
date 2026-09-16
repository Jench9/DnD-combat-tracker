// server.js — combat tracker backend
//
// Serves the static frontend (from ./public) and keeps one shared
// "source of truth" state object in memory. Every connected client
// sends small action messages over WebSocket; the server applies
// them and broadcasts the resulting state to everyone, including
// the sender. Clients never mutate state locally — they just render
// whatever the server last sent them. That's what keeps two people
// clicking at once from fighting each other.

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// ---------- shared state ----------
// Same shape the original localStorage version used, so the frontend
// render() function barely has to change.
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

// ---------- action handlers ----------
// One function per action type. Each mutates `state` directly and
// returns nothing — the caller broadcasts afterwards. Keep these as
// close as possible to the logic your original button handlers had.
const actions = {
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

// ---------- express + http + ws ----------
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast() {
  const msg = JSON.stringify({ type: 'state', state });
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(msg);
  });
}

wss.on('connection', (ws) => {
  // send current state immediately on connect
  ws.send(JSON.stringify({ type: 'state', state }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore malformed messages
    }

    const handler = actions[msg.type];
    if (!handler) return; // unknown action type, ignore

    handler(msg.payload || {});
    broadcast();
  });
});

server.listen(PORT, () => {
  console.log(`Combat tracker running at http://localhost:${PORT}`);
});