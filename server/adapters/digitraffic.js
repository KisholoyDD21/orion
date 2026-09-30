// Fintraffic Digitraffic Marine: open, key-less AIS for Finnish waters and the Baltic. This is a *regional* maritime feed — ORION says so in the UI.
import { makeEntity, clamp01 } from '../core/entity.js';
import { AIS_NAV_STATUS, shipTypeLabel } from '../../shared/taxonomy.js';
import { readJsonSync, writeJsonAtomic, fileAgeMs } from '../lib/cache.js';
import path from 'node:path';
export const id = 'digitraffic';
export const meta = {
  name: 'Digitraffic Marine AIS (Baltic / Finland)', domain: 'maritime', homepage: 'https://www.digitraffic.fi/en/marine-traffic/', docs: 'https://www.digitraffic.fi/en/marine-traffic/',
  license: 'CC BY 4.0 (Fintraffic / Digitraffic)', attribution: 'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY', auth: 'none', coverage: 'Baltic Sea and Finnish waters only', refreshMs: 60_000, defaultEnabled: true, rel: 'B', credHint: 3,
  precision: 'AIS self-reported position (metres)', caveats: ['AIS is self-reported and spoofable; ORION does not treat AIS as ground truth.', 'Regional feed: no coverage outside the Baltic region.'],
};
const MID = { 636: 'LR', 637: 'LR', 351: 'PA', 352: 'PA', 353: 'PA', 354: 'PA', 355: 'PA', 356: 'PA', 357: 'PA', 370: 'PA', 371: 'PA', 372: 'PA', 373: 'PA', 538: 'MH', 477: 'HK', 563: 'SG', 564: 'SG', 565: 'SG', 566: 'SG', 215: 'MT', 229: 'MT', 248: 'MT', 249: 'MT', 256: 'MT', 308: 'BS', 309: 'BS', 311: 'BS', 412: 'CN', 413: 'CN', 414: 'CN', 237: 'GR', 239: 'GR', 240: 'GR', 241: 'GR', 209: 'CY', 210: 'CY', 212: 'CY', 431: 'JP', 432: 'JP', 440: 'KR', 441: 'KR', 257: 'NO', 258: 'NO', 259: 'NO', 219: 'DK', 220: 'DK', 211: 'DE', 218: 'DE', 232: 'GB', 233: 'GB', 234: 'GB', 235: 'GB', 244: 'NL', 245: 'NL', 246: 'NL', 338: 'US', 366: 'US', 367: 'US', 368: 'US', 369: 'US', 273: 'RU', 230: 'FI', 265: 'SE', 266: 'SE', 276: 'EE', 275: 'LV', 277: 'LT', 261: 'PL', 247: 'IT', 226: 'FR', 227: 'FR', 228: 'FR', 224: 'ES', 225: 'ES', 271: 'TR', 419: 'IN', 525: 'ID', 533: 'MY', 548: 'PH', 567: 'TH', 574: 'VN', 503: 'AU', 316: 'CA', 710: 'BR', 422: 'IR', 470: 'AE', 471: 'AE', 403: 'SA', 622: 'EG' };
export const flagOf = (mmsi) => MID[Math.floor(Number(mmsi) / 1e6)] || null;
export function parseLocations(fc, vessels = new Map(), { fetchedAt = new Date().toISOString(), max = 3500 } = {}) {
  const rows = [];
  for (const f of fc?.features || []) {
    const p = f.properties || {}, mmsi = f.mmsi ?? p.mmsi, c = f.geometry?.coordinates || [];
    if (!mmsi || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    rows.push({ mmsi, lon: c[0], lat: c[1], p });
  }
  rows.sort((a, b) => (b.p.sog > 0.3) - (a.p.sog > 0.3) || (b.p.timestampExternal || 0) - (a.p.timestampExternal || 0));
  return rows.slice(0, max).map(({ mmsi, lon, lat, p }) => {
    const v = vessels.get(String(mmsi)) || {}, nav = Number.isInteger(p.navStat) ? p.navStat : 15;
    const sev = nav === 14 ? 0.95 : nav === 6 ? 0.8 : nav === 2 ? 0.55 : nav === 3 ? 0.25 : 0.03;
    return makeEntity({
      id: `ais:${mmsi}`, type: 'maritime', subtype: nav === 14 || nav === 6 || nav === 2 ? 'distress' : 'vessel', source: id, name: (v.name || `MMSI ${mmsi}`).trim(), lat, lon, observedAt: p.timestampExternal, fetchedAt, severity: clamp01(sev), rel: meta.rel, credHint: meta.credHint,
      attrs: { mmsi: String(mmsi), name: v.name || null, imo: v.imo || null, callSign: v.callSign || null, shipType: v.shipType ?? null, shipTypeLabel: shipTypeLabel(v.shipType), destination: v.destination || null, draught: v.draught != null ? v.draught / 10 : null, flag: flagOf(mmsi), navStat: nav, navStatLabel: AIS_NAV_STATUS[nav] || 'Undefined', speedKt: p.sog != null && p.sog <= 102.2 ? p.sog : null, courseDeg: p.cog != null && p.cog < 360 ? p.cog : null, headingDeg: p.heading != null && p.heading < 360 ? p.heading : null },
      tags: nav === 14 ? ['ais-sart-active'] : nav === 6 ? ['aground'] : nav === 2 ? ['not-under-command'] : [],
    });
  });
}
async function vesselMeta(ctx) {
  const file = path.join(ctx.config.cacheDir, 'digitraffic-vessels.json');
  if (ctx.state.vessels && Date.now() - ctx.state.vesselsAt < 6 * 3.6e6) return ctx.state.vessels;
  let list = null;
  if (fileAgeMs(file) < 6 * 3.6e6) list = readJsonSync(file);
  if (!list) { try { list = (await ctx.http.json('https://meri.digitraffic.fi/api/ais/v1/vessels', { timeoutMs: 40000, maxBytes: 60_000_000, headers: { 'Digitraffic-User': 'ORION-Intelligence-Fabric' } })).data; writeJsonAtomic(file, list); } catch (e) { list = readJsonSync(file) || []; ctx.log.warn(`digitraffic vessel metadata unavailable: ${e.message}`); } }
  ctx.state.vessels = new Map((Array.isArray(list) ? list : []).map((v) => [String(v.mmsi), v])); ctx.state.vesselsAt = Date.now();
  return ctx.state.vessels;
}
export async function run(ctx) {
  const vessels = await vesselMeta(ctx);
  const r = await ctx.http.json(`https://meri.digitraffic.fi/api/ais/v1/locations?from=${Date.now() - 20 * 60_000}`, { timeoutMs: 30000, maxBytes: 60_000_000, headers: { 'Digitraffic-User': 'ORION-Intelligence-Fabric' } });
  return { records: parseLocations(r.data, vessels), bytes: r.bytes, ms: r.ms, note: `${vessels.size} vessel records joined` };
}
