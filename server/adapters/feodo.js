// abuse.ch Feodo Tracker botnet C2 blocklist. The feed has no coordinates — only a country code — so ORION places each indicator at the country
// centroid plus a deterministic jitter and labels the precision as "country". It never claims to know where the server physically is.
import { makeEntity } from '../core/entity.js';
import { hashSeed, mulberry32 } from '../../shared/prng.js';
import { destination } from '../../shared/geo.js';
export const id = 'feodo';
export const meta = {
  name: 'abuse.ch Feodo Tracker (botnet C2)', domain: 'cti', homepage: 'https://feodotracker.abuse.ch/', docs: 'https://feodotracker.abuse.ch/blocklist/',
  license: 'CC0 (abuse.ch); see terms of use', attribution: 'abuse.ch Feodo Tracker', auth: 'none', coverage: 'Global botnet C2 IPs (Emotet, QakBot, Dridex, ...)', refreshMs: 900_000, defaultEnabled: true, rel: 'A', credHint: 2,
  precision: 'Country level only (feed has no coordinates)', caveats: ['Map position is the country centroid plus deterministic jitter, not a geolocation of the server.', 'Blocklist entries can be stale or shared hosting; verify before acting.'],
};
export function parse(list, ref, { fetchedAt = new Date().toISOString(), max = 600 } = {}) {
  const out = [], now = Date.parse(fetchedAt);
  for (const r of Array.isArray(list) ? list : []) {
    if (!r?.ip_address || !/^[\d.:a-f]+$/i.test(r.ip_address)) continue;
    const c = ref.centroids?.[String(r.country || '').toUpperCase()]; if (!c) continue;
    const rng = mulberry32(hashSeed(`${r.ip_address}:${r.port}`)); const [lat, lon] = destination(c.lat, c.lon, rng() * 360, 30 + rng() * 280);
    const online = r.status === 'online', lastOnline = Date.parse(`${String(r.last_online || '').slice(0, 10)}T00:00:00Z`), first = Date.parse(String(r.first_seen || '').replace(' ', 'T') + 'Z');
    if (!online && Number.isFinite(lastOnline) && now - lastOnline > 30 * 86400000) continue;
    out.push(makeEntity({
      id: `feodo:${r.ip_address}:${r.port}`, type: 'cyber', subtype: 'c2', source: id, name: `${r.malware || 'C2'} ${r.ip_address}:${r.port}`, lat, lon, precision: 'country', observedAt: online ? fetchedAt : (Number.isFinite(lastOnline) ? lastOnline : first), fetchedAt,
      severity: online ? 0.8 : 0.4, rel: meta.rel, credHint: meta.credHint, corrKeys: [`ip:${r.ip_address}`],
      attrs: { ip: r.ip_address, port: r.port, status: r.status, hostname: r.hostname || null, asn: r.as_number ?? null, asName: r.as_name || null, country: r.country, firstSeen: r.first_seen, lastOnline: r.last_online, malware: r.malware || null, geoNote: 'country centroid + deterministic jitter' },
      refs: [{ label: 'Feodo Tracker', url: 'https://feodotracker.abuse.ch/' }], tags: [r.malware ? String(r.malware).toLowerCase() : 'c2', online ? 'online' : 'offline'],
    }));
    if (out.length >= max) break;
  }
  return out;
}
export async function run(ctx) {
  const r = await ctx.http.json('https://feodotracker.abuse.ch/downloads/ipblocklist.json', { timeoutMs: 20000 });
  return { records: parse(r.data, ctx.ref), bytes: r.bytes, ms: r.ms, note: `${Array.isArray(r.data) ? r.data.length : 0} blocklist rows` };
}
