const WebSocket = require('ws');
const { createApp } = require('../src/app');

// Starts the app on a random port. Returns { port, close }.
async function startServer() {
  require('../src/features/combat/service').reset(); // state is module-level; start each test clean
  const { server, hub } = createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  return { port, close: () => new Promise((resolve) => {
    hub.wss.clients.forEach((c) => c.terminate());
    server.closeAllConnections?.();
    server.close(resolve);
  }) };
}

// Connects a client; collects messages and lets tests await a message type.
function connect(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const messages = [];
  const waiters = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    messages.push(msg);
    waiters.splice(0).forEach((w) => w());
  });
  const opened = new Promise((resolve) => ws.on('open', resolve));

  async function next(type, predicate = () => true, timeout = 2000) {
    const start = Date.now();
    for (;;) {
      const i = messages.findIndex((m) => m.type === type && predicate(m));
      if (i >= 0) return messages.splice(i, 1)[0];
      if (Date.now() - start > timeout) throw new Error(`timeout waiting for ${type}`);
      await new Promise((resolve) => { waiters.push(resolve); setTimeout(resolve, 50); });
    }
  }
  return { ws, opened, next, send: (type, payload) => ws.send(JSON.stringify({ type, payload })), close: () => ws.close() };
}

module.exports = { startServer, connect };
