// Thin fetch wrapper for every ORION API route, plus the SSE live-update stream.
const j = async (url, opts) => {
  const res = await fetch(url, { headers: { accept: 'application/json' }, ...opts });
  if (!res.ok) { let msg = res.statusText; try { msg = (await res.json()).error || msg; } catch { /* body wasn't JSON */ } throw new Error(`${res.status} ${msg}`); }
  return res.status === 204 ? null : res.json();
};
const qs = (params = {}) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, v); const s = p.toString(); return s ? `?${s}` : ''; };
const post = (url, body) => j(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });

export const api = {
  config: () => j('/api/config'), health: () => j('/api/health'), meta: () => j('/api/meta'), stats: () => j('/api/stats'),
  layers: () => j('/api/layers'), layer: (id) => j(`/api/layer/${id}`),
  entity: (id) => j(`/api/entity/${encodeURIComponent(id)}`), entityTrack: (id) => j(`/api/entity/${encodeURIComponent(id)}/track`),
  feed: (params) => j(`/api/feed${qs(params)}`), alerts: (params) => j(`/api/alerts${qs(params)}`),
  search: (q) => j(`/api/search${qs({ q })}`), timeline: (hours) => j(`/api/timeline${qs({ hours })}`),
  context: (lat, lon) => j(`/api/context${qs({ lat, lon })}`), country: (a2) => j(`/api/country/${a2}`),
  focus: (lat, lon, radiusNm) => post('/api/focus', { lat, lon, radiusNm }),
  orbitPath: (norad, params) => j(`/api/orbit/${norad}/path${qs(params)}`), orbitPasses: (norad, params) => j(`/api/orbit/${norad}/passes${qs(params)}`),
  sources: () => j('/api/sources'), sourceHealth: () => j('/api/source-health'), referenceSummary: () => j('/api/reference/summary'),
  graphOverview: (params) => j(`/api/graph/overview${qs(params)}`), graphEntity: (id, depth) => j(`/api/graph/entity/${encodeURIComponent(id)}${qs({ depth })}`), graphPath: (from, to) => j(`/api/graph/path${qs({ from, to })}`),
  attackMatrix: () => j('/api/attack/matrix'), detectionRules: () => j('/api/detection/rules'), detectionEvaluate: (body) => post('/api/detection/evaluate', body),
  stixExport: (params) => j(`/api/stix/export${qs(params)}`), taxiiDiscovery: () => j('/api/taxii/discovery'), taxiiCollections: () => j('/api/taxii/collections'),
  briefing: () => j('/api/briefing'),
  achTemplate: () => j('/api/ach/template'), achEvaluate: (body) => post('/api/ach/evaluate', body),
  caseTemplate: () => j('/api/case/template'), caseCompose: (body) => post('/api/case/compose', body),
  reconPassive: (target) => post('/api/recon/passive', { target }), cve: (id) => j(`/api/cve/${id}`), kev: () => j('/api/kev'),
  researchBenchmark: (params) => j(`/api/research/benchmark${qs(params)}`), researchMetrics: () => j('/api/research/metrics'),
};
/** Live event stream. handlers: {hello,layer,fused,alert,source,heartbeat}. Auto-reconnects (native EventSource behaviour). */
export function connectStream(handlers) {
  const es = new EventSource('/api/stream');
  for (const [ev, fn] of Object.entries(handlers)) es.addEventListener(ev, (e) => { try { fn(JSON.parse(e.data)); } catch { /* ignore malformed frame */ } });
  es.addEventListener('error', () => handlers.connectionState?.('reconnecting'));
  es.addEventListener('open', () => handlers.connectionState?.('open'));
  return () => es.close();
}
