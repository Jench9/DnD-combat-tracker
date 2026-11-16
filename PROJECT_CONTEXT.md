# Adventurer's Kit — project context

Paste or attach this at the start of a new conversation. It describes what exists, how it fits together, and what is still open. Updated after the refactor that split the single-file server and the page-embedded scripts/styles into feature modules.

## What it is

A small self-hosted web app for running D&D 5e sessions. Everyone at the table opens it in a browser and sees the same live state.

- **Home** (`index.html`): landing page with a card per tool (generated from the tool registry).
- **Combat Tracker** (`combat.html`): initiative order, HP, AC, conditions, death saves, rounds. PCs added from a sheet show its portrait (the client looks it up by `characterId` in `charState` rather than copying the image into combat state, which is broadcast on every HP click). Saved characters are added from here ("Add characters" panel, grouped by campaign with an "Add all" per campaign, with each player's initiative roll); every combatant's initiative is editable.
- **Character Sheets** (`characters.html`): create, edit and store full character sheets with portraits, grouped into campaigns, import from D&D Beyond or a PDF.
- **DM / players** (`src/core/identity.js`, `public/js/core/{identity,join}.js`): no accounts. On first visit a "Who are you?" overlay (any page) offers *I'm the DM*, each character (from `GET /api/characters/summary`), or *Create a new character* (creates it as a guest, then opens `characters.html#edit=<id>`). The choice is kept in localStorage (`kit.identity`) and sent as the WebSocket query (`?role=dm` / `?role=player&character=<id>`) and REST headers (`X-Kit-Role`, `X-Kit-Character`); no/unknown identity = player without a character. Trust-based on purpose (anyone may pick DM) — the point is that players' browsers never *receive* DM-only data.
  - **Hub**: each socket has an `identity`; frames are built per identity from an optional `snapshotFor(identity)`; actions are checked against an optional `permissions` map (`'anyone'` or `(payload, identity) => bool`). The DM may do everything; **an action with no entry is DM-only**.
  - **Players see** (`combat/service.playerView`, `map/service.playerView`, monsters `playerView`): no `hidden` combatants or their tokens (`activeIndex` −1 while one has the turn); monsters with `alias || name`, a `health` word (Unhurt / Hurt >50% / Bloodied >25% / Near death / Down) and no hp/maxHp/ac/dmNotes; the monster library reduced to `{id, icon}` of visible, un-aliased monsters in the fight; no Monsters page.
  - **Players may** (`combat/permissions.js`, map/characters `index.js`): act on their own character only — its sheet (`updateCharacter`/`deleteCharacter`), combatant (HP, conditions, death saves, initiative, rename, remove, `addCharacterToCombat`), map token, and `nextTurn` when it's their turn; `addCharacter` is open to anyone. Everything else (monsters, campaigns, quick add, sorting, clearing, map size, `setCombatantDm {id, hidden?, alias?, dmNotes?}`) is DM-only. REST: new imports are DM-only (403), Sync is DM or owner.
  - **UI**: `body.is-dm` / `.is-player`; `.dm-only` / `.player-only` helper classes; nav badge to switch; other people's sheets are view-only; combat rows show 👁 hide/reveal and a "DM" section (alias for monsters, private notes) to the DM; `addMonsterToCombat` takes `hidden` ("Add hidden" checkbox).
- **Items** (`items.html`, feature `items`, wire `itemState`/`items`, saved to `items.json`): weapons (category, melee/ranged, `damage` dice + type, `versatileDamage`, `range` "normal/long", `properties`, `magicBonus`, `extraDamage` + type), armor (`armorType` light/medium/heavy/shield, `baseAc` — the bonus for shields, `maxDex` null = unlimited, `strengthReq`, `stealthDisadvantage`), gear (`effectDice` + `effect`, e.g. healing), plus cost/weight/notes. Dice are validated/normalised by `normaliseDice` (`NdX[+/-M]` with standard dice, or a flat number; invalid input keeps the old value). The library is seeded with the SRD basics (`items/starter.js`: 37 weapons, 12 armors + shield, common gear) **only when `items.json` doesn't exist** (a damaged file is left alone). `source` ('srd'/'custom') and `createdBy` ('dm' or a character id) are set by the server. Everyone receives the library; `addItem {id, patch}` needs a character (or DM); players update/delete only items they created; the DM anything. To-hit isn't stored on items — it depends on the wielder (ability mod + proficiency + `magicBonus`); used by character inventories and actions (below).
- **Inventory, Auto AC, actions** (character sheet *Equipment* and *Actions* tabs; combat rows): characters have `inventory: [{ id, itemId, name, qty, equipped }]` (library items; `name` is a fallback copy), `acAuto`, and `weaponProf: { simple, martial }` (D&D Beyond imports map `simple-weapons`/`martial-weapons`). Edited through `updateCharacter` like any sheet field, so the ownership rules apply. `characters/derived.js` `computeAc` (no armor 10+DEX; light +DEX; medium +DEX capped by `maxDex`; heavy no DEX; + shield; + `magicBonus`) — the characters slice and `addCharacterToCombat` use `withDerived`, and item edits rebroadcast characters. Characters saved before this, and imports, keep a manual AC (`acAuto: false`); new ones start on Auto; switching Auto off keeps the shown value. Client: `public/js/core/attacks.js` `buildActions` (equipped weapons: STR melee / DEX ranged / better of both for finesse; to hit = mod + proficiency if proficient with the category + magic; damage = dice + mod + magic, + extra damage, versatile alternative; gear with effect dice → Use; always an Unarmed Strike) and `renderActions` (Attack / Damage / 2-handed / Use buttons; a natural 20 arms a crit — doubled dice — for that action's next damage roll; Use spends one from the inventory). `public/js/core/dice.js` parses/rolls. Rolls are local to the roller's screen (not shared yet). Equipping body armor or a shield unequips the previous one. The old free-text `equipment` field stays as "Other equipment".
- **D&D Beyond inventory → library** (`imports/dndbeyond/inventory.js`, pure `planInventory(data, library, newId)`): each D&D Beyond item is matched to the library by normalised name (parentheticals dropped; "Crossbow, Light" ↔ "Light Crossbow"; "Leather" ↔ "Leather Armor"; ammo bundles like "Arrows (20)" convert the count) and goes into `inventory` with D&D Beyond's `equipped` and quantity. Unmatched weapons/armor are created as custom library items (`createdBy: 'dm'`) from the definition (`damage.diceString`, `damageType`, `properties` incl. Versatile notes, `categoryId`, `attackType`, `range`/`longRange`, `armorTypeId`, `armorClass`, `stealthCheck`, `strengthRequirement`, `grantedModifiers` magic / armor-class bonus; generic magic weapons without dice fall back to the base weapon named in `type`), deduped within an import and reused by name later. Other unmatched gear becomes the free-text `equipment`. Import and **Sync** both do this (Sync replaces the inventory: `refreshImported(..., { replaceInventory: true })`). New items are broadcast via `onItemsChanged`. Field names are from the unofficial JSON — verified only against hand-written fixtures (`test/ddb-inventory.test.js`), not live data.
- **Spells** (`spells.html`, feature `spells`, wire `spellState`/`spells`, saved to `spells.json`; seeded with ~55 common SRD spells from `spells/starter.js`): `{ level 0–9, school, castingTime, range, components, duration, concentration, ritual, classes, mechanic: attack|save|auto|heal|none, saveAbility, saveSuccess half|none, dice + damageType, addMod, extraDice + extraDamageType, higherLevelDice (per slot level above), cantripScaling (×2/×3/×4 dice at character level 5/11/17), description }`. Items and spells share `src/core/library.js` (`createLibrary`: seed-once, `source`/`createdBy`, damaged file never replaced). Same permissions as items (`addSpell` needs a character; players edit their own).
  - **Characters** gain `spellAbility`, `spellSlots` (9 × `{max, used}`) and `spells: [{ id, spellId, name, prepared }]` (imported from D&D Beyond — see below). Sheet **Spells** tab (`editor/spellbook.js`): ability (shows spell attack = mod + prof, save DC = 8 + mod + prof), slot grid with clickable pips, "Long rest — restore slots", known spells grouped by level with *prepared* toggles.
  - **Actions** (`core/attacks.js`): cantrips + prepared spells, each with a slot picker (levels with slots, showing how many are left) and **Cast**: spends the slot (`onSpendSlot`) and rolls what the spell needs — attack + damage (nat 20 doubles dice), "DC X ABIL save" + damage, healing + modifier, or auto-hit damage. `spellDice` handles cantrip scaling and upcasting. `core/dice.js` parses mixed expressions ("2d8+4d6+3") with `addDice`/`scaleDice`.
- **D&D Beyond spells → library** (`imports/dndbeyond/spells.js`, pure `planSpells(data, library, newId)`): reads `classSpells[].spells` and every list in `spells` (race/class/feat/item/background), matches library spells by name (case-insensitive), creates unknown ones as custom library spells from the definition (`level`, `school`, `activation`, `range` incl. AoE, `components` 1/2/3 = V/S/M, `duration`, `concentration`, `ritual`, `requiresAttackRoll` / `requiresSavingThrow` + `saveDcAbilityId`, damage `modifiers` with `die.diceString` + `subType`, a second damage type as extra dice, heal = `bonus`/`hit-points` with `usePrimaryStat`, `atHigherLevels` `spellscale` → per-level dice, `characterlevel` → cantrip scaling, "half as much damage" in the description → half on save). Prepared = D&D Beyond's `prepared`/`alwaysPrepared`, or always for cantrips, known casters (bard/ranger/sorcerer/warlock) and non-class sources. **Slots are computed** (D&D Beyond doesn't store totals) from the PHB multiclass caster table: full casters + half (paladin/ranger from 2nd, rounded up single-class / down multiclass; artificer rounds up) + third casters (Eldritch Knight / Arcane Trickster); warlock pact slots are added at their slot level; `used` from `spellSlots`/`pactMagic`. `spellAbility` from the highest-level class with `spellCastingAbilityId` (fallback by class name). Import and Sync both apply it (Sync: `replaceSpells: true`). Verified against hand-written fixtures (`test/ddb-spells.test.js`), not live data.
- **SRD 5.1 + 5.2 content** (`src/srd/`, generated by `scripts/build-srd.js` / `npm run build:srd -- <dir>` from 5e-bits/5e-database JSON; attribution in `NOTICE.md`; *never* copy from 5e.tools or the paid books): 658 spells, 1,016 items (74 weapons, 26 armors, gear/tools/mounts, magic items as gear with rarity + text, healing dice parsed), 675 creatures (full stat block in `notes`, `creatureType`, `cr`, `edition`). Shared names: 2014 keeps the plain name, 2024 becomes "Name (2024)"; names are unique per list. 2014 spells use structured `dc`/`damage_at_slot_level`/`heal_at_slot_level`; 2024 records are parsed from the standard SRD wording (saving throw ability, "half as much damage", "increases by XdY for each slot level above", "Cantrip Upgrade", healing "equal to XdY plus your spellcasting ability modifier", second damage type "… damage and … damage"). Reaction/bonus-action triggers move into the description. `src/srd/version.json` holds a content hash: `createLibrary({ starterVersion })` seeds a fresh install, and on a new version merges once (matched by `nameKey` — case/punctuation/"feet"/trailing "armor" ignored; each existing entry matched at most once; `source: 'srd'` entries updated in place keeping ids; custom entries untouched; marker file `<name>.srd-version`). Monsters stay opt-in via **+ SRD creatures** (`addStarterMonsters`, CR order). Items/spells/monsters gained an `edition` field and edition filters; Monsters page has search/type/edition filters (renders the first 120 matches); combat "Add monsters" has a search (first 30). WebSocket `perMessageDeflate` is on (connect payload ~2.6 MB raw → ~0.46 MB). D&D Beyond inventory mapping now only matches weapons/armor to library items of the same type (the SRD's dice-less "Flame Tongue" magic item vs a flame tongue longsword → created as "Flame Tongue (Longsword)").
- **Attack modifiers** (feats, fighting styles, class features, weapon mastery, Hex/Bless…): characters have `modifiers: [{ id, preset, active, only, custom }]` (validated in `characters/model.js`; `custom` = `{ name, toHit, damage: number|PROF|STR…, dice, diceType, appliesTo: weapon|spell|any, range, toggle, note }`). The catalog is data in `public/js/core/modifier-presets.json`, read by the browser (`modifiers.js` loads it with a top-level `await fetch`) and by the server (`characters/derived.js`, for AC). The engine is client-side in `public/js/core/modifiers.js` (both editions labelled; `effectsFor(attack, env)` → to-hit, to-hit dice, flat damage, extra dice parts, reroll rule, crit range, Brutal Critical dice, notes with `{MOD}/{PROF}/{DC}/{TYPE}` filled; class-level scaling from the class text, e.g. "Rogue 5 / Fighter 2"; `unarmedOverride` for Martial Arts). `core/attacks.js` uses it for weapon attacks (per grip: one-handed vs two-handed/versatile, so Dueling vs Great Weapon Fighting apply correctly), the unarmed strike and spells (Agonizing Blast, Empowered Evocation, Elemental Adept, Hex on spell attacks). `dice.js` `roll` supports `reroll` ('gwf-2014' reroll 1–2 once, 'gwf-2024' 1–2 count as 3, 'ea' 1 counts as 2) and `critExtraDice`. Weapons have `mastery` (from SRD 5.2, also on the same 2014 weapons); the Weapon Mastery preset shows each weapon's mastery effect (Graze damage, Topple DC…), limited by `only`. UI: Actions tab "Modifiers" (catalog picker by category, On/Off for situational ones, "only for", custom form); combat row Actions show quick on/off chips (`onToggleModifier`). D&D Beyond (`imports/dndbeyond/modifiers.js`): names from feats, class + subclass features up to the class level, options (fighting styles, invocations) and racial traits map to presets (`BY_NAME`; edition = 2024 if the character has Weapon Mastery); import adds them, Sync merges new ones and keeps existing modifiers/states (situational ones start off, Sneak Attack on). A test checks every detectable key exists in the client catalog. **AC effects**: presets with `ac` — `{ bonus, requiresArmor }` (Defense +1 with armor; Shield +5, Shield of Faith +2, Haste +2 as switches) or an unarmored base `{ base, add: [abilities], noShield }` (Unarmored Defense barbarian 10+DEX+CON / monk 10+DEX+WIS no shield, Draconic Resilience 2014 13+DEX / 2024 10+DEX+CHA, Mage Armor 13+DEX switch); custom modifiers have an `ac` bonus. `computeAc` (Auto AC only) picks the best base — armor, or without body armor plain 10+DEX vs each unarmored formula — then adds the shield (unless the formula forbids it) and bonuses, and returns a `breakdown` sent as `acBreakdown` (AC tile tooltip). `combat/characterSync.syncCombatantAcs` keeps combatants made from sheets at the sheet's AC (after `updateCharacter`, item edits and imports; those broadcast `combat` too). Modifier-only-for-AC presets have no `when` and are skipped by the attack engine. D&D Beyond detection: Defense, Unarmored Defense per class (features are tagged with their class), Draconic Resilience by edition. Not modelled: two-weapon/off-hand attacks, per-turn limits (shown as notes), AC modifiers with a manual AC.
- **TV view** (`/tv` → `public/tv.html`, `public/js/tv/main.js`, `css/pages/tv.css`): read-only full-screen battle map for a shared screen (AirPlay "separate display" from a Mac, iPad mirroring, HDMI, casting). Connects with `connectSocket({ query: 'role=player' })` — always the filtered player view, even on the DM's computer. Board without labels scaled to fit both screen dimensions (`--cell`), background `<img>` kept across redraws, tokens via the exported `map/render.js` `tokenNode`; bottom bar with round, turn and initiative order (portraits, health words); Fullscreen API (+ webkit prefix; hidden where unsupported, e.g. iPhone), cursor/controls hidden after 3 s idle, Screen Wake Lock re-acquired on visibility. Map page has a **📺 TV view** button (`window.open('/tv')`).
- **Monsters** (`monsters.html`): saved monster library `{ id, name, ac, hpMax, initBonus, icon, notes }` (feature `monsters`, wire `monsterState`/`monsters`, saved to `monsters.json`; actions `addMonster {id, patch?}` with a client-made id, `updateMonster {id, patch}`, `deleteMonster`, `addStarterMonsters` — adds the 37 SRD 5.1 monsters in `monsters/starter.js` (AC, average HP, DEX mod as init bonus; notes = "CR · size type" line + speed/senses, traits, attacks, spells, reactions), skipping names already in the library, case-insensitive; a same-named monster whose notes are empty or just the old one-line summary gets the full notes). In the combat list, monster rows have a collapsible "Stats" with the library notes (open state kept across redraws). The combat page shows the fight first, then the add panels. The combat page's "Add monsters" panel sends `addMonsterToCombat { monsterId, count (1–20), init? }`: each copy rolls d20 + bonus, copies are numbered ("Goblin 1"…) when there's more than one, combatants keep `monsterId`.
- **Battle Map** (`map.html`): feature `map` (wire `mapState`/`map`, **memory only**): `{ cols, rows, positions: { [combatantId]: { x, y } }, backgroundId }` (+ `backgrounds: [{id, name}]` for the DM only).
  - **Background maps** (`map/backgrounds.js`, `map/route.js`): image files in `DATA_DIR/maps/`, list saved in `map-backgrounds.json`. `POST /api/maps/backgrounds` (multipart `file` + `name`, DM only, ≤ `MAX_MAP_BYTES` 20 MB) — with sharp, resized to fit `MAP_MAX_SIDE` 2560 px and stored as WebP (animated GIFs kept); without sharp, jpeg/png/webp/gif stored as-is. `GET /api/maps/backgrounds/:id` serves it (random ids; players only learn the selected one). DM-only WS actions `setBackground {id|''}`, `renameBackground`, `deleteBackground` (removes the file; clears it if selected). Only the id travels over the WebSocket — images load over HTTP. The client stretches it over the cell area under the grid (same `<img>` reused across redraws); "Fit grid to image" sets rows = cols × image aspect. `src/core/sharp.js` is the shared lazy sharp loader. Actions `placeToken { id, x, y }` (place or move; integer, in bounds, existing combatant, one token per cell), `removeToken`, `setMapSize { cols, rows }` (5–50; tokens outside go back to the tray), `clearMap`. `snapshot()` prunes positions of combatants that no longer exist; combat's `removeCombatant`/`clearAll` also broadcast `map`. Client: drag with pointer events (mouse + touch), click a token then a cell, arrow keys / Delete / Esc for the selected token; moves are optimistic, the server echo wins; redraws are held during a drag. Tokens show the combatant's picture via `public/js/core/portraits.js` (character portrait by `characterId`, else monster icon by `monsterId`) — the combat list uses the same lookup.

All state is shared live over a WebSocket. There are no accounts, no auth and no database.

## Stack and layout

Node 20.9+ (global `fetch`; `sharp` requires it), Express, `ws`, `multer` (2.x), `pdf-lib`, `pdf-parse`, `sharp` (avatar resizing, loaded lazily so the app still starts without it). Plain HTML/CSS/JS on the client (ES modules via `<script type="module">`), no framework and no build step. Tests use the built-in `node:test` (`npm test`), no extra dependencies.

```
adventurers-kit/
├── server.js                  entry: createApp() + listen
├── src/
│   ├── config.js              PORT, PUBLIC_DIR, JSON_BODY_LIMIT, MAX_PDF_BYTES
│   ├── app.js                 Express + HTTP server + realtime hub; registers features and /api/import
│   ├── core/ids.js            uid()
│   ├── core/images.js         MAX_PORTRAIT_CHARS, isImageDataUrl, sanitizeImage (portraits + monster icons)
│   ├── core/jsonStore.js      createJsonStore(name, fallback) → { load, save (debounced, atomic), flush }; flushAllStores()
│   ├── realtime/hub.js        the only WebSocket code (feature plug-in contract documented at the top)
│   └── features/
│       ├── combat/            service.js (state), actions.js (handlers), index.js (descriptor)
│       ├── characters/        model.js (blankCharacter, mod, sanitizeCharacterPatch), service.js, actions.js, index.js
│       ├── campaigns/         service.js, actions.js, index.js
│       ├── monsters/          model.js, service.js, actions.js, index.js
│       ├── map/               service.js, actions.js, index.js
│       └── imports/
│           ├── index.js       mounts importers at /api/import/<source>
│           ├── dndbeyond/     constants.js, mapper.js (pure), client.js (network), route.js
│           └── pdf/           aliases.js, mapper.js (pure), reader.js (pdf-lib/pdf-parse), route.js
├── public/
│   ├── index.html, combat.html, characters.html, monsters.html, map.html
│   ├── css/ tokens.css, base.css, components.css, pages/{home,combat,characters,monsters,map}.css
│   └── js/
│       ├── core/              socket.js, dom.js, nav.js, tools.js (tool registry: drives nav + home cards), image.js (resizeToDataUrl), portraits.js
│       ├── home/main.js
│       ├── combat/            main.js, render.js, conditions.js, party.js (add characters), bestiary.js (add monsters)
│       ├── monsters/main.js
│       ├── map/               main.js, render.js, interact.js
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
- **Campaigns** (`src/features/campaigns/`, wire `campaignState`/`campaigns`, saved to `campaigns.json`): `{ id, name }`; characters reference one via `campaignId` (`''` = none). Actions `addCampaign {id,name}`, `renameCampaign`, `deleteCampaign` (moves its characters to no campaign, also broadcasts `characters`). The characters page filters by a campaign dropdown (choice kept in localStorage; "All characters" shows sections, no campaign first); new characters and imports (`campaignId` in the D&D Beyond body / PDF form field) go into the selected campaign; D&D Beyond sync keeps the campaign.
- **Characters persist to `DATA_DIR/characters.json`** (default `./data`, Docker volume `./data:/app/data`). `characters/service` loads it at require time (re-sanitized) and calls `persist()` after every mutation; `server.js` flushes pending writes on SIGINT/SIGTERM. Tests point `DATA_DIR` at a temp dir in `test/helpers.js`. **Combat state and map positions are still memory-only.**
- `docker-compose.dev.yml` bind-mounts the project and runs `node --watch server.js`.
- Logs: `docker compose logs -f combat-tracker`.

## Architecture

Server is the single source of truth. Clients send action messages `{ type, payload }`; the server applies them and broadcasts the affected state slice to every client, including the sender. Two independent slices:

- combat — `{ type: 'state', state }`
- characters — `{ type: 'charState', characters }`

On every new connection the server sends both. Each page ignores the message type it doesn't care about.

### Realtime hub and features

`src/realtime/hub.js` takes a list of **features**. A feature is `{ name, wire: { type, key }, snapshot(), actions: { actionType(payload) }, alsoBroadcast?: { actionType: [featureNames] } }`. The hub builds an action → feature index (duplicate action names throw at startup), parses and validates incoming messages (non-JSON, non-object and unknown types are ignored), runs the action, then broadcasts that feature's slice plus any `alsoBroadcast` slices. REST routes can trigger a broadcast through `hub.broadcast(name)` (the importers do this via an `onCharactersChanged` callback).

Layering inside a feature: `service.js` owns the state and plain operations; `actions.js` validates payloads and calls the service; `index.js` is the descriptor. Cross-feature dependencies: `combat/actions.js` → `characters/service.js` + `monsters/service.js` (adding them to combat), `map/service.js` → `combat/service.js` (pruning tokens) and `campaigns/actions.js` → `characters/service.js` (un-assigning on delete).

### Combat state

```js
state = { round, activeIndex, combatants: [
  { id, name, init, ac, hp, maxHp, type: 'pc'|'monster', conditions: [], deathSuccess, deathFail }
]}
```

Actions: `addCombatant`, `addCharacterToCombat { characterId, init? }` (PC from a saved sheet: AC, current/max HP; `init` is the roll result, omitted → server rolls d20 + DEX mod; ignored if that character is already in combat; combatant keeps `characterId`), `setInitiative { id, init }` (clamped −10..99, re-sorts keeping the active combatant), `removeCombatant`, `renameCombatant`, `adjustHP`, `addCondition`, `removeCondition`, `toggleDeathSave`, `nextTurn`, `sortInit`, `clearAll`. Combatant ids are generated server-side. Adding a combatant re-sorts by initiative while keeping the currently active combatant active (so `activeIndex` can shift on add).

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

Actions: `addCharacter { id }` (**id is generated by the client** so the editor can open immediately), `updateCharacter { id, patch }` (partial; `abilities`, `saveProf`, `skillProf` merged key by key; everything goes through `sanitizeCharacterPatch`: level 1–20, ability scores 1–30, name 60 chars, text fields 4000 chars, HP ≥ 0), `deleteCharacter { id }`. (Adding to combat is a combat action now, see above.)

Portrait validation: only `data:image/(jpeg|png|webp);base64,...` up to `MAX_PORTRAIT_CHARS` (derived from `config.MAX_PORTRAIT_BYTES` = 200 KB of image, ≈273k characters), or `''` to clear.

### REST import routes

- `POST /api/import/dndbeyond` — JSON `{ input }` (character URL or numeric id). Fetches `https://character-service.dndbeyond.com/character/v5/character/{id}` (unofficial; sharing must be **Public**), maps it, adds the character, broadcasts, responds `{ character }`. Errors respond `{ error }` (400 bad input, 502 non-OK from D&D Beyond, 404 unusable/private, 500 unexpected). Non-OK and unusable responses are now logged with status and the first 300 chars of the body.
- **Avatars:** the mapper returns `avatarUrl` (`data.decorations.avatarUrl`, else `data.avatarUrl`); `client.fetchAvatar` fetches it only from `https://*.dndbeyond.com`, asks the CDN for 256×256 (`width/height/fit=crop/quality` query params — often ignored), then always resizes with `sharp` to a 256×256 JPEG (cover crop, q85, EXIF-rotated, transparency flattened to white). Any `image/*` sharp can decode is accepted; downloads over 15 MB are refused; the result must still fit `MAX_PORTRAIT_BYTES` (200 KB). Avatar tests are skipped when sharp can't load (Node < 20.9). Any failure just means no portrait (logged), never a failed import. Sync only fills the portrait if the character has none. **Not yet verified against the live CDN** — if avatars never arrive, check the logs for "D&D Beyond avatar: skipped".
- `POST /api/import/dndbeyond/refresh` — JSON `{ characterId, input? }`. Re-imports into an existing character (the editor's "Sync from D&D Beyond" button, e.g. after leveling up). Uses the character's stored `ddbId` (saved on import); `input` links/re-links one. Replaces stats/proficiencies/equipment/features via `characters/service.refreshImported`, keeping portrait, notes, temp HP and damage taken (`hpMax - hpCurrent`). 404 unknown character, 400 no D&D Beyond id, otherwise same errors as above.
- `POST /api/import/pdf` — multipart field `file` (max 15 MB). Fillable form fields are matched against alias tables (case/punctuation-insensitive); unmatched non-empty fields go to Notes. Level is parsed from a combined `ClassLevel` field when there's no level field ("Fighter 3 / Wizard 2" sums to 5). No form fields → raw extracted text into Notes. Responds `{ character, warning }`.

Both importers create the character via `characters/service.addImported` using the same sanitizer as normal edits; the page then opens the new character's editor for review. Keep mappers pure (no network/files) so they stay testable.

## Frontend behavior worth knowing

- Shared pieces: `core/socket.js` (reconnecting WebSocket, handlers keyed by message type), `core/nav.js` renders the top nav from `core/tools.js` into `<nav class="app-nav" data-active="<id>">`, the same registry builds the home cards. To add a tool: add a registry entry, a page, `js/<id>/`, `css/pages/<id>.css`, and a server feature.
- **characters**: list view (cards with avatar, name, race/class, level pill, AC/HP/speed, HP bar), import panel (D&D Beyond tab, PDF tab with drag-and-drop), editor view (hero panel, vitals tiles, HP panel, tabs Stats / Equipment / Features / Notes). Modifiers, saves, skill bonuses, proficiency bonus and initiative are computed client-side, never stored.
- Text edits are debounced 300 ms before sending; the server echoes full state to everyone.
- **Pending-edit tracking** (`characters/store.js`: `touch()` / `mergePending()`): fields touched in the last 2.5 s keep their local value when new state arrives; focused fields are never overwritten. This fixed a real race where an echo from an earlier edit overwrote newer typing. Keep it when changing the editor.
- Portraits are cropped to a centered square and resized to 256 px JPEG in the browser. They are part of the character object, so every `charState` broadcast carries all portraits — fine at table scale.

**Design system** — D&D Beyond-inspired: dark top nav with a red underline on the active page, red accent (`--wax`), amber secondary (`--gold`), Roboto Condensed uppercase headings, Roboto body (Google Fonts), light/dark following the OS (`prefers-color-scheme`, `data-theme` overrides). Tokens live in `css/tokens.css` (`--bg`, `--bg-panel`, `--ink`, `--ink-soft`, `--line`, `--wax`, `--gold`, `--good`, `--blue`, `--nav-bg`); `base.css` and `components.css` are shared; each page has its own `css/pages/*.css`. Pages link the three shared sheets plus their own.

## Known gaps and caveats

- **The D&D Beyond importer has never run against the real service** (the sandbox can't reach `dndbeyond.com`). Mapping logic and the bad-input path are tested; the live fetch is not. The user reported an error importing from D&D Beyond; with the new logging, `docker compose logs` should show the status/body. Cause not yet known.
- D&D Beyond **AC is a best-effort estimate** from equipped armor and shield; skill/save proficiencies come from scanning `modifiers` arrays and may miss sources. The import adds a note saying so.
- PDF alias table is heuristic; the official sheet's exact field names were not verified. Flattened/scanned PDFs only yield raw text.
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
3. ~~Show portraits in the combat tracker and import the avatar from D&D Beyond.~~ Done (see below).
4. Mobile pass on all three pages.
5. Character sheet depth: spell slots and list, attacks, currency, rests, inspiration, death saves on the sheet, duplicate character.
6. Combat tracker: temp HP, per-combatant notes, monster stat import, link combatants to character sheets so HP stays in sync.
7. Light access control (shared table password or per-character ownership) if exposed beyond a trusted network.
