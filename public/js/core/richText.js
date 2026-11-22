// Light formatting for rules text (feature descriptions, custom content,
// the sheet's Features), built as DOM nodes — never innerHTML, so any text
// typed by anyone is safe to show.
//
//   **bold**   *italic* or _italic_
//   - item / * item / • item          a list
//   ### Heading, or "◆ Title" lines   a small heading (◆ = the sheet's feature blocks)
//   a table: two or more lines of cells separated by | (an optional
//   |---|---| line marks the header row), or by tabs (a table copied from a
//   web page pastes that way; its first row is the header)
//   a blank line starts a new paragraph; single line breaks are kept
//
//   renderRich(text) -> DocumentFragment
//   fillRich(element, text)  replaces the element's content

const LIST_RE = /^\s*(?:[-*•])\s+(.*)$/;
const HEADING_RE = /^\s*(?:#{1,6}\s+|◆\s*)(.+)$/;
const SEPARATOR_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const isPipeRow = (line) => /\|/.test(line) && line.replace(/^\s*\||\|\s*$/g, '').includes('|');
const isTabRow = (line) => line.includes('\t') && line.split('\t').filter((c) => c.trim()).length >= 2;
const pipeCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const tabCells = (line) => line.split('\t').map((c) => c.trim());

// **bold**, *italic*, _italic_ inside a line.
function inline(text, into) {
  const re = /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*|(?<![\w])_(?!\s)(.+?)_(?![\w])/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) into.appendChild(document.createTextNode(text.slice(last, m.index)));
    const node = document.createElement(m[1] !== undefined ? 'strong' : 'em');
    inline(m[1] ?? m[2] ?? m[3], node); // nested: ***x*** and **_x_**
    into.appendChild(node);
    last = m.index + m[0].length;
  }
  if (last < text.length) into.appendChild(document.createTextNode(text.slice(last)));
}

function table(rows, { header }) {
  const wrap = document.createElement('div');
  wrap.className = 'rt-table-wrap';
  const t = document.createElement('table');
  t.className = 'rt-table';
  const width = Math.max(...rows.map((r) => r.length));
  rows.forEach((cells, i) => {
    const tr = document.createElement('tr');
    // A row with fewer cells (a group heading like "—Spell Slots—") spans the rest.
    cells.forEach((c, j) => {
      const td = document.createElement(header && i === 0 ? 'th' : 'td');
      if (j === cells.length - 1 && cells.length < width) td.colSpan = width - cells.length + 1;
      inline(c, td);
      tr.appendChild(td);
    });
    (header && i === 0 ? (t.tHead || t.createTHead()) : (t.tBodies[0] || t.createTBody())).appendChild(tr);
  });
  wrap.appendChild(t);
  return wrap;
}

export function renderRich(text) {
  const frag = document.createDocumentFragment();
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  let para = null; // the open paragraph
  let list = null; // the open list
  const close = () => { para = null; list = null; };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { close(); continue; }

    // Tables: a run of 2+ pipe rows (or tab rows).
    const kind = isPipeRow(line) ? 'pipe' : isTabRow(line) ? 'tab' : '';
    if (kind) {
      const isRow = kind === 'pipe' ? (l) => isPipeRow(l) || SEPARATOR_RE.test(l) : isTabRow;
      let j = i;
      while (j < lines.length && lines[j].trim() && isRow(lines[j])) j++;
      if (j - i >= 2) {
        close();
        const block = lines.slice(i, j);
        let header = kind === 'tab';
        const rows = [];
        block.forEach((l, k) => {
          if (kind === 'pipe' && SEPARATOR_RE.test(l)) { if (k === 1) header = true; return; }
          rows.push(kind === 'pipe' ? pipeCells(l) : tabCells(l));
        });
        if (rows.length) frag.appendChild(table(rows, { header }));
        i = j - 1;
        continue;
      }
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      close();
      const el = document.createElement('div');
      el.className = 'rt-h';
      inline(h[1].trim(), el);
      frag.appendChild(el);
      continue;
    }

    const li = LIST_RE.exec(line);
    if (li) {
      para = null;
      if (!list) { list = document.createElement('ul'); list.className = 'rt-list'; frag.appendChild(list); }
      const item = document.createElement('li');
      inline(li[1], item);
      list.appendChild(item);
      continue;
    }

    list = null;
    if (para) para.appendChild(document.createElement('br'));
    else { para = document.createElement('p'); para.className = 'rt-p'; frag.appendChild(para); }
    inline(line.trim(), para);
  }
  return frag;
}

export function fillRich(el, text) {
  el.textContent = '';
  el.classList.add('rt');
  el.appendChild(renderRich(text));
  return el;
}
