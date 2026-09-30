// Configuration: .env file (optional) overlaid by real environment variables. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseEnvFile(file) {
  const out = {};
  let txt = '';
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}

export function loadConfig(overrides = {}) {
  const env = { ...parseEnvFile(path.join(ROOT, '.env')), ...process.env, ...overrides };
  const bool = (v, d) => (v === undefined || v === '' ? d : !/^(0|false|no|off)$/i.test(String(v)));
  const int = (v, d, lo = -Infinity, hi = Infinity) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const list = (v, d) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : d);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  // Back-compat with v1.5: ENABLE_LIVE_FEEDS=false means offline.
  const offline = /^offline$/i.test(env.ORION_MODE || '') || !bool(env.ENABLE_LIVE_FEEDS, true);
  const host = env.HOST || '127.0.0.1';
  const port = int(env.PORT, 8787, 0, 65535);
  const cfg = {
    root: ROOT,
    version: pkg.version,
    host, port,
    mode: offline ? 'offline' : 'live',
    logLevel: env.LOG_LEVEL || 'info',
    userAgent: env.ORION_USER_AGENT || `ORION-Intelligence-Fabric/${pkg.version} (open-source research tool)`,
    cesiumIonToken: env.CESIUM_ION_TOKEN || '',
    allowedHosts: new Set(['localhost', '127.0.0.1', '[::1]', host, ...list(env.ORION_ALLOWED_HOSTS, [])].map((h) => h.toLowerCase())),
    rateLimit: { api: int(env.RATE_LIMIT_API_PER_MIN, 600, 10, 100000), recon: int(env.RATE_LIMIT_RECON_PER_MIN, 12, 1, 1000) },
    keys: { nvd: env.NVD_API_KEY || '', openskyId: env.OPENSKY_CLIENT_ID || '', openskySecret: env.OPENSKY_CLIENT_SECRET || '' },
    adsb: {
      providers: list(env.ADSB_PROVIDERS, ['airplanes.live', 'adsb.lol', 'adsb.one']),
      regions: env.ADSB_REGIONS ? safeJson(env.ADSB_REGIONS, null) : null,
    },
    celestrakGroups: list(env.CELESTRAK_GROUPS, ['stations', 'visual', 'gps-ops', 'weather', 'science', 'geo', 'military']),
    usgsFeed: env.USGS_FEED || 'all_day',
    dataDir: path.join(ROOT, 'data'),
    cacheDir: path.join(ROOT, 'data', 'cache'),
    casesDir: path.join(ROOT, 'data', 'cases'),
    enabled(id, dflt = true) { return this.mode === 'offline' ? false : bool(env['ENABLE_' + id.toUpperCase().replace(/[^A-Z0-9]/g, '_')], dflt); },
    syntheticEnabled: offline || bool(env.ENABLE_SYNTHETIC, false),
  };
  return cfg;
}
function safeJson(s, d) { try { return JSON.parse(s); } catch { return d; } }
