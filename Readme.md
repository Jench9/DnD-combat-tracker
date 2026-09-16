# Combat Tracker

A shared D&D combat tracker: initiative, HP, conditions, and death saves,
synced live across every device connected to it. One player can bump a
monster's HP and everyone else's screen updates instantly.

Unlike the very first version of this, it's no longer a single static HTML
file — there's a small Node server that holds the combat state in memory
and pushes updates to all connected browsers over WebSocket.

## How it works

- `server.js` is the source of truth. It holds one state object
  (`{ round, activeIndex, combatants }`) in memory.
- Every action (add a combatant, adjust HP, toggle a condition, advance the
  turn...) is sent from the browser to the server as a small WebSocket
  message. The server applies it and broadcasts the new state to *all*
  connected clients, including whoever sent it.
- The browser (`public/index.html`) never trusts its own local copy of the
  state — it only ever renders whatever the server last sent it. That's
  what keeps two people clicking at once from producing conflicting results.

## Run it

### With Docker (recommended)

```bash
docker compose up --build
```

Open **http://localhost:3000**

Stop it with `docker compose down`.

### Without Docker

```bash
npm install
node server.js
```

Same URL, same behavior — Docker just packages the Node runtime and
dependencies so you don't need Node installed locally, and gives you
`restart: unless-stopped` for free.

## Letting friends connect

`docker compose up` only binds to your machine. For others to reach it:

- **Same wifi**: they open `http://<your-laptop's-LAN-IP>:3000` in their
  browser. Find your IP with `ipconfig getifaddr en0` (Mac) or `ipconfig`
  (Windows, look for IPv4 Address).
- **Different networks**: you'd need a tunnel (`ngrok`, `cloudflared`) to
  get a public URL without configuring your router.

## Data persistence

Combat state lives **only in memory** in the running server process. That
means:

- Everyone sees the same live state while the server is running — that's
  the whole point.
- Restarting the container (`docker compose down` / a crash / your laptop
  sleeping if Docker isn't set to keep running) wipes it. There's currently
  no database or file backing it.
- If you want state to survive a restart, that's a follow-up step (writing
  state to a JSON file or SQLite and mounting it as a Docker volume) — not
  needed for a normal session, since you'd typically just start a fresh
  combat each time anyway.

## Updating the app

Edit `server.js` (server-side logic/actions) or `public/index.html`
(everything the browser renders and how it sends messages), then:

```bash
docker compose up --build
```

## Project structure

```
combat-tracker-app/
├── server.js            # WebSocket server + shared state + static file serving
├── public/
│   └── index.html        # the frontend — sends actions, renders whatever the server sends back
├── package.json
├── package-lock.json
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .gitignore
└── README.md
```

## Deploying beyond your laptop

Since this now runs a persistent Node process (not just static files), you
have a couple of paths if you outgrow "my laptop on game night":

- **A VPS** (DigitalOcean, Linode, Hetzner, etc.): copy this repo over, run
  `docker compose up -d --build`, open the port in the firewall. Add a
  reverse proxy (Caddy or nginx + Let's Encrypt) for a real domain and
  HTTPS.
- **A platform that runs containers for you** (Fly.io, Railway, Render):
  point it at this repo — the Dockerfile is already set up to build and run
  as-is.
