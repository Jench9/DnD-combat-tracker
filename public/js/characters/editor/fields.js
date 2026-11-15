// Editor: plain text/number inputs bound to character props.
import { $, debounce } from '../../core/dom.js';
import { hpClass } from '../rules.js';
import { cur, patchChar, touch } from '../store.js';
import { updateDerived, renderSaves, renderSkills } from './abilities.js';

// field id -> [character prop, isNumber]
export const FIELD_MAP = {
  csName: ['name', false], csRace: ['race', false], csClass: ['class', false],
  csLevel: ['level', true], csBackground: ['background', false], csAlignment: ['alignment', false],
  csAC: ['ac', true], csSpeed: ['speed', true], csHitDice: ['hitDice', false],
  csHpMax: ['hpMax', true], csHpCur: ['hpCurrent', true], csHpTemp: ['hpTemp', true],
  csNotes: ['notes', false],
};

export function updateHpBar() {
  const max = parseInt($('csHpMax').value, 10) || 0;
  const now = parseInt($('csHpCur').value, 10) || 0;
  const pct = max > 0 ? Math.max(0, Math.min(100, (now / max) * 100)) : 0;
  const f = $('hpFill');
  f.style.width = pct + '%';
  f.className = 'fill' + hpClass(pct);
}

export function bindFields(ch) {
  Object.entries(FIELD_MAP).forEach(([id, [prop, isNumber]]) => {
    const el = $(id);
    el.value = ch[prop];
    const commit = debounce(() => {
      patchChar({ [prop]: isNumber ? (parseInt(el.value, 10) || 0) : el.value });
    }, 300);
    el.oninput = () => {
      const c = cur();
      if (c) { c[prop] = isNumber ? (parseInt(el.value, 10) || 0) : el.value; touch('f:' + prop); }
      if (prop === 'level' && c) {
        c.level = parseInt(el.value, 10) || 1;
        updateDerived(c);
        renderSaves(c);
        renderSkills(c);
      }
      if (prop === 'hpMax' || prop === 'hpCurrent') updateHpBar();
      commit();
    };
  });
}

// Update inputs from server state, skipping the one being typed in.
export function refreshFields(ch) {
  Object.entries(FIELD_MAP).forEach(([id, [prop]]) => {
    const el = $(id);
    if (document.activeElement !== el) el.value = ch[prop];
  });
}
