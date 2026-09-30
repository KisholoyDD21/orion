// Static reference layers + spatial indexes (Natural Earth, OurAirports, WRI GPPD, MITRE ATT&CK). All public data; see data/reference/MANIFEST.json.
import fs from 'node:fs';
import path from 'node:path';
import { GeoIndex, pointInPolygon, haversineKm } from '../../shared/geo.js';

const table = (t) => t.rows.map((r) => Object.fromEntries(t.fields.map((f, i) => [f, r[i]])));
function bboxOfPoly(poly) { let a = 180, b = 90, c = -180, d = -90; for (const [x, y] of poly[0]) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return [a, b, c, d]; }

export function loadReference(dataDir) {
  const rd = (...p) => JSON.parse(fs.readFileSync(path.join(dataDir, ...p), 'utf8'));
  const countries = rd('reference', 'countries-110m.geo.json');
  const centroids = rd('reference', 'country-centroids.json');
  const airports = table(rd('reference', 'airports.json')), plants = table(rd('reference', 'power-plants.json')), places = table(rd('reference', 'places-50m.json'));
  const attack = rd('attack', 'enterprise-attack.compact.json');
  const manifest = (() => { try { return rd('reference', 'MANIFEST.json'); } catch { return null; } })();

  const polys = [];
  for (const f of countries.features) {
    const g = f.geometry, list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of list) polys.push({ a2: f.properties.a2, bbox: bboxOfPoly(poly), poly });
  }
  const byA2 = new Map(countries.features.map((f) => [f.properties.a2, f.properties]));
  const cCache = new Map();
  const countryAt = (lat, lon) => {
    const key = `${Math.round(lat * 20)}:${Math.round(lon * 20)}`;
    if (cCache.has(key)) return cCache.get(key);
    let hit = null;
    for (const p of polys) {
      const [x0, y0, x1, y1] = p.bbox; if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
      if (pointInPolygon(lon, lat, { type: 'Polygon', coordinates: p.poly })) { hit = p.a2; break; }
    }
    if (cCache.size > 60000) cCache.clear();
    cCache.set(key, hit); return hit;
  };
  const index = (rows, cell) => { const g = new GeoIndex(cell); for (const r of rows) g.insert(r, r.lat, r.lon); return g; };
  const nuclear = plants.filter((p) => /nuclear/i.test(p.fuel));
  const idx = { airports: index(airports.filter((a) => a.size === 'L'), 3), airportsAll: index(airports, 3), plants: index(plants, 3), nuclear: index(nuclear, 4), places: index(places.filter((p) => p.pop >= 100000), 3) };

  const context = (lat, lon) => {
    const a2 = countryAt(lat, lon), c = a2 ? byA2.get(a2) : null;
    const place = idx.places.nearest(lat, lon, 400), airport = idx.airportsAll.nearest(lat, lon, 150), nuke = idx.nuclear.nearest(lat, lon, 300), plant = idx.plants.nearest(lat, lon, 150);
    return {
      country: c ? { a2, name: c.n, continent: c.c, pop: c.p } : null,
      place: place ? { name: place.item.name, iso2: place.item.iso2, pop: place.item.pop, km: Math.round(place.km) } : null,
      airport: airport ? { icao: airport.item.icao, iata: airport.item.iata, name: airport.item.name, size: airport.item.size, km: Math.round(airport.km) } : null,
      nuclear: nuke ? { id: nuke.item.id, name: nuke.item.name, mw: nuke.item.mw, iso3: nuke.item.iso3, km: Math.round(nuke.km) } : null,
      plant: plant ? { id: plant.item.id, name: plant.item.name, fuel: plant.item.fuel, mw: plant.item.mw, km: Math.round(plant.km) } : null,
    };
  };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const searchRows = [
    ...places.slice(0, 1251).map((p) => ({ kind: 'place', label: p.name, sub: `${p.iso2}${p.capital ? ' capital' : ''}, pop ${(p.pop / 1e6).toFixed(1)}M`, lat: p.lat, lon: p.lon, key: norm(p.name), w: 3 + Math.log10(Math.max(1, p.pop)) })),
    ...airports.filter((a) => a.size === 'L').map((a) => ({ kind: 'airport', label: `${a.iata || a.icao} ${a.name}`, sub: `${a.icao}, ${a.city || ''} ${a.iso2}`, lat: a.lat, lon: a.lon, key: norm(`${a.iata} ${a.icao} ${a.name} ${a.city}`), w: 4 })),
    ...nuclear.map((p) => ({ kind: 'plant', label: p.name, sub: `Nuclear, ${p.mw} MW, ${p.iso3}`, lat: p.lat, lon: p.lon, key: norm(p.name), w: 2 })),
    ...Object.entries(centroids).map(([a2, c]) => ({ kind: 'country', label: c.n, sub: `Country ${a2}`, lat: c.lat, lon: c.lon, key: norm(`${c.n} ${a2} ${c.a3}`), w: 6 })),
  ];
  const search = (q, limit = 12) => {
    const t = norm(q).trim(); if (t.length < 2) return [];
    const out = [];
    for (const r of searchRows) { const i = r.key.indexOf(t); if (i < 0) continue; const wordStart = i === 0 || r.key[i - 1] === ' '; out.push({ ...r, score: r.w + (wordStart ? 5 : 0) + (i === 0 ? 3 : 0) - i * 0.01 }); }
    return out.sort((a, b) => b.score - a.score).slice(0, limit).map(({ key, w, score, ...r }) => r);
  };
  return { countries, centroids, airports, plants, places, nuclear, attack, manifest, idx, countryAt, countryByA2: byA2, context, search, haversineKm };
}
