// WebSocket connection to the server with auto-reconnect.
//
//   const socket = connectSocket({
//     handlers: { state: (msg) => ..., charState: (msg) => ... },  // by message type
//     onStatus: (live) => ...,                                       // optional
//   });
//   socket.send('actionName', { ...payload });
import { identityQuery } from './identity.js';

export function connectSocket({ handlers = {}, onStatus } = {}) {
  let ws;

  function open() {
    // Who we are (DM / which character) decides what the server sends us.
    ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/?' + identityQuery());
    ws.onopen = () => onStatus && onStatus(true);
    ws.onclose = () => {
      onStatus && onStatus(false);
      setTimeout(open, 1000);
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
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
