import { api } from '../api.js';
import { bus } from '../state.js';
import { fmtAgo, escapeHtml } from '../format.js';
import { LAYERS } from '/shared/taxonomy.js';

export const meta = { id: 'timeline', icon: '⏱', title: 'Timeline' };
const RANGES = [[6, '6h'], [24, '24h'], [72, '3d'], [168, '7d']];

function drawBins(canvas, bins) {
  const ctx = canvas.getContext('2d'), dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  const layerIds = Object.keys(LAYERS), max = Math.max(1, ...bins.map((b) => layerIds.reduce((s, l) => s + (b[l] || 0), 0)));
  const bw = w / bins.length;
  bins.forEach((b, i) => { let y = h; for (const l of layerIds) { const v = b[l] || 0; if (!v) continue; const bh = (v / max) * (h - 4); y -= bh; ctx.fillStyle = LAYERS[l].color; ctx.globalAlpha = 0.85; ctx.fillRect(i * bw + 1, y, Math.max(1, bw - 2), bh); } });
  ctx.globalAlpha = 1;
}
export function mount(host) {
  let disposed = false, hours = 24;
  host.innerHTML = `<div class="panel"><div class="panel-head"><h2>Timeline</h2><p>Time-stamped events: seismic, hazard, media, vulnerabilities, and safety flags.</p>
    <div style="margin-top:8px;display:flex;gap:6px;">${RANGES.map(([h, l]) => `<button class="btn btn-sm" data-h="${h}">${l}</button>`).join('')}</div></div>
    <div style="padding:var(--sp-3) var(--sp-4) 0;"><canvas id="timeline-canvas"></canvas></div>
    <div class="panel-body no-pad" style="padding:0 var(--sp-4);" id="tl-events"></div></div>`;
  const canvas = host.querySelector('#timeline-canvas'), evEl = host.querySelector('#tl-events');
  const setActive = () => host.querySelectorAll('[data-h]').forEach((b) => b.classList.toggle('btn-primary', +b.dataset.h === hours));
  async function load() {
    evEl.innerHTML = `<div class="loading-row"><span class="spinner"></span>Loading…</div>`;
    try { const r = await api.timeline(hours); if (disposed) return; drawBins(canvas, r.bins);
      evEl.innerHTML = r.events.length ? r.events.slice(0, 80).map((e) => `<div class="tl-event" data-id="${escapeHtml(e.id)}"><span>${escapeHtml(e.name)}</span><span class="mono" style="color:var(--text-3);">${fmtAgo(new Date(e.t).toISOString())}</span></div>`).join('') : '<p class="list-empty">No events in this window.</p>';
    } catch (e) { evEl.innerHTML = `<p class="list-empty">${escapeHtml(e.message)}</p>`; }
  }
  host.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => { hours = +b.dataset.h; setActive(); load(); }));
  evEl.addEventListener('click', (e) => { const r = e.target.closest('[data-id]'); if (r) bus.emit('entity:select', r.dataset.id); });
  setActive(); load();
  return () => { disposed = true; };
}
