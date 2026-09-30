import { ApiError, safeId } from '../lib/validate.js';
import { narrate } from '../core/explain.js';
const template = () => ({ title: 'Untitled case', createdAt: new Date().toISOString(), analyst: null, summary: '', entities: [], hypotheses: [], evidence: [], notes: [], provenance: { generator: 'ORION Intelligence Fabric', model: 'orion-score/2.0' } });
export function registerCase(router, d) {
  const { store } = d;
  router.get('/api/case/template', () => template());
  router.post('/api/case/compose', (c) => {
    const ids = Array.isArray(c.body.entityIds) ? c.body.entityIds.slice(0, 40) : []; if (!ids.length) throw new ApiError(400, 'entityIds[] required');
    const entities = ids.map((raw) => { const id = safeId(raw); const e = id && store.get(id); return e ? { id: e.id, name: e.name, layer: e.layer, source: e.source, lat: e.lat, lon: e.lon, observedAt: e.observedAt, priority: e.fusion?.priority ?? null, band: e.fusion?.band ?? null, admiralty: e.fusion?.admiralty ?? null, synthetic: e.synthetic, narrative: narrate(e) } : { id: raw, missing: true }; });
    return { ...template(), title: c.body.title || 'Untitled case', analyst: c.body.analyst || null, entities };
  });
}
