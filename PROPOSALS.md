# Near-term enhancement proposals

Small-to-medium features that build on what's already there. Ordered roughly by
value at the table vs. effort. Effort: **S** = an evening, **M** = a weekend,
**L** = several sessions. Finished items are removed (see `PROJECT_CONTEXT.md`
for what exists and git history for when it landed).

---

## 1. Battle map

### 1.1 Distance ruler — S
Hold Shift (or use a "Measure" button on touch screens) and drag between two cells
to show the distance in feet (5 ft per cell, with an option for the 5/10/5
diagonal rule). Browser only, no sync.

### 1.2 Movement left this turn — S
While a token's turn is active, count the cells it moved since its turn began
and show "20 / 30 ft" on the token card and the combat row (speed from the
sheet; monsters from the stat block's "Speed" line). Reset on `nextTurn`.
Dash doubles it with one click. Just a hint, never blocks a move.

### 1.3 Ping a cell — S
Long-press (or Alt+click) a cell to show a pulse there on every screen, the TV
included, for ~3 s ("look here"). A transient broadcast, not saved state: a new
`pingMap` action that the hub forwards without changing the map slice
(players may ping; pings on fogged cells, once 1.5 exists, go to the DM only).

### 1.4 Area-of-effect templates — M
Sphere/cube/cone/line overlays you can place and rotate on the board, with the
cells they cover highlighted. Sync them as a `templates` list in the map
slice, so the TV shows them too. The DM can clear them. Pairs well with 2.3
(pick the targets of a Fireball from the covered cells).

### 1.5 Fog of war (simple) — L
The DM paints covered cells, and players and the TV see them as solid black.
Filter on the server (`map/service.playerView`) so tokens under fog aren't
sent to players, which matches the "never send secrets" rule.

---

## 2. Combat tracker

### 2.1 Roll initiative for all monsters — S
One DM button: re-roll d20 + bonus for every monster (or only those added
with the same initiative), then sort. Same-type groups can optionally share
one roll, as the 2024 rules suggest for big groups.

### 2.2 Death saving throws with a roll button — S
At 0 HP the row (and the sheet) gets **Roll death save**: d20 through
`rollBatch` (hand dice ask), 10+ = success, 1 = two failures, 20 = back to
1 HP; three successes = stable. Today the dots are filled by hand. Damage at
0 HP adds a failure (two on a crit), as the rules say.

### 2.3 Damage several targets at once — M
"Apply damage" from a spell or a monster action: pick targets (checkboxes in
the list, or a template's cells from 1.4), roll the damage once, then each
target gets full or half (save made) with one click per row, resistances
noted. Concentration checks are already triggered by `adjustHP`.

### 2.4 Condition and effect durations — S
Optional "rounds left" on a condition or spell effect, counted down at the
start of the source's turn (2024: "until the start of your next turn") and
removed at 0, with a short toast ("Bless ended on Goblin 2").

### 2.5 Reaction used — S
A small ⟲ toggle on each row: reaction spent this round, cleared at the start
of that combatant's turn. Using a Reaction feature (Uncanny Dodge, Shield,
Deflect Attacks) from the Actions list sets it automatically.

### 2.6 Undo last HP change — S
A short-lived "Undo" next to the last `adjustHP` (keep the previous hp/tempHp
for each combatant, DM or owner only). This helps with fat-fingered −5s on phones.

### 2.7 Legendary & lair actions — M
For monsters with legendary actions (parsed from the stat block `notes`):
a counter (e.g. 3/3) that resets at the start of their turn, plus a
"Lair action" pseudo-combatant at initiative 20.

### 2.8 Saved encounters per campaign — M
Save the current monsters (without PCs) as a named encounter in a campaign,
then load it later with fresh HP and initiative (and their map positions,
optionally). Lists under the Enemies panel, filtered by the current campaign.

---

## 3. Characters

### 3.1 Builder: 2014 rules — L
The guided creation and level up are 2024-only. Add the 2014 SRD 5.1 classes,
races and backgrounds from 5e-bits (`build-rules.js` already reads that
database), chosen by the sheet's rules edition.

### 3.2 Builder: start above level 1 — S
"Create at level N": run the level-up plan N−1 times inside the wizard
(average HP by default, the same choices one level at a time), instead of
making the player level up repeatedly after creation.

### 3.3 Builder: invocations, metamagic, weapon mastery picks — M
The choices the level up leaves "by hand" today: Eldritch Invocations
(Warlock), Metamagic (Sorcerer) and Weapon Mastery weapons (martial classes),
as pick lists that also switch on the matching attack modifiers.

### 3.4 Two-weapon fighting — S
Attacking with a Light weapon offers the off-hand attack under Bonus
Actions (no ability modifier to damage unless the Two-Weapon Fighting style;
2024 Nick mastery makes it part of the Attack action).

### 3.5 Retire characters — S
An "archived" flag (DM) that hides dead or retired characters from the
"Who are you?" screen, the Allies list and the campaign manager's default
view, without deleting them. A "Show retired" toggle on the Characters page.

---

## 4. Table & players

### 4.1 "Already playing" on the join screen — S
The hub knows each socket's identity. Send the set of character ids with a
live connection (just ids, nothing secret) so the "Who are you?" screen marks
"playing on another device" and two players don't pick the same character.

### 4.2 Private libraries per DM — M
Campaigns already have their own DMs, fight and map; the monster, item
and spell libraries and the map backgrounds are still shared by all DMs.
Mark custom entries as "mine" (only that DM and its campaigns see them),
keeping the SRD shared.

### 4.3 Two-factor login for DM accounts — M
Optional TOTP (authenticator app) for DM accounts, since they can see and
change everything: a QR code on the Players page, a 6-digit code after the
password, and one-time recovery codes.

---

## 5. Housekeeping

### 5.1 More browser tests — S each
`npm run test:e2e` covers page loads and the main flows. Worth adding as
features change: phone viewport runs (360 px) of combat and the map, the
familiar chooser, rests, the D&D Beyond import with a mocked endpoint, map
drag-and-drop, and the TV view following the turn.

---

## Suggested next batch

All S, and they fit together as one "smoother combat" session:

1. **2.1** Roll initiative for all monsters.
2. **2.2** Death saves with a roll button.
3. **2.5** Reaction used.
4. **1.1** Distance ruler.
5. **5.1** A browser test for each of them.
