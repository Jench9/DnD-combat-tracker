// Campaign picker on the list view, plus the editor's "Campaign" select.
// The filter choice is remembered per browser (localStorage).
import { $, uid } from '../core/dom.js';
import { store, cur, patchChar, touch, ALL, NONE } from './store.js';

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
  // Characters whose campaign no longer exists count as "No campaign".
  if (f === NONE) return store.characters.filter((c) => !campaignName(c.campaignId));
  return store.characters.filter((c) => c.campaignId === f);
}

function option(value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}

function fillSelect(select, extras, value) {
  select.innerHTML = '';
  extras.forEach(([v, t]) => select.appendChild(option(v, t)));
  store.campaigns.forEach((c) => select.appendChild(option(c.id, c.name)));
  select.value = value;
}

export function renderCampaignControls() {
  if (loaded && store.campaignFilter !== ALL && store.campaignFilter !== NONE && !campaignName(store.campaignFilter)) {
    store.campaignFilter = ALL; // the selected campaign was deleted
    saveFilter();
  }
  const sel = $('campaignSelect');
  if (document.activeElement !== sel) {
    fillSelect(sel, [[ALL, 'All characters']], store.campaignFilter);
    sel.appendChild(option(NONE, 'No campaign'));
    sel.value = store.campaignFilter;
  }
  const real = !!campaignName(store.campaignFilter);
  $('campaignRenameBtn').hidden = !real;
  $('campaignDeleteBtn').hidden = !real;
  refreshEditorCampaign();
}

// Editor select: value follows the open character.
export function refreshEditorCampaign() {
  const sel = $('csCampaign');
  const ch = cur();
  if (!ch || document.activeElement === sel) return;
  fillSelect(sel, [['', 'No campaign']], campaignName(ch.campaignId) ? ch.campaignId : '');
}

export function initCampaigns({ onFilterChange }) {
  try { store.campaignFilter = localStorage.getItem(FILTER_KEY) || ALL; } catch { /* storage unavailable */ }

  $('campaignSelect').addEventListener('change', (e) => {
    store.campaignFilter = e.target.value;
    saveFilter();
    renderCampaignControls();
    onFilterChange();
  });

  $('campaignNewBtn').addEventListener('click', () => {
    const name = (prompt('Name of the new campaign:') || '').trim();
    if (!name) return;
    const id = uid();
    store.campaigns.push({ id, name }); // optimistic; the server confirms
    store.send('addCampaign', { id, name });
    store.campaignFilter = id;
    saveFilter();
    renderCampaignControls();
    onFilterChange();
  });

  $('campaignRenameBtn').addEventListener('click', () => {
    const id = store.campaignFilter;
    const name = (prompt('Rename campaign:', campaignName(id)) || '').trim();
    if (name) store.send('renameCampaign', { id, name });
  });

  $('campaignDeleteBtn').addEventListener('click', () => {
    const id = store.campaignFilter;
    if (!confirm('Delete the campaign "' + campaignName(id) + '"?\n\nIts characters are kept and moved to "No campaign".')) return;
    store.send('deleteCampaign', { id });
  });

  $('csCampaign').addEventListener('change', (e) => {
    const ch = cur();
    if (!ch) return;
    ch.campaignId = e.target.value;
    touch('f:campaignId');
    patchChar({ campaignId: e.target.value });
  });
}

export function markCampaignsLoaded() { loaded = true; }
