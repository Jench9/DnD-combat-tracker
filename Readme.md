# Adventurer's Kit

A self-hosted D&D 5e toolkit for the table: a **Combat Tracker** and **Character Sheets** (with D&D Beyond and PDF import), synced live across every device connected to the server. One player bumps a monster's HP and everyone's screen updates instantly.

A small Node server holds all state in memory (character sheets are also saved to disk) and pushes updates to every browser over WebSocket. No accounts, no database, no build step.

## Run it

### With Docker (recommended)

```bash
docker compose up -d --build
```

Open **http://localhost:3000**. Stop with `docker compose down`, follow logs with `docker compose logs -f combat-tracker`.

The image bakes the code in, so **any change needs a rebuild** (`docker compose up -d --build`). For live reload while developing:

```bash
docker compose -f docker-compose.dev.yml up --build
```

### Without Docker

```bash
npm ci
npm start
```

Requires Node 20.9+ (for `sharp`, which resizes imported avatars; on older Node the app still runs but D&D Beyond avatars are skipped).

### Tests

```bash
npm test
```

Runs the server tests (`node:test`, no extra dependencies): WebSocket flows for both features, input sanitising, and the importers' mapping logic.

## Letting friends connect

- **Same wifi**: they open `http://<your-LAN-IP>:3000`. Find your IP with `ipconfig getifaddr en0` (Mac) or `ipconfig` (Windows).
- **Different networks**: use a tunnel (`ngrok`, `cloudflared`) or deploy to a VPS / container platform behind a reverse proxy with HTTPS.

## Data persistence

Character sheets are saved to `data/characters.json` (half a second after each change, and on shutdown) and loaded again on startup, so they survive restarts. With Docker, `docker-compose.yaml` mounts `./data` into the container, so they also survive rebuilds. Set `DATA_DIR` to store the file somewhere else. Back up that folder to back up your characters.

Campaigns are saved the same way (`data/campaigns.json`).

Combat state is still **only in memory** and resets on restart.

## How it works

The server is the single source of truth. A client sends an action `{ type, payload }`; the server applies it and broadcasts the updated slice of state to **all** clients, including the sender. Clients only render what the server last sent them.

There are two state slices, both sent to every client on connect:

| Feature | Broadcast message |
|---|---|
| combat | `{ type: 'state', state }` |
| characters | `{ type: 'charState', characters }` |

## Project structure

```
adventurers-kit/
├── server.js                      entry point: builds the app and listens
├── src/
│   ├── config.js                  port, paths, size limits
│   ├── app.js                     wires Express + HTTP server + realtime hub + features
│   ├── core/ids.js                id generation
│   ├── core/jsonStore.js          small JSON-file persistence (data/<name>.json)
│   ├── realtime/hub.js            the only WebSocket code: routes actions to features, broadcasts slices
│   └── features/
│       ├── combat/                state + actions for the combat tracker
│       │   ├── service.js         state and helpers (no message handling)
│       │   ├── actions.js         client -> server action handlers
│       │   └── index.js           feature descriptor registered with the hub
│       ├── characters/
│       │   ├── model.js           blank character, ability modifier, patch sanitizer
│       │   ├── service.js         character list, persisted via core/jsonStore
│       │   ├── actions.js         add / update / delete
│       │   └── index.js
│       └── imports/               REST importers, mounted at /api/import/<source>
│           ├── dndbeyond/         constants, mapper (pure), client (network), route
│           └── pdf/               aliases, mapper (pure), reader (pdf-lib / pdf-parse), route
├── public/
│   ├── index.html, combat.html, characters.html
│   ├── css/
│   │   ├── tokens.css             colors, fonts, light/dark themes
│   │   ├── base.css               reset, body, page header
│   │   ├── components.css         nav, buttons, panels, form fields
│   │   └── pages/                 home.css, combat.css, characters.css
│   └── js/                        ES modules, no build step
│       ├── core/                  socket (reconnecting WebSocket), dom helpers, nav, tool registry
│       ├── home/
│       ├── combat/                main, render, conditions data
│       └── characters/            main, store (state + pending-edit tracking), list, import, rules, editor/
├── test/                          node:test suites
├── package.json, package-lock.json
├── Dockerfile, docker-compose.yaml, docker-compose.dev.yml
└── Readme.md
```

## Adding things

**A new tool** (e.g. a dice roller with shared history)
1. Server: create `src/features/<name>/` with `service.js`, `actions.js` and an `index.js` exporting `{ name, wire: { type, key }, snapshot, actions }`, then add it to the `createHub` list in `src/app.js`. The hub handles routing, broadcasting and sending the slice on connect. If an action also changes another feature, list it in `alsoBroadcast`.
2. Client: add `public/<name>.html`, `public/js/<name>/main.js`, `public/css/pages/<name>.css`, and one entry in `public/js/core/tools.js` (the nav bar and the home cards are generated from it).

**A new importer**: add a folder under `src/features/imports/` with a router factory, and register it in `src/features/imports/index.js`. Keep the mapper (pure function) separate from the code that touches the network or files so it stays easy to test.

**A new character field**: add it to `blankCharacter` and `sanitizeCharacterPatch` in `src/features/characters/model.js`, then bind it in `public/js/characters/editor/` (`FIELD_MAP` in `fields.js` for simple inputs).

## Notes on the D&D Beyond importer

It uses D&D Beyond's unofficial character endpoint, so the character's sharing must be set to **Public**. AC and proficiencies are a best-effort estimate. Non-OK and unusable responses are logged on the server (`docker compose logs`) with the status and the start of the response body.
