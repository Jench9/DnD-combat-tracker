// Tiny DOM/utility helpers shared by every page.
export const $ = (id) => document.getElementById(id);

export function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// A strip that scrolls sideways (top bar tabs, character sheet tabs): faded
// edges (CSS .more-left / .more-right, components.css .h-scroll) where
// there's more to scroll to, and a vertical mouse wheel scrolls it sideways.
export function sideScroll(el) {
  const mark = () => {
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle('more-left', el.scrollLeft > 2);
    el.classList.toggle('more-right', max > 2 && el.scrollLeft < max - 2);
  };
  el.classList.add('h-scroll');
  el.addEventListener('wheel', (e) => {
    if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, { passive: false });
  el.addEventListener('scroll', mark, { passive: true });
  new ResizeObserver(mark).observe(el); // also when a hidden strip appears
  mark();
  return mark;
}
