// Editor: derived tiles, ability score boxes, saving throws, skills.
import { $, debounce } from '../../core/dom.js';
import { ABILITIES, SKILLS, abilityMod, fmtMod, profBonusForLevel } from '../rules.js';
import { cur, patchChar, touch } from '../store.js';

export function updateDerived(c) {
  $('initTile').textContent = fmtMod(abilityMod(c.abilities.dex));
  $('csProf').textContent = '+' + profBonusForLevel(c.level);
}

export function renderAbilitiesGrid(ch) {
  const grid = $('abilitiesGrid');
  grid.innerHTML = '';
  ABILITIES.forEach(([key, label]) => {
    const box = document.createElement('div');
    box.className = 'ability';

    const lab = document.createElement('div');
    lab.className = 'ab-label';
    lab.textContent = label;
    box.appendChild(lab);

    const modEl = document.createElement('div');
    modEl.className = 'ab-mod';
    modEl.textContent = fmtMod(abilityMod(ch.abilities[key]));
    box.appendChild(modEl);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'ab-score bare';
    input.min = '1';
    input.max = '30';
    input.value = ch.abilities[key];
    input.dataset.ability = key;
    input.dataset.modEl = key;
    input.setAttribute('aria-label', label + ' score');
    box.appendChild(input);

    const commit = debounce(() => {
      patchChar({ abilities: { [key]: parseInt(input.value, 10) || 10 } });
    }, 300);

    input.addEventListener('input', () => {
      const val = parseInt(input.value, 10) || 10;
      modEl.textContent = fmtMod(abilityMod(val));
      const c = cur();
      if (c) { // update locally right away so saves/skills recompute instantly
        c.abilities[key] = val;
        touch('a:' + key);
        updateDerived(c);
        renderSaves(c);
        renderSkills(c);
      }
      commit();
    });
    modEl.id = 'mod-' + key;
    grid.appendChild(box);
  });
}

// Update the score inputs from server state, skipping the one being typed in.
export function refreshAbilityInputs(ch) {
  document.querySelectorAll('#abilitiesGrid .ab-score').forEach((input) => {
    if (document.activeElement !== input) {
      const key = input.dataset.ability;
      input.value = ch.abilities[key];
      $('mod-' + key).textContent = fmtMod(abilityMod(ch.abilities[key]));
    }
  });
}

function profRow(label, tag, isProf, bonus, onToggle) {
  const row = document.createElement('label');
  row.className = 'check-row' + (isProf ? ' prof' : '');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = isProf;
  cb.addEventListener('change', () => onToggle(cb.checked));
  const dot = document.createElement('span'); dot.className = 'prof-dot';
  const b = document.createElement('span'); b.className = 'bonus'; b.textContent = fmtMod(bonus);
  const nm = document.createElement('span'); nm.className = 'sname'; nm.textContent = label;
  if (tag) {
    const t = document.createElement('span'); t.className = 'ability-tag'; t.textContent = tag;
    nm.appendChild(document.createTextNode(' '));
    nm.appendChild(t);
  }
  row.append(cb, dot, b, nm);
  return row;
}

export function renderSaves(ch) {
  const wrap = $('savesList');
  wrap.innerHTML = '';
  const prof = profBonusForLevel(ch.level);
  ABILITIES.forEach(([key, label]) => {
    const isProf = !!ch.saveProf[key];
    wrap.appendChild(profRow(label, '', isProf, abilityMod(ch.abilities[key]) + (isProf ? prof : 0), (checked) => {
      const c = cur();
      if (c) { c.saveProf[key] = checked; touch('save:' + key); renderSaves(c); }
      patchChar({ saveProf: { [key]: checked } });
    }));
  });
}

export function renderSkills(ch) {
  const wrap = $('skillsList');
  wrap.innerHTML = '';
  const prof = profBonusForLevel(ch.level);
  SKILLS.forEach(([name, abilKey]) => {
    const isProf = !!ch.skillProf[name];
    wrap.appendChild(profRow(name, '(' + abilKey.toUpperCase() + ')', isProf, abilityMod(ch.abilities[abilKey]) + (isProf ? prof : 0), (checked) => {
      const c = cur();
      if (c) { c.skillProf[name] = checked; touch('skill:' + name); renderSkills(c); }
      patchChar({ skillProf: { [name]: checked } });
    }));
  });
}
