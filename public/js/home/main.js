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

// Download a backup from `url` (fetch: open mode needs the identity headers).
async function download(url, fallbackName) {
  try {
    const resp = await fetch(url, { headers: identityHeaders() });
    if (!resp.ok) { say((await resp.json().catch(() => ({}))).error || 'Backup failed.', true); return; }
    const blob = await resp.blob();
    const name = (/filename="?([^";]+)"?/.exec(resp.headers.get('Content-Disposition') || '') || [])[1] || fallbackName;
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
}

$('backupBtn').addEventListener('click', () => { say('Preparing the backup…'); download('/api/backup', 'adventurers-kit-backup.json'); });

// The automatic backups the server keeps (data/backups/): when, size, download.
async function showAutoBackups() {
  const box = $('autoBackups');
  let data;
  try {
    const r = await fetch('/api/backups', { headers: identityHeaders() });
    if (!r.ok) return;
    data = await r.json();
  } catch { return; }
  box.innerHTML = '';
  const head = document.createElement('h3');
  head.textContent = 'Automatic backups';
  const note = document.createElement('p');
  note.textContent = data.everyDays > 0
    ? `Every ${data.everyDays === 7 ? 'week' : data.everyDays + ' days'}, kept in data/backups/ (the newest ${data.keep}). To go back to one, download it and use Restore from file.`
    : 'Off (AUTO_BACKUP_DAYS=0).';
  box.append(head, note);
  const list = document.createElement('ul');
  data.backups.forEach((b) => {
    const li = document.createElement('li');
    const when = new Date(b.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    li.append(document.createTextNode(`${when} · ${(b.bytes / 1024 / 1024).toFixed(1)} MB `));
    const dl = document.createElement('button');
    dl.type = 'button';
    dl.className = 'btn secondary small';
    dl.textContent = '⬇ Download';
    dl.addEventListener('click', () => download('/api/backups/' + encodeURIComponent(b.name), b.name));
    li.appendChild(dl);
    list.appendChild(li);
  });
  if (!data.backups.length && data.everyDays > 0) {
    const li = document.createElement('li');
    li.textContent = 'None yet — the first one is made shortly after the server starts.';
    list.appendChild(li);
  }
  box.appendChild(list);
  box.hidden = false;
}
if (document.querySelector('.backup-panel').style.display !== 'none' && isDm()) showAutoBackups();

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
