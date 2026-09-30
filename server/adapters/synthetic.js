// Synthetic scenario generator. Used for offline demo mode, tests and UI development. Every record is flagged synthetic:true and rendered as a hollow
// marker with a "SYNTHETIC" badge; nothing here is real traffic, seismicity or threat data. Deterministic for a given seed and time.
import { makeEntity, clamp01 } from '../core/entity.js';
import { Rng, hashSeed } from '../../shared/prng.js';
import { destination, bearingDeg, haversineKm } from '../../shared/geo.js';
import { orbit } from '../lib/orbit.js';
import { AIS_NAV_STATUS } from '../../shared/taxonomy.js';
export const id = 'synthetic';
export const meta = {
  name: 'Synthetic demo scenario', domain: 'demo', homepage: 'https://github.com/', docs: 'docs/ARCHITECTURE.md',
  license: 'MIT (generated data)', attribution: 'ORION synthetic generator', auth: 'none', coverage: 'Global, fictional', refreshMs: 5000, defaultEnabled: false, rel: 'F', credHint: 3,
  precision: 'n/a (fictional)', caveats: ['Entirely synthetic. Exists so the workstation is demonstrable offline and so tests are deterministic.'],
};
const LANES = [
  [[1.2, 103.8], [2.5, 101.5], [4.5, 99.5], [6.0, 96.5], [6.5, 92.0]], [[50.0, -3.0], [50.6, 0.5], [51.1, 1.6], [52.5, 3.4], [53.8, 7.5]], [[31.3, 32.3], [27.5, 33.8], [22.0, 37.5], [15.0, 41.5], [12.5, 44.5], [12.0, 50.0]],
  [[12.0, 50.0], [15.0, 58.0], [18.0, 66.0], [18.9, 72.5]], [[54.5, 10.5], [55.5, 14.5], [57.0, 19.5], [59.4, 23.5], [60.1, 25.0]], [[1.3, 104.0], [6.0, 108.5], [12.0, 110.5], [18.5, 113.5], [22.3, 114.5]],
  [[9.3, -79.9], [12.5, -77.0], [17.0, -72.0], [24.0, -80.0]], [[24.5, 54.5], [26.2, 56.3], [25.2, 58.5]], [[-33.9, 18.3], [-30.0, 30.5], [-20.0, 40.5]], [[36.0, -6.0], [36.5, -1.0], [37.5, 5.0], [38.0, 12.0], [35.5, 18.0]],
];
const SEISMIC_BELTS = [[38, 142, 6], [35, 139, 4], [-33, -71.5, 5], [-1, 99, 6], [38.5, 24, 4], [28, 85, 4], [37, -122, 3], [15, -92, 4], [-6, 130, 5], [40, 30, 3], [36, 70, 3], [-20, -70, 4]];
const MALWARE = ['Emotet', 'QakBot', 'Dridex', 'TrickBot', 'BumbleBee'];
const C2_COUNTRIES = ['US', 'DE', 'NL', 'RU', 'CN', 'SG', 'GB', 'FR', 'IN', 'BR', 'JP', 'CA', 'UA', 'TR', 'ZA'];

const alongPolyline = (pts, s) => {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = haversineKm(...pts[i], ...pts[i + 1]);
    if (s <= acc + d || i === pts.length - 2) { const f = Math.min(1, Math.max(0, (s - acc) / (d || 1))); return { lat: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, lon: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f, hdg: bearingDeg(...pts[i], ...pts[i + 1]) }; }
    acc += d;
  }
};
const polyLen = (pts) => pts.slice(1).reduce((s, p, i) => s + haversineKm(...pts[i], ...p), 0);

export function generate({ ref, seed = 'orion-demo', now = Date.now(), t0 = now } = {}) {
  const rng = new Rng(hashSeed(seed)), fetchedAt = new Date(now).toISOString(), out = [];
  const REL = { 'syn-usgs': 'A', 'syn-eonet': 'B', 'syn-gdelt': 'C', 'syn-adsb': 'B', 'syn-ais': 'B', 'syn-celestrak': 'B', 'syn-feodo': 'A', 'syn-kev': 'A' };   // grade of the real source each synthetic stream stands in for
  const mk = (p) => makeEntity({ synthetic: true, fetchedAt, credHint: 3, ...p, rel: REL[p.source] || 'C' });
  // --- aircraft on great-circle routes
  const big = ref.airports.filter((a) => a.size === 'L');
  for (let i = 0; i < 70; i++) {
    const A = big[Math.floor(rng.next() * big.length)]; let B, tries = 0;
    do { B = big[Math.floor(rng.next() * big.length)]; } while ((haversineKm(A.lat, A.lon, B.lat, B.lon) < 1500 || haversineKm(A.lat, A.lon, B.lat, B.lon) > 9500) && ++tries < 40);
    const L = haversineKm(A.lat, A.lon, B.lat, B.lon), vKmS = (430 + rng.next() * 60) * 1.852 / 3600, phase = rng.next() * L / vKmS, f = ((now / 1000 + phase) * vKmS / L) % 1;
    const b0 = bearingDeg(A.lat, A.lon, B.lat, B.lon), [lat, lon] = destination(A.lat, A.lon, b0, f * L), hdg = bearingDeg(lat, lon, B.lat, B.lon);
    const mil = i % 14 === 5, sq = i === 3 ? '7700' : i === 9 ? '7600' : '1200';
    out.push(mk({
      id: `syn:air:${i}`, type: 'air', subtype: sq !== '1200' ? 'emergency' : mil ? 'mil' : 'civil', source: 'syn-adsb', name: `SYN${100 + i}`, lat, lon, altM: 10000 + rng.next() * 2000, observedAt: now - 2000,
      severity: sq === '7700' ? 0.85 : sq === '7600' ? 0.55 : mil ? 0.3 : 0.03,
      attrs: { hex: `syn${i.toString(16).padStart(3, '0')}`, callsign: `SYN${100 + i}`, altFt: 36000, speedKt: Math.round(vKmS * 3600 / 1.852), headingDeg: hdg, squawk: sq, military: mil, onGround: false, route: `${A.iata || A.icao}-${B.iata || B.icao}` },
    }));
  }
  // --- vessels on shipping lanes
  let v = 0;
  LANES.forEach((lane, li) => {
    const L = polyLen(lane);
    for (let k = 0; k < 4; k++, v++) {
      const kn = 8 + rng.next() * 10, s2 = (now / 1000 * kn * 1.852 / 3600 + rng.next() * 2 * L) % (2 * L), s = s2 > L ? 2 * L - s2 : s2, p = alongPolyline(lane, s);
      const nav = v === 7 ? 6 : v === 18 ? 2 : 0, moving = nav === 0;
      out.push(mk({
        id: `syn:ais:${v}`, type: 'maritime', subtype: nav ? 'distress' : 'vessel', source: 'syn-ais', name: `SYN VESSEL ${v + 1}`, lat: p.lat, lon: p.lon, observedAt: now - 5000, severity: nav === 6 ? 0.8 : nav === 2 ? 0.55 : 0.03,
        attrs: { mmsi: `99900${String(v).padStart(4, '0')}`, shipTypeLabel: ['Cargo', 'Tanker', 'Passenger', 'Fishing'][v % 4], navStat: nav, navStatLabel: AIS_NAV_STATUS[nav], speedKt: moving ? +kn.toFixed(1) : 0, courseDeg: p.hdg, headingDeg: p.hdg, flag: null },
      }));
    }
  });
  // --- satellites (fictional element sets, real SGP4 propagation)
  const epoch = new Date(now).toISOString().slice(0, 23), sats = [];
  const shell = (n, base, spread, name) => { for (let i = 0; i < n; i++) sats.push({ ...base, ...(spread ? spread(i, n) : {}), name: `${name}-${String(i + 1).padStart(3, '0')}` }); };
  shell(2, { mm: 15.5, ecc: 0.0006, inc: 51.64, raan: 120, argp: 80, ma: 10 }, (i) => ({ raan: 120 + i * 40, ma: i * 180 }), 'SYN-STATION');
  shell(60, { mm: 15.06, ecc: 0.0001, inc: 53.05, argp: 90 }, (i, n) => ({ raan: (i % 12) * 30, ma: Math.floor(i / 12) * (360 / 5) + (i % 12) * 7 }), 'SYN-LEO-A');
  shell(20, { mm: 14.2, ecc: 0.001, inc: 98.6, argp: 90 }, (i, n) => ({ raan: (i * 18) % 360, ma: (i * 97) % 360 }), 'SYN-SSO');
  shell(24, { mm: 2.00565, ecc: 0.005, inc: 55, argp: 0 }, (i) => ({ raan: Math.floor(i / 4) * 60, ma: (i % 4) * 90 + Math.floor(i / 4) * 15 }), 'SYN-NAV');
  shell(12, { mm: 1.0027, ecc: 0.0002, inc: 0.05, argp: 0, raan: 0 }, (i, n) => ({ ma: (i * 360) / n }), 'SYN-GEO');
  shell(3, { mm: 2.0058, ecc: 0.74, inc: 63.4, argp: 270 }, (i) => ({ raan: i * 120, ma: i * 120 }), 'SYN-HEO');
  sats.forEach((s, i) => {
    const omm = { OBJECT_NAME: s.name, OBJECT_ID: `2099-${String(i).padStart(3, '0')}A`, EPOCH: epoch, MEAN_MOTION: s.mm, ECCENTRICITY: s.ecc, INCLINATION: s.inc, RA_OF_ASC_NODE: s.raan % 360, ARG_OF_PERICENTER: s.argp, MEAN_ANOMALY: s.ma % 360, EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U', NORAD_CAT_ID: 990001 + i, ELEMENT_SET_NO: 999, REV_AT_EPOCH: 100, BSTAR: 0.0001, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0 };
    const pos = orbit.positionAt(orbit.ommToSatrec(omm), new Date(now)); if (!pos) return;
    const a = Math.cbrt(398600.4418 / ((s.mm * 2 * Math.PI / 86400) ** 2));
    out.push(mk({ id: `syn:sat:${omm.NORAD_CAT_ID}`, type: 'space', subtype: orbit.orbitClass(omm), source: 'syn-celestrak', name: s.name, lat: pos.lat, lon: pos.lon, altM: pos.altKm * 1000, observedAt: now, severity: 0.02, hl: 'space', precision: 'approx',
      attrs: { norad: String(omm.NORAD_CAT_ID), groups: ['synthetic'], inclDeg: s.inc, periodMin: +(1440 / s.mm).toFixed(2), perigeeKm: Math.round(a * (1 - s.ecc) - 6378.137), apogeeKm: Math.round(a * (1 + s.ecc) - 6378.137), epoch: omm.EPOCH, omm } }));
  });
  // --- seismic events (Gutenberg–Richter magnitudes) along real belts + a scripted nuclear-adjacent scenario
  const r2 = new Rng(hashSeed(seed + ':events'));
  const quakes = [];
  for (let i = 0; i < 26; i++) { const b = SEISMIC_BELTS[i % SEISMIC_BELTS.length], [lat, lon] = destination(b[0], b[1], r2.next() * 360, r2.next() * 350), mag = Math.min(7.2, 2.5 - Math.log10(1 - r2.next() * 0.995)); quakes.push({ lat, lon, mag, ageMin: r2.next() * 1300 }); }
  quakes.push({ lat: 37.35, lon: 141.4, mag: 5.9, ageMin: 40, scripted: true });
  quakes.forEach((q, i) => out.push(mk({
    id: `syn:quake:${i}`, type: 'seismic', source: 'syn-usgs', name: `M${q.mag.toFixed(1)} synthetic${q.scripted ? ' (scripted: off Fukushima)' : ''}`, lat: q.lat, lon: q.lon, altM: -10000, observedAt: t0 - q.ageMin * 60000, severity: clamp01((q.mag - 2) / 5.5), credHint: 2,
    attrs: { mag: +q.mag.toFixed(1), depthKm: 10, status: 'synthetic', tsunami: q.mag > 6.5 },
  })));
  // --- hazards and media that corroborate some quakes
  const hz = [['wildfires', -33.8, 150.9], ['wildfires', 38.2, -120.5], ['severeStorms', 18.5, 122.0], ['volcanoes', -8.1, 112.9], ['floods', 24.9, 90.3], ['wildfires', 37.9, 23.9], ['volcanoes', 37.7, 15.0], ['severeStorms', 25.5, -85.0], ['drought', 12.0, 8.5], ['landslides', 28.2, 84.9]];
  hz.forEach(([cat, lat, lon], i) => out.push(mk({ id: `syn:hazard:${i}`, type: 'hazard', subtype: cat, source: 'syn-eonet', name: `Synthetic ${cat} ${i + 1}`, lat, lon, observedAt: t0 - (60 + i * 200) * 60000, severity: { volcanoes: 0.7, severeStorms: 0.6, wildfires: 0.4, floods: 0.5, drought: 0.3, landslides: 0.5 }[cat], credHint: 2, attrs: { category: cat } })));
  const mediaAt = [[37.3, 141.2, 'hazard', 240], [-8.0, 113.0, 'hazard', 60], [24.8, 90.4, 'hazard', 90], [48.5, 37.8, 'conflict', 300], [31.5, 34.4, 'conflict', 150], [51.5, -0.1, 'cyber', 80], [35.7, 139.7, 'cyber', 40], [15.5, 32.5, 'conflict', 70]];
  mediaAt.forEach(([lat, lon, theme, count], i) => out.push(mk({ id: `syn:media:${i}`, type: 'media', subtype: theme, source: 'syn-gdelt', name: `Synthetic media cluster ${i + 1} (${theme})`, lat, lon, observedAt: t0 - i * 45 * 60000, hl: 'media', severity: clamp01(Math.log10(1 + count) / 3) * 0.9, credHint: 6, attrs: { theme, count, place: 'synthetic' } })));
  // --- botnet C2 indicators
  for (let i = 0; i < 24; i++) {
    const cc = C2_COUNTRIES[i % C2_COUNTRIES.length], c = ref.centroids[cc]; if (!c) continue; const [lat, lon] = destination(c.lat, c.lon, r2.next() * 360, 30 + r2.next() * 250), online = r2.next() > 0.35;
    out.push(mk({ id: `syn:c2:${i}`, type: 'cyber', subtype: 'c2', source: 'syn-feodo', name: `${MALWARE[i % 5]} 203.0.113.${i + 10}:443 (synthetic)`, lat, lon, precision: 'country', observedAt: online ? now : t0 - r2.next() * 6e5 * 60, severity: online ? 0.8 : 0.4, credHint: 2, corrKeys: [`ip:203.0.113.${i + 10}`], attrs: { ip: `203.0.113.${i + 10}`, port: 443, status: online ? 'online' : 'offline', malware: MALWARE[i % 5], country: cc } }));
  }
  // --- vulnerabilities (fictional identifiers so they can never be mistaken for real CVEs)
  for (let i = 0; i < 12; i++) out.push(mk({ id: `syn:vuln:${i}`, type: 'vuln', layer: 'vuln', source: 'syn-kev', name: `SYN-2026-${String(i + 1).padStart(4, '0')} synthetic vendor product`, observedAt: t0 - (i * 9 + 2) * 3.6e6, severity: 0.65 + (i % 4 === 0 ? 0.2 : 0), credHint: 1, corrKeys: [`cve:SYN-2026-${i + 1}`], attrs: { cve: `SYN-2026-${String(i + 1).padStart(4, '0')}`, kev: true, vendor: 'Synthetic', product: `Product ${i + 1}`, ransomware: i % 4 === 0 ? 'Known' : 'Unknown', description: 'Fictional record for demonstration.' } }));
  return out;
}
export async function run(ctx) {
  ctx.state.synthT0 = ctx.state.synthT0 || Date.now();
  return { records: generate({ ref: ctx.ref, now: Date.now(), t0: ctx.state.synthT0 }), note: 'synthetic scenario' };
}
