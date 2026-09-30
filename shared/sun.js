// NOAA / Meeus solar position — the same maths behind SunCalc-style chronolocation aids.
import { rad, deg, normLon } from './geo.js';
export function solar(date) {
  const jd = date.getTime() / 86400000 + 2440587.5, T = (jd - 2451545.0) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T), e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
  const omega = 125.04 - 1934.136 * T, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60, eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lam)))), y = Math.tan(rad(eps) / 2) ** 2;
  const eqTime = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  return { decl, eqTime };
}
export function sunPosition(date, lat, lon) {
  const { decl, eqTime } = solar(date), minUTC = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const HA = (minUTC + eqTime) / 4 + lon - 180, h = rad(HA), p = rad(lat), d = rad(decl);
  const elev = deg(Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h)));
  const az = (deg(Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(p) - Math.tan(d) * Math.cos(p))) + 180 + 360) % 360;
  return { azimuth: az, elevation: elev, declination: decl, shadowAzimuth: (az + 180) % 360, shadowRatio: elev > 0.5 ? 1 / Math.tan(rad(elev)) : Infinity };
}
export function subsolarPoint(date) {
  const { decl, eqTime } = solar(date), minUTC = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  return { lat: decl, lon: normLon(-(minUTC + eqTime - 720) / 4) };
}
export const twilight = (elev) => (elev > 0 ? 'day' : elev > -6 ? 'civil twilight' : elev > -12 ? 'nautical twilight' : elev > -18 ? 'astronomical twilight' : 'night');
