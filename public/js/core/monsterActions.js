// Monster actions for the DM: read from the stat block text (the SRD
// creatures' `notes`, or a custom monster written the same way) and shown
// with roll buttons — Attack (d20 + to hit, a natural 20 arms a critical),
// Damage (all damage types of the hit; versatile "or … with two hands" as a
// second button), saving-throw abilities (DC + damage, half on a success)
// and Recharge (d6).
//
//   parseMonsterActions(notes) -> [{ title, entries: [entry] }]   (pure)
//     entry: { name, text, attack: { toHit } | null,
//              damage: [{ label, parts: [{ dice, type }] }]  (alternatives),
//              save: { dc, ability, half } | null, recharge: n | 0 }
//   renderMonsterActions(container, { combatant, monster })
//
// Understands both the 2014 wording ("Melee Weapon Attack: +4 to hit …
// Hit: 5 (1d6 + 2) slashing damage", "DC 13 Dexterity saving throw") and
// the 2024 one ("Melee Attack Roll: +4 … Hit: 5 (1d6 + 2) Slashing damage",
// "Dexterity Saving Throw: DC 13 … Failure: …").
import { roll, rollDie, rollBatch, RollCancelled, formatDice } from './dice.js';

const SECTION_RE = /^—\s*(.+?)\s*—$/;
const ENTRY_RE = /^([^:]{1,80}):\s+(.*)$/;
const ATTACK_RE = /(?:Melee or Ranged|Melee|Ranged)(?: (?:Weapon|Spell))? Attack(?: Roll)?:\s*\+(\d+)/i;
const DAMAGE_RE = /(\d+)\s*\(([^)]*\d+d\d+[^)]*)\)\s*([A-Za-z]+) damage|\b(\d+) ([A-Za-z]+) damage/g;
const SAVE_2014_RE = /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i;
const SAVE_2024_RE = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:\s*DC (\d+)/i;
const RECHARGE_RE = /\(Recharge (\d)(?:\s*[–-]\s*6)?\)/i;

const ABILITY_SHORT = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };
const cleanDice = (s) => formatDice(String(s).replace(/[−–]/g, '-').replace(/\s+/g, ''));

// Damage in a piece of text, as alternatives [{ label, parts }]:
// "X (dice) type damage plus Y (dice) type damage" add up; a comma or "or"
// starts an alternative ("… or 8 (1d10 + 3) slashing damage if used with
// two hands", "… with shillelagh"); a "plus" after alternatives adds to
// all of them (Azer: "…, or … if used with two hands, plus 3 (1d6) fire").
function altLabel(after) {
  // Only the words right after the damage: "… damage if used with two
  // hands, …", "… damage in melee or …", "… damage with shillelagh."
  const t = after.split(/[,.;]|\b(?:or|plus|and|on a)\b|\d/i)[0].trim().toLowerCase();
  if (/two hands/.test(t)) return 'Two-handed';
  if (/\brange|ranged|thrown/.test(t)) return 'Ranged';
  if (/melee/.test(t)) return 'Melee';
  const w = t.replace(/^(if|when)\s+(used|wielded)\s+/, '').replace(/^with\s+/, 'with ');
  if (!w) return '';
  const short = w.length > 28 ? w.slice(0, 28).replace(/\s+\S*$/, '') + '…' : w;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function damageIn(text) {
  const alts = [];
  let current = null;
  let lastEnd = 0;
  DAMAGE_RE.lastIndex = 0;
  for (let m; (m = DAMAGE_RE.exec(text));) {
    const between = text.slice(lastEnd, m.index);
    const part = m[2] ? { dice: cleanDice(m[2]), type: m[3].toLowerCase() } : { dice: m[4], type: m[5].toLowerCase() };
    const adds = /\b(plus|and)\b/i.test(between);
    if (current && adds && alts.length > 1) alts.forEach((a) => a.parts.push(part));
    else if (current && adds) current.parts.push(part);
    else {
      current = { label: '', parts: [part] };
      alts.push(current);
    }
    lastEnd = DAMAGE_RE.lastIndex;
    if (!current.label) current.label = altLabel(text.slice(lastEnd));
  }
  if (alts.length === 1) alts[0].label = ''; // labels only tell options apart
  return alts;
}

// The first sentence of `text` starting at `from` ("1d6 + 2" and "5 ft."
// inside parentheses/before don't end it: a sentence ends at ". " + capital).
function sentenceFrom(text, from) {
  const rest = text.slice(from);
  const end = rest.search(/\.\s+(?=[A-Z])/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

function parseEntry(name, text) {
  const entry = { name, text, attack: null, damage: [], save: null, recharge: 0 };
  const rc = RECHARGE_RE.exec(name) || RECHARGE_RE.exec(text);
  if (rc) entry.recharge = parseInt(rc[1], 10);

  const atk = ATTACK_RE.exec(text);
  if (atk) {
    entry.attack = { toHit: parseInt(atk[1], 10) };
    const hit = text.search(/Hit:/);
    if (hit !== -1) entry.damage = damageIn(sentenceFrom(text, hit));
    return entry;
  }
  const s14 = SAVE_2014_RE.exec(text);
  const s24 = SAVE_2024_RE.exec(text);
  if (s14 || s24) {
    entry.save = s14
      ? { dc: parseInt(s14[1], 10), ability: ABILITY_SHORT[s14[2].toLowerCase()] }
      : { dc: parseInt(s24[2], 10), ability: ABILITY_SHORT[s24[1].toLowerCase()] };
    entry.save.half = /half as much damage|Success:\s*Half damage/i.test(text);
    // The damage of a failed save: 2014 "… taking 63 (18d6) fire damage on a
    // failed save"; 2024 "Failure: 22 (5d8) Acid damage."
    const fail = text.search(/Failure:/i);
    const first = fail !== -1 ? fail : text.search(/\d+\s*\(\d+d\d+/);
    if (first !== -1) entry.damage = damageIn(sentenceFrom(text, first)).slice(0, 1);
  }
  return entry;
}

export function parseMonsterActions(notes) {
  const sections = [];
  let current = null;
  String(notes || '').split('\n').forEach((raw) => {
    const line = raw.trim();
    const head = SECTION_RE.exec(line);
    if (head) {
      current = { title: head[1].charAt(0).toUpperCase() + head[1].slice(1), entries: [] };
      sections.push(current);
      return;
    }
    if (!current) return; // traits and stats above the first section
    const m = ENTRY_RE.exec(line);
    if (m) current.entries.push(parseEntry(m[1].trim(), m[2].trim()));
    else if (line && current.entries.length) current.entries[current.entries.length - 1].text += ' ' + line;
  });
  return sections.filter((s) => s.entries.length);
}

// ---- view

const results = new Map(); // combatantId:entry -> { text, crit, armed }
const fmt = (n) => (n >= 0 ? '+' + n : '−' + Math.abs(n));
const damageText = (alt) => alt.parts.map((p) => `${p.dice} ${p.type}`).join(' + ') + (alt.label && alt.label !== 'Melee' ? ` (${alt.label.toLowerCase()})` : '');

function statText(e) {
  const bits = [];
  if (e.attack) bits.push(`${fmt(e.attack.toHit)} to hit`);
  if (e.save) bits.push(`DC ${e.save.dc} ${e.save.ability} save`);
  if (e.damage.length) bits.push(e.damage.map(damageText).join(' or '));
  if (e.save && e.damage.length) bits[bits.length - 1] += e.save.half ? ' (half on a success)' : '';
  return bits.join(' · ');
}

async function rolled(title, fn) {
  try {
    return await rollBatch(title, fn);
  } catch (err) {
    if (err instanceof RollCancelled) return false;
    throw err;
  }
}

function rollDamage(alt, crit) {
  const lines = [];
  let total = 0;
  alt.parts.forEach((p) => {
    const r = roll(p.dice, 0, { crit, label: p.type });
    total += Math.max(0, r.total);
    lines.push(`${Math.max(0, r.total)} ${p.type} (${r.text})`);
  });
  return `${crit ? 'CRITICAL ' : ''}damage${alt.label ? ` (${alt.label.toLowerCase()})` : ''}: ${alt.parts.length > 1 ? `${total} total — ` : ''}${lines.join(' + ')}`;
}

function showResult(key) {
  const r = results.get(key);
  document.querySelectorAll('.action-result').forEach((out) => {
    if (out.dataset.key !== key) return;
    out.textContent = r ? r.text : '';
    out.classList.toggle('crit', !!(r && r.crit));
  });
}

function entryRow(c, e, sectionTitle) {
  const key = 'mon:' + c.id + ':' + sectionTitle + ':' + e.name;
  const row = document.createElement('div');
  row.className = 'action-row monster-action';

  const head = document.createElement('div');
  head.className = 'action-head';
  const name = document.createElement('span');
  name.className = 'action-name';
  name.textContent = e.name;
  const stat = document.createElement('span');
  stat.className = 'action-stat';
  stat.textContent = statText(e);
  head.append(name, stat);
  row.appendChild(head);

  const det = document.createElement('div');
  det.className = 'action-detail monster-text';
  det.textContent = e.text;
  row.appendChild(det);

  const btns = document.createElement('div');
  btns.className = 'action-btns';
  const button = (label, title, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn secondary small';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', async () => { if (await fn() !== false) showResult(key); });
    btns.appendChild(b);
  };
  const who = `${c.name}: ${e.name}`;
  if (e.attack) {
    button('Attack', 'Roll d20 + to hit', async () => {
      const r = await rolled(`${who} — attack`, () => {
        const d20 = rollDie(20, 'd20 to hit');
        return { d20, total: d20 + e.attack.toHit };
      });
      if (!r) return false;
      const crit = r.d20 === 20;
      const note = crit ? ' — natural 20, critical hit!' : r.d20 === 1 ? ' — natural 1, miss' : '';
      results.set(key, { text: `Attack: ${r.total} (d20 [${r.d20}] ${fmt(e.attack.toHit)})${note}`, crit, armed: crit });
      return true;
    });
  }
  e.damage.forEach((alt, i) => {
    const label = e.damage.length === 1 || !alt.label ? (i === 0 ? 'Damage' : `Damage ${i + 1}`) : alt.label;
    button(label, e.attack ? 'Roll damage (doubled dice after a critical hit)' : 'Roll damage (one roll for every creature in the area)', async () => {
      const prev = results.get(key);
      const crit = !!(e.attack && prev && prev.armed);
      const text = await rolled(`${who} — ${crit ? 'critical ' : ''}damage`, () => rollDamage(alt, crit));
      if (text === false) return false;
      const saveNote = e.save ? ` · DC ${e.save.dc} ${e.save.ability} save${e.save.half ? ', half on a success' : ''}` : '';
      results.set(key, { text: text + saveNote, crit, armed: false });
      return true;
    });
  });
  if (e.recharge) {
    button(`Recharge ${e.recharge}–6`, 'Roll d6 at the start of its turn', async () => {
      const d6 = await rolled(`${who} — recharge`, () => rollDie(6, 'd6 recharge'));
      if (d6 === false) return false;
      results.set(key, { text: `Recharge: d6 [${d6}] — ${d6 >= e.recharge ? 'available again!' : 'not yet'}`, crit: false });
      return true;
    });
  }
  if (btns.children.length) row.appendChild(btns);

  const out = document.createElement('div');
  out.className = 'action-result';
  out.dataset.key = key;
  row.appendChild(out);
  return { row, key };
}

export function renderMonsterActions(container, { combatant, monster }) {
  container.innerHTML = '';
  const sections = parseMonsterActions(monster && monster.notes);
  if (!sections.length) {
    const none = document.createElement('div');
    none.className = 'action-detail';
    none.textContent = 'No actions found in this creature\'s stat block (they are read from its "— Actions —" section).';
    container.appendChild(none);
    return;
  }
  const keys = [];
  sections.forEach((s) => {
    const h = document.createElement('div');
    h.className = 'monster-section';
    h.textContent = s.title;
    container.appendChild(h);
    s.entries.forEach((e) => {
      const { row, key } = entryRow(combatant, e, s.title);
      container.appendChild(row);
      keys.push(key);
    });
  });
  keys.forEach(showResult);
}
