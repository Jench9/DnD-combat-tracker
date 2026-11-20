// Campaigns on the Characters page: the filter dropdown above the list, and
// (DM) the "Manage campaigns" dialog — create, rename, mark as current,
// delete, and tick which characters are in each one (a character can be in
// several). Membership is edited only here, not on the sheet.
// The filter choice is remembered per browser (localStorage).
import { $, uid } from '../core/dom.js';
import { store, ALL, NONE } from './store.js';
import { campaignsOf, inCampaign } from '../core/campaigns.js';
import { el, makeDialog, button } from './builder/common.js';

const FILTER_KEY = 'kit.campaignFilter';
let loaded = false; // campaign list received from the server at least once

function saveFilter() {
  try { localStorage.setItem(FILTER_KEY, store.campaignFilter); } catch { /* storage unavailable */ }
}

export function campaignName(id) {
  const c = store.campaigns.find((x) => x.id === id);
  return c ? c.name : '';
}

// The campaign new and imported characters go into: the one being viewed,
// or none when viewing "All" / "No campaign".
export function campaignForNew() {
  return campaignName(store.campaignFilter) ? store.campaignFilter : '';
}

export function charactersInView() {
  const f = store.campaignFilter;
  if (f === ALL) return store.characters;
  // Characters whose campaigns no longer exist count as "No campaign".
  if (f === NONE) return store.characters.filter((c) => !campaignsOf(c).some((id) => campaignName(id)));
  return store.characters.filter((c) => inCampaign(c, f));
}

function option(value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}

export function renderCampaignControls() {
  if (loaded && store.campaignFilter !== ALL && store.campaignFilter !== NONE && !campaignName(store.campaignFilter)) {
    store.campaignFilter = ALL; // the selected campaign was deleted
    saveFilter();
  }
  const sel = $('campaignSelect');
  if (document.activeElement !== sel) {
    sel.innerHTML = '';
    sel.appendChild(option(ALL, 'All characters'));
    store.campaigns.forEach((c) => sel.appendChild(option(c.id, (c.active ? '★ ' : '') + c.name)));
    sel.appendChild(option(NONE, 'No campaign'));
    sel.value = store.campaignFilter;
  }
  refreshCampaignManager();
}

// ---- "Manage campaigns" dialog (DM)
let mgr = null; // { d, selected } while open

const sendCampaigns = (ch, ids) => {
  ch.campaignIds = ids; // optimistic; the server echoes
  ch.campaignId = ids[0] || '';
  store.send('updateCharacter', { id: ch.id, patch: { campaignIds: ids } });
};

function newCampaign() {
  const name = (prompt('Name of the new campaign:') || '').trim();
  if (!name) return '';
  const id = uid();
  store.campaigns.push({ id, name }); // optimistic; the server confirms
  store.send('addCampaign', { id, name });
  return id;
}

function drawManager() {
  if (!mgr) return;
  const { d } = mgr;
  if (!store.campaigns.some((c) => c.id === mgr.selected)) mgr.selected = (store.campaigns[0] || {}).id || '';
  const top = d.body.querySelector('.cm-chars')?.scrollTop || 0;
  d.body.innerHTML = '';

  const wrap = el('div', 'cm-wrap');
  // Left: the campaigns.
  const side = el('div', 'cm-side');
  store.campaigns.forEach((c) => {
    const n = store.characters.filter((ch) => inCampaign(ch, c.id)).length;
    const b = el('button', 'cm-camp' + (c.id === mgr.selected ? ' on' : ''));
    b.type = 'button';
    b.append(el('span', 'cm-camp-name', (c.active ? '★ ' : '') + c.name), el('span', 'cm-count', String(n)));
    b.addEventListener('click', () => { mgr.selected = c.id; drawManager(); });
    side.appendChild(b);
  });
  side.appendChild(button('+ New campaign', 'secondary', () => {
    const id = newCampaign();
    if (id) { mgr.selected = id; drawManager(); renderCampaignControls(); }
  }));
  wrap.appendChild(side);

  // Right: the selected campaign and every character, ticked if in it.
  const main = el('div', 'cm-main');
  const camp = store.campaigns.find((c) => c.id === mgr.selected);
  if (!camp) {
    main.appendChild(el('div', 'cm-empty', 'No campaigns yet. Create one to group characters (a character can be in several).'));
  } else {
    const head = el('div', 'cm-head');
    head.appendChild(el('h4', 'cm-title', camp.name));
    const tools = el('div', 'cm-tools');
    const current = button(camp.active ? '★ Current campaign' : '☆ Set as current', 'secondary' + (camp.active ? ' cm-current' : ''), () => {
      const on = !!camp.active;
      store.campaigns = store.campaigns.map(({ active, ...c }) => (!on && c.id === camp.id ? { ...c, active: true } : c)); // optimistic
      store.send('setActiveCampaign', { id: on ? '' : camp.id });
      renderCampaignControls();
    });
    current.title = 'The campaign being played now: its characters come first when someone picks who they are, and in the Allies list';
    tools.append(current,
      button('Rename', 'secondary', () => {
        const name = (prompt('Rename campaign:', camp.name) || '').trim();
        if (name) store.send('renameCampaign', { id: camp.id, name });
      }),
      button('Delete', 'secondary', () => {
        if (!confirm(`Delete the campaign "${camp.name}"?\n\nIts characters are kept (those in no other campaign go to "No campaign").`)) return;
        store.send('deleteCampaign', { id: camp.id });
      }));
    head.appendChild(tools);
    main.appendChild(head);

    const filter = el('input', 'cm-filter');
    filter.type = 'search';
    filter.placeholder = 'Filter characters…';
    filter.value = mgr.filter || '';
    filter.setAttribute('aria-label', 'Filter characters');
    main.appendChild(filter);

    const list = el('div', 'cm-chars');
    const drawList = () => {
      list.innerHTML = '';
      const q = (mgr.filter || '').trim().toLowerCase();
      // Alphabetical (not members first: rows would jump when ticked).
      const chars = store.characters
        .filter((ch) => !q || (ch.name || '').toLowerCase().includes(q))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      if (!chars.length) list.appendChild(el('div', 'cm-empty', store.characters.length ? 'No character matches.' : 'No characters yet.'));
      chars.forEach((ch) => {
        const row = el('label', 'cm-char' + (inCampaign(ch, camp.id) ? ' in' : ''));
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = inCampaign(ch, camp.id);
        cb.addEventListener('change', () => {
          const ids = campaignsOf(ch).filter((x) => x !== camp.id);
          sendCampaigns(ch, cb.checked ? [...ids, camp.id] : ids);
          row.classList.toggle('in', cb.checked);
          drawCounts();
        });
        const text = el('span', 'cm-char-text');
        text.appendChild(el('span', 'cm-char-name', ch.name || 'Unnamed character'));
        const others = campaignsOf(ch).filter((x) => x !== camp.id).map(campaignName).filter(Boolean);
        text.appendChild(el('span', 'cm-char-meta', [['Lv ' + (ch.level || 1), ch.class].filter(Boolean).join(' '),
          others.length ? 'also in ' + others.join(', ') : ''].filter(Boolean).join(' · ')));
        row.append(cb, text);
        list.appendChild(row);
      });
    };
    filter.addEventListener('input', () => { mgr.filter = filter.value; drawList(); });
    drawList();
    main.appendChild(list);
    requestAnimationFrame(() => { list.scrollTop = top; });
  }
  wrap.appendChild(main);
  d.body.appendChild(wrap);

  // Counts in the side list after a tick, without redrawing everything.
  function drawCounts() {
    side.querySelectorAll('.cm-camp').forEach((b, i) => {
      const c = store.campaigns[i];
      b.querySelector('.cm-count').textContent = String(store.characters.filter((ch) => inCampaign(ch, c.id)).length);
    });
  }
}

export function openCampaignManager() {
  const d = makeDialog('campaignDlg', 'Manage campaigns');
  d.dlg.classList.add('cm-dlg');
  mgr = { d, selected: campaignName(store.campaignFilter) ? store.campaignFilter : '', filter: '' };
  d.btns.append(el('span', 'b-spacer'), button('Done', '', () => d.dlg.close()));
  d.dlg.addEventListener('close', () => { mgr = null; });
  drawManager();
  d.dlg.showModal();
}

// New sheets or campaigns from the server: redraw the open dialog (not
// while the DM is typing in its filter).
export function refreshCampaignManager() {
  if (!mgr) return;
  const a = document.activeElement;
  if (a && mgr.d.body.contains(a) && a.classList.contains('cm-filter')) return;
  drawManager();
}

export function initCampaigns({ onFilterChange }) {
  try { store.campaignFilter = localStorage.getItem(FILTER_KEY) || ALL; } catch { /* storage unavailable */ }

  $('campaignSelect').addEventListener('change', (e) => {
    store.campaignFilter = e.target.value;
    saveFilter();
    renderCampaignControls();
    onFilterChange();
  });

  $('campaignManageBtn').addEventListener('click', openCampaignManager);
}

export function markCampaignsLoaded() { loaded = true; }
