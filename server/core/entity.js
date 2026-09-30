// Normalised entity factory — every adapter funnels through here so downstream code can rely on the shape.
const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const iso = (v, dflt) => { const d = v instanceof Date ? v : new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : dflt; };
const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const trim = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
export function makeEntity(p) {
  if (!p || !p.id || !p.type || !p.source) throw new Error('entity requires id, type, source');
  const lat = num(p.lat), lon = num(p.lon);
  const geo = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const fetchedAt = iso(p.fetchedAt, new Date().toISOString());
  return {
    id: trim(p.id, 160), type: p.type, layer: p.layer || p.type, subtype: p.subtype || null, source: p.source,
    name: trim(p.name ?? p.id, 120),
    lat: geo ? lat : null, lon: geo ? lon : null, altM: geo ? num(p.altM) : null,
    observedAt: iso(p.observedAt, fetchedAt), fetchedAt,
    synthetic: !!p.synthetic, precision: p.precision || 'exact', rel: p.rel || 'C', hl: p.hl || null,
    severity: clamp01(p.severity), criticalityHint: p.criticalityHint == null ? null : clamp01(p.criticalityHint), credHint: p.credHint ? Number(p.credHint) : null,
    attrs: p.attrs || {}, corrKeys: (p.corrKeys || []).slice(0, 8),
    refs: (p.refs || []).filter((r) => r && /^https?:\/\//i.test(r.url || '')).slice(0, 8).map((r) => ({ label: trim(r.label || r.url, 80), url: String(r.url).slice(0, 500) })),
    tags: (p.tags || []).slice(0, 12).map((t) => trim(t, 40)),
    firstSeenAt: p.firstSeenAt || fetchedAt,
  };
}
export { clamp01, trim };
