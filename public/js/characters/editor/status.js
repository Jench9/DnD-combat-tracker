// Quick status on the sheet: Heroic Inspiration (toggle), Exhaustion
// (0–6, rules text for the character's edition) and coins.
import { $, debounce } from '../../core/dom.js';
import { cur, patchChar, touch } from '../store.js';
import { exhaustionText, effectiveSpeed } from '../../core/exhaustion.js';

const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'];

export function initStatus() {
  $('csInspiration').addEventListener('click', () => {
    const c = cur();
    if (!c) return;
    c.inspiration = !c.inspiration;
    touch('f:inspiration');
    patchChar({ inspiration: c.inspiration });
    refreshStatusUi(c);
  });
  $('csExhaustion').addEventListener('change', () => {
    const c = cur();
    if (!c) return;
    c.exhaustion = parseInt($('csExhaustion').value, 10) || 0;
    touch('f:exhaustion');
    patchChar({ exhaustion: c.exhaustion });
    refreshStatusUi(c);
  });
  const sendCoins = debounce(() => { const c = cur(); if (c) patchChar({ currency: c.currency }); }, 300);
  COINS.forEach((k) => {
    $('coin-' + k).addEventListener('input', () => {
      const c = cur();
      if (!c) return;
      c.currency = { ...(c.currency || {}), [k]: Math.max(0, parseInt($('coin-' + k).value, 10) || 0) };
      touch('f:currency');
      sendCoins();
    });
  });
}

export function refreshStatusUi(c) {
  const on = !!c.inspiration;
  $('csInspiration').textContent = (on ? '★' : '☆') + ' Heroic Inspiration';
  $('csInspiration').classList.toggle('on', on);
  $('csInspiration').setAttribute('aria-pressed', String(on));
  const lvl = c.exhaustion || 0;
  if (document.activeElement !== $('csExhaustion')) $('csExhaustion').value = String(lvl);
  $('csExhaustion').title = exhaustionText(Math.max(1, lvl), c.rulesEdition);
  const speed = effectiveSpeed(c);
  $('exhText').textContent = lvl ? exhaustionText(lvl, c.rulesEdition) + (speed !== (c.speed || 0) ? ` Speed now ${speed} ft.` : '') : '';
  $('exhText').classList.toggle('bad', lvl > 0);
  COINS.forEach((k) => {
    const el = $('coin-' + k);
    if (document.activeElement !== el) el.value = (c.currency && c.currency[k]) || 0;
  });
}
