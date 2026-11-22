// REST side of backups (the admin; open mode: the DM):
//   GET  /api/backup    downloads everything the app saves, as one JSON file
//   GET  /api/backups   the automatic backups { everyDays, keep, backups: [{ name, createdAt, bytes }] }
//   GET  /api/backups/:name   downloads one of them
//   POST /api/restore   body: that file; replaces all data, then the server
//                       rebroadcasts every slice (onRestored)
const express = require('express');
const { MAX_BACKUP_BYTES, AUTO_BACKUP_DAYS, AUTO_BACKUP_KEEP } = require('../../config');
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

  // The automatic backups: list, and download one (to restore it with "Restore from file").
  router.get('/backups', dmOnly, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ everyDays: AUTO_BACKUP_DAYS, keep: AUTO_BACKUP_KEEP, backups: backup.autoBackups() });
  });
  router.get('/backups/:name', dmOnly, (req, res) => {
    const file = backup.autoBackupPath(req.params.name);
    if (!file || !require('fs').existsSync(file)) return res.status(404).json({ error: 'No such backup.' });
    res.set('Cache-Control', 'no-store');
    res.download(file, `adventurers-kit-${req.params.name}`);
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
