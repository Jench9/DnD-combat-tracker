# Adventurer's Kit — project context

Paste or attach this at the start of a new conversation. It describes what exists, how it fits together, and what is still open. Updated after the refactor that split the single-file server and the page-embedded scripts/styles into feature modules.

## What it is

A small self-hosted web app for running D&D 5e sessions. Everyone at the table opens it in a browser and sees the same live state.

- **Home** (`index.html`): landing page with a card per tool (generated from the tool registry).
- **Combat Tracker** (`combat.html`): initiative order, HP, AC, conditions, death saves, rounds.
- **Character Sheets** (`characters.html`): create, edit and store full character sheets with portraits, import from D&D Beyond or a PDF, and send a character into the combat tracker.

All state is shared live over a WebSocket. There are no accounts, no auth and no database.

## Stack and layout

Node 18+ (global `fetch` is used), Express, `ws`, `multer` (2.x), `pdf-lib`, `pdf-parse`. Plain HTML/CSS/JS on the client (ES modules via `<script type="module">`), no framework and no build step. Tests use the built-in `node:test` (`npm test`), no extra dependencies.

```
adventurers-kit/
├── server.js                  entry: createApp() + listen
├── src/
│   ├── config.js              PORT, PUBLIC_DIR, JSON_BODY_LIMIT, MAX_PDF_BYTES
│   ├── app.js                 Express + HTTP server + realtime hub; registers features and /api/import
│   ├── core/ids.js            uid()
│   ├── core/jsonStore.js      createJsonStore(name, fallback) → { load, save (debounced, atomic), flush }; flushAllStores()
│   ├── realtime/hub.js        the only WebSocket code (feature plug-in contract documented at the top)
│   └── features/
│       ├── combat/            service.js (state), actions.js (handlers), index.js (descriptor)
│       ├── characters/        model.js (blankCharacter, mod, sanitizeCharacterPatch), service.js, actions.js, index.js
│       └── imports/
│           ├── index.js       mounts importers at /api/import/<source>
│           ├── dndbeyond/     constants.js, mapper.js (pure), client.js (network), route.js
│           └── pdf/           aliases.js, mapper.js (pure), reader.js (pdf-lib/pdf-parse), route.js
├── public/
│   ├── index.html, combat.html, characters.html
│   ├── css/ tokens.css, base.css, components.css, pages/{home,combat,characters}.css
│   └── js/
│       ├── core/              socket.js, dom.js, nav.js, tools.js (tool registry: drives nav + home cards)
│       ├── home/main.js
│       ├── combat/            main.js, render.js, conditions.js
│       └── characters/        main.js, store.js, list.js, import.js, rules.js, editor/{index,fields,abilities,listEditor,portrait}.js
├── test/                      realtime, imports tests + helpers
├── package.json, package-lock.json   lock must stay in sync (see Docker)
├── Dockerfile, docker-compose.yaml, docker-compose.dev.yml
└── Readme.md
```

Runs on port 3000 (`PORT` env var overrides).

## Deployment (Docker)

`docker-compose.yaml`:

```yaml
services:
  combat-tracker:
    build: .
    ports:
      - "3000:3000"
    restart: unless-stopped
```

- No volumes: code is baked into the image, so **every change needs `docker compose up -d --build`**, including edits to `public/*` and `src/*`.
- Dockerfile (`node:20-alpine`, `WORKDIR /app`): copies `package.json` + `package-lock.json`, runs `npm ci --omit=dev`, then copies `server.js`, `src/` and `public/`. **A new top-level source folder must be added with another `COPY`.** `npm ci` fails if the lock file is out of sync; after adding a dependency run `npm install` locally before rebuilding.
- **Campaigns** (`src/features/campaigns/`, wire `campaignState`/`campaigns`, saved to `campaigns.json`): `{ id, name }`; characters reference one via `campaignId` (`''` = none). Actions `addCampaign {id,name}`, `renameCampaign`, `deleteCampaign` (moves its characters to no campaign, also broadcasts `characters`). The characters page filters by a campaign dropdown (choice kept in localStorage); new characters and imports (`campaignId` in the D&D Beyond body / PDF form field) go into the selected campaign; D&D Beyond sync keeps the campaign.
- **Characters persist to `DATA_DIR/characters.json`** (default `./data`, Docker volume `./data:/app/data`). `characters/service` loads it at require time (re-sanitized) and calls `persist()` after every mutation; `server.js` flushes pending writes on SIGINT/SIGTERM. Tests point `DATA_DIR` at a temp dir in `test/helpers.js`. **Combat state is still memory-only.**
- `docker-compose.dev.yml` bind-mounts the project and runs `node --watch server.js`.
- Logs: `docker compose logs -f combat-tracker`.

## Architecture

Server is the single source of truth. Clients send action messages `{ type, payload }`; the server applies them and broadcasts the affected state slice to every client, including the sender. Two independent slices:

- combat — `{ type: 'state', state }`
- characters — `{ type: 'charState', characters }`

On every new connection the server sends both. Each page ignores the message type it doesn't care about.

### Realtime hub and features

`src/realtime/hub.js` takes a list of **features**. A feature is `{ name, wire: { type, key }, snapshot(), actions: { actionType(payload) }, alsoBroadcast?: { actionType: [featureNames] } }`. The hub builds an action → feature index (duplicate action names throw at startup), parses and validates incoming messages (non-JSON, non-object and unknown types are ignored), runs the action, then broadcasts that feature's slice plus any `alsoBroadcast` slices. REST routes can trigger a broadcast through `hub.broadcast(name)` (the importers do this via an `onCharactersChanged` callback).

Layering inside a feature: `service.js` owns the state and plain operations; `actions.js` validates payloads and calls the service; `index.js` is the descriptor. The only cross-feature dependency is `characters/actions.js` → `combat/service.js` (for `sendToCombat`).

### Combat state

```js
state = { round, activeIndex, combatants: [
  { id, name, init, ac, hp, maxHp, type: 'pc'|'monster', conditions: [], deathSuccess, deathFail }
]}
```

Actions: `addCombatant`, `removeCombatant`, `renameCombatant`, `adjustHP`, `addCondition`, `removeCondition`, `toggleDeathSave`, `nextTurn`, `sortInit`, `clearAll`. Combatant ids are generated server-side. Adding a combatant re-sorts by initiative while keeping the currently active combatant active (so `activeIndex` can shift on add).

### Character state

```js
{ id, portrait,               // portrait: base64 data URL ('' if none)
  name, race, class, level, background, alignment,
  ac, speed, hitDice,
  abilities: { str, dex, con, int, wis, cha },
  hpMax, hpCurrent, hpTemp,
  saveProf:  { str: bool, ... },
  skillProf: { 'Stealth': bool, ... },   // keys are the display skill names
  equipment,                  // newline-separated text; "Dagger x2" = quantity 2
  features,                   // newline-separated text, one entry per line
  notes }
```

Actions: `addCharacter { id }` (**id is generated by the client** so the editor can open immediately), `updateCharacter { id, patch }` (partial; `abilities`, `saveProf`, `skillProf` merged key by key; everything goes through `sanitizeCharacterPatch`: level 1–20, ability scores 1–30, name 60 chars, text fields 4000 chars, HP ≥ 0), `deleteCharacter { id }`, `sendToCombat { id }` (pushes the character into combat as a PC, initiative = 10 + DEX modifier, HP = current HP; broadcasts both slices).

Portrait validation: only `data:image/(jpeg|png|webp);base64,...` up to 200,000 characters, or `''` to clear.

### REST import routes

- `POST /api/import/dndbeyond` — JSON `{ input }` (character URL or numeric id). Fetches `https://character-service.dndbeyond.com/character/v5/character/{id}` (unofficial; sharing must be **Public**), maps it, adds the character, broadcasts, responds `{ character }`. Errors respond `{ error }` (400 bad input, 502 non-OK from D&D Beyond, 404 unusable/private, 500 unexpected). Non-OK and unusable responses are now logged with status and the first 300 chars of the body.
- `POST /api/import/dndbeyond/refresh` — JSON `{ characterId, input? }`. Re-imports into an existing character (the editor's "Sync from D&D Beyond" button, e.g. after leveling up). Uses the character's stored `ddbId` (saved on import); `input` links/re-links one. Replaces stats/proficiencies/equipment/features via `characters/service.refreshImported`, keeping portrait, notes, temp HP and damage taken (`hpMax - hpCurrent`). 404 unknown character, 400 no D&D Beyond id, otherwise same errors as above.
- `POST /api/import/pdf` — multipart field `file` (max 15 MB). Fillable form fields are matched against alias tables (case/punctuation-insensitive); unmatched non-empty fields go to Notes. Level is parsed from a combined `ClassLevel` field when there's no level field ("Fighter 3 / Wizard 2" sums to 5). No form fields → raw extracted text into Notes. Responds `{ character, warning }`.

Both importers create the character via `characters/service.addImported` using the same sanitizer as normal edits; the page then opens the new character's editor for review. Keep mappers pure (no network/files) so they stay testable.

## Frontend behavior worth knowing

- Shared pieces: `core/socket.js` (reconnecting WebSocket, handlers keyed by message type), `core/nav.js` renders the top nav from `core/tools.js` into `<nav class="app-nav" data-active="<id>">`, the same registry builds the home cards. To add a tool: add a registry entry, a page, `js/<id>/`, `css/pages/<id>.css`, and a server feature.
- **characters**: list view (cards with avatar, name, race/class, level pill, AC/HP/speed, HP bar), import panel (D&D Beyond tab, PDF tab with drag-and-drop), editor view (hero panel, vitals tiles, HP panel, tabs Stats / Equipment / Features / Notes). Modifiers, saves, skill bonuses, proficiency bonus and initiative are computed client-side, never stored.
- Text edits are debounced 300 ms before sending; the server echoes full state to everyone.
- **Pending-edit tracking** (`characters/store.js`: `touch()` / `mergePending()`): fields touched in the last 2.5 s keep their local value when new state arrives; focused fields are never overwritten. This fixed a real race where an echo from an earlier edit overwrote newer typing. Keep it when changing the editor.
- Portraits are cropped to a centered square and resized to 256 px JPEG in the browser. They are part of the character object, so every `charState` broadcast carries all portraits — fine at table scale.
- "Send to Combat Tracker" sends the action and navigates to `combat.html`.

**Design system** — D&D Beyond-inspired: dark top nav with a red underline on the active page, red accent (`--wax`), amber secondary (`--gold`), Roboto Condensed uppercase headings, Roboto body (Google Fonts), light/dark following the OS (`prefers-color-scheme`, `data-theme` overrides). Tokens live in `css/tokens.css` (`--bg`, `--bg-panel`, `--ink`, `--ink-soft`, `--line`, `--wax`, `--gold`, `--good`, `--blue`, `--nav-bg`); `base.css` and `components.css` are shared; each page has its own `css/pages/*.css`. Pages link the three shared sheets plus their own.

## What has been verified

- Refactor equivalence: the original single-file server and the refactored one were driven with the same scripted WebSocket sequence (combat, characters, sanitizer edge cases, sendToCombat, malformed messages) and produced identical broadcasts.
- `npm test`: 9 tests (WebSocket flows for both features, bad input, importers' mappers, REST validation errors).
- Headless Chromium run of all three pages: nav and home cards, adding/sorting combatants, HP, conditions, next turn, second client sync, character create/edit/derived values/equipment/features/portrait persisted on the server, PDF import with a generated fillable PDF, send to combat, dark theme on a phone-width viewport.

## Known gaps and caveats

- **The D&D Beyond importer has never run against the real service** (the sandbox can't reach `dndbeyond.com`). Mapping logic and the bad-input path are tested; the live fetch is not. The user reported an error importing from D&D Beyond; with the new logging, `docker compose logs` should show the status/body. Cause not yet known.
- D&D Beyond **AC is a best-effort estimate** from equipped armor and shield; skill/save proficiencies come from scanning `modifiers` arrays and may miss sources. The import adds a note saying so.
- PDF alias table is heuristic; the official sheet's exact field names were not verified. Flattened/scanned PDFs only yield raw text.
- No persistence: restarts wipe everything.
- No authentication or per-user ownership.
- Mobile layout got one dark-mode phone-width look at the character list only.
- Fonts come from Google Fonts at runtime; offline they fall back to system fonts.
- Client scripts are ES modules, so the pages need to be served over HTTP (not opened from disk).

## Conventions for working with this user

- They want **files to add to their project**, not artifacts. Deliver complete, drop-in files and say which ones changed or are new/removed.
- They run it in Docker: tell them when a rebuild is needed (any change) and when `npm install` / a new lock file is needed (dependency changes).
- Keep the server as the source of truth and keep the message shapes (`state`, `charState`).
- They sometimes write in Spanish; reply in the language of their latest message.

## Candidate next steps

1. Debug the D&D Beyond import using the new server logs.
2. Persistence: save combat state and characters to a JSON file on change, load on startup (a `persistence` module that wraps the feature services), and mount a named volume in `docker-compose.yaml`.
3. Show portraits in the combat tracker (carry `portrait` through `sendToCombat`) and import the avatar from D&D Beyond.
4. Mobile pass on all three pages.
5. Character sheet depth: spell slots and list, attacks, currency, rests, inspiration, death saves on the sheet, duplicate character.
6. Combat tracker: temp HP, per-combatant notes, monster stat import, link combatants to character sheets so HP stays in sync.
7. Light access control (shared table password or per-character ownership) if exposed beyond a trusted network.
