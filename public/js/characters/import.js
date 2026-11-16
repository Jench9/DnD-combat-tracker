// The import panel (D&D Beyond + PDF). `onImported(character)` is called
// with the character the server created.
import { $ } from '../core/dom.js';
import { campaignForNew } from './campaigns.js';
import { identityHeaders } from '../core/identity.js';

function showImportMsg(el, kind, text) {
  el.className = 'import-msg ' + kind;
  el.textContent = text;
}

export function initImport({ onImported }) {
  const importPanel = $('importPanel');

  $('importToggleBtn').addEventListener('click', () => {
    importPanel.style.display = importPanel.style.display === 'none' ? 'block' : 'none';
  });

  document.querySelectorAll('.import-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.import-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.import-pane').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('pane-' + tab.dataset.pane).classList.add('active');
    });
  });

  function done(character) {
    onImported(character);
    importPanel.style.display = 'none';
  }

  // ---- D&D Beyond
  $('ddbImportBtn').addEventListener('click', async () => {
    const input = $('ddbInput').value.trim();
    const msg = $('ddbMsg');
    if (!input) { showImportMsg(msg, 'error', 'Paste a D&D Beyond character URL or ID first.'); return; }
    const btn = $('ddbImportBtn');
    btn.disabled = true;
    btn.textContent = 'Importing…';
    showImportMsg(msg, 'ok', 'Fetching character…');
    try {
      const resp = await fetch('/api/import/dndbeyond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...identityHeaders() },
        body: JSON.stringify({ input, campaignId: campaignForNew() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        showImportMsg(msg, 'error', data.error || 'Import failed.');
      } else {
        showImportMsg(msg, 'warn', 'Imported — please double-check AC and proficiencies.');
        $('ddbInput').value = '';
        done(data.character);
      }
    } catch (err) {
      showImportMsg(msg, 'error', 'Could not reach the server.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Import';
    }
  });

  // ---- PDF
  async function uploadPdf(file) {
    const msg = $('pdfMsg');
    if (!file) return;
    if (file.type !== 'application/pdf') {
      showImportMsg(msg, 'error', 'That doesn\'t look like a PDF.');
      return;
    }
    showImportMsg(msg, 'ok', 'Reading PDF…');
    const formData = new FormData();
    formData.append('campaignId', campaignForNew());
    formData.append('file', file);
    try {
      const resp = await fetch('/api/import/pdf', { method: 'POST', headers: identityHeaders(), body: formData });
      const data = await resp.json();
      if (!resp.ok) {
        showImportMsg(msg, 'error', data.error || 'Import failed.');
      } else {
        showImportMsg(msg, 'warn', data.warning || 'Imported — please review the sheet.');
        done(data.character);
      }
    } catch (err) {
      showImportMsg(msg, 'error', 'Could not reach the server.');
    }
  }

  const pdfInput = $('pdfInput');
  const pdfDrop = $('pdfDrop');
  pdfInput.addEventListener('change', () => uploadPdf(pdfInput.files[0]));
  ['dragover', 'dragenter'].forEach((evt) => pdfDrop.addEventListener(evt, (e) => { e.preventDefault(); pdfDrop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((evt) => pdfDrop.addEventListener(evt, (e) => { e.preventDefault(); pdfDrop.classList.remove('drag'); }));
  pdfDrop.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) uploadPdf(file);
  });
}
