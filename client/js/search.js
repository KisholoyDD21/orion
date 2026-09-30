import { api } from './api.js';
import { bus } from './state.js';
import { escapeHtml } from './format.js';

const KIND_LABEL = { entity: 'live', place: 'place', airport: 'airport', plant: 'nuclear', country: 'country' };
export function mountSearch(input, resultsEl) {
  let timer = null, items = [], activeIndex = -1;
  const close = () => { resultsEl.hidden = true; resultsEl.innerHTML = ''; activeIndex = -1; };
  const render = () => { resultsEl.innerHTML = items.map((r, i) => `<div class="search-result" data-i="${i}"><span class="kind">${KIND_LABEL[r.kind] || r.kind}</span><div style="min-width:0;"><div class="label">${escapeHtml(r.label)}</div><div class="sub">${escapeHtml(r.sub || '')}</div></div></div>`).join(''); resultsEl.hidden = !items.length; };
  async function run(q) {
    if (q.trim().length < 2) { close(); return; }
    try { const r = await api.search(q); items = r.results; render(); } catch { /* transient network hiccup: leave previous results in place */ }
  }
  input.addEventListener('input', () => { clearTimeout(timer); const q = input.value; timer = setTimeout(() => run(q), 180); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); input.blur(); }
    else if (e.key === 'Enter' && items[Math.max(0, activeIndex)]) pick(items[Math.max(0, activeIndex)]);
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  function pick(r) {
    if (r.kind === 'entity') bus.emit('entity:select', r.id); else bus.emit('place:select', r);
    input.value = ''; close();
  }
  resultsEl.addEventListener('mousedown', (e) => { const el = e.target.closest('[data-i]'); if (el) pick(items[+el.dataset.i]); });
}
