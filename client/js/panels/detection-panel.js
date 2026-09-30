import { api } from '../api.js';
import { escapeHtml } from '../format.js';
export const meta = { id: 'detection', icon: '▦', title: 'Detection' };
const LEVEL_COLOR = { critical: 'var(--band-critical)', high: 'var(--band-high)', medium: 'var(--band-elevated)', low: 'var(--text-2)', informational: 'var(--text-3)' };
export function mount(host) {
  host.innerHTML = `<div class="panel"><div class="panel-head"><h2>Detection &amp; ATT&amp;CK</h2><p>Sigma-syntax rules authored for ORION's own entity schema (see docs/METHODOLOGY.md §6).</p></div>
    <div class="panel-body">
      <label class="form-label">ATT&amp;CK coverage</label><div id="attack-matrix"></div>
      <div class="divider"></div>
      <label class="form-label">Rules (<span id="rule-count">…</span>)</label><div id="rule-list"></div>
      <button class="btn btn-primary btn-block" id="run-det" style="margin-top:10px;">Evaluate rules against live data</button>
      <div id="det-out"></div>
    </div></div>`;
  const matrixEl = host.querySelector('#attack-matrix'), ruleList = host.querySelector('#rule-list'), ruleCount = host.querySelector('#rule-count'), out = host.querySelector('#det-out');
  api.attackMatrix().then((m) => {
    matrixEl.innerHTML = `<p style="font-size:11px;color:var(--text-2);margin-bottom:6px;">ATT&amp;CK v${escapeHtml(String(m.version || ''))} · ${m.coverage.ruleTagged}/${m.coverage.total} techniques tagged by an ORION rule</p>` +
      m.tactics.map((t) => { const covered = t.techniques.filter((x) => x.hasOrionRule).length, pct = t.techniques.length ? Math.round((covered / t.techniques.length) * 100) : 0;
        return `<div style="margin-bottom:6px;"><div style="display:flex;justify-content:space-between;font-size:11px;"><span>${escapeHtml(t.name)}</span><span class="mono" style="color:var(--text-3);">${covered}/${t.techniques.length}</span></div><div class="bar"><i style="width:${pct}%;background:${covered ? 'var(--accent)' : 'var(--bg-3)'}"></i></div></div>`; }).join('');
  }).catch((e) => { matrixEl.innerHTML = `<p class="list-empty">${escapeHtml(e.message)}</p>`; });
  api.detectionRules().then((r) => { ruleCount.textContent = r.count;
    ruleList.innerHTML = r.rules.map((x) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line-0);font-size:11.5px;"><span>${escapeHtml(x.title)}</span><span class="mono" style="color:${LEVEL_COLOR[x.level] || 'var(--text-2)'};font-size:10px;text-transform:uppercase;">${x.level}</span></div>`).join('');
  }).catch((e) => { ruleList.innerHTML = `<p class="list-empty">${escapeHtml(e.message)}</p>`; });
  host.querySelector('#run-det').addEventListener('click', async (e) => {
    e.target.disabled = true; out.innerHTML = `<div class="loading-row"><span class="spinner"></span>Evaluating…</div>`;
    try { const r = await api.detectionEvaluate({}); out.innerHTML = `<p style="font-size:11px;color:var(--text-2);margin:8px 0;">${r.matches.length} match(es) across ${r.count} entities</p>` +
      r.matches.slice(0, 30).map((m) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line-0);font-size:11.5px;"><span>${escapeHtml(m.title)}</span><span class="mono" style="color:var(--text-3);font-size:10px;">${escapeHtml(m.entityName || '')}</span></div>`).join('');
    } catch (err) { out.innerHTML = `<p class="list-empty">${escapeHtml(err.message)}</p>`; } finally { e.target.disabled = false; }
  });
  return () => {};
}
