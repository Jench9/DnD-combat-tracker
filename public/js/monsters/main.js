// Monsters page: the saved monster library (name, AC, HP, initiative
// bonus, icon, notes). Monsters are added to fights from the combat page.
import { creatureIcon } from '../core/creatureIcons.js';
import { parseMonsterActions, renderMonsterActions } from '../core/monsterActions.js';
import { $, uid, debounce } from '../core/dom.js';
import { renderNav } from '../core/nav.js';
import { connectSocket } from '../core/socket.js';
import { resizeToDataUrl } from '../core/image.js';
import { isDm } from '../core/identity.js';

renderNav();

// The monster library is DM-only (the server doesn't send it to players).
if (isDm()) {
  start();
} else {
  $('monGrid').innerHTML = '<div class="empty-lg"><div class="big-icon">🔒</div>Only the DM can see the monster library.</div>';
}

function start() {
  let monsters = [];
  let openId = null;

  // input id -> [monster prop, isNumber]
  const FIELDS = {
    mName: ['name', false], mAC: ['ac', true], mHP: ['hpMax', true], mInit: ['initBonus', true], mNotes: ['notes', false],
  };

  const signed = (n) => (n >= 0 ? '+' : '') + n;
  const current = () => monsters.find((m) => m.id === openId);

  function setConn(live) {
    $('connDot').classList.toggle('live', live);
    $('connLabel').textContent = live ? 'Live' : 'Connecting…';
  }

  const socket = connectSocket({
    onStatus: setConn,
    handlers: {
      monsterState: (msg) => {
        monsters = msg.monsters;
        refreshTypeFilter();
        if (openId && !current()) closeEditor();
        renderGrid();
        refreshEditor();
      },
    },
  });

  function patch(p) {
    const m = current();
    if (!m) return;
    Object.assign(m, p); // optimistic; the server echo is authoritative
    socket.send('updateMonster', { id: m.id, patch: p });
    renderGrid();
  }

  // ---- grid
  function iconNode(m, cls) {
    const d = document.createElement('div');
    d.className = 'mon-icon ' + cls;
    if (m.icon) {
      const img = document.createElement('img');
      img.src = m.icon;
      img.alt = '';
      d.appendChild(img);
    } else {
      d.textContent = creatureIcon(m);
    }
    return d;
  }

  // Type filter options from what's in the library (beast, dragon, …).
  function refreshTypeFilter() {
    const sel = $('typeFilter');
    const keep = sel.value;
    const types = [...new Set(monsters.map((m) => m.creatureType).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All types</option>';
    types.forEach((t) => {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t[0].toUpperCase() + t.slice(1) + (t.endsWith('s') ? '' : 's');
      sel.appendChild(o);
    });
    sel.value = types.includes(keep) ? keep : '';
  }

  // Large libraries (the SRD has ~675 creatures) render the first matches only.
  const MAX_SHOWN = 120;

  function renderGrid() {
    const grid = $('monGrid');
    grid.innerHTML = '';
    if (monsters.length === 0) {
      $('monCount').textContent = '';
      grid.innerHTML = '<div class="empty-lg"><div class="big-icon">🐉</div>No monsters yet — create one with “+ New monster”, '
        + 'or add every SRD creature with “+ SRD creatures”.</div>';
      return;
    }
    const q = $('monSearch').value.trim().toLowerCase();
    const type = $('typeFilter').value;
    const ed = $('editionFilter').value;
    const shown = monsters.filter((m) => (!q || m.name.toLowerCase().includes(q))
      && (!type || m.creatureType === type)
      && (!ed || (ed === 'custom' ? !m.edition : m.edition === ed)));
    $('monCount').textContent = shown.length > MAX_SHOWN
      ? `Showing ${MAX_SHOWN} of ${shown.length} — search or filter to narrow it down.`
      : `${shown.length} monster${shown.length === 1 ? '' : 's'}`;
    shown.slice(0, MAX_SHOWN).forEach((m) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mon-card' + (m.id === openId ? ' open' : '');
      card.addEventListener('click', () => openEditor(m.id));
      card.appendChild(iconNode(m, 'small'));
      const body = document.createElement('div');
      body.className = 'mon-card-body';
      const name = document.createElement('div');
      name.className = 'mon-card-name';
      name.textContent = m.name || 'Unnamed monster';
      const stats = document.createElement('div');
      stats.className = 'mon-card-stats';
      stats.innerHTML = `<span><b>${m.ac}</b> AC</span><span><b>${m.hpMax}</b> HP</span><span><b>${signed(m.initBonus)}</b> init</span>`
        + (m.cr ? `<span><b>${m.cr}</b> CR</span>` : '');
      body.append(name, stats);
      const acts = actionSummary(m);
      if (acts) {
        const line = document.createElement('div');
        line.className = 'mon-card-actions';
        line.textContent = acts;
        body.appendChild(line);
      }
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  // "Bite +14 · Claw +14 · Fire Breath DC 21 ⟳" — the main actions at a
  // glance (Multiattack left out), parsed once per stat block.
  const summaries = new Map(); // notes -> text
  function actionSummary(m) {
    if (!m.notes) return '';
    if (summaries.has(m.notes)) return summaries.get(m.notes);
    const actions = (parseMonsterActions(m.notes).find((s) => s.title === 'Actions') || { entries: [] }).entries
      .filter((e) => !/^multiattack/i.test(e.name) && (e.attack || e.save || e.damage.length));
    const label = (e) => e.name.replace(/\s*\((?:Recharge|Recharges|\d+\/Day)[^)]*\)/i, '')
      + (e.attack ? ` +${e.attack.toHit}` : e.save ? ` DC ${e.save.dc}` : '') + (e.recharge ? ' ⟳' : '');
    const shown = actions.slice(0, 3).map(label).join(' · ') + (actions.length > 3 ? ` · +${actions.length - 3} more` : '');
    summaries.set(m.notes, shown);
    return shown;
  }

  // ---- editor
  function setIcon(src) {
    $('iconImg').hidden = !src;
    if (src) $('iconImg').src = src; else $('iconImg').removeAttribute('src');
    $('iconPh').hidden = !!src;
    $('iconRemove').hidden = !src;
    const m = current();
    $('iconEmoji').textContent = m ? creatureIcon(m) : '';
  }

  // The open monster's actions with roll buttons (redrawn when its stat
  // block or name changes; roll results are kept across redraws).
  let drawnActions = '';
  function renderActionsPanel(m) {
    const sig = m.id + '\n' + m.name + '\n' + m.notes;
    if (sig === drawnActions) return;
    drawnActions = sig;
    const has = parseMonsterActions(m.notes).length > 0;
    $('monActions').hidden = !has;
    if (has) renderMonsterActions($('monActionsBody'), { combatant: { id: 'lib-' + m.id, name: m.name || 'Monster' }, monster: m });
  }

  // Fill the form from state, skipping the field being typed in.
  function refreshEditor() {
    const m = current();
    if (!m) return;
    Object.entries(FIELDS).forEach(([id, [prop]]) => {
      if (document.activeElement !== $(id)) $(id).value = m[prop];
    });
    setIcon(m.icon);
    renderActionsPanel(m);
  }

  function openEditor(id) {
    openId = id;
    $('editor').hidden = false;
    refreshEditor();
    renderGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeEditor() {
    openId = null;
    $('editor').hidden = true;
    renderGrid();
  }

  Object.entries(FIELDS).forEach(([id, [prop, isNumber]]) => {
    const el = $(id);
    const commit = debounce(() => {
      if (isNumber && el.value === '') return; // wait for a number
      patch({ [prop]: isNumber ? parseInt(el.value, 10) : el.value });
    }, 300);
    el.addEventListener('input', commit);
    el.addEventListener('blur', () => setTimeout(refreshEditor, 350)); // show the clamped value
  });

  $('newMonsterBtn').addEventListener('click', () => {
    const id = uid();
    monsters.unshift({ id, name: '', ac: 12, hpMax: 10, initBonus: 0, icon: '', notes: '' }); // optimistic
    socket.send('addMonster', { id });
    openEditor(id);
    $('mName').focus();
  });

  $('starterBtn').addEventListener('click', () => socket.send('addStarterMonsters'));

  $('doneBtn').addEventListener('click', closeEditor);

  $('deleteMonsterBtn').addEventListener('click', () => {
    const m = current();
    if (!m || !confirm('Delete "' + (m.name || 'this monster') + '"? Monsters already in a fight stay there.')) return;
    socket.send('deleteMonster', { id: m.id });
    closeEditor();
  });

  $('iconBtn').addEventListener('click', () => $('iconInput').click());
  $('iconInput').addEventListener('change', async () => {
    const file = $('iconInput').files[0];
    $('iconInput').value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeToDataUrl(file, 256);
      setIcon(dataUrl);
      patch({ icon: dataUrl });
    } catch {
      alert('Could not read that image.');
    }
  });
  $('iconRemove').addEventListener('click', () => { setIcon(''); patch({ icon: '' }); });

  ['monSearch', 'typeFilter', 'editionFilter'].forEach((id) => $(id).addEventListener('input', renderGrid));

  renderGrid();
}
