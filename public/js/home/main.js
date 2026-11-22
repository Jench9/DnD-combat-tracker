import { renderNav } from '../core/nav.js';
import { visibleTools } from '../core/tools.js';
import { isDm, isAdmin, identityHeaders, authMode } from '../core/identity.js';

renderNav();

const grid = document.getElementById('toolGrid');
visibleTools({ isDm: isDm(), accounts: authMode() === 'accounts' }).forEach((t) => {
  const a = document.createElement('a');
  a.className = 'tool-card';
  a.href = t.href;
  const ic = document.createElement('span');
  ic.className = 'ic';
  ic.textContent = t.icon;
  const h = document.createElement('h2');
  h.textContent = t.title;
  const p = document.createElement('p');
  p.textContent = t.description;
  a.append(ic, h, p);
  grid.appendChild(a);
});

// ---- Backup & restore (DM)
const $ = (id) => document.getElementById(id);
function say(text, isError) {
  $('backupMsg').textContent = text;
  $('backupMsg').classList.toggle('error', !!isError);
}

// Everyone's data: with accounts, only the admin backs it up or restores it.
if (authMode() === 'accounts' && !isAdmin()) document.querySelector('.backup-panel').style.display = 'none';

$('backupBtn').addEventListener('click', async () => {
  say('Preparing the backup…');
  try {
    const resp = await fetch('/api/backup', { headers: identityHeaders() });
    if (!resp.ok) { say((await resp.json().catch(() => ({}))).error || 'Backup failed.', true); return; }
    const blob = await resp.blob();
    const name = (/filename="([^"]+)"/.exec(resp.headers.get('Content-Disposition') || '') || [])[1] || 'adventurers-kit-backup.json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    say(`Saved ${name} (${(blob.size / 1024 / 1024).toFixed(1)} MB). Keep it somewhere safe.`);
  } catch {
    say('Could not reach the server.', true);
  }
});

$('restoreBtn').addEventListener('click', () => $('restoreInput').click());
$('restoreInput').addEventListener('change', async () => {
  const file = $('restoreInput').files[0];
  $('restoreInput').value = '';
  if (!file) return;
  if (!confirm(`Restore "${file.name}"?\n\nThis replaces ALL current data — characters, libraries, monsters, the fight and the map — for everyone at the table. The current data is saved in data/backups/ first.`)) return;
  say('Restoring…');
  $('restoreBtn').disabled = true;
  try {
    const resp = await fetch('/api/restore', { method: 'POST', headers: { ...identityHeaders(), 'Content-Type': 'application/json' }, body: file });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) { say(data.error || 'Restore failed.', true); return; }
    say(`Restored ${data.files} files. Everyone's screens have been updated (the previous data is in data/backups/${data.safetyCopy}).`);
  } catch {
    say('Could not reach the server.', true);
  } finally {
    $('restoreBtn').disabled = false;
  }
});
