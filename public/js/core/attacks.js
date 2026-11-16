// A character's actions, built from what they carry and know: attacks with
// each equipped weapon (plus an unarmed strike), "use" actions for carried
// gear with effect dice (e.g. a healing potion), and their cantrips and
// prepared spells. Shared by the character sheet and the combat tracker.
//
//   buildActions(character, itemsById, spellsById) -> [action]   (pure)
//   renderActions(container, { character, items, spells, canUse,
//                              onUse(entryId), onSpendSlot(level) })
//
// 5e rules: melee attacks use STR, ranged use DEX, finesse the better of
// the two. To hit = that modifier + proficiency (if proficient with the
// weapon's category) + magic bonus; damage = dice + modifier + magic bonus.
import { abilityMod, profBonusForLevel, fmtMod } from '../characters/rules.js';
import { roll, rollDie, formatDice, addDice, scaleDice } from './dice.js';
import { slotLabel, spellHeader } from '../spells/format.js';

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

export function buildActions(ch, itemsById, spellsById = new Map()) {
  const mods = { str: abilityMod(ch.abilities?.str), dex: abilityMod(ch.abilities?.dex) };
  const prof = profBonusForLevel(ch.level);
  const actions = [];

  (ch.inventory || []).forEach((entry) => {
    const it = itemsById.get(entry.itemId);
    if (!it || entry.qty <= 0) return;
    if (it.type === 'weapon' && entry.equipped) {
      let ability = it.attackType === 'ranged' ? 'dex' : 'str';
      if (it.properties.includes('finesse')) ability = mods.dex > mods.str ? 'dex' : 'str';
      const proficient = !!(ch.weaponProf && ch.weaponProf[it.weaponCategory]);
      const magic = it.magicBonus || 0;
      const dmgMod = mods[ability] + magic;
      const reach = it.properties.includes('reach') ? 'reach 10 ft' : 'reach 5 ft';
      actions.push({
        key: entry.id,
        kind: 'attack',
        name: it.name,
        toHit: mods[ability] + (proficient ? prof : 0) + magic,
        damage: { dice: it.damage, mod: dmgMod, type: it.damageType },
        versatile: it.versatileDamage ? { dice: it.versatileDamage, mod: dmgMod, type: it.damageType } : null,
        extra: it.extraDamage ? { dice: it.extraDamage, mod: 0, type: it.extraDamageType || '' } : null,
        detail: [
          it.attackType === 'ranged' ? `range ${it.range || '?'} ft` : reach + (it.range ? ` or range ${it.range} ft` : ''),
          ability.toUpperCase(),
          proficient ? 'proficient' : 'not proficient',
        ].join(' · '),
      });
    } else if (it.type === 'gear' && it.effectDice) {
      actions.push({
        key: entry.id, kind: 'use', name: it.name, qty: entry.qty,
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

  // Everyone can punch: STR + proficiency to hit, 1 + STR damage.
  actions.push({
    key: 'unarmed', kind: 'attack', name: 'Unarmed Strike',
    toHit: mods.str + prof, damage: { dice: '1', mod: mods.str, type: 'bludgeoning' },
    versatile: null, extra: null, detail: 'reach 5 ft · STR',
  });
  return actions;
}

const damageText = (d) => `${formatDice(d.dice, d.mod)} ${d.type}`.trim();

// Last roll per character+action, kept across redraws (the combat list
// redraws on every change at the table). A natural 20 arms a critical
// for that action's next damage roll.
const results = new Map(); // key -> { text, crit }

function rollDamage(a, part, crit) {
  const main = roll(part.dice, part.mod, { crit });
  const lines = [`${Math.max(0, main.total)} ${part.type} (${main.text})`];
  let total = Math.max(0, main.total);
  if (a.extra) {
    const ex = roll(a.extra.dice, 0, { crit });
    lines.push(`${ex.total} ${a.extra.type} (${ex.text})`);
    total += ex.total;
  }
  return (crit ? 'CRITICAL ' : '') + 'damage: ' + (a.extra ? `${total} total — ` : '') + lines.join(' + ');
}

// --- spells
const slotChoice = new Map(); // key -> chosen slot level (survives redraws)

// What a spell does with a given slot, as text (no rolls).
function spellStat(sp, sc, slot, charLevel) {
  const d = spellDice(sp, slot, charLevel);
  const mod = sp.addMod && sc ? sc.mod : 0;
  const dmg = d ? `${formatDice(d, mod)} ${sp.mechanic === 'heal' ? 'healing' : sp.damageType}`.trim() : '';
  const extra = sp.extraDice ? ` + ${sp.extraDice} ${sp.extraDamageType}` : '';
  const needsCaster = sp.mechanic === 'attack' || sp.mechanic === 'save' || sp.addMod;
  if (needsCaster && !sc) return (dmg + extra) + ' — set a spellcasting ability in the Spells tab';
  if (sp.mechanic === 'attack') return `${fmtMod(sc.attack)} to hit · ${dmg}${extra}`;
  if (sp.mechanic === 'save') {
    const onSave = !dmg ? '' : sp.saveSuccess === 'half' ? ' (half on success)' : ' (none on success)';
    return `DC ${sc.dc} ${sp.saveAbility.toUpperCase()} save` + (dmg ? ` · ${dmg}${extra}${onSave}` : '');
  }
  return dmg + extra;
}

// Casts: rolls everything the spell needs, returns the result text.
function castText(sp, sc, slot, charLevel) {
  const d = spellDice(sp, slot, charLevel);
  const mod = sp.addMod && sc ? sc.mod : 0;
  const at = sp.level > 0 ? ` (${slotLabel(slot)}-level slot)` : '';
  const dmgRoll = (crit) => {
    const main = roll(d, mod, { crit });
    let text = `${Math.max(0, main.total)} ${sp.damageType} (${main.text})`;
    if (sp.extraDice) {
      const ex = roll(sp.extraDice, 0, { crit });
      text += ` + ${ex.total} ${sp.extraDamageType} (${ex.text})`;
    }
    return text;
  };
  if (sp.mechanic === 'attack' && sc) {
    const d20 = rollDie(20);
    const crit = d20 === 20;
    const note = crit ? ' — natural 20, critical!' : d20 === 1 ? ' — natural 1, miss' : '';
    return { crit, text: `${sp.name}${at}: attack ${d20 + sc.attack} (d20 [${d20}] ${fmtMod(sc.attack)})${note}` + (d ? ` · ${crit ? 'CRITICAL ' : ''}damage ${dmgRoll(crit)}` : '') };
  }
  if (sp.mechanic === 'save' && sc) {
    const onSave = sp.saveSuccess === 'half' ? ', half on a success' : '';
    return { crit: false, text: `${sp.name}${at}: DC ${sc.dc} ${sp.saveAbility.toUpperCase()} save` + (d ? ` · ${dmgRoll(false)}${onSave}` : '') };
  }
  if (sp.mechanic === 'heal' && d) {
    const r = roll(d, mod);
    return { crit: false, text: `${sp.name}${at}: heals ${Math.max(0, r.total)} (${r.text})` };
  }
  if (sp.mechanic === 'auto' && d) return { crit: false, text: `${sp.name}${at}: ${dmgRoll(false)}` };
  return { crit: false, text: `Cast ${sp.name}${at}.` };
}

function renderSpellRow(row, a, { key, character, canUse, onSpendSlot, out, show }) {
  const sp = a.spell;
  const sc = spellcasting(character);
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
  stat.textContent = spellStat(sp, sc, slot, character.level);
  head.append(name, stat);
  row.appendChild(head);
  const det = document.createElement('div');
  det.className = 'action-detail';
  det.textContent = spellHeader(sp);
  if (sp.description) det.title = sp.description;
  row.appendChild(det);

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
        stat.textContent = spellStat(sp, sc, slot, character.level);
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
    cast.addEventListener('click', () => {
      const r = castText(sp, sc, slot, character.level);
      results.set(key, r);
      show();
      if (sp.level > 0) onSpendSlot(slot);
    });
    btns.appendChild(cast);
    row.appendChild(btns);
  }
  row.appendChild(out);
  show();
}

export function renderActions(container, { character, items, spells = [], canUse, onUse, onSpendSlot = () => {} }) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const actions = buildActions(character, byId, new Map(spells.map((sp) => [sp.id, sp])));
  container.innerHTML = '';

  const sc = spellcasting(character);
  if (sc && actions.some((a) => a.kind === 'spell')) {
    const info = document.createElement('div');
    info.className = 'spell-info';
    info.textContent = `Spellcasting (${sc.ability.toUpperCase()}): spell attack ${fmtMod(sc.attack)} · save DC ${sc.dc}`;
    container.appendChild(info);
  }

  actions.forEach((a) => {
    const key = character.id + ':' + a.key;
    if (a.kind === 'spell') {
      const row = document.createElement('div');
      row.className = 'action-row spell';
      const out = document.createElement('div');
      out.className = 'action-result';
      const show = () => {
        const r = results.get(key);
        out.textContent = r ? r.text : '';
        out.classList.toggle('crit', !!(r && r.crit));
      };
      renderSpellRow(row, a, { key, character, canUse, onSpendSlot, out, show });
      container.appendChild(row);
      return;
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
      stat.textContent = `${fmtMod(a.toHit)} to hit · ${damageText(a.damage)}`
        + (a.extra ? ` + ${damageText(a.extra)}` : '')
        + (a.versatile ? ` (two-handed ${damageText(a.versatile)})` : '');
    } else {
      stat.textContent = damageText(a.effect);
    }
    head.appendChild(stat);
    row.appendChild(head);

    if (a.detail) {
      const det = document.createElement('div');
      det.className = 'action-detail';
      det.textContent = a.detail;
      row.appendChild(det);
    }

    const out = document.createElement('div');
    out.className = 'action-result';
    const show = () => {
      const r = results.get(key);
      out.textContent = r ? r.text : '';
      out.classList.toggle('crit', !!(r && r.crit));
    };

    if (canUse) {
      const btns = document.createElement('div');
      btns.className = 'action-btns';
      const button = (label, fn, title) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn secondary small';
        b.textContent = label;
        if (title) b.title = title;
        b.addEventListener('click', () => { fn(); show(); });
        btns.appendChild(b);
      };
      if (a.kind === 'attack') {
        button('Attack', () => {
          const d20 = rollDie(20);
          const total = d20 + a.toHit;
          const note = d20 === 20 ? ' — natural 20, critical hit!' : d20 === 1 ? ' — natural 1, miss' : '';
          results.set(key, { text: `Attack: ${total} (d20 [${d20}] ${fmtMod(a.toHit)})${note}`, crit: d20 === 20, armed: d20 === 20 });
        }, 'Roll d20 + to hit');
        const dmg = (part, label) => button(label, () => {
          const prev = results.get(key);
          const crit = !!(prev && prev.armed);
          results.set(key, { text: rollDamage(a, part, crit), crit, armed: false });
        }, 'Roll damage (doubled dice after a natural 20)');
        dmg(a.damage, 'Damage');
        if (a.versatile) dmg(a.versatile, '2-handed');
      } else {
        button('Use', () => {
          const r = roll(a.effect.dice);
          results.set(key, { text: `${a.name}: ${r.total} ${a.effect.type} (${r.text}) — one used`, crit: false });
          onUse(a.key);
        }, 'Roll the effect and use one up');
      }
      row.appendChild(btns);
    }
    row.appendChild(out);
    show();
    container.appendChild(row);
  });
}
