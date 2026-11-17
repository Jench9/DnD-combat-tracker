// Long grouped lists (Items: ~1,000 entries, Spells: ~650) show the first
// rows of each group and a "Show all" button for the rest, so a phone
// doesn't render the whole library at once. Search and filters still cover
// everything; an expanded group stays expanded until the filters change.
//
//   const groups = createCappedGroups({ cap: 30 });
//   groups.fill(box, key, entries, renderRow, noun)  // fills one group's box
//   groups.reset()                                   // filters changed
export function createCappedGroups({ cap = 30 } = {}) {
  const expanded = new Set();
  return {
    reset() { expanded.clear(); },
    fill(box, key, entries, renderRow, noun = 'entries') {
      const all = expanded.has(key) || entries.length <= cap + 5; // don't hide just a handful
      (all ? entries : entries.slice(0, cap)).forEach((e) => box.appendChild(renderRow(e)));
      if (all) return;
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn secondary show-more';
      more.textContent = `Show all ${entries.length} ${noun} (${entries.length - cap} more)`;
      more.addEventListener('click', () => {
        expanded.add(key);
        more.remove();
        entries.slice(cap).forEach((e) => box.appendChild(renderRow(e)));
      });
      box.appendChild(more);
    },
  };
}
