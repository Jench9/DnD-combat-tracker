// Invite / password reset page: /join.html#invite=<code>. The code stays
// in the #fragment, so it never reaches server logs or Referer headers.
import { $, post, freshStart, onSubmit } from './common.js';

const code = (/invite=([A-Za-z0-9_-]+)/.exec(location.hash) || [])[1] || '';
let info = null;
try {
  const r = await fetch(`/api/auth/invite/${encodeURIComponent(code)}`);
  info = await r.json();
  if (!r.ok) throw new Error(info.error);
} catch (e) {
  $('inviteBadText').textContent = code ? (e.message || 'Could not check the link.') : 'There is no invite code in this link.';
  $('inviteBad').hidden = false;
}
$('inviteLoading').hidden = true;

if (info && !info.error) {
  $('inviteForm').hidden = false;
  if (info.kind === 'reset') {
    $('inviteTitle').textContent = 'Choose a new password';
    $('inviteText').textContent = `For the account ${info.username}. Your other devices will be logged out.`;
    $('inviteUserField').hidden = true;
    $('inviteSubmit').textContent = 'Set the password';
    $('invitePass').focus();
  } else {
    $('inviteText').textContent = info.role === 'admin'
      ? 'You are invited as an admin: every account and campaign, DM everywhere.'
      : info.role === 'dm'
        ? 'You are invited as a DM: create your own campaigns and run them.'
        : 'Create your account. Your characters will be waiting for you (or create one after you sign in).';
    $('inviteUser').required = true;
    $('inviteUser').focus();
  }
}

onSubmit($('inviteForm'), $('inviteMsg'), async () => {
  if ($('invitePass').value !== $('invitePass2').value) throw new Error('The passwords are different.');
  await post(`/api/auth/invite/${encodeURIComponent(code)}`, { username: $('inviteUser').value, password: $('invitePass').value });
  freshStart();
  history.replaceState(null, '', '/join.html'); // drop the used code from the address bar
  location.replace('/');
});
