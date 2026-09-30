import { api } from '../api.js';
import { bus, caseBuilder } from '../state.js';
import { escapeHtml } from '../format.js';
export const meta = { id: 'case', icon: '▣', title: 'Case' };
export function mount(host) {
  host.innerHTML = `<div class="panel"><div class="panel-head"><h2>Case builder</h2><p>Add entities from the Detail panel, then compose a case file with every fusion narrative included.</p></div>
    <div class="panel-body">
      <label class="form-label">Title</label><input id="case-title" value="Untitled case">
      <label class="form-label">Analyst</label><input id="case-analyst" placeholder="optional">
      <div class="divider"></div>
      <div id="case-items"></div>
      <button class="btn btn-primary btn-block" id="case-compose" style="margin-top:12px;">Compose &amp; download</button>
      <div id="case-out"></div>
    </div></div>`;
  const items = host.querySelector('#case-items'), out = host.querySelector('#case-out');
  function renderItems() { items.innerHTML = caseBuilder.size() ? caseBuilder.list().map((id) => `<div class="related-item" data-id="${escapeHtml(id)}"><span>${escapeHtml(id)}</span><span class="rel">remove ×</span></div>`).join('') : '<p class="list-empty">No entities added yet — open Detail on something and click "Add to case".</p>'; }
  items.addEventListener('click', (e) => { const r = e.target.closest('[data-id]'); if (r) { caseBuilder.remove(r.dataset.id); renderItems(); } });
  const off = bus.on('case:changed', renderItems);
  host.querySelector('#case-compose').addEventListener('click', async () => {
    if (!caseBuilder.size()) { out.innerHTML = '<p class="list-empty">Add at least one entity first.</p>'; return; }
    out.innerHTML = `<div class="loading-row"><span class="spinner"></span>Composing…</div>`;
    try {
      const r = await api.caseCompose({ title: host.querySelector('#case-title').value || 'Untitled case', analyst: host.querySelector('#case-analyst').value || null, entityIds: caseBuilder.list() });
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob);
      out.innerHTML = `<a class="btn btn-block" href="${url}" download="orion-case.json">Download orion-case.json</a>`;
    } catch (e) { out.innerHTML = `<p class="list-empty">${escapeHtml(e.message)}</p>`; }
  });
  renderItems();
  return () => { off(); };
}
