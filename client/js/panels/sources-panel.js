import { api } from '../api.js';
import { bus } from '../state.js';
import { fmtAgo, escapeHtml } from '../format.js';

export const meta = { id: 'sources', icon: '⛁', title: 'Sources' };
const STATE_LABEL = { ok: 'OK', degraded: 'Degraded', error: 'Error', idle: 'Idle', disabled: 'Off' };

function row(s) {
  const h = s.health || {};
  return `<tr data-id="${escapeHtml(s.id)}" title="${escapeHtml(s.attribution || '')}">
    <td><span class="source-dot" data-state="${h.state || 'idle'}" style="display:inline-block;margin-right:6px;"></span>${escapeHtml(s.name)}</td>
    <td>${STATE_LABEL[h.state] || h.state || '—'}</td>
    <td>${h.records ?? '—'}</td>
    <td>${h.latencyMs ? Math.round(h.latencyMs) + 'ms' : '—'}</td>
    <td>${h.failures ? `${h.failures}/${h.calls}` : (h.calls ?? '—')}</td>
    <td>${h.lastSuccessAt ? fmtAgo(h.lastSuccessAt) : '—'}</td>
  </tr>`;
}
export function mount(host) {
  let disposed = false, rowsById = new Map();
  host.innerHTML = `<div class="panel"><div class="panel-head"><h2>Source health</h2><p>Every live data source ORION polls, its cadence, and its current state.</p></div>
    <div class="panel-body no-pad" style="overflow:auto;"><table class="data-table"><thead><tr><th>Source</th><th>State</th><th>Records</th><th>Latency</th><th>Fail/Calls</th><th>Last OK</th></tr></thead><tbody id="src-body"></tbody></table></div>
    <div class="panel-foot" id="src-detail" style="font-size:11px;color:var(--text-2);">Click a source for license &amp; attribution.</div></div>`;
  const tbody = host.querySelector('#src-body'), detail = host.querySelector('#src-detail');
  async function load() {
    try { const r = await api.sources(); tbody.innerHTML = r.sources.map(row).join(''); r.sources.forEach((s) => rowsById.set(s.id, s)); } catch (e) { tbody.innerHTML = `<tr><td colspan="6">${escapeHtml(e.message)}</td></tr>`; }
  }
  tbody.addEventListener('click', (e) => { const tr = e.target.closest('[data-id]'); const s = tr && rowsById.get(tr.dataset.id); if (!s) return;
    detail.innerHTML = `<b>${escapeHtml(s.name)}</b> — ${escapeHtml(s.license || 'license n/a')}<br>${escapeHtml(s.attribution || '')}${s.caveats?.length ? '<br>⚠ ' + s.caveats.map(escapeHtml).join(' · ') : ''}`;
  });
  const off = bus.on('source:update', (s) => { rowsById.set(s.id, { ...rowsById.get(s.id), health: s }); const tr = tbody.querySelector(`[data-id="${CSS.escape(s.id)}"]`); if (tr) tr.outerHTML = row(rowsById.get(s.id)); });
  load();
  return () => { disposed = true; off(); };
}
