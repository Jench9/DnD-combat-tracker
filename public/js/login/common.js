// Shared by the login and invite pages (no identity.js here: it would send
// a logged-out visitor back to the login page).
export const $ = (id) => document.getElementById(id);

export async function post(url, body) {
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Could not reach the server.');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Something went wrong (${r.status}).`);
  return data;
}

// Where to go after logging in: the page that sent us here, if it's ours.
export function nextPage() {
  const next = new URLSearchParams(location.search).get('next') || '/';
  return /^\/(?!\/)/.test(next) && !/^\/(login|join)\.html/.test(next) ? next : '/';
}

// A new login: forget the character chosen by whoever used this browser before.
export function freshStart() {
  try { localStorage.removeItem('kit.identity'); } catch { /* storage unavailable */ }
}

// Submit handler with a busy button and the error shown in `msg`.
export function onSubmit(form, msg, fn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    msg.textContent = '';
    try {
      await fn();
    } catch (err) {
      msg.textContent = err.message;
      btn.disabled = false;
    }
  });
}
