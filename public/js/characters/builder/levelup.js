// Level up dialog: pick the class to gain a level in (or a new one —
// multiclassing), then answer what that level asks for (hit points,
// subclass, feat / ability increase, fighting style, expertise, skills,
// spells). The plan comes from GET /api/builder/plan; POST /levelup applies
// it and the server checks every answer again.
//
//   openLevelUp(character, { onDone(character, summary) })
import { SKILLS } from '../rules.js';
import { rollBatch, rollDie, RollCancelled } from '../../core/dice.js';
import {
  api, el, details, section, checkList, cards, select, spellPicker, featExtras, increasePicker, makeDialog, button,
} from './common.js';

const ALL_SKILLS = SKILLS.map(([n]) => n);

export async function openLevelUp(ch, { onDone } = {}) {
  const d = makeDialog('levelUpDlg', `Level up — ${ch.name || 'character'}`);
  d.dlg.classList.add('wide');
  d.body.appendChild(el('div', 'b-hint', 'Loading…'));
  d.dlg.showModal();

  let info;
  try {
    info = await api(`/plan?id=${encodeURIComponent(ch.id)}`);
  } catch (e) {
    d.body.innerHTML = '';
    d.msg.textContent = e.message;
    return;
  }
  if (!info.hasClass) {
    d.body.innerHTML = '';
    d.body.appendChild(el('p', '', 'This sheet has no class yet. Use ✨ Guided creation, or type the class (e.g. "Fighter 3") in the sheet first.'));
    return;
  }
  if (info.level >= 20) {
    d.body.innerHTML = '';
    d.body.appendChild(el('p', '', 'Already level 20.'));
    return;
  }

  const takenSpells = new Set((ch.spells || []).map((s) => s.spellId));
  let classKey = (info.classes.find((c) => info.options.some((o) => o.key === c.key && !o.blocked)) || {}).key || '';
  let plan = null;
  let a = null; // answers

  async function loadPlan() {
    plan = null;
    d.msg.textContent = '';
    a = { classKey, hp: { method: 'average' }, feat: { key: '' }, spells: { cantrips: [], spells: [] }, expertise: [], skills: [] };
    if (!classKey) { draw(); return; }
    try {
      plan = await api(`/plan?id=${encodeURIComponent(ch.id)}&class=${encodeURIComponent(classKey)}`);
    } catch (e) {
      d.msg.textContent = e.message;
    }
    draw();
  }

  function draw() {
    const top = d.body.scrollTop;
    d.body.innerHTML = '';
    d.steps.innerHTML = '';
    d.steps.appendChild(el('span', 'b-step on', `Level ${info.level} → ${info.level + 1}`));

    // Which class.
    const s = section('Which class?');
    const mine = info.options.filter((o) => o.level > 0);
    const others = info.options.filter((o) => o.level === 0);
    s.appendChild(cards(mine.map((o) => ({ key: o.key, title: `${o.name} ${o.level} → ${o.level + 1}`, disabled: o.blocked || false })), classKey, (k) => { classKey = k; loadPlan(); }, { name: 'lu-class' }));
    const mc = details('Multiclass into a new class', '', !mine.some((o) => o.key === classKey) && !!classKey);
    mc.appendChild(cards(others.map((o) => ({ key: o.key, title: o.name, disabled: o.blocked || false })), classKey, (k) => { classKey = k; loadPlan(); }, { name: 'lu-class' }));
    s.appendChild(mc);
    const unknown = info.classes.filter((c) => !info.options.some((o) => o.key === c.key));
    if (unknown.length) s.appendChild(el('div', 'b-hint', `${unknown.map((c) => c.name).join(', ')}: not in the SRD rules — level it up by hand on the sheet.`));
    d.body.appendChild(s);

    if (plan) drawPlan();
    d.btns.innerHTML = '';
    d.btns.appendChild(button('Cancel', 'secondary', () => d.dlg.close()));
    d.btns.appendChild(el('span', 'b-spacer'));
    if (plan) d.btns.appendChild(button(`⬆ Become ${plan.className} ${plan.newClassLevel}`, '', confirm));
    d.body.scrollTop = top;
  }

  function drawPlan() {
    const head = section(`${plan.className} ${plan.newClassLevel}${plan.isNewClass ? ' (new class)' : ''} · character level ${plan.newTotalLevel}`);
    if (plan.features.length) plan.features.forEach((f) => head.appendChild(details(f.name, f.desc)));
    else head.appendChild(el('div', 'b-hint', 'No new class features at this level (spell slots and counters may still go up).'));
    d.body.appendChild(head);

    const subChoices = [];
    plan.choices.forEach((c) => {
      if (c.type === 'hp') d.body.appendChild(hpSection(c));
      if (c.type === 'subclass') {
        d.body.appendChild(subclassSection());
        const chosen = (plan.subclasses || []).find((x) => x.key === a.subclass);
        if (chosen) subChoices.push(...chosen.choices);
      }
    });
    [...plan.choices, ...subChoices].forEach((c) => {
      if (c.type === 'feat') d.body.appendChild(featSection(c));
      if (c.type === 'fightingStyle') d.body.appendChild(fightingStyleSection(c));
      if (c.type === 'expertise') {
        const s = section('Expertise', `Double proficiency in ${c.count} skill${c.count === 1 ? '' : 's'} you're proficient in.`);
        s.appendChild(checkList(c.options, a.expertise, c.count, (v) => { a.expertise = v; }));
        d.body.appendChild(s);
      }
      if (c.type === 'skills') {
        const s = section(plan.isNewClass ? `${plan.className} multiclass skill` : 'Skill proficiencies', `Choose ${c.count}.`);
        s.appendChild(checkList(c.from, a.skills, c.count, (v) => { a.skills = v; }, { disabled: (x) => ((ch.skillProf || {})[x] ? 'Already proficient' : '') }));
        d.body.appendChild(s);
      }
      if (c.type === 'spells') {
        const s = section('New spells', c.list === 'wizard' ? 'Wizards add two spells to their spellbook each level.' : 'Spells you can now prepare (you can also swap others on the sheet).');
        if (c.cantrips) s.appendChild(spellPicker({ title: `Cantrip${c.cantrips > 1 ? 's' : ''}`, listKey: c.list, cantrip: true, count: c.cantrips, selected: a.spells.cantrips, taken: takenSpells, onChange: (v) => { a.spells.cantrips = v; } }));
        if (c.spells) s.appendChild(spellPicker({ title: `Spell${c.spells > 1 ? 's' : ''} (up to level ${c.maxLevel})`, listKey: c.list, cantrip: false, maxLevel: c.maxLevel, count: c.spells, selected: a.spells.spells, taken: takenSpells, onChange: (v) => { a.spells.spells = v; } }));
        d.body.appendChild(s);
      }
    });
    if (plan.notes.length) {
      const n = section('By hand');
      plan.notes.forEach((t) => n.appendChild(el('div', 'b-facts', '• ' + t)));
      d.body.appendChild(n);
    }
  }

  function hpSection(c) {
    const s = section('Hit points', `Constitution modifier ${c.conMod >= 0 ? '+' : ''}${c.conMod} is added either way (at least 1 HP).`);
    const opts = [
      { key: 'average', title: `Take the average: ${c.average}`, sub: `+${Math.max(1, c.average + c.conMod)} HP` },
      { key: 'roll', title: `Roll a d${c.die}`, sub: a.hp.roll ? `Rolled ${a.hp.roll} → +${Math.max(1, a.hp.roll + c.conMod)} HP` : 'Roll when you pick this' },
    ];
    s.appendChild(cards(opts, a.hp.method, async (k) => {
      if (k === 'roll' && !a.hp.roll) {
        try {
          a.hp.roll = await rollBatch(`Hit points: d${c.die}`, () => rollDie(c.die, `d${c.die} hit points`));
        } catch (e) {
          if (!(e instanceof RollCancelled)) throw e;
          a.hp = { method: 'average' };
          draw();
          return;
        }
      }
      a.hp.method = k;
      draw();
    }, { name: 'lu-hp' }));
    if (a.hp.method === 'roll') s.appendChild(el('div', 'b-hint', 'The roll is kept — no rerolls.'));
    return s;
  }

  function subclassSection() {
    const s = section(`${plan.className} subclass`, 'The SRD has one subclass per class. For one from a book, choose "Other" and add its features to the sheet yourself.');
    const opts = (plan.subclasses || []).map((x) => ({ key: x.key, title: x.name, sub: x.summary }));
    opts.push({ key: 'custom', title: 'Other (from a book)', sub: 'Name only' });
    s.appendChild(cards(opts, a.subclass, (k) => { a.subclass = k; a.skills = []; a.fightingStyle = ''; draw(); }, { name: 'lu-sub' }));
    const chosen = (plan.subclasses || []).find((x) => x.key === a.subclass);
    if (chosen) {
      if (chosen.desc) s.appendChild(el('div', 'b-desc', chosen.desc));
      chosen.features.forEach((f) => s.appendChild(details(f.name, f.desc)));
    }
    if (a.subclass === 'custom') {
      const inp = el('input', 'b-text');
      inp.placeholder = 'Subclass name, e.g. Battle Master';
      inp.maxLength = 60;
      inp.value = a.subclassName || '';
      inp.addEventListener('input', () => { a.subclassName = inp.value; });
      s.appendChild(inp);
    }
    return s;
  }

  function featSection(c) {
    const s = section(c.slot === 'boon' ? 'Epic Boon' : 'Ability Score Improvement or a feat',
      c.slot === 'boon' ? 'An Epic Boon feat (or another feat you qualify for).' : 'Take +2 / +1+1 to abilities (max 20), or a feat you qualify for.');
    const opts = c.options.map((o) => ({ value: o.key, label: o.ok ? o.name : `${o.name} — ${o.why}`, disabled: !o.ok }));
    opts.push({ value: 'custom', label: 'Other feat (not in the SRD)…' });
    s.appendChild(select(opts, a.feat.key, (v) => { a.feat = { key: v }; draw(); }));
    const feat = c.options.find((o) => o.key === a.feat.key);
    if (feat) {
      s.appendChild(details(`${feat.name} — rules`, feat.desc));
      s.appendChild(featExtras(feat, a.feat, { abilities: ch.abilities, skillProf: ch.skillProf || {}, allSkills: ALL_SKILLS, takenSpells }, draw));
    }
    if (a.feat.key === 'custom') {
      const inp = el('input', 'b-text');
      inp.placeholder = 'Feat name';
      inp.maxLength = 60;
      inp.value = a.feat.name || '';
      inp.addEventListener('input', () => { a.feat.name = inp.value; });
      s.appendChild(inp);
      s.appendChild(el('div', 'b-hint', 'Optional, if the feat raises an ability:'));
      s.appendChild(increasePicker({ kind: 'one', abilities: ch.abilities, value: a.feat.plus, onChange: (p) => { a.feat.plus = p; } }));
    }
    return s;
  }

  function fightingStyleSection(c) {
    const s = section('Fighting Style');
    const opts = c.options.map((o) => ({ value: o.key, label: o.ok ? o.name : `${o.name} — already taken`, disabled: !o.ok }));
    if (c.alternative) opts.push({ value: 'custom', label: `${c.alternative} (instead of a feat)` });
    s.appendChild(select(opts, a.fightingStyle, (v) => { a.fightingStyle = v; draw(); }));
    const f = c.options.find((o) => o.key === a.fightingStyle);
    if (f) s.appendChild(details(`${f.name} — rules`, f.desc));
    return s;
  }

  async function confirm() {
    const btn = d.btns.lastElementChild;
    btn.disabled = true;
    d.msg.textContent = '';
    const answers = { ...a };
    if (!plan.choices.some((c) => c.type === 'feat')) delete answers.feat;
    try {
      const { character, summary } = await api('/levelup', { id: ch.id, answers });
      d.dlg.close();
      if (onDone) onDone(character, summary);
    } catch (e) {
      d.msg.textContent = e.message;
      btn.disabled = false;
    }
  }

  d.body.innerHTML = '';
  await loadPlan();
}
