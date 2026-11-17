// A combatant's Actions (attacks, items, spells) wired to the server, for
// the Combat Tracker rows and the Battle Map token card.
//
//   combatActionsFor(c, { characters, items, spells, state, send, isDm, ownsCharacter, monsterFor })
//     → fill(container) for a combatant made from a character sheet, or —
//     for the DM — a library monster with actions in its stat block; else null.
//
// Using an item spends it from the inventory; casting a leveled spell
// spends a slot. Casting is blocked while incapacitated; a new
// concentration spell ends the old one (after asking); spells that last
// open the target dialog (core/spellDialog.js).
import { renderActions } from './attacks.js';
import { openSpellDialog, ENDS_CONCENTRATION_CONDITIONS } from './spellDialog.js';
import { renderMonsterActions, parseMonsterActions } from './monsterActions.js';

export function castBlockedReason(c) {
  const cond = (c.conditions || []).find((x) => ENDS_CONCENTRATION_CONDITIONS.includes(x));
  return cond ? `Can't cast spells while ${cond}` : '';
}

export function combatActionsFor(c, { characters, items, spells, state, send, isDm, ownsCharacter, monsterFor = () => null }) {
  const ch = c.characterId && characters.find((x) => x.id === c.characterId);
  if (!ch) {
    // Monsters: only the DM's browser has their stat blocks.
    const monster = isDm && c.monsterId ? monsterFor(c) : null;
    if (!monster || !parseMonsterActions(monster.notes).length) return null;
    return (container) => renderMonsterActions(container, { combatant: c, monster });
  }
  return (container) => renderActions(container, {
    character: ch,
    items,
    spells,
    canUse: ownsCharacter(ch.id),
    onToggleModifier: (modId) => send('updateCharacter', {
      id: ch.id,
      patch: { modifiers: ch.modifiers.map((m) => (m.id === modId ? { ...m, active: !m.active } : m)) },
    }),
    onSpendSlot: (level) => send('updateCharacter', {
      id: ch.id,
      patch: { spellSlots: ch.spellSlots.map((s, i) => (i === level - 1 ? { ...s, used: Math.min(s.max, s.used + 1) } : s)) },
    }),
    cast: {
      blocked: castBlockedReason(c),
      before: (sp) => !(sp.concentration && c.concentration)
        || confirm(`${c.name} is concentrating on ${c.concentration}. Casting ${sp.name} ends it. Continue?`),
      after: (sp) => {
        if (sp.concentration || !/^instant/i.test(sp.duration || '')) {
          openSpellDialog({ state, caster: c, spell: sp.name, concentration: !!sp.concentration, send, canTargetHidden: isDm });
        }
      },
    },
    onUse: (entryId) => send('updateCharacter', {
      id: ch.id,
      patch: { inventory: ch.inventory.map((e) => (e.id === entryId ? { ...e, qty: Math.max(0, e.qty - 1) } : e)) },
    }),
  });
}
