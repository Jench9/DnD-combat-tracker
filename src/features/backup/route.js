// REST side of backups (DM only):
//   GET  /api/backup    downloads everything the app saves, as one JSON file
//   POST /api/restore   body: that file; replaces all data, then the server
//                       rebroadcasts every slice (onRestored)
const express = require('express');
const { MAX_BACKUP_BYTES } = require('../../config');
const { identityFromHeaders, isDm } = require('../../core/identity');
const backup = require('./service');

function createBackupRouter({ onRestored }) {
  const router = express.Router();
  // Everyone's data: the admin (open mode: the DM).
  const dmOnly = (req, res, next) => {
    const id = identityFromHeaders(req);
    const ok = id.accountId ? id.accountRole === 'admin' : isDm(id);
    return ok ? next() : res.status(403).json({ error: 'Only the admin can back up or restore the data.' });
  };

  router.get('/backup', dmOnly, (req, res) => {
    const now = new Date(); // the server's local date
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    res.set('Content-Disposition', `attachment; filename="adventurers-kit-backup-${day}.json"`);
    res.set('Cache-Control', 'no-store');
    res.type('application/json').send(JSON.stringify(backup.createBackup()));
  });

  // Raw body: a backup with map images is far over the normal JSON limit.
  router.post('/restore', dmOnly, express.raw({ type: () => true, limit: MAX_BACKUP_BYTES }), (req, res) => {
    let bundle;
    try {
      bundle = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '');
    } catch {
      return res.status(400).json({ error: "That isn't a valid backup file (not JSON)." });
    }
    try {
      const result = backup.restoreBackup(bundle);
      console.log(`Restored a backup (${result.files} files); previous data saved as backups/${result.safetyCopy}`);
      onRestored();
      res.json(result);
    } catch (err) {
      if (err instanceof backup.BackupError) return res.status(400).json({ error: err.message });
      console.error('Restore failed:', err);
      res.status(500).json({ error: 'Restore failed — check the server log. The previous data was saved in data/backups/.' });
    }
  });

  // express.raw rejects oversized bodies before the handler runs.
  router.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That backup is too large.' });
    next(err);
  });

  return router;
}

module.exports = { createBackupRouter };
