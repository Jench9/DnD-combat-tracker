// server.js — entry point. All real code lives in src/.
const { createApp } = require('./src/app');
const { PORT } = require('./src/config');

const { server } = createApp();

server.listen(PORT, () => {
  console.log(`Adventurer's Kit running at http://localhost:${PORT}`);
});
