import { makeEntity } from '../core/entity.js';
export const id = 'kev';
export const meta = {
  name: 'CISA Known Exploited Vulnerabilities', domain: 'vulnerability', homepage: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', docs: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
  license: 'Public domain (US Government work)', attribution: 'CISA KEV Catalog', auth: 'none', coverage: 'Global CVEs with evidence of active exploitation', refreshMs: 3.6e6, defaultEnabled: true, rel: 'A', credHint: 1,
  precision: 'Not geolocated (vulnerability records)', caveats: ['KEV means exploitation was observed, not that any particular system is affected.'],
};
export function parse(raw, { fetchedAt = new Date().toISOString(), sinceDays = 120 } = {}) {
  const out = [], cutoff = Date.now() - sinceDays * 86400000;
  for (const v of raw?.vulnerabilities || []) {
    if (!/^CVE-\d{4}-\d{4,7}$/.test(v.cveID || '')) continue;
    const added = Date.parse(`${v.dateAdded}T00:00:00Z`); if (!Number.isFinite(added) || added < cutoff) continue;
    const ransom = v.knownRansomwareCampaignUse === 'Known';
    out.push(makeEntity({
      id: `kev:${v.cveID}`, type: 'vuln', layer: 'vuln', source: id, name: `${v.cveID} ${v.vendorProject || ''} ${v.product || ''}`.trim().slice(0, 110), observedAt: added, fetchedAt, severity: 0.65 + (ransom ? 0.2 : 0), rel: meta.rel, credHint: meta.credHint,
      corrKeys: [`cve:${v.cveID}`], attrs: { cve: v.cveID, kev: true, vendor: v.vendorProject, product: v.product, vulnName: v.vulnerabilityName, dateAdded: v.dateAdded, dueDate: v.dueDate, ransomware: v.knownRansomwareCampaignUse, cwes: v.cwes || [], action: String(v.requiredAction || '').slice(0, 300), notes: String(v.notes || '').slice(0, 300), description: String(v.shortDescription || '').slice(0, 400) },
      refs: [{ label: 'NVD record', url: `https://nvd.nist.gov/vuln/detail/${v.cveID}` }, { label: 'CISA KEV catalog', url: meta.homepage }], tags: ransom ? ['ransomware-use'] : [],
    }));
  }
  return out;
}
export async function run(ctx) {
  const r = await ctx.http.json('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', { timeoutMs: 25000 });
  const all = new Map((r.data?.vulnerabilities || []).map((v) => [v.cveID, v])); ctx.state.kevIndex = all;
  return { records: parse(r.data), bytes: r.bytes, ms: r.ms, note: `catalog ${r.data?.catalogVersion || '?'}, ${all.size} total entries` };
}
