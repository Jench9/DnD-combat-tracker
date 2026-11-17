// The spell dialog (Combat Tracker and Battle Map): concentration and
// spell effects. Builds its own <dialog> the first time it opens.
//
//   openSpellDialog({ state, caster, spell, concentration, send, canTargetHidden })
//     after casting (or "Concentrating on…"): pick who the spell affects.
//     With concentration → setConcentration (the targets' icons end with it);
//     without → addEffect on each target.
//   openSpellDialog({ state, target, send })
//     "Spell effect…" on a row: put an effect on that combatant by hand.
import { effectIcon } from './effects.js';

// Conditions that stop a creature from casting (and end concentration);
// the server has the same list (combat/service.js ENDS_CONCENTRATION).
export const ENDS_CONCENTRATION_CONDITIONS = ['Incapacitated', 'Paralyzed', 'Petrified', 'Stunned', 'Unconscious'];

let current = null; // { caster, target, send }

const $ = (id) => document.getElementById(id);

function ensureDialog() {
  if ($('spellDlg')) return;
  const dlg = document.createElement('dialog');
  dlg.id = 'spellDlg';
  dlg.className = 'spell-dlg';
  dlg.innerHTML = `
    <form method="dialog" id="spellForm">
      <h3 id="spellDlgTitle">Spell</h3>
      <label class="spell-dlg-field">Spell
        <input id="spellDlgName" maxlength="40" autocomplete="off" required>
      </label>
      <label class="spell-dlg-check"><input type="checkbox" id="spellDlgConc"> Concentration (ends when the caster stops concentrating)</label>
      <div class="spell-dlg-sub" id="spellDlgTargetsLbl">Targets (they get the spell's icon)</div>
      <div class="spell-dlg-targets" id="spellDlgTargets"></div>
      <div class="spell-dlg-btns">
        <button type="button" class="btn secondary small" id="spellDlgCancel">Cancel</button>
        <button type="submit" class="btn small" id="spellDlgOk">Apply</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  $('spellForm').addEventListener('submit', () => { apply(); current = null; });
  $('spellDlgCancel').addEventListener('click', () => { dlg.close(); current = null; });
}

export function openSpellDialog({ state, caster = null, target = null, spell = '', concentration = false, send, canTargetHidden = false }) {
  ensureDialog();
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
