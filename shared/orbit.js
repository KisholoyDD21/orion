// SGP4 helpers around satellite.js (injected, so the same code runs in Node and in the browser).
// OMM = CCSDS Orbit Mean-Elements Message, the JSON format served by CelesTrak's GP endpoint.
export function createOrbit(sat) {
  const R2D = 180 / Math.PI;
  const ommToSatrec = (omm) => sat.json2satrec(omm);
  function positionAt(satrec, date) {
    let pv; try { pv = sat.propagate(satrec, date); } catch { return null; }
    if (!pv || !pv.position || pv.position === true || typeof pv.position.x !== 'number' || Number.isNaN(pv.position.x)) return null;
    const g = sat.eciToGeodetic(pv.position, sat.gstime(date));
    const v = pv.velocity && typeof pv.velocity.x === 'number' ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : null;
    return { lat: g.latitude * R2D, lon: ((g.longitude * R2D + 540) % 360) - 180, altKm: g.height, speedKmS: v };
  }
  /** Ground track / orbit path samples over [start, start+spanMin]. */
  function path(satrec, start, spanMin = 100, steps = 120) {
    const out = [];
    for (let i = 0; i <= steps; i++) { const t = new Date(start.getTime() + (i * spanMin * 60000) / steps), p = positionAt(satrec, t); if (p) out.push({ ...p, t: t.getTime() }); }
    return out;
  }
  function lookAngles(satrec, date, obs) {
    const pv = sat.propagate(satrec, date); if (!pv || !pv.position) return null;
    const ecf = sat.eciToEcf(pv.position, sat.gstime(date));
    const la = sat.ecfToLookAngles({ latitude: obs.lat / R2D, longitude: obs.lon / R2D, height: obs.altKm || 0 }, ecf);
    return { azimuth: la.azimuth * R2D, elevation: la.elevation * R2D, rangeKm: la.rangeSat };
  }
  /** Passes above `minElevDeg` for an observer over the next `hours`. Coarse 20 s scan, refined only by the scan step. */
  function passes(satrec, from, obs, { hours = 24, minElevDeg = 10, stepS = 20 } = {}) {
    const out = []; let cur = null;
    for (let t = from.getTime(); t <= from.getTime() + hours * 3.6e6; t += stepS * 1000) {
      const la = lookAngles(satrec, new Date(t), obs); if (!la) continue;
      if (la.elevation >= 0) { if (!cur) cur = { start: t, maxElev: la.elevation, maxAt: t, az0: la.azimuth }; if (la.elevation > cur.maxElev) { cur.maxElev = la.elevation; cur.maxAt = t; } cur.end = t; cur.az1 = la.azimuth; }
      else if (cur) { if (cur.maxElev >= minElevDeg) out.push(cur); cur = null; }
    }
    if (cur && cur.maxElev >= minElevDeg) out.push(cur);
    return out;
  }
  const orbitClass = (omm) => {
    const n = Number(omm.MEAN_MOTION), e = Number(omm.ECCENTRICITY);
    if (!(n > 0)) return 'unknown';
    const a = Math.cbrt(398600.4418 / ((n * 2 * Math.PI / 86400) ** 2)), perigee = a * (1 - e) - 6378.137, apogee = a * (1 + e) - 6378.137;
    if (e > 0.25) return 'HEO'; if (Math.abs(a - 42164) < 300 && Number(omm.INCLINATION) < 20) return 'GEO'; if (apogee < 2000) return 'LEO'; if (perigee > 2000 && apogee < 35000) return 'MEO'; return 'other';
  };
  return { ommToSatrec, positionAt, path, lookAngles, passes, orbitClass };
}
