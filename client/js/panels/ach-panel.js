// Analysis of Competing Hypotheses workbench (Heuer, 1999) — rates each piece of evidence against each hypothesis,
// then ranks hypotheses by *least inconsistent* evidence rather than by how much supports them, the key ACH insight.
import { api } from '../api.js';
import { escapeHtml } from '../format.js';

export const meta = { id: 'ach', icon: '⚖', title: 'ACH' };
let uid = 0; const nid = (p) => `${p}${++uid}`;

export function mount(host) {
  let disposed = false, hyps = [], evid = [], ratings = {}, ratingLabels = {};
  host.innerHTML = `<div class="panel"><div class="panel-head"><h2>ACH workbench</h2><p>Rate each item of evidence against each hypothesis; ORION ranks by inconsistency, not support.</p></div>
    <div class="panel-body">
      <label class="form-label">Hypotheses</label><div id="hyp-list"></div>
      <button class="btn btn-sm" id="add-hyp">+ Hypothesis</button>
      <label class="form-label">Evidence</label><div id="evid-list"></div>
      <button class="btn btn-sm" id="add-evid">+ Evidence</button>
      <div class="divider"></div>
      <div style="overflow-x:auto;"><table class="ach-table" id="ach-grid"></table></div>
      <button class="btn btn-primary btn-block" id="ach-run" style="margin-top:12px;">Evaluate</button>
      <div id="ach-results" style="margin-top:14px;"></div>
    </div></div>`;
  const hypList = host.querySelector('#hyp-list'), evidList = host.querySelector('#evid-list'), grid = host.querySelector('#ach-grid'), results = host.querySelector('#ach-results');

  function renderLists() {
    hypList.innerHTML = hyps.map((h) => `<div style="display:flex;gap:6px;margin-bottom:5px;"><input data-hid="${h.id}" value="${escapeHtml(h.text)}" style="flex:1;"><button class="btn btn-sm" data-rm-h="${h.id}">×</button></div>`).join('');
    evidList.innerHTML = evid.map((e) => `<div style="display:flex;gap:6px;margin-bottom:5px;"><input data-eid="${e.id}" value="${escapeHtml(e.text)}" style="flex:1;"><input type="number" step="0.25" min="0.25" max="3" value="${e.weight}" data-ew="${e.id}" style="width:56px;" title="weight"><button class="btn btn-sm" data-rm-e="${e.id}">×</button></div>`).join('');
    renderGrid();
  }
  function renderGrid() {
    const opts = Object.entries(ratingLabels).map(([k, v]) => `<option value="${k}">${k}</option>`).join('');
    grid.innerHTML = `<thead><tr><th>Evidence \\ Hypothesis</th>${hyps.map((h) => `<th>${escapeHtml(h.text.slice(0, 18))}</th>`).join('')}</tr></thead>
      <tbody>${evid.map((e) => `<tr><td>${escapeHtml(e.text.slice(0, 28))}</td>${hyps.map((h) => `<td><select data-e="${e.id}" data-h="${h.id}">${opts}</select></td>`).join('')}</tr>`).join('')}</tbody>`;
    grid.querySelectorAll('select').forEach((sel) => { const cur = ratings[sel.dataset.e]?.[sel.dataset.h]; if (cur) sel.value = cur; sel.value = sel.value || 'N';
      sel.addEventListener('change', () => { (ratings[sel.dataset.e] ||= {})[sel.dataset.h] = sel.value; }); });
  }
  hypList.addEventListener('input', (e) => { const h = hyps.find((x) => x.id === e.target.dataset.hid); if (h) h.text = e.target.value; if (e.target.dataset.hid) renderGrid(); });
  evidList.addEventListener('input', (e) => { const ev = evid.find((x) => x.id === e.target.dataset.eid || x.id === e.target.dataset.ew); if (!ev) return; if (e.target.dataset.eid) ev.text = e.target.value; if (e.target.dataset.ew) ev.weight = +e.target.value || 1; });
  host.querySelector('#add-hyp').addEventListener('click', () => { hyps.push({ id: nid('h'), text: 'New hypothesis' }); renderLists(); });
  host.querySelector('#add-evid').addEventListener('click', () => { evid.push({ id: nid('e'), text: 'New evidence', weight: 1 }); renderLists(); });
  host.addEventListener('click', (e) => { if (e.target.dataset.rmH) { hyps = hyps.filter((h) => h.id !== e.target.dataset.rmH); renderLists(); } if (e.target.dataset.rmE) { evid = evid.filter((x) => x.id !== e.target.dataset.rmE); renderLists(); } });

  host.querySelector('#ach-run').addEventListener('click', async () => {
    results.innerHTML = `<div class="loading-row"><span class="spinner"></span>Evaluating…</div>`;
    try {
      const r = await api.achEvaluate({ hypotheses: hyps, evidence: evid, ratings });
      const maxInc = Math.max(1, ...r.rows.map((x) => x.inconsistency));
      results.innerHTML = `<div style="font-size:11px;color:var(--text-2);margin-bottom:8px;">${escapeHtml(r.method)}</div>` +
        r.rows.map((row, i) => { const h = hyps.find((x) => x.id === row.hypId); return `<div class="ach-rank${i === 0 ? ' leader' : ''}"><span>${escapeHtml(h?.text || row.hypId)}</span><span class="mono">inconsistency ${row.inconsistency.toFixed(1)}</span></div>`; }).join('') +
        (r.fragileEvidence?.length ? `<div style="margin-top:8px;font-size:11px;color:var(--text-2);">Fragile (leader flips if removed): ${r.fragileEvidence.map((f) => escapeHtml(evid.find((e) => e.id === f)?.text || f)).join(', ')}</div>` : '');
    } catch (e) { results.innerHTML = `<p class="list-empty">${escapeHtml(e.message)}</p>`; }
  });

  (async () => { try { const t = await api.achTemplate(); if (disposed) return; ratingLabels = t.ratings; hyps = t.example.hypotheses.map((h) => ({ ...h })); evid = t.example.evidence.map((e) => ({ ...e })); renderLists(); } catch { ratingLabels = { CC: 1, C: 1, N: 1, I: 1, II: 1 }; renderLists(); } })();
  return () => { disposed = true; };
}
