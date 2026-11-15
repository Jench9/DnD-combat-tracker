// The character editor view: open / refresh from server / close.
import { $ } from '../../core/dom.js';
import { store, findChar, cur, clearTouched } from '../store.js';
import { updateDerived, renderAbilitiesGrid, renderSaves, renderSkills, refreshAbilityInputs } from './abilities.js';
import { bindFields, refreshFields, updateHpBar } from './fields.js';
import { makeListEditor } from './listEditor.js';
import { setPortrait, initPortrait } from './portrait.js';
import { refreshEditorCampaign } from '../campaigns.js';

let equipEd;
let featEd;

function showTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'features') featEd.resize(); // textareas can't measure while hidden
}

// Wire up the editor's static controls. Call once at startup.
export function initEditor() {
  equipEd = makeListEditor({ listId: 'equipList', addId: 'equipAdd', addBtnId: 'equipAddBtn', prop: 'equipment', withQty: true, multiline: false });
  featEd = makeListEditor({ listId: 'featList', addId: 'featAdd', addBtnId: 'featAddBtn', prop: 'features', withQty: false, multiline: true });
  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  initPortrait();
}

export function openEditor(id) {
  if (id !== store.activeCharId) clearTouched();
  store.activeCharId = id;
  const ch = findChar(id);
  if (!ch) return;

  bindFields(ch);
  refreshEditorCampaign();
  setPortrait(ch.portrait || '');
  updateDerived(ch);
  updateHpBar();
  renderAbilitiesGrid(ch);
  renderSaves(ch);
  renderSkills(ch);
  equipEd.render(ch.equipment);
  featEd.render(ch.features);
  showTab('stats');

  $('char-list-view').style.display = 'none';
  $('char-edit-view').style.display = 'block';
  window.scrollTo(0, 0);
}

// Runs whenever fresh state arrives while the editor is open (e.g.
// someone else at the table is editing this sheet too). Skips any
// field you're currently typing in so it never fights your cursor.
// Returns false if the open character no longer exists.
export function refreshEditorFromServer() {
  const ch = cur();
  if (!ch) return false;

  refreshFields(ch);
  refreshEditorCampaign();
  refreshAbilityInputs(ch);
  setPortrait(ch.portrait || '');
  updateDerived(ch);
  updateHpBar();
  renderSaves(ch);
  renderSkills(ch);
  if (!equipEd.busy()) equipEd.render(ch.equipment);
  if (!featEd.busy()) featEd.render(ch.features);
  return true;
}

export function showListView() {
  $('char-edit-view').style.display = 'none';
  $('char-list-view').style.display = 'block';
}
