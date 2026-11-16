// Realtime hub: the only file that knows about WebSockets.
//
// A "feature" plugs in by exposing:
//   name            unique id, e.g. 'combat'
//   wire            { type, key } — the message the clients receive,
//                   built as { type, [key]: snapshot } with the snapshot
//                   from snapshotFor(identity) if present, else snapshot()
//   snapshot()      returns the feature's current state slice
//   snapshotFor     optional (identity) => slice — what this viewer may see
//                   (e.g. players don't receive DM-only fields)
//   actions         { actionType: (payload, identity) => void } — client -> server
//   permissions     optional { actionType: 'anyone' | (payload, identity) => bool }
//                   saying what players may do. The DM may do everything;
//                   an action with no entry is DM-only.
//   alsoBroadcast   optional { actionType: ['otherFeatureName'] } for
//                   actions that change more than one slice
//
// Each connection's identity (DM or player + character, see
// core/identity.js) comes from the WebSocket URL. The hub checks the
// permission, applies the action, then sends the feature's slice (and any
// extra slices) to every connected client, each filtered for that client.
// On connect, a client immediately receives every slice.
const { WebSocketServer } = require('ws');
const { identityFromUrl, isDm } = require('../core/identity');

function createHub(server, features) {
  // Compression: the libraries (SRD items, spells, monsters) are a few MB
  // of JSON, sent on every connect; deflate makes that ~5–10× smaller.
  const wss = new WebSocketServer({ server, perMessageDeflate: { threshold: 1024 } });

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

  function frame(feature, identity) {
    const slice = feature.snapshotFor ? feature.snapshotFor(identity) : feature.snapshot();
    return JSON.stringify({ type: feature.wire.type, [feature.wire.key]: slice });
  }

  // Broadcast one feature's slice by name (also used by REST routes). The
  // frame is built once per distinct identity, not once per client.
  function broadcast(name) {
    const feature = byName.get(name);
    if (!feature) return;
    const cache = new Map();
    wss.clients.forEach((client) => {
      if (client.readyState !== client.OPEN) return;
      const id = client.identity;
      const key = id.role + ':' + id.characterId;
      if (!cache.has(key)) cache.set(key, frame(feature, id));
      client.send(cache.get(key));
    });
  }

  function allowed(feature, type, payload, identity) {
    if (isDm(identity)) return true;
    const rule = feature.permissions && feature.permissions[type];
    if (rule === 'anyone') return true;
    if (typeof rule === 'function') {
      try { return !!rule(payload, identity); } catch { return false; }
    }
    return false;
  }

  wss.on('connection', (ws, req) => {
    ws.identity = identityFromUrl(req.url);
    // Any page might be the one that just opened this socket, so send every slice.
    features.forEach((f) => ws.send(frame(f, ws.identity)));

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

      const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};
      if (!allowed(feature, msg.type, payload, ws.identity)) return; // not theirs to change
      feature.actions[msg.type](payload, ws.identity);
      broadcast(feature.name);
      const extra = (feature.alsoBroadcast && feature.alsoBroadcast[msg.type]) || [];
      extra.forEach(broadcast);
    });
  });

  return { wss, broadcast };
}

module.exports = { createHub };
