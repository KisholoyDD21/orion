import { api } from '../api.js';
import { bus } from '../state.js';
import { fmtAgo, escapeHtml, bandLabel } from '../format.js';

export const meta = { id: 'alerts', icon: '▲', title: 'Alerts' };
const DOT = { critical: 'var(--band-critical)', high: 'var(--band-high)', elevated: 'var(--band-elevated)', routine: 'var(--band-routine)' };

function row(a) {
  return `<div class="alert-item" data-id="${escapeHtml(a.entityId)}">
    <div class="alert-band-dot" style="background:${DOT[a.level] || DOT.routine}"></div>
    <div style="flex:1;min-width:0;">
      <div class="alert-title">${escapeHtml(a.title)}</div>
      <div class="alert-why">${escapeHtml(a.why?.[0] || bandLabel(a.level))}${a.synthetic ? ' · synthetic' : ''}</div>
    </div>
    <div class="alert-time">${fmtAgo(a.at)}</div>
  </div>`;
}
export function mount(host, app) {
  let disposed = false, sort = 'top', items = [];
  host.innerHTML = `<div class="panel">
    <div class="panel-head"><h2>Alerts</h2><p>Entities above the reporting threshold, ranked by priority.</p>
      <div style="margin-top:8px;display:flex;gap:6px;">
        <button class="btn btn-sm" data-sort="top">Top</button><button class="btn btn-sm" data-sort="recent">Recent</button>
      </div></div>
    <div class="panel-body no-pad" id="alert-list" style="padding:0 var(--sp-4);"></div></div>`;
  const list = host.querySelector('#alert-list');
  const setActiveBtn = () => host.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('btn-primary', b.dataset.sort === sort));
  async function load() {
    list.innerHTML = `<div class="loading-row"><span class="spinner"></span>Loading…</div>`;
    try { const r = await api.alerts({ sort, limit: 100 }); items = r.alerts; renderList(); } catch (e) { list.innerHTML = `<p class="list-empty">${escapeHtml(e.message)}</p>`; }
  }
  function renderList() { list.innerHTML = items.length ? items.map(row).join('') : `<p class="list-empty">No alerts yet.</p>`; }
  host.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { sort = b.dataset.sort; setActiveBtn(); load(); }));
  list.addEventListener('click', (e) => { const r = e.target.closest('[data-id]'); if (r) bus.emit('entity:select', r.dataset.id); });
  const off = bus.on('alert:new', (a) => { if (disposed) return; if (sort === 'recent') items.unshift(a); else { items.push(a); items.sort((x, y) => y.priority - x.priority); } items = items.slice(0, 150); renderList(); });
  setActiveBtn(); load();
  return () => { disposed = true; off(); };
}
