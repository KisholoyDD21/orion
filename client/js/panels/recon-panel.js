import { api } from '../api.js';
import { escapeHtml } from '../format.js';
export const meta = { id: 'recon', icon: '⌕', title: 'Recon' };
function block(title, html) { return `<h3 style="font-size:11px;color:var(--text-2);margin:10px 0 4px;text-transform:uppercase;letter-spacing:.04em;">${title}</h3>${html}`; }
export function mount(host) {
  host.innerHTML = `<div class="panel"><div class="panel-head"><h2>Passive recon</h2><p>Public registries only (RDAP, certificate transparency, DNS, Shodan InternetDB). ORION never sends packets to the target itself.</p></div>
    <div class="panel-body">
      <label class="form-label">Domain or IP</label>
      <div style="display:flex;gap:6px;"><input id="recon-target" placeholder="example.com or 8.8.8.8"><button class="btn" id="recon-go">Look up</button></div>
      <div id="recon-out"></div>
      <div class="divider"></div>
      <label class="form-label">CVE</label>
      <div style="display:flex;gap:6px;"><input id="cve-target" placeholder="CVE-2024-12345"><button class="btn" id="cve-go">Look up</button></div>
      <div id="cve-out"></div>
    </div></div>`;
  const out = host.querySelector('#recon-out'), cveOut = host.querySelector('#cve-out');
  host.querySelector('#recon-go').addEventListener('click', async () => {
    const target = host.querySelector('#recon-target').value.trim(); if (!target) return;
    out.innerHTML = `<div class="loading-row"><span class="spinner"></span>Querying…</div>`;
    try { const r = await api.reconPassive(target); if (r.note && !r.rdap) { out.innerHTML = `<p class="list-empty">${escapeHtml(r.note)}</p>`; return; }
      let html = '';
      if (r.rdap?.ok) html += block('RDAP', `<div class="kv">${['ldhName', 'entityName'].filter((k) => r.rdap[k]).map((k) => `<dt>${k}</dt><dd style="text-align:left;font-family:inherit;">${escapeHtml(r.rdap[k])}</dd>`).join('')}</div>${r.rdap.events?.length ? '<div class="kv">' + r.rdap.events.map((e) => `<dt>${escapeHtml(e.action)}</dt><dd style="text-align:left;font-family:inherit;">${escapeHtml(e.date)}</dd>`).join('') + '</div>' : ''}`);
      else if (r.rdap) html += block('RDAP', `<p class="list-empty">${escapeHtml(r.rdap.note || 'no data')}</p>`);
      if (r.crtsh?.ok) html += block(`Certificate transparency (${r.crtsh.certificateCount})`, `<div style="font-size:11px;max-height:140px;overflow:auto;">${r.crtsh.subdomains.slice(0, 40).map(escapeHtml).join('<br>')}</div>`);
      if (r.dns?.ok) html += block(`DNS (${r.dns.type})`, r.dns.answers.length ? r.dns.answers.map((a) => `<div class="mono" style="font-size:11px;">${escapeHtml(a.data)}</div>`).join('') : '<p class="list-empty">no records</p>');
      if (r.internetdb?.ok) html += block('Shodan InternetDB', `<div class="kv"><dt>Ports</dt><dd style="text-align:left;font-family:inherit;">${(r.internetdb.ports || []).join(', ') || '—'}</dd>${r.internetdb.vulns?.length ? `<dt>CVEs</dt><dd style="text-align:left;font-family:inherit;">${r.internetdb.vulns.slice(0, 10).join(', ')}</dd>` : ''}</div>`);
      out.innerHTML = html || '<p class="list-empty">No data returned.</p>';
    } catch (e) { out.innerHTML = `<p class="list-empty">${escapeHtml(e.message)}</p>`; }
  });
  host.querySelector('#cve-go').addEventListener('click', async () => {
    const id = host.querySelector('#cve-target').value.trim(); if (!id) return;
    cveOut.innerHTML = `<div class="loading-row"><span class="spinner"></span>Querying…</div>`;
    try { const r = await api.cve(id);
      cveOut.innerHTML = `<div class="kv"><dt>KEV</dt><dd style="text-align:left;font-family:inherit;">${r.kev ? 'Yes — ' + escapeHtml(r.kev.ransomware === 'Known' ? 'known ransomware use' : 'listed') : 'Not listed'}</dd>${r.epss ? `<dt>EPSS</dt><dd style="text-align:left;font-family:inherit;">${(r.epss.epss * 100).toFixed(1)}% (percentile ${(r.epss.percentile * 100).toFixed(0)})</dd>` : ''}${r.nvd ? `<dt>NVD status</dt><dd style="text-align:left;font-family:inherit;">${escapeHtml(r.nvd.status)}</dd>` : ''}</div>${r.nvd?.description ? `<p style="font-size:11.5px;color:var(--text-1);margin-top:8px;">${escapeHtml(r.nvd.description)}</p>` : ''}`;
    } catch (e) { cveOut.innerHTML = `<p class="list-empty">${escapeHtml(e.message)}</p>`; }
  });
  return () => {};
}
