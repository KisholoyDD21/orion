import { ApiError, clampInt, clampNum, safeId } from '../lib/validate.js';
import { LAYERS, bandOf } from '../../shared/taxonomy.js';
import { sensitivity } from '../../shared/scoring.js';
import { orbit } from '../lib/orbit.js';
import { narrate, factorRows } from '../core/explain.js';

const r4 = (x) => (x == null ? null : Math.round(x * 1e4) / 1e4);
export function compact(e) {
  const f = e.fusion, a = e.attrs || {};
  const o = { i: e.id, a: r4(e.lat), o: r4(e.lon), h: e.altM == null ? null : Math.round(e.altM), p: f ? f.priority : 0, c: f ? +f.confidence.toFixed(2) : 0, n: e.name, g: e.subtype, t: Math.round(Date.parse(e.observedAt) / 1000) };
  if (a.speedKt != null) o.s = a.speedKt;
  const hd = a.headingDeg ?? a.courseDeg; if (hd != null) o.k = Math.round(hd);
  let fl = ''; if (e.synthetic) fl += 'x'; if (e.subtype === 'emergency') fl += 'e'; if (e.subtype === 'mil') fl += 'm'; if (e.subtype === 'distress') fl += 'd'; if (a.onGround) fl += 'g'; if (fl) o.f = fl;
  if (e.type === 'seismic') o.m = a.mag; else if (e.type === 'media') o.m = a.count; else if (e.type === 'cyber') o.m = a.status === 'online' ? 1 : 0;
  if (e.layer === 'space') o.omm = a.omm;
  return o;
}
const summary = (e) => ({ id: e.id, layer: e.layer, type: e.type, subtype: e.subtype, name: e.name, lat: r4(e.lat), lon: r4(e.lon), priority: e.fusion?.priority ?? 0, confidence: e.fusion?.confidence ?? 0, band: e.fusion?.band || 'routine', admiralty: e.fusion?.admiralty, term: e.fusion?.term, rules: (e.fusion?.rules || []).map((r) => r.label), observedAt: e.observedAt, ageSec: e.fusion?.ageSec, synthetic: e.synthetic, source: e.source, precision: e.precision });

export function registerCore(router, d) {
  const { config, ref, store, ledger, sse, fusion, alerts, state, catalog, scheduler, started } = d;
  const srcMeta = new Map(catalog.map((c) => [c.id, c]));
  const metaForEntity = (e) => srcMeta.get(e.source) || srcMeta.get(e.source.replace(/^syn-/, '')) || null;

  router.get('/api/health', () => {
    const s = ledger.all();
    return { ok: true, name: 'ORION Intelligence Fabric', version: config.version, mode: config.mode, uptimeSec: Math.round(process.uptime()), entities: store.byId.size, sources: { ok: s.filter((x) => x.state === 'ok').length, degraded: s.filter((x) => x.state === 'degraded').length, error: s.filter((x) => x.state === 'error').length, total: s.length }, fusion: { runs: fusion.stats.runs, lastMs: fusion.stats.lastMs }, time: new Date().toISOString() };
  });
  router.get('/api/config', () => ({ version: config.version, mode: config.mode, cesiumIonToken: config.cesiumIonToken || null, startedAt: started, layers: LAYERS, syntheticEnabled: config.syntheticEnabled }));
  router.get('/api/meta', () => ({ name: 'ORION Intelligence Fabric', version: config.version, mode: config.mode, model: fusion.stats.lastAt ? 'orion-score/2.0' : null, standards: ['STIX 2.1', 'TAXII 2.1 (read-only)', 'MITRE ATT&CK', 'Sigma', 'Admiralty (NATO STANAG 2511)', 'ICD 203 estimative language', 'CZML', 'GeoJSON'], safety: { activeScanning: false, note: 'Passive OSINT only. No packets are sent to investigation targets; recon uses third-party public datasets.' }, sources: catalog.filter((c) => c.enabled).map((c) => c.id) }));
  router.get('/api/sources', () => ({ mode: config.mode, sources: catalog.map((c) => ({ ...c, health: ledger.get(c.id) || null })) }));
  router.get('/api/source-health', () => ({ generatedAt: new Date().toISOString(), sources: ledger.all() }));
  router.get('/api/layers', () => ({ generatedAt: new Date().toISOString(), mode: config.mode, layers: store.layers().map((l) => ({ ...l, ...(LAYERS[l.id] || {}) })) }));

  router.get('/api/layer/:id', (c) => {
    const id = c.params.id; if (!LAYERS[id]) throw new ApiError(404, 'unknown layer');
    const etag = `W/"L-${id}-${store.layerVersion.get(id) || 0}-${fusion.stats.runs}"`;
    if (c.req.headers['if-none-match'] === etag) { c.res.writeHead(304, { etag, 'cache-control': 'no-cache' }); return c.res.end(); }
    let items = store.layer(id);
    if (id === 'air') { const seen = new Map(); for (const e of items) { const k = e.attrs.hex || e.id, p = seen.get(k); if (!p || (p.id.startsWith('osky:') && !e.id.startsWith('osky:'))) seen.set(k, e); } items = [...seen.values()]; }
    c.json({ id, version: store.layerVersion.get(id) || 0, updatedAt: store.layerUpdatedAt.get(id) || null, count: items.length, items: items.filter((e) => e.lat !== null || id === 'vuln').map(compact) }, 200, { headers: { etag }, cache: 'no-cache' });
  });

  router.get('/api/entity/:id', (c) => {
    const id = safeId(c.params.id); const e = id && store.get(id); if (!e) throw new ApiError(404, 'entity not found');
    const f = e.fusion, m = metaForEntity(e);
    const sens = f ? sensitivity(f.factors, { key: e.id, n: 160 }) : null;
    const related = (f?.links || []).map((l) => { const o = store.get(l.to); return o ? { ...summary(o), rel: l.rel } : { id: l.to, name: l.to.replace(/^(infra|country):/, ''), rel: l.rel, kind: l.to.split(':')[0], km: l.km }; });
    const { omm, ...attrs } = e.attrs || {};
    return { entity: { ...e, attrs, fusion: undefined }, fusion: f ? { ...f, sensitivity: sens } : null, factors: factorRows(e), narrative: narrate(e), track: store.track(e.id), related, source: m ? { id: m.id, name: m.name, license: m.license, attribution: m.attribution, homepage: m.homepage, auth: m.auth, precision: m.precision, caveats: m.caveats } : { id: e.source, name: e.source, synthetic: e.synthetic }, hasOrbit: !!omm };
  });
  router.get('/api/entity/:id/track', (c) => ({ id: c.params.id, points: store.track(c.params.id) }));

  router.get('/api/feed', (c) => {
    const q = c.query, limit = clampInt(q.limit, 40, 1, 200), min = clampNum(q.min, 8, 0, 100);
    const layers = q.layers ? String(q.layers).split(',').filter((l) => LAYERS[l]) : Object.keys(LAYERS).filter((l) => l !== 'space');
    const items = store.query({ layers, minPriority: min, limit, includeSynthetic: q.synthetic !== '0' }).map(summary);
    return { generatedAt: new Date().toISOString(), mode: config.mode, model: 'orion-score/2.0', count: items.length, items, bands: fusion.stats.byBand };
  });
  router.get('/api/alerts', (c) => ({ generatedAt: new Date().toISOString(), alerts: (c.query.sort === 'recent' ? alerts.recent(clampInt(c.query.limit, 30, 1, 200)) : alerts.top(clampInt(c.query.limit, 30, 1, 200))) }));

  router.get('/api/search', (c) => {
    const q = String(c.query.q || '').trim().slice(0, 80); if (q.length < 2) return { results: [] };
    const lq = q.toLowerCase(), hits = [];
    for (const e of store.byId.values()) {
      if (e.lat === null) continue; const a = e.attrs || {};
      const hay = `${e.name} ${a.callsign || ''} ${a.hex || ''} ${a.registration || ''} ${a.mmsi || ''} ${a.norad || ''} ${a.ip || ''}`.toLowerCase();
      const i = hay.indexOf(lq); if (i < 0) continue;
      hits.push({ kind: 'entity', id: e.id, label: e.name, sub: `${e.layer}${e.synthetic ? ' (synthetic)' : ''}`, lat: e.lat, lon: e.lon, layer: e.layer, score: 5 - i * 0.01 + (e.fusion?.priority ?? 0) / 50 });
      if (hits.length > 400) break;
    }
    hits.sort((x, y) => y.score - x.score);
    return { results: [...hits.slice(0, 8), ...ref.search(q, 10)].map(({ score, ...r }) => r) };
  });

  router.get('/api/timeline', (c) => {
    const hours = clampInt(c.query.hours, 24, 1, 168), since = Date.now() - hours * 3.6e6, kinds = new Set(['seismic', 'hazard', 'vuln', 'cyber', 'media']);
    const events = [], bins = new Array(hours).fill(0).map(() => ({})), t1 = Date.now();
    for (const e of store.byId.values()) {
      const t = Date.parse(e.observedAt); if (!(t >= since) || t > t1 + 60000) continue;
      const keep = kinds.has(e.type) || (e.type === 'air' && e.subtype === 'emergency') || (e.type === 'maritime' && e.subtype === 'distress'); if (!keep) continue;
      events.push({ id: e.id, t, layer: e.layer, name: e.name, priority: e.fusion?.priority ?? 0, synthetic: e.synthetic });
      const b = Math.min(hours - 1, Math.floor((t - since) / 3.6e6)); bins[b][e.layer] = (bins[b][e.layer] || 0) + 1;
    }
    events.sort((a, b) => b.t - a.t);
    return { hours, since: new Date(since).toISOString(), events: events.slice(0, 400), bins: bins.map((b, i) => ({ t: since + i * 3.6e6, ...b })) };
  });

  router.get('/api/stats', () => {
    const byLayer = {}; for (const l of store.layers()) byLayer[l.id] = l.count;
    return { generatedAt: new Date().toISOString(), uptimeSec: Math.round(process.uptime()), mode: config.mode, entities: store.byId.size, byLayer, fusion: fusion.stats, alerts: alerts.list.length, sseClients: sse.clients.size, memoryMb: Math.round(process.memoryUsage().rss / 1048576), node: process.version };
  });

  router.get('/api/reference/summary', () => ({ manifest: ref.manifest, counts: { countries: ref.countries.features.length, airports: ref.airports.length, powerPlants: ref.plants.length, nuclear: ref.nuclear.length, places: ref.places.length, attackTechniques: ref.attack.techniques?.length ?? null } }));
  router.get('/api/context', (c) => { const lat = clampNum(c.query.lat, NaN, -90, 90), lon = clampNum(c.query.lon, NaN, -180, 180); if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new ApiError(400, 'lat and lon required'); return { lat, lon, context: ref.context(lat, lon) }; });
  router.get('/api/country/:a2', (c) => {
    const a2 = String(c.params.a2).toUpperCase(), p = ref.countryByA2.get(a2); if (!p) throw new ApiError(404, 'unknown country');
    const ents = store.all().filter((e) => e.lat !== null && e.type !== 'space' && ref.countryAt(e.lat, e.lon) === a2), by = {}; let max = 0;
    for (const e of ents) { by[e.layer] = (by[e.layer] || 0) + 1; max = Math.max(max, e.fusion?.priority ?? 0); }
    return { country: { a2, name: p.n, continent: p.c, pop: p.p }, counts: by, maxPriority: max, top: ents.sort((a, b) => (b.fusion?.priority ?? 0) - (a.fusion?.priority ?? 0)).slice(0, 8).map(summary) };
  });

  router.post('/api/focus', (c) => {
    if (config.mode === 'offline') return { ok: false, note: 'offline mode: no live aircraft queries' };
    const lat = clampNum(c.body.lat, NaN, -90, 90), lon = clampNum(c.body.lon, NaN, -180, 180), nm = clampInt(c.body.radiusNm, 150, 10, 250);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new ApiError(400, 'lat and lon required');
    const key = `${Math.round(lat)}:${Math.round(lon)}`; state.focus.set(key, { name: 'focus', lat, lon, nm, expires: Date.now() + 5 * 60_000 });
    while (state.focus.size > 6) state.focus.delete(state.focus.keys().next().value);
    const j = ledger.get('adsb'); const stale = !j?.lastAttemptAt || Date.now() - Date.parse(j.lastAttemptAt) > 25_000;
    if (stale && !j?.running) scheduler.runNow('adsb');
    return { ok: true, regions: state.focus.size, note: 'Aircraft in this area will appear within about a minute (provider limit: 1 request/s).' };
  }, { limit: 'recon' });

  router.get('/api/orbit/:norad/path', (c) => {
    const e = store.get(`sat:${c.params.norad}`) || store.get(`syn:sat:${c.params.norad}`); if (!e?.attrs?.omm) throw new ApiError(404, 'satellite not found');
    const minutes = clampInt(c.query.minutes, Math.round(e.attrs.periodMin || 100), 10, 600), steps = clampInt(c.query.steps, 120, 20, 400);
    return { norad: c.params.norad, name: e.name, points: orbit.path(orbit.ommToSatrec(e.attrs.omm), new Date(), minutes, steps).map((p) => ({ lat: +p.lat.toFixed(3), lon: +p.lon.toFixed(3), altKm: Math.round(p.altKm), t: p.t })) };
  });
  router.get('/api/orbit/:norad/passes', (c) => {
    const e = store.get(`sat:${c.params.norad}`) || store.get(`syn:sat:${c.params.norad}`); if (!e?.attrs?.omm) throw new ApiError(404, 'satellite not found');
    const lat = clampNum(c.query.lat, NaN, -90, 90), lon = clampNum(c.query.lon, NaN, -180, 180); if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new ApiError(400, 'lat and lon required');
    const passes = orbit.passes(orbit.ommToSatrec(e.attrs.omm), new Date(), { lat, lon, altKm: 0 }, { hours: clampInt(c.query.hours, 24, 1, 72), minElevDeg: clampNum(c.query.minElev, 10, 0, 80) });
    return { norad: c.params.norad, name: e.name, observer: { lat, lon }, passes: passes.map((p) => ({ start: new Date(p.start).toISOString(), end: new Date(p.end).toISOString(), maxElevDeg: +p.maxElev.toFixed(1), maxAt: new Date(p.maxAt).toISOString(), azStart: Math.round(p.az0), azEnd: Math.round(p.az1) })), note: 'Geometric visibility above the horizon; ignores sunlight and atmosphere.' };
  });

  router.get('/api/stream', (c) => { sse.add(c.req, c.res, { version: config.version, mode: config.mode, layers: store.layers() }); });
}
