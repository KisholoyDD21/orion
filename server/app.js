// Application assembly: wires config, reference data, store, fusion, adapters, routes, static assets and the HTTP hardening layer.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { loadConfig } from './lib/config.js';
import { createLogger } from './lib/log.js';
import { createHttp } from './lib/http.js';
import { HostLimiter, WindowLimiter, DEFAULT_HOST_GAPS } from './lib/ratelimit.js';
import { createRouter, readJsonBody, sendJson, sendText } from './lib/router.js';
import { createStatic } from './lib/static.js';
import { SseHub } from './lib/sse.js';
import { Ledger } from './lib/ledger.js';
import { ApiError } from './lib/validate.js';
import { loadReference } from './core/reference.js';
import { EntityStore } from './core/store.js';
import { createFusion } from './core/fusion.js';
import { AlertCenter } from './core/alerts.js';
import { createScheduler } from './core/scheduler.js';
import { activeAdapters, catalog } from './adapters/index.js';
import { registerCore } from './routes/core.js';
import { registerGraph } from './routes/graph.js';
import { registerResearch } from './routes/research.js';
import { registerStandards } from './routes/standards.js';
import { registerRecon } from './routes/recon.js';
import { registerAch } from './routes/ach.js';
import { registerCase } from './routes/case.js';
import { registerBriefing } from './routes/briefing.js';
import { registerDetection } from './routes/detection.js';

// CesiumJS needs 'unsafe-eval' at runtime (its core Scene/Renderer modules use Function-based code generation in a
// few hot paths); script-src is still same-origin only, so this only widens what our own bundled, self-hosted
// scripts may do, not what may run at all — no third-party or remote script is ever permitted.
const CSP = ["default-src 'self'", "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:", "connect-src 'self' https: data: blob:", "worker-src 'self' blob:", "child-src blob:", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"].join('; ');
function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}
const hostnameOf = (h) => { const s = String(h || '').toLowerCase(); if (s.startsWith('[')) return s.slice(0, s.indexOf(']') + 1); return s.replace(/:\d+$/, ''); };

export function createApp({ config = loadConfig(), fetchImpl, extraRoutes = [] } = {}) {
  const log = createLogger(config.logLevel), started = new Date().toISOString();
  const ref = loadReference(config.dataDir), store = new EntityStore(), ledger = new Ledger(), sse = new SseHub();
  const httpc = createHttp({ userAgent: config.userAgent, limiter: new HostLimiter(DEFAULT_HOST_GAPS), fetchImpl });
  const state = { focus: new Map(), epss: new Map() };
  const fusion = createFusion({ store, ref, state, log });
  const alerts = new AlertCenter({ onAlert: (a) => sse.broadcast('alert', a) });
  const adapters = activeAdapters(config), cat = catalog(config);
  const afterFusion = () => { alerts.consider(store.all()); sse.broadcast('fused', { at: new Date().toISOString(), runs: fusion.stats.runs, byBand: fusion.stats.byBand }); };
  const ctx = { http: httpc, config, log, ref, store, state, onEnrich: () => fusion.schedule(200, afterFusion) };
  store.onChange(({ sourceId, layers }) => { fusion.schedule(400, afterFusion); sse.broadcast('layer', { source: sourceId, layers: layers.map((id) => ({ id, version: store.layerVersion.get(id) || 0 })) }); });
  const scheduler = createScheduler({ adapters, ctx, store, ledger, sse, log });
  for (const c of cat) ledger.init(c.id, { name: c.name, domain: c.domain, enabled: c.enabled, refreshMs: c.refreshMs, state: c.enabled ? 'idle' : 'disabled' });

  const router = createRouter();
  const deps = { config, log, ref, store, ledger, sse, fusion, alerts, state, catalog: cat, scheduler, started, http: httpc, ctx };
  registerCore(router, deps); registerGraph(router, deps); registerResearch(router, deps);
  registerStandards(router, deps); registerRecon(router, deps); registerAch(router); registerCase(router, deps);
  registerBriefing(router, deps); registerDetection(router, deps);
  for (const reg of extraRoutes) reg(router, deps);

  const cesiumDir = path.join(config.root, 'node_modules', 'cesium', 'Build', 'Cesium'), satDir = path.join(config.root, 'node_modules', 'satellite.js', 'dist');
  if (!fs.existsSync(cesiumDir)) log.warn('CesiumJS not found in node_modules: run "npm install" (the API works, the 3D globe will not load).');
  const serveStatic = createStatic([
    { prefix: '/', dir: path.join(config.root, 'client'), cache: 'no-cache' },
    { prefix: '/shared/', dir: path.join(config.root, 'shared'), cache: 'no-cache', allow: /\.js$/ },
    { prefix: '/vendor/cesium/', dir: cesiumDir, cache: 'public, max-age=86400' },
    { prefix: '/vendor/satellite.js/', dir: satDir, cache: 'public, max-age=86400', allow: /\.js$/ },
    { prefix: '/data/reference/', dir: path.join(config.dataDir, 'reference'), cache: 'public, max-age=3600', allow: /\.json$/ },
    { prefix: '/data/attack/', dir: path.join(config.dataDir, 'attack'), cache: 'public, max-age=3600', allow: /\.json$/ },
    { prefix: '/docs/', dir: path.join(config.root, 'docs'), cache: 'no-cache', allow: /\.md$/ },
  ]);
  const apiLimit = new WindowLimiter(config.rateLimit.api), reconLimit = new WindowLimiter(config.rateLimit.recon);
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(config.host);

  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    try {
      const host = hostnameOf(req.headers.host);
      if (!(config.allowedHosts.has(host) || (!loopback && net.isIP(host.replace(/^\[|\]$/g, ''))))) return sendText(req, res, 'Host not allowed', 421);
      let url; try { url = new URL(req.url, 'http://localhost'); } catch { return sendText(req, res, 'Bad request', 400); }
      const pathname = url.pathname;
      if (!pathname.startsWith('/api/')) { if (!serveStatic(req, res, pathname)) sendText(req, res, 'Not found', 404); return; }
      if (req.method === 'OPTIONS') { res.writeHead(204, { allow: 'GET, HEAD, POST, PUT, DELETE' }); return res.end(); }
      const m = router.match(req.method, pathname);
      if (!m.route) return sendJson(req, res, { error: m.pathMatched ? 'method not allowed' : 'not found' }, m.pathMatched ? 405 : 404);
      const write = req.method !== 'GET' && req.method !== 'HEAD';
      if (write) { const origin = req.headers.origin; if (origin) { try { if (new URL(origin).host.toLowerCase() !== String(req.headers.host).toLowerCase()) return sendJson(req, res, { error: 'cross-origin request rejected' }, 403); } catch { return sendJson(req, res, { error: 'bad origin' }, 403); } } }
      const ip = req.socket.remoteAddress || 'unknown';
      const lim = m.route.opts.limit === 'recon' ? reconLimit.check(`r:${ip}`) : apiLimit.check(ip);
      if (!lim.ok) return sendJson(req, res, { error: 'rate limit exceeded' }, 429, { headers: { 'retry-after': String(Math.ceil(lim.resetMs / 1000)) } });
      const c = { req, res, url, params: m.params, query: Object.fromEntries(url.searchParams), body: write ? await readJsonBody(req) : {}, ip, json: (obj, status, opts) => sendJson(req, res, obj, status, opts) };
      const out = await m.route.handler(c);
      if (out !== undefined && !res.headersSent) sendJson(req, res, out, 200, { cache: m.route.opts.cache || 'no-store' });
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof ApiError) return sendJson(req, res, { error: e.message, ...(e.extra || {}) }, e.status);
      log.error(`unhandled ${req.method} ${req.url}: ${e.stack || e}`); sendJson(req, res, { error: 'internal error' }, 500);
    }
  });
  server.keepAliveTimeout = 65_000;

  return {
    server, config, deps, store, fusion, alerts, ledger, sse, ref, scheduler,
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => {
          const port = server.address().port;
          log.info(`ORION ${config.version} listening on http://${config.host === '::1' ? '[::1]' : config.host}:${port}  (mode: ${config.mode}, ${adapters.length} adapters)`);
          scheduler.start(); setTimeout(() => alerts.prime(), config.mode === 'offline' ? 3000 : 25_000).unref?.();
          resolve(port);
        });
      });
    },
    async stop() { scheduler.stop(); sse.close(); await new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); }); },
  };
}
