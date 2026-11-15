// Realtime hub: the only file that knows about WebSockets.
//
// A "feature" plugs in by exposing:
//   name            unique id, e.g. 'combat'
//   wire            { type, key } — the message the clients receive,
//                   built as { type, [key]: snapshot() }
//   snapshot()      returns the feature's current state slice
//   actions         { actionType: (payload) => void } — client -> server
//   alsoBroadcast   optional { actionType: ['otherFeatureName'] } for
//                   actions that change more than one slice
//
// The hub applies the action, then broadcasts the feature's slice (and any
// extra slices) to every connected client, including the sender. On
// connect, a client immediately receives every slice.
const { WebSocketServer } = require('ws');

function createHub(server, features) {
  const wss = new WebSocketServer({ server });

  const byName = new Map(features.map((f) => [f.name, f]));
  const actionOwner = new Map();
  features.forEach((f) => {
    Object.keys(f.actions).forEach((type) => {
      if (actionOwner.has(type)) {
        throw new Error(`Duplicate action "${type}" in features "${actionOwner.get(type).name}" and "${f.name}"`);
      }
      actionOwner.set(type, f);
    });
  });

  function frame(feature) {
    return JSON.stringify({ type: feature.wire.type, [feature.wire.key]: feature.snapshot() });
  }

  function sendAll(msg) {
    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) client.send(msg);
    });
  }

  // Broadcast one feature's slice by name (also used by REST routes).
  function broadcast(name) {
    const feature = byName.get(name);
    if (feature) sendAll(frame(feature));
  }

  wss.on('connection', (ws) => {
    // Either page (combat or characters) might be the one that just
    // opened this socket, so send every slice.
    features.forEach((f) => ws.send(frame(f)));

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return; // ignore malformed messages
      }
      if (!msg || typeof msg !== 'object') return;

      const feature = actionOwner.get(msg.type);
      if (!feature) return; // unknown action type — ignore

      feature.actions[msg.type](msg.payload || {});
      broadcast(feature.name);
      const extra = (feature.alsoBroadcast && feature.alsoBroadcast[msg.type]) || [];
      extra.forEach(broadcast);
    });
  });

  return { wss, broadcast };
}

module.exports = { createHub };
