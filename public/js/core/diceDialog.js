// "Roll my own dice": the dialog that asks for the results of the dice an
// action needs (core/dice.js rollBatch). Importing this module registers it;
// pages that roll dice import it once. Builds its <dialog> on first use.
import { setDiceAsker, randomDie } from './dice.js';

const $ = (id) => document.getElementById(id);

function ensureDialog() {
  if ($('diceDlg')) return $('diceDlg');
  const dlg = document.createElement('dialog');
  dlg.id = 'diceDlg';
  dlg.className = 'spell-dlg dice-dlg';
  dlg.innerHTML = `
    <form method="dialog" id="diceForm" novalidate>
      <h3 id="diceDlgTitle">Your dice</h3>
      <div class="spell-dlg-sub">Roll these and enter what each die shows.</div>
      <div class="dice-rows" id="diceRows"></div>
      <div class="dice-msg" id="diceMsg"></div>
      <div class="spell-dlg-btns">
        <button type="button" class="btn secondary small" id="diceRollRest" title="Fill the empty ones with random rolls">🎲 Roll the rest for me</button>
        <button type="button" class="btn secondary small" id="diceCancel">Cancel</button>
        <button type="submit" class="btn small" id="diceOk">OK</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  return dlg;
}

// [{ sides, label }] -> Promise<[values] | null>
function askDice(need, title) {
  const dlg = ensureDialog();
  $('diceDlgTitle').textContent = title || 'Your dice';
  $('diceMsg').textContent = '';
  const rows = $('diceRows');
  rows.innerHTML = '';
  const inputs = need.map((n, i) => {
    const row = document.createElement('label');
    row.className = 'dice-row';
    const name = document.createElement('span');
    name.className = 'dice-name';
    name.textContent = n.label || `d${n.sides}`;
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = '1';
    input.max = String(n.sides);
    input.placeholder = `1–${n.sides}`;
    input.setAttribute('aria-label', `${name.textContent} (${i + 1} of ${need.length})`);
    row.append(name, input);
    rows.appendChild(row);
    return input;
  });

  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      $('diceForm').onsubmit = null;
      $('diceCancel').onclick = null;
      $('diceRollRest').onclick = null;
      dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(value);
    };
    $('diceRollRest').onclick = () => {
      inputs.forEach((inp, i) => { if (inp.value === '') inp.value = randomDie(need[i].sides); });
    };
    $('diceCancel').onclick = () => finish(null);
    dlg.onclose = () => finish(null); // Esc
    $('diceForm').onsubmit = (e) => {
      const values = inputs.map((inp) => parseInt(inp.value, 10));
      const bad = values.findIndex((v, i) => !Number.isInteger(v) || v < 1 || v > need[i].sides);
      if (bad >= 0) {
        e.preventDefault();
        $('diceMsg').textContent = `Enter a number from 1 to ${need[bad].sides} for ${need[bad].label || 'd' + need[bad].sides}.`;
        inputs[bad].focus();
        return;
      }
      e.preventDefault();
      finish(values);
    };
    dlg.showModal();
    if (inputs[0]) inputs[0].focus();
  });
}

setDiceAsker(askDice);
