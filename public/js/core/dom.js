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
