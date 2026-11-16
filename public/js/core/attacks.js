// A character's actions, built from what they carry: attacks with each
// equipped weapon (plus an unarmed strike) and "use" actions for carried
// gear with effect dice (e.g. a healing potion). Shared by the character
// sheet and the combat tracker.
//
//   buildActions(character, itemsById) -> [action]   (pure)
//   renderActions(container, { character, items, canUse, onUse(entryId) })
//
// 5e rules: melee attacks use STR, ranged use DEX, finesse the better of
// the two. To hit = that modifier + proficiency (if proficient with the
// weapon's category) + magic bonus; damage = dice + modifier + magic bonus.
import { abilityMod, profBonusForLevel, fmtMod } from '../characters/rules.js';
import { roll, rollDie, formatDice } from './dice.js';

export function buildActions(ch, itemsById) {
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

export function renderActions(container, { character, items, canUse, onUse }) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const actions = buildActions(character, byId);
  container.innerHTML = '';

  actions.forEach((a) => {
    const key = character.id + ':' + a.key;
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
