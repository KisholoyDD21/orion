import { api } from '../api.js';
import { bus, caseBuilder } from '../state.js';
import { fmtAgo, fmtAlt, fmtLatLon, fmtPct, escapeHtml, bandLabel } from '../format.js';

export const meta = { id: 'detail', icon: '◎', title: 'Detail' };

function factorBar(f) {
  const pct = Math.round((f.value ?? 0) * 100);
  return `<div class="factor-row"><span class="fk">${f.key}</span><div class="bar"><i style="width:${pct}%"></i></div><span class="fv">${pct}%</span></div>
          <div class="factor-note">${escapeHtml(f.note)}</div>`;
}
function relatedRow(r) {
  const label = r.name || r.label || r.id;
  return `<div class="related-item" data-goto="${escapeHtml(r.id)}"><span>${escapeHtml(label)}</span><span class="rel">${escapeHtml(r.rel)}${r.km != null ? ` · ${r.km}km` : ''}</span></div>`;
}
export function mount(host, app) {
  let disposed = false, currentId = null;
  host.innerHTML = `<div class="panel"><div class="panel-body" id="detail-body"><p class="list-empty">Select anything on the globe — an aircraft, vessel, satellite, earthquake, or alert — to see how ORION scored it.</p></div></div>`;
  const body = host.querySelector('#detail-body');

  async function render(id) {
    currentId = id; body.innerHTML = `<div class="loading-row"><span class="spinner"></span>Loading…</div>`;
    let d; try { d = await api.entity(id); } catch (e) { body.innerHTML = `<p class="list-empty">Could not load this entity (${escapeHtml(e.message)}).</p>`; return; }
    if (disposed || currentId !== id) return;
    const e = d.entity, f = d.fusion, band = f?.band || 'routine';
    const badges = [
      f ? `<span class="badge badge-${band}">${bandLabel(band)} · ${f.priority.toFixed(0)}</span>` : '',
      f ? `<span class="badge badge-source">${f.admiralty}</span>` : '',
      f ? `<span class="badge badge-source">${escapeHtml(f.term)}</span>` : '',
      e.synthetic ? `<span class="badge badge-synth">Synthetic</span>` : '',
    ].join('');
    body.innerHTML = `
      <div class="detail-title">${escapeHtml(e.name)}</div>
      <div class="detail-sub">${escapeHtml(e.layer)} · ${escapeHtml(e.source)} · ${e.lat != null ? fmtLatLon(e.lat, e.lon) : 'not geolocated'}${e.altM != null ? ' · ' + fmtAlt(e.altM) : ''}</div>
      <div class="badge-row">${badges}</div>
      ${f ? `<div>${d.factors.map(factorBar).join('')}</div>` : '<p class="list-empty">Not yet scored by the fusion engine.</p>'}
      ${d.narrative ? `<div class="narrative">${escapeHtml(d.narrative)}</div>` : ''}
      ${f?.rules?.length ? `<div>${f.rules.map((r) => `<span class="rule-chip" title="${escapeHtml(r.detail || '')}">${escapeHtml(r.label)}</span>`).join('')}</div>` : ''}
      ${d.related?.length ? `<div class="divider"></div><h3 style="font-size:11px;color:var(--text-2);margin-bottom:6px;">Linked (${d.related.length})</h3>${d.related.map(relatedRow).join('')}` : ''}
      <div class="divider"></div>
      <h3 style="font-size:11px;color:var(--text-2);margin-bottom:6px;">Source</h3>
      <div class="kv"><dt>Name</dt><dd style="text-align:left;font-family:inherit;">${escapeHtml(d.source?.name || e.source)}</dd>
      ${d.source?.license ? `<dt>License</dt><dd style="text-align:left;font-family:inherit;">${escapeHtml(d.source.license)}</dd>` : ''}
      ${d.source?.precision ? `<dt>Precision</dt><dd style="text-align:left;font-family:inherit;">${escapeHtml(d.source.precision)}</dd>` : ''}</div>
      ${d.source?.caveats?.length ? `<ul class="caveat-list">${d.source.caveats.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''}
      <div class="panel-foot-inline" style="margin-top:14px;display:flex;gap:8px;">
        <button class="btn btn-sm" id="btn-fly">Fly to</button>
        <button class="btn btn-sm" id="btn-case">${caseBuilder.has(e.id) ? '✓ In case' : '+ Add to case'}</button>
        ${d.hasOrbit ? '<button class="btn btn-sm" id="btn-passes">Passes over here</button>' : ''}
      </div>
      <div id="passes-out"></div>`;
    body.querySelectorAll('[data-goto]').forEach((el) => el.addEventListener('click', () => bus.emit('entity:select', el.dataset.goto)));
    body.querySelector('#btn-fly')?.addEventListener('click', () => { if (e.lat != null) app.globe.flyTo(e.lon, e.lat, Math.max(80000, (e.altM || 0) * 3)); });
    body.querySelector('#btn-case')?.addEventListener('click', (ev) => { if (caseBuilder.has(e.id)) caseBuilder.remove(e.id); else caseBuilder.add(e.id); ev.target.textContent = caseBuilder.has(e.id) ? '✓ In case' : '+ Add to case'; });
    body.querySelector('#btn-passes')?.addEventListener('click', async () => {
      const c = app.globe.viewer.camera.positionCartographic, lat = app.globe.Cesium.Math.toDegrees(c.latitude), lon = app.globe.Cesium.Math.toDegrees(c.longitude);
      const out = body.querySelector('#passes-out'); out.innerHTML = `<div class="loading-row"><span class="spinner"></span>Computing…</div>`;
      try { const p = await api.orbitPasses(e.attrs.norad, { lat, lon, hours: 24, minElev: 10 });
        out.innerHTML = `<div class="divider"></div><h3 style="font-size:11px;color:var(--text-2);">Passes above 10° · next 24h from map centre</h3>` + (p.passes.length ? p.passes.map((x) => `<div class="kv" style="margin-bottom:6px;"><dt>${new Date(x.start).toUTCString().slice(17, 22)}</dt><dd style="text-align:left;font-family:inherit;">max ${x.maxElevDeg}° at ${new Date(x.maxAt).toUTCString().slice(17,22)}Z</dd></div>`).join('') : '<p class="list-empty">No passes above 10° in the next 24h.</p>');
      } catch (err) { out.innerHTML = `<p class="list-empty">${escapeHtml(err.message)}</p>`; }
    });
  }
  const off = bus.on('entity:select', (id) => { if (!disposed) render(id); });
  if (app.selectedId) render(app.selectedId);
  return () => { disposed = true; off(); };
}
