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
//   dmPermissions   optional { actionType: (payload, identity) => bool }: limits
//                   on a DM for things outside its own table (another
//                   campaign's character or campaign — core/access.js)
//   alsoBroadcast   optional { actionType: ['otherFeatureName'] } for
//                   actions that change more than one slice, or
//                   { actionType: (result) => [...] } to decide from what
//                   the action returned
//
// Each connection's identity (DM or player + characters, see
// core/identity.js) comes from the session cookie (accounts mode) or the
// WebSocket URL (open mode); connections without one, or from another
// site (Origin), are refused before the upgrade. The hub checks the
// permission, applies the action, then sends the feature's slice (and any
// extra slices) to every connected client, each filtered for that client.
// On connect, a client immediately receives every slice.
const { WebSocketServer } = require('ws');
const { identityFromUpgrade, isDm } = require('../core/identity');
const { sameOrigin } = require('../core/security');
const { MAX_WS_MESSAGE_BYTES } = require('../config');
const { withTable } = require('../core/table');

function createHub(server, features) {
  // Compression: the libraries (SRD items, spells, monsters) are a few MB
  // of JSON, sent on every connect; deflate makes that ~5–10× smaller.
  const wss = new WebSocketServer({
    server,
    perMessageDeflate: { threshold: 1024 },
    maxPayload: MAX_WS_MESSAGE_BYTES,
    verifyClient: ({ req }, done) => {
      if (!sameOrigin(req)) return done(false, 403, 'Cross-site connection refused');
      const identity = identityFromUpgrade(req);
      if (!identity) return done(false, 401, 'Please log in');
      req.identity = identity;
      return done(true);
    },
  });

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

  // Built inside the viewer's table (campaign): its fight, its map.
  function frame(feature, identity) {
    const slice = withTable(identity.tableId, () => (feature.snapshotFor ? feature.snapshotFor(identity) : feature.snapshot()));
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
      const key = id.role + ':' + id.characterId + ':' + (id.accountId || '') + ':' + id.tableId;
      if (!cache.has(key)) cache.set(key, frame(feature, id));
      client.send(cache.get(key));
    });
  }

  function allowed(feature, type, payload, identity) {
    if (isDm(identity)) {
      const limit = feature.dmPermissions && feature.dmPermissions[type];
      if (!limit) return true;
      try { return !!limit(payload, identity); } catch { return false; }
    }
    const rule = feature.permissions && feature.permissions[type];
    if (rule === 'anyone') return true;
    if (typeof rule === 'function') {
      try { return !!rule(payload, identity); } catch { return false; }
    }
    return false;
  }

  wss.on('connection', (ws, req) => {
    ws.identity = req.identity;
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
      const result = withTable(ws.identity.tableId, () => {
        if (!allowed(feature, msg.type, payload, ws.identity)) return { refused: true }; // not theirs to change
        return { value: feature.actions[msg.type](payload, ws.identity) };
      });
      if (result.refused) return;
      broadcast(feature.name);
      let extra = (feature.alsoBroadcast && feature.alsoBroadcast[msg.type]) || [];
      if (typeof extra === 'function') extra = extra(result.value) || [];
      extra.forEach(broadcast);
    });
  });

  // An account's sessions ended (4401: its pages check they're still
  // logged in, then reconnect or go to the login page) or its role changed
  // (4403: its pages reload, to show the DM tools or hide them).
  function closeAccount(accountId, code = 4401) {
    wss.clients.forEach((client) => {
      if (client.identity && client.identity.accountId === accountId) client.close(code, code === 4403 ? 'Role changed' : 'Session changed');
    });
  }

  return { wss, broadcast, closeAccount };
}

module.exports = { createHub };
