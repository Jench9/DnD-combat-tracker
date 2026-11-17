// The spell dialog of the combat tracker: concentration and spell effects.
//
//   openSpellDialog({ state, caster, spell, concentration, send, canTargetHidden })
//     after casting (or "Concentrating on…"): pick who the spell affects.
//     With concentration → setConcentration (the targets' icons end with it);
//     without → addEffect on each target.
//   openSpellDialog({ state, target, send })
//     "Spell effect…" on a row: put an effect on that combatant by hand.
import { $ } from '../core/dom.js';
import { effectIcon } from '../core/effects.js';

// Conditions that stop a creature from casting (and end concentration);
// the server has the same list (combat/service.js ENDS_CONCENTRATION).
export const ENDS_CONCENTRATION_CONDITIONS = ['Incapacitated', 'Paralyzed', 'Petrified', 'Stunned', 'Unconscious'];

let current = null; // { caster, target, send }

export function openSpellDialog({ state, caster = null, target = null, spell = '', concentration = false, send, canTargetHidden = false }) {
  const dlg = $('spellDlg');
  current = { caster, target, send };
  $('spellDlgTitle').textContent = target ? 'Spell effect on ' + target.name
    : (concentration ? caster.name + ' concentrates on…' : caster.name + ' casts…');
  $('spellDlgName').value = spell;
  $('spellDlgConc').checked = concentration;
  $('spellDlgConc').parentElement.hidden = !!target;
  $('spellDlgTargetsLbl').hidden = !!target;

  const list = $('spellDlgTargets');
  list.innerHTML = '';
  if (!target) {
    state.combatants
      .filter((c) => canTargetHidden || !c.hidden)
      .forEach((c) => {
        const label = document.createElement('label');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = c.id;
        label.append(box, document.createTextNode(c.name + (c.id === caster.id ? ' (self)' : '')));
        list.appendChild(label);
      });
  }
  const updateIcon = () => {
    const name = $('spellDlgName').value.trim();
    $('spellDlgOk').textContent = name ? 'Apply ' + effectIcon(name) : 'Apply';
  };
  $('spellDlgName').oninput = updateIcon;
  updateIcon();
  dlg.showModal();
  if (!spell) $('spellDlgName').focus();
}

function apply() {
  if (!current) return;
  const { caster, target, send } = current;
  const name = $('spellDlgName').value.trim();
  if (!name) return;
  if (target) {
    send('addEffect', { id: target.id, name });
    return;
  }
  const targets = [...$('spellDlgTargets').querySelectorAll('input:checked')].map((b) => b.value);
  if ($('spellDlgConc').checked) send('setConcentration', { id: caster.id, spell: name, targets });
  else targets.forEach((id) => send('addEffect', { id, name, casterId: caster.id }));
}

$('spellForm').addEventListener('submit', () => { apply(); current = null; });
$('spellDlgCancel').addEventListener('click', () => { $('spellDlg').close(); current = null; });
