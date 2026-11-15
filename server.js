// server.js — entry point. All real code lives in src/.
const { createApp } = require('./src/app');
const { PORT } = require('./src/config');
const { flushAllStores } = require('./src/core/jsonStore');

const { server } = createApp();

server.listen(PORT, () => {
  console.log(`Adventurer's Kit running at http://localhost:${PORT}`);
});

// Write any pending saves before exiting (Ctrl+C, `docker compose down`).
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => {
  flushAllStores();
  process.exit(0);
}));
