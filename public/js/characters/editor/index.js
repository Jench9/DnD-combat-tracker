// The character editor view: open / refresh from server / close.
import { fillRich } from '../../core/richText.js';
import { $ } from '../../core/dom.js';
import { store, findChar, cur, clearTouched } from '../store.js';
import { updateDerived, renderAbilitiesGrid, renderSaves, renderSkills, refreshAbilityInputs } from './abilities.js';
import { bindFields, refreshFields, updateHpBar } from './fields.js';
import { makeListEditor } from './listEditor.js';
import { setPortrait, initPortrait } from './portrait.js';
import { ownsCharacter } from '../../core/identity.js';
import { initInventory, refreshInventoryUi } from './inventory.js';
import { initSpellbook, refreshSpellbookUi } from './spellbook.js';
import { initModifierList, refreshModifierUi } from './modifierList.js';
import { initRest, refreshRestUi, resetRestUi } from './rest.js';
import { initStatus, refreshStatusUi } from './status.js';
import { refreshFamiliarUi } from './familiar.js';

let equipEd;
let featEd;

function showTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'features') featEd.resize(); // textareas can't measure while hidden
}

// Wire up the editor's static controls. Call once at startup.
// Which Features view this browser prefers ('read' | 'edit'); an empty
// list always opens in Edit (there's nothing to read).
const FEAT_VIEW_KEY = 'kit.featView';
function featView() {
  try { return localStorage.getItem(FEAT_VIEW_KEY) === 'edit' ? 'edit' : 'read'; } catch { return 'read'; }
}
function setFeatView(view) {
  try { localStorage.setItem(FEAT_VIEW_KEY, view); } catch { /* storage blocked */ }
  const ch = cur();
  if (ch) drawFeatRead(ch);
  if (view === 'edit') featEd.resize();
}
function drawFeatRead(ch) {
  const empty = !String(ch.features || '').trim();
  const read = featView() === 'read' && !empty;
  $('featRead').hidden = !read;
  $('featEditView').hidden = read;
  $('featReadBtn').setAttribute('aria-pressed', String(read));
  $('featEditBtn').setAttribute('aria-pressed', String(!read));
  if (read) fillRich($('featRead'), ch.features);
}

export function initEditor() {
  equipEd = makeListEditor({ listId: 'equipList', addId: 'equipAdd', addBtnId: 'equipAddBtn', prop: 'equipment', withQty: true, multiline: false });
  featEd = makeListEditor({ listId: 'featList', addId: 'featAdd', addBtnId: 'featAddBtn', prop: 'features', withQty: false, multiline: true });
  // Features: a formatted read view (core/richText.js) or the row editor.
  $('featReadBtn').addEventListener('click', () => setFeatView('read'));
  $('featEditBtn').addEventListener('click', () => setFeatView('edit'));
  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  initPortrait();
  initInventory();
  initSpellbook(refreshInventoryUi); // spell changes also redraw the Actions tab
  initModifierList(refreshInventoryUi); // so do modifier changes
  initRest();
  initStatus();
}

export function openEditor(id) {
  if (id !== store.activeCharId) { clearTouched(); resetRestUi(); }
  store.activeCharId = id;
  const ch = findChar(id);
  if (!ch) return;

  bindFields(ch);
  setPortrait(ch.portrait || '');
  updateDerived(ch);
  updateHpBar();
  renderAbilitiesGrid(ch);
  renderSaves(ch);
  renderSkills(ch);
  equipEd.render(ch.equipment);
  featEd.render(ch.features);
  drawFeatRead(ch);
  showTab('stats');
  refreshInventoryUi(ch);
  refreshSpellbookUi(ch);
  refreshModifierUi(ch);
  refreshRestUi(ch);
  refreshStatusUi(ch);
  refreshFamiliarUi(ch);
  applyAccess(ch);

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
  refreshAbilityInputs(ch);
  setPortrait(ch.portrait || '');
  updateDerived(ch);
  updateHpBar();
  renderSaves(ch);
  renderSkills(ch);
  if (!equipEd.busy()) equipEd.render(ch.equipment);
  if (!featEd.busy()) featEd.render(ch.features);
  drawFeatRead(ch);
  refreshInventoryUi(ch);
  refreshSpellbookUi(ch);
  if (!$('modList').contains(document.activeElement)) refreshModifierUi(ch); // not under the cursor
  refreshRestUi(ch);
  refreshStatusUi(ch);
  refreshFamiliarUi(ch);
  applyAccess(ch);
  return true;
}

// Players can look at every sheet but change only their own (the server
// enforces this too). Disables every control in the sheet otherwise.
function applyAccess(ch) {
  const editable = ownsCharacter(ch.id);
  const view = $('char-edit-view');
  view.classList.toggle('readonly', !editable);
  $('viewOnlyTag').hidden = editable;
  $('deleteCharBtn').hidden = !editable;
  $('ddbSyncBtn').hidden = !editable;
  $('retireCharBtn').textContent = ch.retired ? 'Bring back' : 'Retire';
  $('retireCharBtn').title = ch.retired ? 'Retired: show it again on "Who are you?", the Allies list and the character list' : 'Dead or left the party: hidden from "Who are you?", the Allies list and the character list (Show retired), without deleting it';
  const empty = !String(ch.class || '').trim();
  $('guidedBtn').hidden = !editable || !empty;
  $('levelUpBtn').hidden = !editable || empty || (parseInt(ch.level, 10) || 1) >= 20;
  // Only undo what this did: controls disabled for their own reasons (Cast
  // with no slots left, a free cast already used) stay disabled.
  view.querySelectorAll('input, select, textarea, button').forEach((el) => {
    if (el.id === 'backToListBtn' || el.classList.contains('tab-btn') || el.closest('.feat-views')) return; // switching views changes nothing
    if (!editable) {
      if (!el.disabled) { el.disabled = true; el.dataset.viewOnly = '1'; }
    } else if (el.dataset.viewOnly) {
      el.disabled = false;
      delete el.dataset.viewOnly;
    }
  });
}

export function showListView() {
  $('char-edit-view').style.display = 'none';
  $('char-list-view').style.display = 'block';
}
