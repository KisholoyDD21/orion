// Satellites from CelesTrak GP data (OMM JSON). Elements refresh about every 2 h upstream, so ORION caches on disk and never polls faster.
import path from 'node:path';
import { makeEntity } from '../core/entity.js';
import { readJsonSync, writeJsonAtomic, fileAgeMs } from '../lib/cache.js';
import { orbit } from '../lib/orbit.js';
export const id = 'celestrak';
export const meta = {
  name: 'CelesTrak GP element sets', domain: 'space', homepage: 'https://celestrak.org/', docs: 'https://celestrak.org/NORAD/documentation/gp-data-formats.php',
  license: 'Free for research use (data derived from U.S. Space Force / Space-Track)', attribution: 'CelesTrak (Dr. T.S. Kelso)', auth: 'none', coverage: 'Selectable groups (stations, visual, GPS, weather, science, GEO, military)', refreshMs: 2 * 3.6e6, defaultEnabled: true, rel: 'B', credHint: 2,
  precision: 'SGP4 prediction; error grows with element-set age (km after days)', caveats: ['Positions are computed (SGP4), not observed.', 'Polling faster than every 2 h is discouraged upstream, so ORION caches to disk.'],
};
const OMM_KEYS = ['OBJECT_NAME', 'OBJECT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'EPHEMERIS_TYPE', 'CLASSIFICATION_TYPE', 'NORAD_CAT_ID', 'ELEMENT_SET_NO', 'REV_AT_EPOCH', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT'];
export const compactOmm = (o) => Object.fromEntries(OMM_KEYS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
export function toEntities(list, group, { fetchedAt = new Date().toISOString(), now = new Date() } = {}) {
  const out = [];
  for (const o of Array.isArray(list) ? list : []) {
    if (!o || !o.NORAD_CAT_ID || !Number.isFinite(Number(o.MEAN_MOTION))) continue;
    let pos = null; try { pos = orbit.positionAt(orbit.ommToSatrec(o), now); } catch { pos = null; }
    if (!pos) continue;
    const mm = Number(o.MEAN_MOTION), a = Math.cbrt(398600.4418 / ((mm * 2 * Math.PI / 86400) ** 2)), ecc = Number(o.ECCENTRICITY);
    out.push(makeEntity({
      id: `sat:${o.NORAD_CAT_ID}`, type: 'space', subtype: orbit.orbitClass(o), source: id, name: String(o.OBJECT_NAME || o.NORAD_CAT_ID), lat: pos.lat, lon: pos.lon, altM: pos.altKm * 1000, observedAt: o.EPOCH, fetchedAt, severity: 0.02, rel: meta.rel, credHint: meta.credHint, precision: 'approx', hl: 'space',
      attrs: { norad: String(o.NORAD_CAT_ID), intlDes: o.OBJECT_ID, groups: [group], inclDeg: Number(o.INCLINATION), periodMin: +(1440 / mm).toFixed(2), perigeeKm: Math.round(a * (1 - ecc) - 6378.137), apogeeKm: Math.round(a * (1 + ecc) - 6378.137), epoch: o.EPOCH, omm: compactOmm(o) },
      refs: [{ label: 'CelesTrak object', url: `https://celestrak.org/NORAD/elements/gp.php?CATNR=${encodeURIComponent(o.NORAD_CAT_ID)}` }],
    }));
  }
  return out;
}
export async function run(ctx) {
  const merged = new Map(); let bytes = 0, notes = [];
  for (const g of ctx.config.celestrakGroups) {
    if (!/^[\w-]+$/.test(g)) continue;
    const file = path.join(ctx.config.cacheDir, `celestrak-${g}.json`);
    let list = fileAgeMs(file) < 2 * 3.6e6 ? readJsonSync(file) : null;
    if (!list) {
      try { const r = await ctx.http.json(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(g)}&FORMAT=json`, { timeoutMs: 30000, maxBytes: 40_000_000 }); list = r.data; bytes += r.bytes; writeJsonAtomic(file, list); }
      catch (e) { list = readJsonSync(file); notes.push(`${g}: ${list ? 'stale cache' : 'failed'} (${e.message.slice(0, 60)})`); }
    }
    for (const e of toEntities(list, g)) { const prev = merged.get(e.id); if (prev) { prev.attrs.groups.push(g); } else merged.set(e.id, e); }
    if (merged.size > 8000) break;
  }
  if (!merged.size) throw new Error(`no element sets available (${notes.join('; ')})`);
  return { records: [...merged.values()], bytes, note: notes.join('; ') || `${ctx.config.celestrakGroups.length} groups` };
}
