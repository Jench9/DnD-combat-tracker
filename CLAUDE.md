# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Adventurer's Kit: a self-hosted D&D 5e table toolkit (combat tracker, character sheets with D&D Beyond/PDF import, monster/item/spell libraries, battle map, TV view), synced live to every browser over WebSocket. Node + Express + `ws` on the server; plain HTML/CSS/ES modules on the client — **no framework, no build step, no database, no accounts**.

`PROJECT_CONTEXT.md` is a detailed, feature-by-feature description (data shapes, action names, permissions, importer field mappings, known gaps). Read the relevant section before changing a feature, and update it when you change behavior it describes. `Readme.md` has the user-facing overview.

## Commands

```bash
npm ci && npm start                    # http://localhost:3000 (PORT env overrides); Node >= 20.9
npm test                               # node:test, all files in test/
node --test test/spells.test.js        # one file
node --test --test-name-pattern="sync" test/imports.test.js   # tests matching a name
npm run build:srd -- <folder>          # regenerate src/srd/*.json from 5e-bits/5e-database JSON (see Readme)

docker compose up -d --build                        # production; code is baked in, so ANY change needs --build
docker compose -f docker-compose.dev.yml up --build # dev: bind mount + node --watch
docker compose logs -f combat-tracker
```

No linter is configured. `sharp` is optional at runtime (loaded lazily via `src/core/sharp.js`); avatar tests skip when it can't load.

## Architecture

**Server is the single source of truth.** Clients send `{ type, payload }`; the server applies it and broadcasts the affected state slice to all clients (including the sender). Clients only render what the server last sent; optimistic UI (map drags, character editor) is always overwritten by the echo.

**Realtime hub** (`src/realtime/hub.js`, the only WebSocket code — its header documents the contract). Each feature in `src/features/<name>/index.js` exports `{ name, wire: { type, key }, snapshot, snapshotFor?, actions, permissions?, alsoBroadcast? }` and is registered in the `createHub` list in `src/app.js`. Action names are global (duplicates throw at startup). Within a feature: `service.js` owns state and plain operations, `actions.js` validates payloads and calls the service, `index.js` is the descriptor. REST routes trigger broadcasts with `hub.broadcast(name)` via callbacks passed in `app.js`.

**DM vs players** (`src/core/identity.js`, `public/js/core/identity.js`/`join.js`). Identity is trust-based (anyone may pick DM) and travels as the WS query (`?role=dm` / `?role=player&character=<id>`) and REST headers `X-Kit-Role` / `X-Kit-Character`. Two rules matter when adding anything:
- **An action with no `permissions` entry is DM-only.** Players may only act on their own character (see `combat/permissions.js`).
- **Players' browsers must never receive DM-only data.** Filtering happens server-side in `snapshotFor(identity)` / `playerView` (hidden combatants, monster HP/AC/notes, aliases → health words). Don't send secrets and hide them with CSS. The TV view always connects as `role=player`.

**Persistence**: `src/core/jsonStore.js` (debounced atomic writes to `DATA_DIR`, default `./data`, flushed on SIGINT/SIGTERM). Everything is saved: characters, campaigns, monsters, items, spells, map backgrounds, and also combat state and map token positions (`combat.json`/`map.json`, saved after every combat/map action via `core/savingActions.js`). Feature services load at `require` time, so tests set `DATA_DIR` to a temp dir in `test/helpers.js` before requiring the app, and reset module-level combat/map state per test.

**Libraries + SRD** (`src/core/library.js`): items and spells are seeded from `src/srd/*.json` on first start and merged once when `src/srd/version.json` changes (`source: 'srd'` entries updated in place keeping ids; `custom` entries never touched; a damaged file is never replaced). `source`/`createdBy` are set by the server, never by clients. SRD data must only come from 5e-bits/5e-database (CC-BY-4.0, see `NOTICE.md`) — never 5e.tools or paid books.

**Derived values**: AC is computed server-side (`characters/derived.js` `computeAc`, sent with `acBreakdown`); `combat/characterSync.js` keeps sheet-based combatants' AC and HP in sync both ways. Attack/spell/modifier math is client-side (`public/js/core/attacks.js`, `modifiers.js`, `dice.js`). The modifier catalog `public/js/core/modifier-presets.json` is read by **both** the browser and the server; D&D Beyond detection (`imports/dndbeyond/modifiers.js`) must only reference keys that exist there (a test checks this).

**Importers** (`src/features/imports/<source>/`, mounted at `/api/import/<source>`): keep the mapper/planner a pure function, separate from network/file code, so it's testable with fixtures. The D&D Beyond endpoint is unofficial (tested live by the user, but it can change); unit tests use hand-written fixtures.

**Client**: `public/js/core/tools.js` is the tool registry that generates the nav and home cards. Each page = `public/<name>.html` + `public/js/<name>/main.js` + `public/css/pages/<name>.css`, linking the shared `tokens.css`/`base.css`/`components.css`. Theme colors are tokens in `tokens.css` (light/dark). Character editor keeps recently touched and focused fields over incoming state (`characters/store.js` `touch()`/`mergePending()`) — this fixes a real echo race; preserve it.

## Common extensions

- **New tool**: server feature folder + register in `src/app.js`; client page/js/css + one entry in `public/js/core/tools.js`.
- **New character field**: `blankCharacter` and `sanitizeCharacterPatch` in `src/features/characters/model.js`, then bind in `public/js/characters/editor/` (`FIELD_MAP` in `fields.js` for simple inputs).
- **New top-level source folder**: add a `COPY` to the `Dockerfile`. After adding a dependency, run `npm install` so `package-lock.json` stays in sync (`npm ci` in Docker fails otherwise).

## Working with this user

- They run it in Docker: say when a rebuild is needed and when dependency/lock changes require `npm install`.
- Keep existing wire message shapes stable.
- They sometimes write in Spanish; reply in the language of their latest message.
