# Near-term enhancement proposals

Small-to-medium features that build on what's already there. Ordered roughly by
value at the table vs. effort. Effort: **S** = an evening, **M** = a weekend,
**L** = several sessions. See `PROJECT_CONTEXT.md` → *Candidate next steps* for
the longer-term list.

---

## 1. Battle map

### 1.1 ~~Creature size on the map~~ — done
Large / Huge / Gargantuan creatures take up a single cell today.
- Add `size` (1–4 cells) to the combatant. Fill it from the size in the
  monster's stat block (`notes`, e.g. "Large giant") when added from the library, and let the DM change it.
- `placeToken` checks every covered cell (in bounds, free). The token spans
  `size × size` cells (CSS grid `span`).
- Keep the wire shape: `positions[id]` stays `{ x, y }` (top-left corner).

### 1.2 Conditions on tokens — S
Conditions only show in the combat list. Add small badges to the token corner
(first letter or emoji: 🔥 burning, 💤 unconscious, ⛓ grappled/restrained…),
with the full list in the tooltip. Players already receive `conditions`, so no
server change is needed.

### 1.3 Distance ruler — S
Hold Shift (or use a "Measure" button on touch screens) and drag between two cells
to show the distance in feet (5 ft per cell, with an option for the 5/10/5
diagonal rule). This only runs in the browser, with no sync.

### 1.4 Area-of-effect templates — M
Sphere/cube/cone/line overlays you can place and rotate on the board, with the
cells they cover highlighted. Sync them as a new `templates` list in the map
slice (memory only, like tokens), so the TV shows them too. The DM can clear them.

### 1.5 Fog of war (simple) — L
The DM paints covered cells, and players and the TV see them as solid black.
Filter on the server (`map/service.playerView`) so tokens under fog aren't
sent to players, which matches the "never send secrets" rule.

### 1.6 Pan & zoom on phones — S
Pinch-zoom and two-finger pan on the board instead of relying on sideways scrolling.

---

## 2. Combat tracker

### 2.1 Concentration tracking — S
A "Concentrating on…" chip on the combatant (spell name). When it takes
damage, show the CON save DC (`max(10, damage/2)`) next to the HP change, and
offer "Drop" to end it. Set it automatically when a concentration spell is cast
from the Actions tab (spells already have the concentration flag).

### 2.2 Condition durations — S
Optional "rounds left" on a condition, counted down on `nextTurn` for that
combatant and removed at 0, with a short toast ("Bless ended on Goblin 2").

### 2.3 Legendary & lair actions — M
For monsters with legendary actions (parsed from the stat block `notes`):
a counter (e.g. 3/3) that resets at the start of their turn, plus a
"Lair action" pseudo-combatant at initiative 20.

### 2.4 ~~Persist combat state & token positions~~ — done
This is the oldest open gap. Save the combat and map slices through
`jsonStore` (debounced like everything else), so a container rebuild or crash
in the middle of a fight doesn't lose the encounter. Add a "Start fresh" button
next to Clear.

### 2.5 Undo last HP change — S
A short-lived "Undo" next to the last `adjustHP` (keep the previous hp/tempHp
for each combatant, DM or owner only). This helps with fat-fingered −5s on phones.

### 2.6 Saved encounters — M
Save the current set of monsters (without PCs) as a named encounter, then
load it later with fresh HP/initiative. Store it per campaign.

---

## 3. Dice & shared rolls

### 3.1 Shared roll log — M
Rolls are local to the roller's screen today. Add a `rolls` feature with a
memory-only ring buffer of the last ~50 rolls: who, what, result, breakdown.
Players' rolls are public, and the DM can pick "secret roll" (sent only to DM
identities through `snapshotFor`). Show it in a side panel on Combat/Map,
and the last roll as a toast on the TV.

### 3.2 Roll initiative for all monsters — S
A single DM button: d20 + DEX mod for every monster that has no initiative
yet, then sort. Same-type groups can optionally share one roll.

---

## 4. Character sheet

### 4.1 Quick status block — S
These are on the sheet but missing from the model today: inspiration (toggle), exhaustion level
(0–6, 2014 and 2024 effects as a tooltip), currency (cp/sp/ep/gp/pp). Add them
to `blankCharacter` / `sanitizeCharacterPatch` and fill them from D&D Beyond
(`inspiration`, `currencies`) on import/sync.

### 4.2 Resources in the combat row — S
Show a character's tracked resources (Ki, Rage, Channel Divinity, spell slots)
as small −/+ chips in their combat row, so players don't have to switch to the sheet.

### 4.3 Duplicate character — S
Clone a sheet (new id, "Copy of …", no portrait sync link). This is handy for
NPC allies and pregens.

---

## 5. Housekeeping

### 5.1 Backup / restore — S
`GET /api/backup` (DM only) zips or concatenates the `DATA_DIR` JSON files;
"Restore" uploads it back. This adds a safety net beyond the Docker volume.

### 5.2 Shorter library lists on phones — S
Items/Spells render ~1,000 rows. Cap them at 120 like Monsters, with "Show more",
or collapse them by type.

### 5.3 Table password (optional) — M
A single shared password env var (`KIT_PASSWORD`). If it's set, the
join screen asks for it, and REST + WS check a signed cookie. A separate DM
password keeps players from choosing DM. Only needed if the server is
reachable beyond the home network.

---

## Suggested next batch

If you want a coherent "next session" scope, these fit together and are all S:

1. ~~**2.4** Persist combat + map~~ (done, along with 1.1 token sizes).
2. **1.2** Condition badges on tokens (pairs with the new name labels).
3. **2.1** Concentration tracking.
4. **3.2** Roll initiative for all monsters.
5. **1.3** Distance ruler.
