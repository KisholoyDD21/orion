import { makeEntity, clamp01 } from '../core/entity.js';
export const id = 'nvd';
export const meta = {
  name: 'NIST NVD (recent high-severity CVEs)', domain: 'vulnerability', homepage: 'https://nvd.nist.gov/', docs: 'https://nvd.nist.gov/developers/vulnerabilities',
  license: 'Public domain (US Government work)', attribution: 'NIST National Vulnerability Database', auth: 'optional API key (higher rate limit)', coverage: 'CVEs published in the last 3 days with CVSS >= 7', refreshMs: 3 * 3.6e6, defaultEnabled: true, rel: 'A', credHint: 2,
  precision: 'Not geolocated', caveats: ['Unauthenticated limit is 5 requests / 30 s; ORION issues one request per refresh.', 'CVSS measures severity, not likelihood of exploitation (see EPSS and KEV).'],
};
export function cvssOf(metrics = {}) {
  for (const k of ['cvssMetricV40', 'cvssMetricV31', 'cvssMetricV30', 'cvssMetricV2']) { const m = metrics[k]?.[0]; if (m?.cvssData) return { version: k.replace('cvssMetric', ''), score: Number(m.cvssData.baseScore), severity: m.cvssData.baseSeverity || m.baseSeverity || null, vector: m.cvssData.vectorString || null }; }
  return null;
}
export function parse(raw, { fetchedAt = new Date().toISOString(), minScore = 7 } = {}) {
  const out = [];
  for (const w of raw?.vulnerabilities || []) {
    const c = w.cve; if (!c?.id || !/^CVE-\d{4}-\d{4,7}$/.test(c.id)) continue;
    const s = cvssOf(c.metrics); if (!s || !(s.score >= minScore)) continue;
    const desc = (c.descriptions || []).find((d) => d.lang === 'en')?.value || '';
    out.push(makeEntity({
      id: `nvd:${c.id}`, type: 'vuln', layer: 'vuln', source: id, name: `${c.id} CVSS ${s.score.toFixed(1)}`, observedAt: c.published, fetchedAt, severity: clamp01(s.score / 10), rel: meta.rel, credHint: meta.credHint, corrKeys: [`cve:${c.id}`],
      attrs: { cve: c.id, kev: false, cvss: s.score, cvssVersion: s.version, cvssSeverity: s.severity, vector: s.vector, status: c.vulnStatus, description: desc.slice(0, 400), cwes: (c.weaknesses || []).flatMap((x) => x.description || []).map((d) => d.value).filter((v) => /^CWE-/.test(v)).slice(0, 4) },
      refs: [{ label: 'NVD record', url: `https://nvd.nist.gov/vuln/detail/${c.id}` }],
    }));
  }
  return out;
}
export async function run(ctx) {
  const fmt = (d) => d.toISOString().slice(0, 23), end = new Date(), start = new Date(end.getTime() - 3 * 86400000);
  const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${fmt(start)}&pubEndDate=${fmt(end)}&resultsPerPage=200&noRejected`;
  const r = await ctx.http.json(url, { timeoutMs: 30000, headers: ctx.config.keys.nvd ? { apiKey: ctx.config.keys.nvd } : {} });
  return { records: parse(r.data), bytes: r.bytes, ms: r.ms, note: `${r.data?.totalResults ?? '?'} CVEs published in window` };
}
