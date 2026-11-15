// Editor: equipment / features as editable row lists.
// Both are stored as newline-separated text on the server (so imports and
// older data keep working); this renders that text as editable rows.
import { $, debounce } from '../../core/dom.js';
import { cur, patchChar, touch } from '../store.js';

function parseItems(text) {
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

export function makeListEditor({ listId, addId, addBtnId, prop, withQty, multiline }) {
  const list = $(listId);
  const addInput = $(addId);

  function collect() {
    return [...list.querySelectorAll('.item')].map((row) => {
      const nm = row.querySelector('.nm').value.replace(/\n/g, ' ').trim();
      if (!nm) return '';
      if (withQty) {
        const q = parseInt(row.querySelector('.qty').value, 10) || 1;
        return q > 1 ? nm + ' x' + q : nm;
      }
      return nm;
    }).filter(Boolean).join('\n');
  }

  function localSync() {
    const c = cur();
    if (c) { c[prop] = collect(); touch('f:' + prop); }
  }
  const sendDebounced = debounce(() => patchChar({ [prop]: collect() }), 300);
  const commit = () => { localSync(); sendDebounced(); };

  function refreshEmpty() {
    const hint = list.querySelector('.empty-mini');
    const has = list.querySelector('.item');
    if (!has && !hint) {
      const d = document.createElement('div');
      d.className = 'empty-mini';
      d.textContent = 'Nothing here yet.';
      list.appendChild(d);
    } else if (has && hint) {
      hint.remove();
    }
  }

  function addRow(line) {
    let name = line;
    let qty = 1;
    if (withQty) {
      const m = line.match(/^(.*?)\s+x(\d+)$/i);
      if (m) { name = m[1]; qty = parseInt(m[2], 10); }
    }
    const row = document.createElement('div');
    row.className = 'item';

    const nm = document.createElement(multiline ? 'textarea' : 'input');
    nm.className = 'nm';
    if (multiline) nm.rows = 1; else nm.type = 'text';
    nm.value = name;
    nm.addEventListener('input', () => { if (multiline) autosize(nm); commit(); });
    if (multiline) nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nm.blur(); } });
    row.appendChild(nm);

    if (withQty) {
      const x = document.createElement('span'); x.className = 'qty-x'; x.textContent = '×';
      const q = document.createElement('input');
      q.type = 'number'; q.min = '1'; q.className = 'qty bare'; q.value = qty;
      q.setAttribute('aria-label', 'Quantity');
      q.addEventListener('input', commit);
      row.append(x, q);
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Remove');
    del.addEventListener('click', () => {
      row.remove();
      refreshEmpty();
      localSync();
      patchChar({ [prop]: collect() });
    });
    row.appendChild(del);

    list.appendChild(row);
    if (multiline) autosize(nm);
  }

  function render(text) {
    list.innerHTML = '';
    parseItems(text).forEach(addRow);
    refreshEmpty();
  }

  function addFromInput() {
    const v = addInput.value.trim();
    if (!v) return;
    addRow(v);
    refreshEmpty();
    addInput.value = '';
    localSync();
    patchChar({ [prop]: collect() });
  }
  $(addBtnId).addEventListener('click', addFromInput);
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFromInput(); } });

  return {
    render,
    busy: () => list.contains(document.activeElement),
    resize: () => list.querySelectorAll('textarea.nm').forEach(autosize),
  };
}
