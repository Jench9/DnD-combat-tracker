// A character's actions, built from what they carry and know: attacks with
// each equipped weapon (plus an unarmed strike), "use" actions for carried
// gear with effect dice (e.g. a healing potion), and their cantrips and
// prepared spells. Shared by the character sheet and the combat tracker.
//
//   buildActions(character, itemsById, spellsById) -> [action]   (pure)
//   renderActions(container, { character, items, spells, canUse,
//                              onUse(entryId), onSpendSlot(level), onSpendResource(id, n) })
//
// The list is shown in sections by what each thing costs in the turn:
// Attacks (weapons, Unarmed Strike, Breath Weapon; "Attack action: 2
// attacks" with Extra Attack), Actions, Bonus Actions, Reactions, No action
// needed (class/species features from core/features.js, and carried items —
// 2024 potions are a Bonus Action), then Spells, each tagged with its
// casting time.
//
// 5e rules: melee attacks use STR, ranged use DEX, finesse the better of
// the two. To hit = that modifier + proficiency (if proficient with the
// weapon's category) + magic bonus; damage = dice + modifier + magic bonus.
// On top of that, the character's modifiers (feats, fighting styles, class
// features, weapon mastery, Hex…; see modifiers.js) add to hit, damage,
// extra dice, reroll rules, a wider crit range and rules notes.
import { abilityMod, profBonusForLevel, fmtMod } from '../characters/rules.js';
import { roll, rollDie, rollBatch, RollCancelled, formatDice, addDice, scaleDice } from './dice.js';
import { slotLabel, spellHeader } from '../spells/format.js';
import { effectsFor, unarmedOverride, resolveModifiers } from './modifiers.js';
import { featureActions, attacksPerAction, itemActionType, castingType } from './features.js';

// Spell attack bonus and save DC, or null without a spellcasting ability.
export function spellcasting(ch) {
  if (!ch.spellAbility) return null;
  const mod = abilityMod(ch.abilities?.[ch.spellAbility]);
  const prof = profBonusForLevel(ch.level);
  return { ability: ch.spellAbility, mod, attack: mod + prof, dc: 8 + mod + prof };
}

// Damage/healing dice for a spell cast with a given slot: cantrips get
// more dice at character levels 5/11/17; leveled spells add their
// higher-level dice per slot level above their own.
export function spellDice(sp, slotLevel, charLevel) {
  if (!sp.dice) return '';
  if (sp.level === 0) {
    const lvl = parseInt(charLevel, 10) || 1;
    return sp.cantripScaling ? scaleDice(sp.dice, 1 + (lvl >= 5) + (lvl >= 11) + (lvl >= 17)) : sp.dice;
  }
  return sp.higherLevelDice && slotLevel > sp.level ? addDice(sp.dice, sp.higherLevelDice, slotLevel - sp.level) : sp.dice;
}

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

// Everything the modifier engine needs about the character.
function envFor(ch) {
  const abilityMods = Object.fromEntries(ABILITY_KEYS.map((k) => [k, abilityMod(ch.abilities?.[k])]));
  return { ch, abilityMods, prof: profBonusForLevel(ch.level) };
}

// One way of dealing damage with an attack (one-handed, two-handed…):
// main dice + flat modifier, plus extra labelled dice (item extra damage,
// Sneak Attack, Hex…), and how the main dice are rolled.
function grip(label, dice, type, mod, fx, itemExtra) {
  const parts = [];
  if (itemExtra) parts.push(itemExtra);
  fx.parts.forEach((p) => parts.push(p));
  return {
    label,
    main: { dice, type, mod: mod + fx.flat, reroll: fx.reroll, critExtraDice: fx.critExtraDice },
    parts,
  };
}

export function buildActions(ch, itemsById, spellsById = new Map()) {
  const env = envFor(ch);
  const mods = env.abilityMods;
  const prof = env.prof;
  const actions = [];

  (ch.inventory || []).forEach((entry) => {
    const it = itemsById.get(entry.itemId);
    if (!it || entry.qty <= 0) return;
    if (it.type === 'weapon' && entry.equipped) {
      let ability = it.attackType === 'ranged' ? 'dex' : 'str';
      if (it.properties.includes('finesse')) ability = mods.dex > mods.str ? 'dex' : 'str';
      const proficient = !!(ch.weaponProf && ch.weaponProf[it.weaponCategory]);
      const magic = it.magicBonus || 0;
      const reach = it.properties.includes('reach') ? 'reach 10 ft' : 'reach 5 ft';
      const base = {
        kind: 'weapon', name: it.name, range: it.attackType, props: it.properties, ability,
        attackRoll: true, damaging: true, damageType: it.damageType, mastery: it.mastery || '',
      };
      // Two-handed weapons are always used two-handed; versatile ones both ways.
      const fx = effectsFor({ ...base, twoHandedGrip: it.properties.includes('two-handed') }, env);
      const fx2 = it.versatileDamage ? effectsFor({ ...base, twoHandedGrip: true }, env) : null;
      const itemExtra = it.extraDamage ? { dice: it.extraDamage, type: it.extraDamageType || '', label: '' } : null;
      const dmgMod = mods[ability] + magic;
      actions.push({
        key: entry.id,
        kind: 'attack',
        name: it.name,
        toHit: mods[ability] + (proficient ? prof : 0) + magic + fx.toHit,
        toHitDice: fx.toHitDice,
        critRange: fx.critRange,
        grips: [
          grip('Damage', it.damage, it.damageType, dmgMod, fx, itemExtra),
          ...(fx2 ? [grip('2-handed', it.versatileDamage, it.damageType, dmgMod, fx2, itemExtra)] : []),
        ],
        detail: [
          it.attackType === 'ranged' ? `range ${it.range || '?'} ft` : reach + (it.range ? ` or range ${it.range} ft` : ''),
          ability.toUpperCase(),
          proficient ? 'proficient' : 'not proficient',
          ...new Set([...fx.applied, ...(fx2 ? fx2.applied : [])]),
        ].join(' · '),
        notes: [...new Set([...fx.notes, ...(fx2 ? fx2.notes : [])])],
      });
    } else if (it.type === 'gear' && it.effectDice) {
      actions.push({
        key: entry.id, kind: 'use', name: it.name, qty: entry.qty, actionType: itemActionType(it, ch),
        effect: { dice: it.effectDice, mod: 0, type: it.effect || '' },
      });
    }
  });

  // Cantrips are always ready; leveled spells when prepared.
  (ch.spells || []).forEach((entry) => {
    const sp = spellsById.get(entry.spellId);
    if (!sp || (sp.level > 0 && !entry.prepared)) return;
    actions.push({ key: entry.id, kind: 'spell', name: sp.name, spell: sp });
  });

  // Everyone can punch: STR + proficiency to hit, 1 + STR damage — unless
  // Martial Arts gives a bigger die and lets DEX be used.
  const ma = unarmedOverride(env);
  const uAbility = ma && ma.dex && mods.dex > mods.str ? 'dex' : 'str';
  const ufx = effectsFor({
    kind: 'unarmed', name: 'Unarmed Strike', range: 'melee', props: [], ability: uAbility,
    attackRoll: true, damaging: true, damageType: 'bludgeoning',
  }, env);
  actions.push({
    key: 'unarmed', kind: 'attack', name: 'Unarmed Strike',
    toHit: mods[uAbility] + prof + ufx.toHit, toHitDice: ufx.toHitDice, critRange: ufx.critRange,
    grips: [grip('Damage', ma ? ma.die : '1', 'bludgeoning', mods[uAbility], ufx, null)],
    detail: ['reach 5 ft', uAbility.toUpperCase(), ...ufx.applied].join(' · '),
    notes: ufx.notes,
  });
  return actions;
}

const partText = (p) => ` + ${p.dice} ${p.type}${p.label ? ` (${p.label})` : ''}`.replace(/ +\(/, ' (').replace(/\s+$/, '');
const gripText = (g) => `${formatDice(g.main.dice, g.main.mod)} ${g.main.type}`.trim() + g.parts.map(partText).join('');
const toHitText = (a) => `${fmtMod(a.toHit)}${(a.toHitDice || []).map((d) => ` +${d.dice}`).join('')} to hit`;

// Last roll per character+action, kept across redraws (the combat list
// redraws on every change at the table). A critical hit arms that action's
// next damage roll.
const results = new Map(); // key -> { text, crit, armed }

// Shows a roll result on every copy of that action on the page (the list
// may have been redrawn while the player was entering their dice).
function showResult(key) {
  const r = results.get(key);
  document.querySelectorAll('.action-result').forEach((out) => {
    if (out.dataset.key !== key) return;
    out.textContent = r ? r.text : '';
    out.classList.toggle('crit', !!(r && r.crit));
  });
}

// Runs a roll (asking for the dice if the player rolls their own); false
// if they cancelled.
async function rolled(title, fn) {
  try {
    return await rollBatch(title, fn);
  } catch (err) {
    if (err instanceof RollCancelled) return false;
    throw err;
  }
}

function rollGrip(g, crit) {
  const main = roll(g.main.dice, g.main.mod, { crit, reroll: g.main.reroll, critExtraDice: g.main.critExtraDice, label: g.main.type });
  const lines = [`${Math.max(0, main.total)} ${g.main.type} (${main.text})`];
  let total = Math.max(0, main.total);
  g.parts.forEach((p) => {
    const r = roll(p.dice, 0, { crit, label: [p.type, p.label].filter(Boolean).join(' ') });
    lines.push(`${r.total} ${p.type}${p.label ? ` ${p.label}` : ''} (${r.text})`.replace(/\s+\(/, ' ('));
    total += r.total;
  });
  return (crit ? 'CRITICAL ' : '') + 'damage: ' + (g.parts.length ? `${total} total — ` : '') + lines.join(' + ');
}

// d20 + to hit (+ Bless-style dice); a critical on critRange or higher.
function rollAttack(a) {
  const d20 = rollDie(20, 'd20 to hit');
  const extra = (a.toHitDice || []).map((d) => ({ d, r: roll(d.dice, 0, { label: d.label }) }));
  const total = d20 + a.toHit + extra.reduce((s, x) => s + x.r.total, 0);
  const crit = d20 >= (a.critRange || 20);
  const note = crit ? (d20 === 20 ? ' — natural 20, critical hit!' : ` — natural ${d20}, critical hit!`) : d20 === 1 ? ' — natural 1, miss' : '';
  const extraText = extra.map((x) => ` + ${x.r.total} (${x.d.label})`).join('');
  return { total, crit, text: `Attack: ${total} (d20 [${d20}] ${fmtMod(a.toHit)}${extraText})${note}` };
}

// --- spells
const slotChoice = new Map(); // key -> chosen slot level (survives redraws)

// The character's modifiers that apply to this spell (Agonizing Blast,
// Empowered Evocation, Elemental Adept, Hex on spell attacks…).
function spellEffects(sp, character) {
  const sc = spellcasting(character);
  return effectsFor({
    kind: 'spell', name: sp.name, ability: sc ? sc.ability : '', attackRoll: sp.mechanic === 'attack',
    school: sp.school, damaging: !!sp.dice && sp.mechanic !== 'heal', damageType: sp.damageType,
  }, envFor(character));
}

const spellParts = (fx) => fx.parts.map(partText).join('');

// What a spell does with a given slot, as text (no rolls).
function spellStat(sp, sc, slot, charLevel, fx) {
  const d = spellDice(sp, slot, charLevel);
  const mod = (sp.addMod && sc ? sc.mod : 0) + (sp.mechanic === 'heal' ? 0 : fx.flat);
  const dmg = d ? `${formatDice(d, mod)} ${sp.mechanic === 'heal' ? 'healing' : sp.damageType}`.trim() : '';
  const extra = (sp.extraDice ? ` + ${sp.extraDice} ${sp.extraDamageType}` : '') + (d ? spellParts(fx) : '');
  const needsCaster = sp.mechanic === 'attack' || sp.mechanic === 'save' || sp.addMod;
  if (needsCaster && !sc) return (dmg + extra) + ' — set a spellcasting ability in the Spells tab';
  if (sp.mechanic === 'attack') return `${toHitText({ toHit: sc.attack + fx.toHit, toHitDice: fx.toHitDice })} · ${dmg}${extra}`;
  if (sp.mechanic === 'save') {
    const onSave = !dmg ? '' : sp.saveSuccess === 'half' ? ' (half on success)' : ' (none on success)';
    return `DC ${sc.dc} ${sp.saveAbility.toUpperCase()} save` + (dmg ? ` · ${dmg}${extra}${onSave}` : '');
  }
  return dmg + extra;
}

// Casts: rolls everything the spell needs, returns the result text (or
// false if the player cancelled entering their dice). A spell attack's
// damage is a second roll: a critical hit doubles its dice.
async function castRoll(sp, sc, slot, charLevel, fx) {
  const d = spellDice(sp, slot, charLevel);
  const mod = sp.addMod && sc ? sc.mod : 0;
  const at = sp.level > 0 ? ` (${slotLabel(slot)}-level slot)` : '';
  const dmgRoll = (crit) => {
    const main = roll(d, mod + fx.flat, { crit, reroll: fx.reroll, label: sp.damageType });
    let text = `${Math.max(0, main.total)} ${sp.damageType} (${main.text})`;
    if (sp.extraDice) {
      const ex = roll(sp.extraDice, 0, { crit, reroll: fx.reroll, label: sp.extraDamageType });
      text += ` + ${ex.total} ${sp.extraDamageType} (${ex.text})`;
    }
    fx.parts.forEach((p) => {
      const r = roll(p.dice, 0, { crit, label: [p.type, p.label].filter(Boolean).join(' ') });
      text += ` + ${r.total} ${p.type} ${p.label} (${r.text})`;
    });
    return text;
  };
  if (sp.mechanic === 'attack' && sc) {
    const r = await rolled(`${sp.name}: spell attack`, () => rollAttack({ toHit: sc.attack + fx.toHit, toHitDice: fx.toHitDice, critRange: 20 }));
    if (!r) return false;
    const dmg = d ? await rolled(`${sp.name}: ${r.crit ? 'critical ' : ''}damage`, () => dmgRoll(r.crit)) : '';
    if (dmg === false) return false;
    return { crit: r.crit, text: `${sp.name}${at}: ${r.text.replace(/^Attack/, 'attack')}` + (dmg ? ` · ${r.crit ? 'CRITICAL ' : ''}damage ${dmg}` : '') };
  }
  if (sp.mechanic === 'save' && sc) {
    const onSave = sp.saveSuccess === 'half' ? ', half on a success' : '';
    const dmg = d ? await rolled(`${sp.name}: damage`, () => dmgRoll(false)) : '';
    if (dmg === false) return false;
    return { crit: false, text: `${sp.name}${at}: DC ${sc.dc} ${sp.saveAbility.toUpperCase()} save` + (dmg ? ` · ${dmg}${onSave}` : '') };
  }
  if (sp.mechanic === 'heal' && d) {
    const r = await rolled(`${sp.name}: healing`, () => roll(d, mod, { label: 'healing' }));
    if (!r) return false;
    return { crit: false, text: `${sp.name}${at}: heals ${Math.max(0, r.total)} (${r.text})` };
  }
  if (sp.mechanic === 'auto' && d) {
    const dmg = await rolled(`${sp.name}: damage`, () => dmgRoll(false));
    if (dmg === false) return false;
    return { crit: false, text: `${sp.name}${at}: ${dmg}` };
  }
  return { crit: false, text: `Cast ${sp.name}${at}.` };
}

function renderSpellRow(row, a, { key, character, canUse, onSpendSlot, out, show, cast: castHooks }) {
  const sp = a.spell;
  const sc = spellcasting(character);
  const fx = spellEffects(sp, character);
  const slots = character.spellSlots || [];
  const available = (lvl) => { const s = slots[lvl - 1]; return s ? s.max - s.used : 0; };
  const levels = sp.level === 0 ? [0] : [...Array(10 - sp.level).keys()].map((i) => sp.level + i).filter((l) => (slots[l - 1] || {}).max > 0);
  let slot = slotChoice.get(key);
  if (!levels.includes(slot)) slot = levels.find((l) => l === 0 || available(l) > 0) ?? levels[0] ?? sp.level;

  const head = document.createElement('div');
  head.className = 'action-head';
  const name = document.createElement('span');
  name.className = 'action-name';
  name.textContent = sp.name;
  const stat = document.createElement('span');
  stat.className = 'action-stat';
  stat.textContent = spellStat(sp, sc, slot, character.level, fx);
  head.append(name, stat);
  row.appendChild(head);
  const det = document.createElement('div');
  det.className = 'action-detail';
  det.textContent = [spellHeader(sp), ...fx.applied].join(' · ');
  if (sp.description) det.title = sp.description;
  row.appendChild(det);
  appendNotes(row, fx.notes);

  if (canUse) {
    const btns = document.createElement('div');
    btns.className = 'action-btns';
    if (sp.level > 0) {
      const sel = document.createElement('select');
      sel.className = 'slot-select';
      sel.setAttribute('aria-label', 'Spell slot level');
      if (!levels.length) {
        const o = document.createElement('option');
        o.textContent = 'No slots';
        sel.appendChild(o);
        sel.disabled = true;
      }
      levels.forEach((l) => {
        const o = document.createElement('option');
        o.value = l;
        o.textContent = `${slotLabel(l)} slot (${available(l)} left)`;
        sel.appendChild(o);
      });
      sel.value = slot;
      sel.addEventListener('change', () => {
        slotChoice.set(key, parseInt(sel.value, 10));
        slot = parseInt(sel.value, 10);
        stat.textContent = spellStat(sp, sc, slot, character.level, fx);
        cast.disabled = available(slot) <= 0;
      });
      btns.appendChild(sel);
    }
    const cast = document.createElement('button');
    cast.type = 'button';
    cast.className = 'btn secondary small';
    cast.textContent = 'Cast';
    cast.disabled = sp.level > 0 && (!levels.length || available(slot) <= 0);
    cast.title = sp.level > 0 ? 'Spend a slot and roll' : 'Roll';
    if (castHooks.blocked) {
      cast.disabled = true;
      cast.title = castHooks.blocked;
    }
    cast.addEventListener('click', async () => {
      if (castHooks.before && !castHooks.before(sp)) return;
      const castSlot = slot;
      const r = await castRoll(sp, sc, castSlot, character.level, fx);
      if (!r) return; // cancelled while entering the dice: nothing spent
      results.set(key, r);
      showResult(key);
      if (sp.level > 0) onSpendSlot(castSlot);
      if (castHooks.after) castHooks.after(sp);
    });
    btns.appendChild(cast);
    row.appendChild(btns);
  }
  row.appendChild(out);
  show();
}

function appendNotes(row, notes) {
  (notes || []).forEach((n) => {
    const el = document.createElement('div');
    el.className = 'action-note';
    el.textContent = n;
    row.appendChild(el);
  });
}

// `onToggleModifier(id)`: if given, situational modifiers (Rage, Hex…)
// get quick on/off switches above the actions (the combat tracker).
// `onSpendResource(resourceId, amount)`: Use on a class feature spends it.
// `cast` (combat tracker): { blocked: '' | reason Cast is disabled,
// before(spell) → false cancels the cast, after(spell) once it's cast }.
export function renderActions(container, {
  character, items, spells = [], canUse, onUse, onSpendSlot = () => {}, onToggleModifier = null, cast = {},
  onSpendResource = null,
}) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const actions = buildActions(character, byId, new Map(spells.map((sp) => [sp.id, sp])));
  container.innerHTML = '';

  const toggles = onToggleModifier ? resolveModifiers(character).filter(({ def }) => def.toggle) : [];
  if (toggles.length) {
    const bar = document.createElement('div');
    bar.className = 'mod-toggles';
    toggles.forEach(({ entry, def }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mod-chip' + (entry.active ? ' on' : '');
      b.textContent = `${def.name.replace(/\s*\(.*?\)|\s*[−-]\d.*$/g, '')}: ${entry.active ? 'on' : 'off'}`;
      b.title = def.name;
      b.disabled = !canUse;
      b.addEventListener('click', () => onToggleModifier(entry.id));
      bar.appendChild(b);
    });
    container.appendChild(bar);
  }

  // Sections by what each costs in the turn; spells stay together (tagged
  // with their casting time).
  const feats = featureActions(character);
  const attacks = actions.filter((a) => a.kind === 'attack');
  const perAction = attacksPerAction(character);
  const groups = [
    { key: 'attack', title: 'Attacks', hint: perAction > 1 ? `Attack action: ${perAction} attacks` : 'Attack action', actions: attacks, feats: feats.filter((f) => f.type === 'attack') },
    { key: 'action', title: 'Actions', actions: actions.filter((a) => a.kind === 'use' && a.actionType === 'action'), feats: feats.filter((f) => f.type === 'action') },
    { key: 'bonus', title: 'Bonus Actions', hint: 'one per turn', actions: actions.filter((a) => a.kind === 'use' && a.actionType === 'bonus'), feats: feats.filter((f) => f.type === 'bonus') },
    { key: 'reaction', title: 'Reactions', hint: 'one per round', actions: [], feats: feats.filter((f) => f.type === 'reaction') },
    { key: 'free', title: 'No action needed', actions: [], feats: feats.filter((f) => f.type === 'free') },
    { key: 'spell', title: 'Spells', actions: actions.filter((a) => a.kind === 'spell'), feats: [] },
  ];

  groups.forEach((g) => {
    if (!g.actions.length && !g.feats.length) return;
    const head = document.createElement('div');
    head.className = 'action-group';
    head.dataset.group = g.key;
    const title = document.createElement('span');
    title.className = 'action-group-title';
    title.textContent = g.title;
    head.appendChild(title);
    if (g.hint) {
      const hint = document.createElement('span');
      hint.className = 'action-group-hint';
      hint.textContent = g.hint;
      head.appendChild(hint);
    }
    container.appendChild(head);
    if (g.key === 'spell') {
      const sc = spellcasting(character);
      if (sc) {
        const info = document.createElement('div');
        info.className = 'spell-info';
        info.textContent = `Spellcasting (${sc.ability.toUpperCase()}): spell attack ${fmtMod(sc.attack)} · save DC ${sc.dc}`;
        container.appendChild(info);
      }
    }
    g.feats.forEach((f) => container.appendChild(featureRow(f, { character, canUse, onSpendResource, onToggleModifier })));
    g.actions.forEach((a) => container.appendChild(actionRow(a, { character, canUse, onUse, onSpendSlot, cast })));
  });
}

const CAST_TAG = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction' };

function resultSlot(key) {
  const out = document.createElement('div');
  out.className = 'action-result';
  out.dataset.key = key;
  const show = () => {
    const r = results.get(key);
    out.textContent = r ? r.text : '';
    out.classList.toggle('crit', !!(r && r.crit));
  };
  return { out, show };
}

function actionRow(a, { character, canUse, onUse, onSpendSlot, cast }) {
  const key = character.id + ':' + a.key;
  if (a.kind === 'spell') {
    const row = document.createElement('div');
    row.className = 'action-row spell';
    const { out, show } = resultSlot(key);
    renderSpellRow(row, a, { key, character, canUse, onSpendSlot, out, show, cast });
    // Casting time as a tag next to the name.
    const type = castingType(a.spell.castingTime);
    const tag = document.createElement('span');
    tag.className = 'cast-tag ' + type;
    tag.textContent = CAST_TAG[type] || String(a.spell.castingTime || '').replace(/^1 /, '');
    tag.title = `Casting time: ${a.spell.castingTime || '?'}`;
    row.querySelector('.action-name').appendChild(tag);
    return row;
  }
  const row = document.createElement('div');
  row.className = 'action-row';

  const head = document.createElement('div');
  head.className = 'action-head';
  const name = document.createElement('span');
  name.className = 'action-name';
  name.textContent = a.name + (a.kind === 'use' ? ` ×${a.qty}` : '');
  head.appendChild(name);
  const stat = document.createElement('span');
  stat.className = 'action-stat';
  if (a.kind === 'attack') {
    stat.textContent = `${toHitText(a)} · ${gripText(a.grips[0])}`
      + (a.grips[1] ? ` (two-handed ${gripText(a.grips[1])})` : '');
  } else {
    stat.textContent = `${formatDice(a.effect.dice, a.effect.mod)} ${a.effect.type}`.trim();
  }
  head.appendChild(stat);
  row.appendChild(head);

  if (a.detail) {
    const det = document.createElement('div');
    det.className = 'action-detail';
    det.textContent = a.detail;
    row.appendChild(det);
  }
  appendNotes(row, a.notes);

  const { out, show } = resultSlot(key);

  if (canUse) {
    const btns = document.createElement('div');
    btns.className = 'action-btns';
    const button = (label, fn, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn secondary small';
      b.textContent = label;
      if (title) b.title = title;
      b.addEventListener('click', async () => { if (await fn() !== false) showResult(key); });
      btns.appendChild(b);
    };
    if (a.kind === 'attack') {
      button('Attack', async () => {
        const r = await rolled(`${a.name}: attack`, () => rollAttack(a));
        if (!r) return false;
        results.set(key, { text: r.text, crit: r.crit, armed: r.crit });
        return true;
      }, 'Roll d20 + to hit');
      a.grips.forEach((g) => button(g.label, async () => {
        const prev = results.get(key);
        const crit = !!(prev && prev.armed);
        const text = await rolled(`${a.name}: ${crit ? 'critical ' : ''}damage`, () => rollGrip(g, crit));
        if (text === false) return false;
        results.set(key, { text, crit, armed: false });
        return true;
      }, 'Roll damage (doubled dice after a critical hit)'));
    } else {
      button('Use', async () => {
        const r = await rolled(`${a.name}`, () => roll(a.effect.dice, 0, { label: a.effect.type }));
        if (!r) return false;
        results.set(key, { text: `${a.name}: ${r.total} ${a.effect.type} (${r.text}) — one used`, crit: false });
        onUse(a.key);
        return true;
      }, 'Roll the effect and use one up');
    }
    row.appendChild(btns);
  }
  row.appendChild(out);
  show();
  return row;
}

// A class / species feature (core/features.js): its uses from the sheet's
// Resources, and Use (spends them, rolls if it has dice).
function featureRow(f, { character, canUse, onSpendResource, onToggleModifier }) {
  const key = character.id + ':feat:' + f.key;
  const row = document.createElement('div');
  row.className = 'action-row feature';
  const head = document.createElement('div');
  head.className = 'action-head';
  const name = document.createElement('span');
  name.className = 'action-name';
  name.textContent = f.name;
  const stat = document.createElement('span');
  stat.className = 'action-stat';
  const left = f.resource ? Math.max(0, f.resource.max - f.resource.used) : null;
  const uses = f.resource
    ? (f.pool ? `${left} left` : `${left}/${f.resource.max} ${f.resource.name === f.name ? 'left' : f.resource.name}`)
    : '';
  stat.textContent = [f.stat, uses].filter(Boolean).join(' · ');
  head.append(name, stat);
  row.appendChild(head);
  const det = document.createElement('div');
  det.className = 'action-detail';
  det.textContent = f.text;
  row.appendChild(det);
  if (f.tracks && !f.resource) appendNotes(row, [`Add a "${f.name}" resource (Actions tab → Resources) to count its uses.`]);

  const { out, show } = resultSlot(key);
  const spend = (n) => { if (f.resource && onSpendResource) onSpendResource(f.resource.id, n); };
  if (canUse && !f.noUse && (f.resource || f.roll)) {
    const btns = document.createElement('div');
    btns.className = 'action-btns';
    const button = (label, title, disabled, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn secondary small';
      b.textContent = label;
      b.title = title;
      b.disabled = disabled;
      b.addEventListener('click', async () => { if (await fn() !== false) showResult(key); });
      btns.appendChild(b);
    };
    if (f.pool) {
      button('Use…', 'Spend from the pool', !left, () => {
        const n = parseInt(prompt(`${f.name}: how many? (${left} left)`, String(Math.min(5, left))), 10);
        if (!(n > 0)) return false;
        const used = Math.min(n, left);
        results.set(key, { text: `${f.name}: ${used} spent (${left - used} left).`, crit: false });
        spend(used);
        return true;
      });
    } else {
      if (f.optional) {
        button('Use free', 'The version that costs nothing', false, () => {
          results.set(key, { text: `${f.name} (free version).`, crit: false });
          return true;
        });
      }
      const short = f.resource && left < f.cost;
      button(f.optional ? `Spend ${f.cost}` : 'Use', f.resource ? `Uses ${f.cost} of ${f.resource.name}` : 'Roll', !!short, async () => {
        let text = `${f.name} used.`;
        if (f.roll) {
          const r = await rolled(f.name, () => roll(f.roll.dice, f.roll.mod, { label: f.roll.label }));
          if (!r) return false;
          text = `${f.name}: ${r.total} ${f.roll.label} (${r.text})`;
        }
        if (f.resource) text += ` — ${Math.max(0, left - f.cost)} left.`;
        results.set(key, { text, crit: false });
        spend(f.cost);
        // Rage: also switch on its damage modifier (combat tracker).
        if (f.key === 'rage' && onToggleModifier) {
          const m = (character.modifiers || []).find((x) => x.preset === 'rage' && !x.active);
          if (m) onToggleModifier(m.id);
        }
        return true;
      });
    }
    row.appendChild(btns);
  }
  row.appendChild(out);
  show();
  return row;
}
