import { api } from '../api.js';
import { escapeHtml } from '../format.js';
export const meta = { id: 'research', icon: 'Σ', title: 'Research' };

function drawHist(canvas, counts, labels, color) {
  const ctx = canvas.getContext('2d'), dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  const max = Math.max(1, ...counts), bw = w / counts.length;
  counts.forEach((c, i) => { const bh = (c / max) * (h - 14); ctx.fillStyle = color; ctx.globalAlpha = .85; ctx.fillRect(i * bw + 2, h - bh - 12, bw - 4, bh); ctx.fillStyle = 'rgba(200,210,220,.7)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(c), i * bw + bw / 2, h - 2); });
  ctx.globalAlpha = 1;
}
export function mount(host) {
  let disposed = false;
  host.innerHTML = `<div class="panel"><div class="panel-head"><h2>Research</h2><p>Live fusion diagnostics and an on-demand synthetic benchmark of the scoring model.</p></div>
    <div class="panel-body">
      <div class="metric-grid" id="metric-grid"></div>
      <label class="form-label">Priority distribution</label><canvas id="hist-priority" style="width:100%;height:80px;"></canvas>
      <label class="form-label">Age (hours)</label><canvas id="hist-age" style="width:100%;height:80px;"></canvas>
      <div id="anomalies"></div>
      <div class="divider"></div>
      <button class="btn btn-primary btn-block" id="run-bench">Run benchmark (synthetic, ~30 seeds)</button>
      <div id="bench-out"></div>
    </div></div>`;
  const grid = host.querySelector('#metric-grid'), anomEl = host.querySelector('#anomalies'), benchOut = host.querySelector('#bench-out');
  async function loadMetrics() {
    try { const m = await api.researchMetrics(); if (disposed) return;
      grid.innerHTML = [['Entities', m.entities], ['Fusion runs', m.fusion.runs], ['Last pass', `${m.fusion.lastMs?.toFixed(1) ?? '—'} ms`], ['Mode', m.mode]].map(([l, v]) => `<div class="metric-card"><div class="mv">${escapeHtml(String(v))}</div><div class="ml">${l}</div></div>`).join('');
      drawHist(host.querySelector('#hist-priority'), m.priorityHistogram.counts, [], '#7fd8e6');
      drawHist(host.querySelector('#hist-age'), m.ageHoursHistogram.counts, [], '#b79cff');
      anomEl.innerHTML = m.anomalies.length ? `<p style="font-size:11px;color:var(--band-high);margin-top:8px;">⚠ ${m.anomalies.length} layer(s) show unusual entity-count deltas (|z|&gt;3 vs trailing 30min).</p>` : '';
    } catch (e) { grid.innerHTML = `<p class="list-empty">${escapeHtml(e.message)}</p>`; }
  }
  host.querySelector('#run-bench').addEventListener('click', async (e) => {
    e.target.disabled = true; benchOut.innerHTML = `<div class="loading-row"><span class="spinner"></span>Running synthetic benchmark…</div>`;
    try { const r = await api.researchBenchmark({}); if (disposed) return;
      const nom = r.scenarios.nominal, rows = Object.entries(nom.rankers).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="mono">${v.auroc.mean.toFixed(3)}</td><td class="mono">${v.p20.mean.toFixed(2)}</td></tr>`).join('');
      benchOut.innerHTML = `<table class="data-table" style="margin-top:10px;"><thead><tr><th>Ranker</th><th>AUROC</th><th>P@20</th></tr></thead><tbody>${rows}</tbody></table>
        <p style="font-size:11px;color:var(--text-2);margin-top:8px;">Paired ORION vs. naive-additive Δ AUROC: ${nom.paired?.orionVsAdditive?.meanDelta?.toFixed(3) ?? '—'}. Calibration ECE: ${nom.calibration?.ece?.toFixed(3) ?? '—'}. Full methodology in docs/BENCHMARKS.md.</p>`;
    } catch (err) { benchOut.innerHTML = `<p class="list-empty">${escapeHtml(err.message)}</p>`; } finally { e.target.disabled = false; }
  });
  loadMetrics();
  return () => { disposed = true; };
}
