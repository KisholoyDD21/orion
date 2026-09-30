import { makeEntity, clamp01 } from '../core/entity.js';
import { centroidOfCoords } from '../../shared/geo.js';
export const id = 'eonet';
export const meta = {
  name: 'NASA EONET (natural events)', domain: 'hazard', homepage: 'https://eonet.gsfc.nasa.gov/', docs: 'https://eonet.gsfc.nasa.gov/docs/v3',
  license: 'NASA open data (public domain; cite source)', attribution: 'NASA Earth Observatory Natural Event Tracker', auth: 'none', coverage: 'Global, open events only', refreshMs: 600_000, defaultEnabled: true, rel: 'B', credHint: 2,
  precision: 'Event point or polygon centroid', caveats: ['EONET aggregates agency reports; polygon events are reduced to their centroid.'],
};
const BASE = { volcanoes: 0.7, severeStorms: 0.6, wildfires: 0.4, floods: 0.5, earthquakes: 0.5, landslides: 0.5, drought: 0.3, dustHaze: 0.25, seaLakeIce: 0.12, snow: 0.2, tempExtremes: 0.3, waterColor: 0.1, manmade: 0.4 };
export function parse(raw, { fetchedAt = new Date().toISOString() } = {}) {
  const out = [];
  for (const ev of raw?.events || []) {
    const geoms = (ev.geometry || []).filter((g) => g && g.coordinates).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), g = geoms.at(-1);
    if (!ev.id || !g) continue;
    const c = g.type === 'Point' ? g.coordinates : centroidOfCoords(g.coordinates);
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const cat = ev.categories?.[0] || {}, mag = Number(g.magnitudeValue);
    let sev = BASE[cat.id] ?? 0.3;
    if (Number.isFinite(mag)) { if (g.magnitudeUnit === 'kts') sev += clamp01((mag - 34) / 100) * 0.3; else if (/acre/i.test(g.magnitudeUnit || '')) sev += clamp01(Math.log10(Math.max(1, mag)) / 6) * 0.3; }
    out.push(makeEntity({
      id: `eonet:${ev.id}`, type: 'hazard', subtype: cat.id || 'other', source: id, name: String(ev.title || ev.id).slice(0, 100), lat: c[1], lon: c[0], observedAt: g.date, fetchedAt,
      precision: g.type === 'Point' ? 'exact' : 'approx', severity: clamp01(sev), rel: meta.rel, credHint: meta.credHint,
      attrs: { category: cat.title, magnitude: Number.isFinite(mag) ? mag : null, magnitudeUnit: g.magnitudeUnit || null, track: geoms.length, sources: (ev.sources || []).map((s) => s.id).slice(0, 6) },
      refs: [...(ev.link ? [{ label: 'EONET record', url: ev.link }] : []), ...(ev.sources || []).filter((s) => s.url).slice(0, 4).map((s) => ({ label: s.id, url: s.url }))],
    }));
  }
  return out;
}
export async function run(ctx) {
  const r = await ctx.http.json('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=300', { timeoutMs: 20000 });
  return { records: parse(r.data), bytes: r.bytes, ms: r.ms };
}
