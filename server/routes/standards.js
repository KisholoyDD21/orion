import { ApiError, clampInt } from '../lib/validate.js';
import { buildBundle, EXTENSION_NOTE } from '../standards/stix.js';
import { discovery, apiRootInfo, collectionsFor } from '../standards/taxii.js';
import { LAYERS } from '../../shared/taxonomy.js';
export function registerStandards(router, d) {
  const { store } = d;
  const baseUrl = (req) => `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  router.get('/api/stix/export', (c) => {
    const layer = c.query.layer; if (layer && !LAYERS[layer]) throw new ApiError(400, 'unknown layer');
    const items = store.query({ layers: layer ? [layer] : null, minPriority: 0, limit: clampInt(c.query.limit, 200, 1, 500), sort: 'priority' });
    return { ...buildBundle(items, { limit: 500 }), x_orion_note: EXTENSION_NOTE };
  });
  router.get('/api/taxii/discovery', (c) => discovery(baseUrl(c.req)));
  router.get('/api/taxii/', (c) => apiRootInfo());
  router.get('/api/taxii/collections', () => collectionsFor(store.layers()));
  router.get('/api/taxii/collections/:id/objects', (c) => {
    const layer = c.params.id.replace(/^col-/, ''); if (!LAYERS[layer]) throw new ApiError(404, 'unknown collection');
    const items = store.query({ layers: [layer], limit: clampInt(c.query.limit, 100, 1, 500), sort: 'priority' });
    return { objects: buildBundle(items, { limit: 500 }).objects };
  });
}
