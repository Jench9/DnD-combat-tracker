// Guided character creation (2024 rules, SRD 5.2): a step-by-step dialog
// that ends in POST /api/builder/create. The server checks the whole build
// again and answers with the character (or a message).
//
//   openCreator({ id?, campaignId, onDone(character) })
//     id: fill in this blank sheet (a new player's) instead of making a new one
import { SKILLS, abilityMod, fmtMod } from '../rules.js';
import { rollBatch, rollDie, RollCancelled } from '../../core/dice.js';
import {
  ABILITY_NAMES, ABILITY_KEYS, loadRules, api, el, details, section, checkList, cards, select,
  spellPicker, featExtras, makeDialog, button, withSource,
} from './common.js';

const STANDARD = [15, 14, 13, 12, 10, 8];
const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const ALL_SKILLS = SKILLS.map(([n]) => n);
const ALIGNMENTS = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned'];
const MI_LIST_NAME = { cleric: 'Cleric', druid: 'Druid', wizard: 'Wizard' };

export async function openCreator({ id = '', campaignId = '', onDone } = {}) {
  let rules;
  try {
    rules = await loadRules();
  } catch (e) {
    alert(e.message);
    return;
  }
  const classOf = (k) => rules.classes.find((c) => c.key === k);
  const speciesOf = (k) => rules.species.find((s) => s.key === k);
  const bgOf = (k) => rules.backgrounds.find((b) => b.key === k);
  const featOf = (k) => rules.feats.find((f) => f.key === k);

  // Everything the player picks; sent as the build.
  const st = {
    classKey: '', speciesKey: '', subspeciesKey: '', backgroundKey: '',
    method: 'standard', pool: [...STANDARD], assign: {}, points: Object.fromEntries(ABILITY_KEYS.map((k) => [k, 8])),
    manual: Object.fromEntries(ABILITY_KEYS.map((k) => [k, 10])),
    bonusMode: '2-1', bonus: {},
    classSkills: [], speciesSkill: '',
    originFeat: { key: '' }, backgroundFeat: {},
    level1: { fightingStyle: '', expertise: [], spells: { cantrips: [], spells: [] } },
    equipment: { class: 0, background: 0 },
    name: '', alignment: '',
  };

  // ---- derived
  const cls = () => classOf(st.classKey);
  const sp = () => speciesOf(st.speciesKey);
  const bg = () => bgOf(st.backgroundKey);
  const sub = () => (sp() ? sp().subspecies.find((s) => s.key === st.subspeciesKey) : null);
  const skillTrait = () => (sp() ? [...sp().traits, ...(sub() ? sub().traits : [])].find((t) => t.skillChoice) : null);
  const humanFeat = () => (st.speciesKey === 'human' ? featOf(st.originFeat.key) : null);
  const bgFeat = () => (bg() ? featOf(bg().feat.key) : null);

  function baseScores() {
    if (st.method === 'pointbuy') return { ...st.points };
    if (st.method === 'manual') return { ...st.manual };
    const out = {};
    for (const k of ABILITY_KEYS) {
      const i = st.assign[k];
      if (i === undefined || i === '' || st.pool[i] === undefined) return null;
      out[k] = st.pool[i];
    }
    return out;
  }
  function finalScores() {
    const base = baseScores();
    if (!base) return null;
    const out = { ...base };
    Object.entries(st.bonus).forEach(([k, v]) => { out[k] = Math.min(20, out[k] + v); });
    return out;
  }
  // Skills known before a given step (same order as the server applies them).
  function profSkills({ withClass = true, withSpecies = true, withSkilled = true } = {}) {
    const s = new Set(bg() ? bg().skills : []);
    if (withClass) st.classSkills.forEach((x) => s.add(x));
    if (withSpecies && st.speciesSkill) s.add(st.speciesSkill);
    if (withSkilled && humanFeat() && humanFeat().key === 'skilled') (st.originFeat.skills || []).forEach((x) => s.add(x));
    return s;
  }
  const level1Spells = () => {
    const c = cls();
    const row = c && c.levels[0].spells;
    if (!row) return { cantrips: 0, spells: 0 };
    return { cantrips: row.cantrips, spells: c.key === 'wizard' ? 6 : row.prepared };
  };
  const miSources = () => {
    const out = [];
    if (bgFeat() && bgFeat().key === 'magic-initiate') out.push({ who: 'background', answer: st.backgroundFeat, fixedList: (bg().feat.note || '').toLowerCase() });
    if (humanFeat() && humanFeat().key === 'magic-initiate') out.push({ who: 'species', answer: st.originFeat, fixedList: '' });
    return out;
  };

  // ---- steps
  const steps = [
    { key: 'class', title: 'Class', render: stepClass, check: () => (!cls() ? 'Choose a class.' : '') },
    { key: 'species', title: 'Species', render: stepSpecies, check: checkSpecies },
    { key: 'background', title: 'Background', render: stepBackground, check: checkBackground },
    { key: 'abilities', title: 'Abilities', render: stepAbilities, check: checkAbilities },
    { key: 'skills', title: 'Skills', render: stepSkills, check: checkSkills },
    { key: 'spells', title: 'Spells', render: stepSpells, check: checkSpells, show: () => level1Spells().cantrips + level1Spells().spells > 0 || miSources().length > 0 },
    { key: 'equipment', title: 'Equipment', render: stepEquipment, check: () => '' },
    { key: 'review', title: 'Name & review', render: stepReview, check: () => (!st.name.trim() ? 'Give your character a name.' : '') },
  ];
  const visible = () => steps.filter((s) => !s.show || s.show());
  let at = 0;

  const d = makeDialog('creatorDlg', 'New character');
  d.dlg.classList.add('wide');

  function draw() {
    const list = visible();
    at = Math.min(at, list.length - 1);
    const step = list[at];
    d.steps.innerHTML = '';
    list.forEach((s, i) => {
      const b = el('button', 'b-step' + (i === at ? ' on' : '') + (i < at ? ' done' : ''), `${i + 1}. ${s.title}`);
      b.type = 'button';
      b.disabled = i > at; // go forward with Next, so each step is checked
      b.addEventListener('click', () => { at = i; d.msg.textContent = ''; draw(); });
      d.steps.appendChild(b);
    });
    d.body.innerHTML = '';
    step.render(d.body);
    d.btns.innerHTML = '';
    if (at > 0) d.btns.appendChild(button('← Back', 'secondary', () => { at -= 1; d.msg.textContent = ''; draw(); }));
    d.btns.appendChild(el('span', 'b-spacer'));
    if (at < list.length - 1) {
      d.btns.appendChild(button('Next →', '', () => {
        const err = step.check();
        d.msg.textContent = err;
        if (err) return;
        at += 1;
        draw();
        d.body.scrollTop = 0;
      }));
    } else {
      d.btns.appendChild(button('✨ Create character', '', create));
    }
  }
  const redraw = () => { const top = d.body.scrollTop; draw(); d.body.scrollTop = top; };

  // ---- 1. class
  function stepClass(body) {
    const s = section('Choose a class', 'Your class decides your hit points, saving throws, skills to choose from, and what you can do. Everything here is from the SRD 5.2 (2024 rules).');
    s.appendChild(cards(rules.classes.map((c) => ({
      key: c.key, title: c.name,
      sub: `d${c.hitDie} · ${c.primaryDesc}${c.spellAbility ? ' · spells' : ''}`,
    })), st.classKey, (k) => {
      if (k !== st.classKey) { st.classKey = k; st.classSkills = []; st.level1 = { fightingStyle: '', expertise: [], spells: { cantrips: [], spells: [] } }; st.equipment.class = 0; }
      redraw();
    }));
    body.appendChild(s);
    const c = cls();
    if (!c) return;
    const info = section(`${c.name} at level 1`);
    info.appendChild(el('div', 'b-facts', `Hit die d${c.hitDie} · Saving throws: ${c.saves.map((k) => ABILITY_NAMES[k]).join(', ')} · ${c.proficiencies.join(', ')}`));
    c.levels[0].features.forEach((fk) => {
      const f = rules.features[fk];
      if (f) info.appendChild(details(f.name, f.desc));
    });
    if (c.subclasses.length) info.appendChild(el('div', 'b-hint', `Subclass at level ${c.subclassLevel} (SRD: ${c.subclasses.map((x) => x.name).join(', ')}).`));
    body.appendChild(info);
  }

  // ---- 2. species
  function stepSpecies(body) {
    const s = section('Choose a species');
    s.appendChild(cards(rules.species.map((x) => ({ key: x.key, title: x.name, sub: `${x.size} · speed ${x.speed} ft`, tag: x.source })), st.speciesKey, (k) => {
      if (k !== st.speciesKey) { st.speciesKey = k; st.subspeciesKey = ''; st.speciesSkill = ''; st.originFeat = { key: '' }; }
      redraw();
    }));
    body.appendChild(s);
    const x = sp();
    if (!x) return;
    const t = section(x.name);
    if (x.subspecies.length) {
      const what = x.subspecies[0].name.split(':')[0];
      t.appendChild(el('div', 'b-label', what));
      t.appendChild(select(x.subspecies.map((o) => ({ value: o.key, label: o.name.split(':').pop().trim() })), st.subspeciesKey, (v) => { st.subspeciesKey = v; redraw(); }));
    }
    [...x.traits, ...(sub() ? sub().traits : [])].forEach((tr) => t.appendChild(details(tr.name, tr.desc)));
    if (skillTrait()) t.appendChild(el('div', 'b-hint', `${skillTrait().name}: you'll pick the skill in the Skills step.`));
    body.appendChild(t);
    if (x.key === 'human') {
      const f = section('Versatile: an Origin feat');
      const origins = rules.feats.filter((o) => o.type === 'origin');
      f.appendChild(select(origins.map((o) => ({ value: o.key, label: withSource(o.name, o.source) })), st.originFeat.key, (v) => { st.originFeat = { key: v }; redraw(); }));
      const feat = humanFeat();
      if (feat) {
        f.appendChild(details(`${feat.name} — rules`, feat.desc));
        if (feat.key === 'skilled') f.appendChild(el('div', 'b-hint', 'Pick the three skills in the Skills step.'));
        if (feat.key === 'magic-initiate') f.appendChild(el('div', 'b-hint', 'Pick its spell list and spells in the Spells step.'));
      }
      body.appendChild(f);
    }
  }
  function checkSpecies() {
    if (!sp()) return 'Choose a species.';
    if (sp().subspecies.length && !sub()) return `Choose a ${sp().subspecies[0].name.split(':')[0].toLowerCase()}.`;
    if (sp().key === 'human' && !humanFeat()) return 'Human: choose an Origin feat (Versatile).';
    return '';
  }

  // ---- 3. background
  function stepBackground(body) {
    const s = section('Choose a background', 'Your background raises three ability scores, gives an Origin feat, two skills, a tool and starting gear.');
    s.appendChild(cards(rules.backgrounds.map((b) => ({ key: b.key, title: b.name, sub: `${b.abilities.map((k) => k.toUpperCase()).join(' / ')} · ${b.feat.name}${b.feat.note ? ` (${b.feat.note})` : ''}`, tag: b.source })), st.backgroundKey, (k) => {
      if (k !== st.backgroundKey) { st.backgroundKey = k; st.bonus = {}; st.backgroundFeat = {}; st.equipment.background = 0; }
      redraw();
    }));
    body.appendChild(s);
    const b = bg();
    if (!b) return;
    const info = section(b.name);
    info.appendChild(el('div', 'b-facts', `Skills: ${b.skills.join(', ')} · Tools: ${b.tools.join(', ') || '—'}`));
    const feat = bgFeat();
    if (feat) info.appendChild(details(`Feat: ${feat.name}${b.feat.note ? ` (${b.feat.note})` : ''}`, feat.desc));
    if (st.speciesKey === 'human' && humanFeat() && humanFeat().key === b.feat.key && !humanFeat().repeatable) {
      info.appendChild(el('div', 'b-warn', `You also picked ${humanFeat().name} as your Human feat — go back and choose another.`));
    }
    body.appendChild(info);

    const asi = section('Ability score increase', `+2 to one and +1 to another of ${b.abilities.map((k) => ABILITY_NAMES[k]).join(', ')} — or +1 to all three.`);
    const mode = select([{ value: '2-1', label: '+2 and +1' }, { value: '1-1-1', label: '+1 to all three' }], st.bonusMode, (v) => {
      st.bonusMode = v || '2-1';
      st.bonus = st.bonusMode === '1-1-1' ? Object.fromEntries(b.abilities.map((k) => [k, 1])) : {};
      redraw();
    });
    mode.querySelector('option[value=""]').remove();
    asi.appendChild(mode);
    if (st.bonusMode === '2-1') {
      const two = Object.keys(st.bonus).find((k) => st.bonus[k] === 2) || '';
      const one = Object.keys(st.bonus).find((k) => st.bonus[k] === 1) || '';
      const opts = (other) => b.abilities.map((k) => ({ value: k, label: ABILITY_NAMES[k], disabled: k === other }));
      const set = (t, o) => { st.bonus = {}; if (t) st.bonus[t] = 2; if (o && o !== t) st.bonus[o] = 1; };
      const row = el('div', 'b-row');
      row.append(el('span', 'b-label', '+2'), select(opts(one), two, (v) => { set(v, one); redraw(); }),
        el('span', 'b-label', '+1'), select(opts(two), one, (v) => { set(two, v); redraw(); }));
      asi.appendChild(row);
      if (!two && !one && cls() && cls().primary.some((k) => b.abilities.includes(k))) {
        asi.appendChild(el('div', 'b-hint', `Tip: your class's main ability is ${cls().primaryDesc}.`));
      }
    }
    body.appendChild(asi);
  }
  function checkBackground() {
    if (!bg()) return 'Choose a background.';
    if (humanFeat() && humanFeat().key === bg().feat.key && !humanFeat().repeatable) return `${humanFeat().name} comes from your background already — pick another Human feat.`;
    const v = Object.values(st.bonus).sort().join();
    if (v !== '1,2' && v !== '1,1,1') return 'Choose where the +2 and +1 go.';
    return '';
  }

  // ---- 4. abilities
  function stepAbilities(body) {
    const s = section('Ability scores');
    const mode = select([
      { value: 'standard', label: 'Standard array (15, 14, 13, 12, 10, 8)' },
      { value: 'pointbuy', label: 'Point buy (27 points)' },
      { value: 'roll', label: 'Roll 4d6, drop the lowest' },
      { value: 'manual', label: 'Enter my own' },
    ], st.method, (v) => {
      st.method = v || 'standard';
      st.assign = {};
      st.pool = st.method === 'standard' ? [...STANDARD] : st.method === 'roll' ? [] : st.pool;
      redraw();
    });
    mode.querySelector('option[value=""]').remove();
    s.appendChild(mode);
    const c = cls();
    if (c) s.appendChild(el('div', 'b-hint', `${c.name}: put your best score in ${c.primaryDesc}, then Constitution.`));
    body.appendChild(s);

    const grid = el('div', 'b-abil-grid');
    const finals = finalScores() || {};
    const scoreCell = (k) => {
      if (st.method === 'pointbuy') {
        const box = el('div', 'b-stepper');
        const minus = button('−', 'secondary', () => { if (st.points[k] > 8) { st.points[k] -= 1; redraw(); } });
        const plus = button('+', 'secondary', () => {
          const left = 27 - ABILITY_KEYS.reduce((n, a) => n + POINT_COST[st.points[a]], 0);
          if (st.points[k] < 15 && POINT_COST[st.points[k] + 1] - POINT_COST[st.points[k]] <= left) { st.points[k] += 1; redraw(); }
        });
        box.append(minus, el('b', '', String(st.points[k])), plus);
        return box;
      }
      if (st.method === 'manual') {
        const inp = el('input', 'b-num');
        inp.type = 'number';
        inp.min = '3';
        inp.max = '18';
        inp.value = st.manual[k];
        inp.addEventListener('change', () => { st.manual[k] = Math.max(3, Math.min(18, parseInt(inp.value, 10) || 10)); redraw(); });
        return inp;
      }
      const used = new Set(Object.entries(st.assign).filter(([a]) => a !== k).map(([, i]) => String(i)));
      return select(st.pool.map((v, i) => ({ value: String(i), label: String(v), disabled: used.has(String(i)) })), st.assign[k] === undefined ? '' : String(st.assign[k]), (v) => {
        if (v === '') delete st.assign[k]; else st.assign[k] = v;
        redraw();
      }, { placeholder: '—' });
    };
    ['Ability', 'Score', 'Background', 'Total', 'Mod'].forEach((h) => grid.appendChild(el('div', 'b-abil-h', h)));
    ABILITY_KEYS.forEach((k) => {
      grid.appendChild(el('div', 'b-abil-name' + (c && c.primary.includes(k) ? ' primary' : ''), ABILITY_NAMES[k]));
      const cell = el('div');
      cell.appendChild(scoreCell(k));
      grid.appendChild(cell);
      grid.appendChild(el('div', 'b-abil-bonus', st.bonus[k] ? `+${st.bonus[k]}` : ''));
      grid.appendChild(el('div', 'b-abil-total', finals[k] !== undefined ? String(finals[k]) : '—'));
      grid.appendChild(el('div', 'b-abil-mod', finals[k] !== undefined ? fmtMod(abilityMod(finals[k])) : ''));
    });
    body.appendChild(grid);

    const tools = el('div', 'b-row');
    if (st.method === 'pointbuy') {
      const left = 27 - ABILITY_KEYS.reduce((n, a) => n + POINT_COST[st.points[a]], 0);
      tools.appendChild(el('span', 'b-count' + (left === 0 ? ' done' : ''), `${left} points left`));
    }
    if (st.method === 'roll') {
      tools.appendChild(button(st.pool.length ? '🎲 Roll again' : '🎲 Roll the six scores', '', rollScores));
      if (st.pool.length) tools.appendChild(el('span', 'b-hint', `Rolled: ${st.pool.join(', ')} — now put each one on an ability.`));
    }
    if ((st.method === 'standard' || (st.method === 'roll' && st.pool.length)) && c) {
      tools.appendChild(button('Suggest for ' + c.name, 'secondary', () => { suggest(); redraw(); }));
    }
    body.appendChild(tools);
  }
  // Best score to the class's main abilities, then CON, then the rest.
  function suggest() {
    const c = cls();
    const order = [...c.primary, 'con', ...['dex', 'wis', 'str', 'cha', 'int'].filter((k) => !c.primary.includes(k))].filter((k, i, a) => a.indexOf(k) === i);
    const idx = st.pool.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
    st.assign = Object.fromEntries(order.map((k, n) => [k, String(idx[n])]));
  }
  async function rollScores() {
    try {
      const scores = await rollBatch('Ability scores: 4d6 drop the lowest, six times', () => Array.from({ length: 6 }, (_, n) => {
        const dice = Array.from({ length: 4 }, (__, j) => rollDie(6, `Score ${n + 1}, die ${j + 1}`));
        return dice.sort((a, b) => b - a).slice(0, 3).reduce((x, y) => x + y, 0);
      }));
      st.pool = scores;
      st.assign = {};
      redraw();
    } catch (e) {
      if (!(e instanceof RollCancelled)) throw e;
    }
  }
  function checkAbilities() {
    if (st.method === 'roll' && !st.pool.length) return 'Roll your scores first.';
    if (!baseScores()) return 'Put a score on every ability.';
    if (st.method === 'pointbuy' && ABILITY_KEYS.reduce((n, a) => n + POINT_COST[st.points[a]], 0) > 27) return 'Point buy: 27 points at most.';
    return '';
  }

  // ---- 5. skills & level 1 choices
  function stepSkills(body) {
    const c = cls();
    const b = bg();
    const s = section(`${c.name} skills`, `Choose ${c.skills.choose}. ${b.name} already gives ${b.skills.join(' and ')}.`);
    s.appendChild(checkList(c.skills.from, st.classSkills, Math.min(c.skills.choose, c.skills.from.filter((x) => !b.skills.includes(x)).length), (v) => {
      st.classSkills = v;
      if (st.speciesSkill && v.includes(st.speciesSkill)) st.speciesSkill = '';
      redraw(); // species skill, Skilled and Expertise depend on these
    }, { disabled: (x) => (b.skills.includes(x) ? `From ${b.name}` : '') }));
    body.appendChild(s);

    const t = skillTrait();
    if (t) {
      const sk = section(`${t.name} (${sp().name})`, t.skillChoice.desc);
      const have = profSkills({ withSpecies: false, withSkilled: false });
      sk.appendChild(select(t.skillChoice.from.map((x) => ({ value: x, label: x, disabled: have.has(x) })), st.speciesSkill, (v) => { st.speciesSkill = v; redraw(); }));
      body.appendChild(sk);
    }
    const hf = humanFeat();
    if (hf && hf.key === 'skilled') {
      const sk = section('Skilled (Human feat)');
      sk.appendChild(featExtras(hf, st.originFeat, { abilities: finalScores(), skillProf: Object.fromEntries([...profSkills({ withSkilled: false })].map((x) => [x, true])), allSkills: ALL_SKILLS, onSkills: redraw }, redraw));
      body.appendChild(sk);
    }

    if (c.levels[0].features.includes('fighter-fighting-style')) {
      const fs = section('Fighting Style', 'A Fighting Style feat. Defense is recommended.');
      const opts = rules.feats.filter((f) => f.type === 'fighting-style');
      fs.appendChild(select(opts.map((f) => ({ value: f.key, label: withSource(f.name, f.source) })), st.level1.fightingStyle, (v) => { st.level1.fightingStyle = v; redraw(); }));
      const f = featOf(st.level1.fightingStyle);
      if (f) fs.appendChild(details(`${f.name} — rules`, f.desc));
      body.appendChild(fs);
    }
    if (c.levels[0].features.includes('rogue-expertise')) {
      const ex = section('Expertise', 'Double proficiency in two skills you are proficient in.');
      const prof = [...profSkills()];
      st.level1.expertise = st.level1.expertise.filter((x) => prof.includes(x));
      ex.appendChild(checkList(ALL_SKILLS, st.level1.expertise, 2, (v) => { st.level1.expertise = v; }, { disabled: (x) => (prof.includes(x) ? '' : 'Not proficient') }));
      body.appendChild(ex);
    }
  }
  function checkSkills() {
    const c = cls();
    const need = Math.min(c.skills.choose, c.skills.from.filter((x) => !bg().skills.includes(x)).length);
    if (st.classSkills.length !== need) return `Choose ${need} ${c.name} skills.`;
    if (skillTrait() && !st.speciesSkill) return `Choose your ${skillTrait().name} skill.`;
    if (skillTrait() && profSkills({ withSpecies: false, withSkilled: false }).has(st.speciesSkill)) return `You already have ${st.speciesSkill} — choose another ${skillTrait().name} skill.`;
    const hf = humanFeat();
    if (hf && hf.key === 'skilled' && (st.originFeat.skills || []).length !== 3) return 'Skilled: choose three skills.';
    if (c.levels[0].features.includes('fighter-fighting-style') && !st.level1.fightingStyle) return 'Choose a Fighting Style.';
    if (c.levels[0].features.includes('rogue-expertise')) {
      const prof = profSkills();
      if (st.level1.expertise.length !== 2 || st.level1.expertise.some((x) => !prof.has(x))) return 'Expertise: choose two skills you are proficient in.';
    }
    return '';
  }

  // ---- 6. spells
  function stepSpells(body) {
    const c = cls();
    const n = level1Spells();
    if (n.cantrips || n.spells) {
      const s = section(`${c.name} spells`, c.key === 'wizard'
        ? 'Cantrips you know, and the six level 1 spells in your spellbook.'
        : 'Cantrips you know, and the level 1 spells you have prepared.');
      if (n.cantrips) s.appendChild(spellPicker({ title: 'Cantrips', listKey: c.key, cantrip: true, count: n.cantrips, selected: st.level1.spells.cantrips, onChange: (v) => { st.level1.spells.cantrips = v; } }));
      if (n.spells) s.appendChild(spellPicker({ title: 'Level 1 spells', listKey: c.key, cantrip: false, maxLevel: 1, count: n.spells, selected: st.level1.spells.spells, onChange: (v) => { st.level1.spells.spells = v; } }));
      body.appendChild(s);
    }
    miSources().forEach((m) => {
      const s = section(`Magic Initiate (${m.who === 'background' ? bg().name : 'Human'})`, m.fixedList ? `${MI_LIST_NAME[m.fixedList]} spells: two cantrips and one level 1 spell (you can cast it once per long rest without a slot).` : 'Choose a spell list, then two cantrips and one level 1 spell.');
      s.appendChild(featExtras(featOf('magic-initiate'), m.answer, { abilities: finalScores(), skillProf: {}, allSkills: ALL_SKILLS, fixedList: m.fixedList }, redraw));
      body.appendChild(s);
    });
  }
  function checkSpells() {
    const n = level1Spells();
    const sp1 = st.level1.spells;
    if (sp1.cantrips.length !== n.cantrips) return `Choose ${n.cantrips} cantrips.`;
    if (sp1.spells.length !== n.spells) return `Choose ${n.spells} level 1 spells.`;
    const all = [...sp1.cantrips, ...sp1.spells];
    const lists = [];
    for (const m of miSources()) {
      const mi = m.answer.magicInitiate || {};
      if (!mi.list) return 'Magic Initiate: choose a spell list.';
      if ((mi.cantrips || []).length !== 2 || !mi.spell) return 'Magic Initiate: choose two cantrips and one level 1 spell.';
      if (lists.includes(mi.list)) return 'Magic Initiate twice: use a different spell list each time.';
      lists.push(mi.list);
      all.push(...mi.cantrips, mi.spell);
    }
    if (new Set(all).size !== all.length) return 'The same spell is chosen twice — pick a different one.';
    return '';
  }

  // ---- 7. equipment
  function equipmentText(o) {
    const parts = o.items.map((i) => `${i.count > 1 ? i.count + ' × ' : ''}${i.name}${i.note ? ` (${i.note})` : ''}`);
    parts.push(...o.other);
    if (o.gp) parts.push(`${o.gp} GP`);
    return parts.join(', ');
  }
  function stepEquipment(body) {
    [[cls(), 'class'], [bg(), 'background']].forEach(([src, which]) => {
      if (!src.equipment.length) return;
      const s = section(`${src.name} starting equipment`);
      s.appendChild(cards(src.equipment[0].options.map((o, i) => ({ key: String(i), title: `Option ${String.fromCharCode(65 + i)}`, sub: equipmentText(o) })), String(st.equipment[which]), (k) => { st.equipment[which] = parseInt(k, 10); }, { name: 'eq-' + which }));
      body.appendChild(s);
    });
    body.appendChild(el('div', 'b-hint', 'Items from the library go into the Equipment tab (armor equipped); anything else is listed under "Other equipment". Gold goes into Coins.'));
  }

  // ---- 8. review
  function stepReview(body) {
    const s = section('Name & alignment');
    const name = el('input', 'b-text');
    name.type = 'text';
    name.maxLength = 60;
    name.placeholder = 'Character name';
    name.value = st.name;
    name.addEventListener('input', () => { st.name = name.value; });
    s.appendChild(name);
    s.appendChild(select(ALIGNMENTS.map((a) => ({ value: a, label: a })), st.alignment, (v) => { st.alignment = v; }, { placeholder: 'Alignment (optional)' }));
    body.appendChild(s);
    setTimeout(() => name.focus(), 0);

    const c = cls();
    const f = finalScores();
    const hp = c.hitDie + abilityMod(f.con) + (st.speciesKey === 'dwarf' ? 1 : 0);
    const r = section('Summary');
    const lines = [
      `${sp().name}${sub() ? ` (${sub().name.split(':').pop().trim()})` : ''} ${c.name} 1 · ${bg().name}`,
      `HP ${hp} · Hit die d${c.hitDie} · Speed ${sp().speed} ft`,
      ABILITY_KEYS.map((k) => `${k.toUpperCase()} ${f[k]} (${fmtMod(abilityMod(f[k]))})`).join(' · '),
      `Skills: ${[...profSkills()].sort().join(', ')}`,
      `Feats: ${[bgFeat() && bgFeat().name, humanFeat() && humanFeat().name, featOf(st.level1.fightingStyle) && featOf(st.level1.fightingStyle).name].filter(Boolean).join(', ')}`,
    ];
    lines.forEach((l) => r.appendChild(el('div', 'b-facts', l)));
    r.appendChild(el('div', 'b-hint', 'After this you can edit anything on the sheet. To start above level 1, use ⬆ Level up on the sheet.'));
    body.appendChild(r);
  }

  async function create() {
    const err = steps[steps.length - 1].check();
    d.msg.textContent = err;
    if (err) return;
    const build = {
      name: st.name.trim(), alignment: st.alignment,
      classKey: st.classKey, backgroundKey: st.backgroundKey, speciesKey: st.speciesKey, subspeciesKey: st.subspeciesKey,
      abilityMethod: st.method === 'roll' ? 'roll' : st.method,
      abilities: baseScores(),
      backgroundBonus: st.bonus,
      classSkills: st.classSkills, speciesSkill: st.speciesSkill,
      originFeat: st.speciesKey === 'human' ? st.originFeat : undefined,
      backgroundFeat: st.backgroundFeat,
      level1: st.level1,
      equipment: st.equipment,
    };
    const btn = d.btns.lastElementChild;
    btn.disabled = true;
    btn.textContent = 'Creating…';
    try {
      const { character } = await api('/create', { id: id || undefined, campaignId, build });
      d.dlg.close();
      if (onDone) onDone(character);
    } catch (e) {
      d.msg.textContent = e.message;
      btn.disabled = false;
      btn.textContent = '✨ Create character';
    }
  }

  draw();
  d.dlg.showModal();
}
