// Geodesy & spatial helpers shared by server, tests and browser.
export const R_KM = 6371.0088;
export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;
export const normLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
export const clampLat = (lat) => Math.max(-90, Math.min(90, lat));
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
export function destination(lat, lon, bearing, km) {
  const d = km / R_KM, b = rad(bearing), p1 = rad(lat), l1 = rad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [deg(p2), normLon(deg(l2))];
}
export function greatCircle(lat1, lon1, lat2, lon2, n = 32) {
  const p1 = rad(lat1), l1 = rad(lon1), p2 = rad(lat2), l2 = rad(lon2);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d === 0) return [[lat1, lon1]];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2), y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2), z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([deg(Math.atan2(z, Math.hypot(x, y))), deg(Math.atan2(y, x))]);
  }
  return out;
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pointInPolygon(lon, lat, geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const poly of polys) { if (!inRing(lon, lat, poly[0])) continue; let hole = false; for (let h = 1; h < poly.length; h++) if (inRing(lon, lat, poly[h])) { hole = true; break; } if (!hole) return true; }
  return false;
}
/** Uniform-grid spatial index for radius / nearest queries on points. */
export class GeoIndex {
  constructor(cellDeg = 2) { this.cell = cellDeg; this.map = new Map(); this.size = 0; }
  key(i, j) { return `${i}:${j}`; }
  insert(item, lat, lon) {
    const k = this.key(Math.floor(lat / this.cell), Math.floor(normLon(lon) / this.cell));
    (this.map.get(k) || this.map.set(k, []).get(k)).push({ item, lat, lon }); this.size++;
  }
  within(lat, lon, km) {
    const dLat = km / 111.2 + 1e-9, cosLat = Math.max(0.05, Math.cos(rad(lat))), dLon = Math.min(180, km / (111.2 * cosLat) + 1e-9);
    const i0 = Math.floor((lat - dLat) / this.cell), i1 = Math.floor((lat + dLat) / this.cell), out = [];
    const span = Math.ceil((2 * dLon) / this.cell) + 1, jc = Math.floor(normLon(lon) / this.cell), jMax = Math.floor(180 / this.cell), jMin = Math.floor(-180 / this.cell);
    const seen = new Set();
    for (let i = i0; i <= i1; i++) for (let s = -Math.ceil(span / 2); s <= Math.ceil(span / 2); s++) {
      let j = jc + s; if (j > jMax) j = jMin + (j - jMax - 1); if (j < jMin) j = jMax - (jMin - j - 1);
      const k = this.key(i, j); if (seen.has(k)) continue; seen.add(k);
      for (const e of this.map.get(k) || []) { const d = haversineKm(lat, lon, e.lat, e.lon); if (d <= km) out.push({ item: e.item, km: d }); }
    }
    return out.sort((a, b) => a.km - b.km);
  }
  nearest(lat, lon, maxKm = 500) { return this.within(lat, lon, maxKm)[0] || null; }
}
export function centroidOfCoords(coords) {           // mean of vertices; fine for the small polygons we handle (EONET)
  const pts = coords.flat(Infinity); let sx = 0, sy = 0, n = 0;
  for (let i = 0; i + 1 < pts.length; i += 2) { sx += pts[i]; sy += pts[i + 1]; n++; }
  return n ? [sx / n, sy / n] : null;
}
export function formatLatLon(lat, lon, d = 3) {
  return `${Math.abs(lat).toFixed(d)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(d)}°${lon >= 0 ? 'E' : 'W'}`;
}
