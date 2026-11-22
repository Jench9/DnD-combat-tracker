// Login page: log in, or — on the first start — create the DM account
// with the setup code from the server log.
import { $, post, nextPage, freshStart, onSubmit } from './common.js';

let status = { mode: 'accounts', needsSetup: false, account: null };
try { status = await (await fetch('/api/auth/status')).json(); } catch { /* shown as a login error later */ }

if (status.mode === 'open') {
  $('openMode').hidden = false;
} else if (status.account) {
  location.replace(nextPage()); // already logged in
} else if (status.needsSetup) {
  $('setupForm').hidden = false;
  $('setupCode').focus();
} else {
  $('loginForm').hidden = false;
  $('loginUser').focus();
}

onSubmit($('loginForm'), $('loginMsg'), async () => {
  await post('/api/auth/login', { username: $('loginUser').value, password: $('loginPass').value });
  freshStart();
  location.replace(nextPage());
});

onSubmit($('setupForm'), $('setupMsg'), async () => {
  if ($('setupPass').value !== $('setupPass2').value) throw new Error('The passwords are different.');
  await post('/api/auth/setup', { code: $('setupCode').value, username: $('setupUser').value, password: $('setupPass').value });
  freshStart();
  location.replace('/players.html'); // next: invite the players
});
