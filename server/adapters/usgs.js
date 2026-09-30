import { makeEntity, clamp01 } from '../core/entity.js';
export const id = 'usgs';
export const meta = {
  name: 'USGS Earthquake Hazards', domain: 'seismic', homepage: 'https://earthquake.usgs.gov/', docs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
  license: 'Public domain (US Government work)', attribution: 'U.S. Geological Survey', auth: 'none', coverage: 'Global, M1+ in the US, M4+ elsewhere', refreshMs: 120_000, defaultEnabled: true, rel: 'A', credHint: 2,
  precision: 'Instrument-derived epicentre (km-scale)', caveats: ['Automatic solutions are revised; ORION marks status=reviewed as higher credibility.'],
};
export function parse(raw, { fetchedAt = new Date().toISOString() } = {}) {
  const out = [];
  for (const f of raw?.features || []) {
    const c = f.geometry?.coordinates || [], p = f.properties || {}, mag = Number(p.mag);
    if (!f.id || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || !Number.isFinite(mag)) continue;
    const sev = clamp01((mag - 2) / 5.5 + (p.tsunami === 1 ? 0.1 : 0) + (p.alert === 'orange' || p.alert === 'red' ? 0.1 : 0));
    out.push(makeEntity({
      id: `usgs:${f.id}`, type: 'seismic', source: id, name: `M${mag.toFixed(1)} ${p.place || 'unlocated'}`.slice(0, 100), lat: c[1], lon: c[0], altM: Number.isFinite(c[2]) ? -c[2] * 1000 : null,
      observedAt: p.time, fetchedAt, severity: sev, rel: meta.rel, credHint: p.status === 'reviewed' ? 2 : 3,
      attrs: { mag, magType: p.magType, depthKm: c[2], place: p.place, tsunami: p.tsunami === 1, sig: p.sig, alert: p.alert || null, felt: p.felt ?? null, mmi: p.mmi ?? null, status: p.status, net: p.net, updated: p.updated ? new Date(p.updated).toISOString() : null },
      refs: p.url ? [{ label: 'USGS event page', url: p.url }] : [], tags: [p.tsunami === 1 ? 'tsunami-flag' : null, p.alert ? `pager-${p.alert}` : null].filter(Boolean),
    }));
  }
  return out;
}
export async function run(ctx) {
  const feed = /^[\w.]+$/.test(ctx.config.usgsFeed) ? ctx.config.usgsFeed : 'all_day';
  const r = await ctx.http.json(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`, { timeoutMs: 15000 });
  return { records: parse(r.data, { fetchedAt: new Date().toISOString() }), bytes: r.bytes, ms: r.ms, note: `feed ${feed}` };
}
