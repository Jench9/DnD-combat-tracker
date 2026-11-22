// server.js — entry point. All real code lives in src/.
const { createApp } = require('./src/app');
const { PORT, AUTO_BACKUP_DAYS, AUTO_BACKUP_KEEP } = require('./src/config');
const { startAutoBackups } = require('./src/features/backup/service');
const { flushAllStores } = require('./src/core/jsonStore');

const { server } = createApp();

server.listen(PORT, () => {
  console.log(`Adventurer's Kit running at http://localhost:${PORT}`);
});

// Weekly (by default) backups in data/backups/, the newest two kept.
startAutoBackups({ days: AUTO_BACKUP_DAYS, keep: AUTO_BACKUP_KEEP });

// Write any pending saves before exiting (Ctrl+C, `docker compose down`).
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => {
  flushAllStores();
  process.exit(0);
}));
