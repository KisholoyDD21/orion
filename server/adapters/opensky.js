// Optional global aircraft snapshot from OpenSky. Anonymous access is heavily credit-limited (≈400 credits/day), and since 2025 authenticated
// access is OAuth2 client-credentials only, so this adapter is off unless enabled or credentials are configured.
import { makeEntity } from '../core/entity.js';
export const id = 'opensky';
export const meta = {
  name: 'OpenSky Network (global snapshot)', domain: 'aviation', homepage: 'https://opensky-network.org/', docs: 'https://openskynetwork.github.io/opensky-api/rest.html',
  license: 'Research / non-commercial use (see OpenSky terms)', attribution: 'The OpenSky Network, https://opensky-network.org', auth: 'optional OAuth2 client credentials', coverage: 'Global ADS-B receiver network', refreshMs: 1_200_000, defaultEnabled: false, rel: 'B', credHint: 2,
  precision: 'Receiver-derived position', caveats: ['Anonymous requests: about 400 API credits per day; a global call costs several credits, so the default cadence is 20 min.', 'Set OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET to use OAuth2 (faster cadence).'],
};
export const refreshMs = (config) => (config.keys.openskyId ? 120_000 : meta.refreshMs);
export function parse(raw, { fetchedAt = new Date().toISOString(), max = 6000 } = {}) {
  const out = []; const t = Number(raw?.time) * 1000 || Date.now();
  for (const s of raw?.states || []) {
    const [icao, call, country, tPos, , lon, lat, baro, onGround, vel, track, vrate, , geoAlt, squawk] = s;
    if (!icao || !Number.isFinite(lat) || !Number.isFinite(lon) || onGround) continue;
    out.push(makeEntity({
      id: `osky:${icao}`, type: 'air', subtype: 'civil', source: id, name: String(call || icao).trim() || icao, lat, lon, altM: Number.isFinite(geoAlt) ? geoAlt : baro,
      observedAt: (Number(tPos) || t / 1000) * 1000, fetchedAt, severity: squawk === '7700' ? 0.85 : squawk === '7500' ? 1 : squawk === '7600' ? 0.55 : 0.03, rel: meta.rel, credHint: meta.credHint,
      attrs: { hex: icao, callsign: String(call || '').trim() || null, originCountry: country, speedKt: Number.isFinite(vel) ? Math.round(vel * 1.94384) : null, headingDeg: track, vrateFpm: Number.isFinite(vrate) ? Math.round(vrate * 196.85) : null, squawk: squawk || null, onGround: false, altFt: Number.isFinite(baro) ? Math.round(baro * 3.28084) : null },
    }));
    if (out.length >= max) break;
  }
  return out;
}
async function token(ctx) {
  const { openskyId, openskySecret } = ctx.config.keys; if (!openskyId || !openskySecret) return null;
  const t = ctx.state.openskyToken; if (t && t.exp > Date.now() + 30_000) return t.value;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: openskyId, client_secret: openskySecret }).toString();
  const r = await ctx.http.json('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, timeoutMs: 10000 });
  ctx.state.openskyToken = { value: r.data.access_token, exp: Date.now() + (Number(r.data.expires_in) || 1500) * 1000 }; return ctx.state.openskyToken.value;
}
export async function run(ctx) {
  const tok = await token(ctx);
  const r = await ctx.http.json('https://opensky-network.org/api/states/all?extended=1', { timeoutMs: 25000, maxBytes: 40_000_000, headers: tok ? { authorization: `Bearer ${tok}` } : {} });
  const left = r.headers.get('x-rate-limit-remaining');
  return { records: parse(r.data), bytes: r.bytes, ms: r.ms, note: left ? `credits remaining ${left}` : tok ? 'authenticated' : 'anonymous' };
}
