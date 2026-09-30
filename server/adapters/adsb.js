// Aircraft via the community ADS-B "v2" API family (airplanes.live, adsb.lol, adsb.one: same readsb/ADSBExchange schema, tried in order).
// Global coverage is impossible with point queries, so ORION asks for what matters most: military-tagged aircraft, the three emergency squawks,
// and regional snapshots around hubs (plus on-demand "focus" regions requested from the UI).
import { makeEntity, clamp01 } from '../core/entity.js';
import { SQUAWK_MEANING } from '../../shared/taxonomy.js';
export const id = 'adsb';
export const meta = {
  name: 'ADS-B aircraft (airplanes.live / adsb.lol / adsb.one)', domain: 'aviation', homepage: 'https://airplanes.live/', docs: 'https://airplanes.live/api-guide/',
  license: 'Non-commercial use; no SLA (see provider terms)', attribution: 'airplanes.live community ADS-B network (or fallback provider)', auth: 'none', coverage: 'Military + emergency squawks (global) and regional snapshots', refreshMs: 45_000, defaultEnabled: true, rel: 'B', credHint: 2,
  precision: 'Receiver-derived position (metres to km)', caveats: ['Rate limit 1 request/s per provider; providers can change or disappear without notice.', 'Some aircraft (military, privacy programmes) are filtered or absent.', 'ADS-B is unauthenticated and can be spoofed.'],
};
const BASES = { 'airplanes.live': 'https://api.airplanes.live/v2', 'adsb.lol': 'https://api.adsb.lol/v2', 'adsb.one': 'https://api.adsb.one/v2' };
export const DEFAULT_REGIONS = Object.freeze([
  { name: 'London', lat: 51.5, lon: -0.1, nm: 150 }, { name: 'Frankfurt', lat: 50.0, lon: 8.6, nm: 150 }, { name: 'New York', lat: 40.7, lon: -74.0, nm: 150 }, { name: 'Los Angeles', lat: 34.0, lon: -118.3, nm: 150 },
  { name: 'Dubai', lat: 25.2, lon: 55.3, nm: 150 }, { name: 'Delhi', lat: 28.6, lon: 77.1, nm: 150 }, { name: 'Singapore', lat: 1.4, lon: 103.9, nm: 150 }, { name: 'Tokyo', lat: 35.5, lon: 139.7, nm: 150 },
  { name: 'Sao Paulo', lat: -23.5, lon: -46.6, nm: 150 }, { name: 'Johannesburg', lat: -26.1, lon: 28.2, nm: 150 }, { name: 'Sydney', lat: -33.9, lon: 151.2, nm: 150 },
]);
const FT = 0.3048;
export function parseAc(list, { fetchedAt = new Date().toISOString(), flavor = 'point', nowMs = Date.now() } = {}) {
  const out = [];
  for (const a of list || []) {
    if (!a || !a.hex || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;
    const ground = a.alt_baro === 'ground', altFt = ground ? 0 : Number(a.alt_baro ?? a.alt_geom);
    const mil = flavor === 'mil' || (Number(a.dbFlags) & 1) === 1, sq = a.squawk ? String(a.squawk) : null;
    const emerg = SQUAWK_MEANING[sq] ? sq : null, declared = a.emergency && a.emergency !== 'none' ? a.emergency : null;
    let sev = 0.03; if (mil) sev = 0.3; if (sq === '7600') sev = 0.55; else if (declared) sev = Math.max(sev, 0.6); if (sq === '7700') sev = 0.85; if (sq === '7500') sev = 1;
    const call = String(a.flight || '').trim(), seenPos = Number.isFinite(a.seen_pos) ? a.seen_pos : Number.isFinite(a.seen) ? a.seen : 0;
    out.push(makeEntity({
      id: `adsb:${a.hex}`, type: 'air', subtype: emerg || declared ? 'emergency' : mil ? 'mil' : 'civil', source: id, name: call || a.r || a.hex, lat: a.lat, lon: a.lon, altM: Number.isFinite(altFt) ? altFt * FT : null,
      observedAt: nowMs - seenPos * 1000, fetchedAt, severity: clamp01(sev), rel: meta.rel, credHint: meta.credHint,
      attrs: { hex: a.hex, callsign: call || null, registration: a.r || null, typeCode: a.t || null, category: a.category || null, altFt: Number.isFinite(altFt) ? Math.round(altFt) : null, onGround: ground, speedKt: Number.isFinite(a.gs) ? Math.round(a.gs) : null, headingDeg: Number.isFinite(a.track) ? a.track : null, vrateFpm: Number.isFinite(a.baro_rate) ? a.baro_rate : null, squawk: sq, emergency: declared, military: mil, operator: a.ownOp || null },
      tags: [mil ? 'military-tagged' : null, emerg ? `squawk-${emerg}` : null].filter(Boolean),
    }));
  }
  return out;
}
async function v2(ctx, path) {
  let last;
  for (const p of ctx.config.adsb.providers) {
    const base = BASES[p]; if (!base) continue;
    try { const r = await ctx.http.json(base + path, { timeoutMs: 9000 }); if (Array.isArray(r.data?.ac)) return { ...r, provider: p }; last = new Error(`${p}: unexpected response shape`); } catch (e) { last = e; }
  }
  throw last || new Error('no ADS-B provider configured');
}
export async function run(ctx) {
  const regions = [...(ctx.config.adsb.regions || DEFAULT_REGIONS)];
  const now = Date.now();
  for (const [k, f] of ctx.state.focus) { if (f.expires < now) ctx.state.focus.delete(k); else regions.push(f); }
  const jobs = [['/mil', 'mil'], ['/squawk/7700', 'squawk'], ['/squawk/7500', 'squawk'], ['/squawk/7600', 'squawk'], ...regions.map((r) => [`/point/${r.lat.toFixed(3)}/${r.lon.toFixed(3)}/${Math.min(250, r.nm || 150)}`, 'point'])];
  const merged = new Map(); let bytes = 0, ms = 0, ok = 0, provider = null, lastErr = null;
  for (const [path, flavor] of jobs) {
    try {
      const r = await v2(ctx, path); ok++; bytes += r.bytes; ms += r.ms; provider = r.provider;
      for (const e of parseAc(r.data.ac, { flavor, nowMs: Number(r.data.now) > 1e12 ? Number(r.data.now) : Date.now() })) { const prev = merged.get(e.id); if (!prev || e.severity > prev.severity || (e.severity === prev.severity && e.observedAt > prev.observedAt)) merged.set(e.id, e); }
    } catch (e) { lastErr = e; }
  }
  if (!ok) throw lastErr || new Error('all ADS-B queries failed');
  const records = [...merged.values()].slice(0, 12000);
  return { records, bytes, ms: Math.round(ms / ok), provider, note: `${ok}/${jobs.length} queries ok` };
}
