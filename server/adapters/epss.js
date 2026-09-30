// EPSS (FIRST.org): probability that a CVE will be exploited in the next 30 days. Used as an enrichment table (no entities of its own).
export const id = 'epss';
export const enrichment = true;
export const meta = {
  name: 'FIRST EPSS (exploit prediction)', domain: 'vulnerability', homepage: 'https://www.first.org/epss/', docs: 'https://www.first.org/epss/api',
  license: 'Free to use; cite FIRST EPSS', attribution: 'FIRST.org EPSS', auth: 'none', coverage: 'CVEs present in ORION (KEV + recent NVD)', refreshMs: 6 * 3.6e6, defaultEnabled: true, rel: 'A', credHint: 2, startDelayMs: 25_000,
  precision: 'Probability in [0,1] with percentile', caveats: ['EPSS is a statistical estimate, not a measurement of exposure.'],
};
export function parse(raw) {
  const m = new Map();
  for (const r of raw?.data || []) { const e = Number(r.epss), p = Number(r.percentile); if (/^CVE-/.test(r.cve || '') && Number.isFinite(e) && Number.isFinite(p)) m.set(r.cve.toUpperCase(), { epss: e, percentile: p, date: r.date }); }
  return m;
}
export async function run(ctx) {
  const ids = [...new Set(ctx.store.all().filter((e) => e.type === 'vuln').map((e) => e.attrs.cve))].slice(0, 500);
  if (!ids.length) return { records: [], note: 'no CVEs to enrich yet' };
  const map = ctx.state.epss || (ctx.state.epss = new Map()); let bytes = 0;
  for (let i = 0; i < ids.length; i += 60) {
    const r = await ctx.http.json(`https://api.first.org/data/v1/epss?cve=${ids.slice(i, i + 60).join(',')}`, { timeoutMs: 20000 });
    bytes += r.bytes; for (const [k, v] of parse(r.data)) map.set(k, v);
  }
  ctx.onEnrich?.();
  return { records: [], bytes, note: `${map.size} CVEs scored` };
}
