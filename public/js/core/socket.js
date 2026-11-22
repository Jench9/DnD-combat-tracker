// WebSocket connection to the server with auto-reconnect.
//
//   const socket = connectSocket({
//     handlers: { state: (msg) => ..., charState: (msg) => ... },  // by message type
//     onStatus: (live) => ...,                                       // optional
//   });
//   socket.send('actionName', { ...payload });
import { identityQuery, authMode, setAccount, toLogin } from './identity.js';

// Accounts: a refused or closed connection may mean the session ended
// (logged out elsewhere, password changed, account disabled).
async function stillLoggedIn() {
  if (authMode() !== 'accounts') return true;
  try {
    const s = await (await fetch('/api/auth/status')).json();
    return !!s.account;
  } catch {
    return true; // server down: keep retrying
  }
}

// `query` overrides who this connection is (default: this browser's chosen
// identity) — the TV view always connects as a plain player.
export function connectSocket({ handlers = {}, onStatus, query } = {}) {
  let ws;

  function open() {
    // Who we are (DM / which character) decides what the server sends us.
    ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/?' + (query ?? identityQuery()));
    ws.onopen = () => onStatus && onStatus(true);
    ws.onclose = async (e) => {
      onStatus && onStatus(false);
      // 4401: the server ended sessions; 1006: refused or dropped.
      if ([4401, 4403, 1006].includes(e.code) && !(await stillLoggedIn())) { toLogin(); return; }
      // 4403: made DM / no longer DM (or disabled): reload to redraw everything.
      if (e.code === 4403) { location.reload(); return; }
      setTimeout(open, 1000);
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'accountState' && msg.accounts) setAccount(msg.accounts.me);
      const handler = handlers[msg.type];
      if (handler) handler(msg);
    };
  }
  open();

  return {
    send(type, payload = {}) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, payload }));
    },
  };
}
