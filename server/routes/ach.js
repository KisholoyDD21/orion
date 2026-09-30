import { ApiError } from '../lib/validate.js';
import { computeACH, RATINGS } from '../../shared/ach.js';
const TEMPLATE = { hypotheses: [{ id: 'h1', text: 'Coordinated activity' }, { id: 'h2', text: 'Coincidental / unrelated events' }, { id: 'h3', text: 'Sensor or reporting artifact' }], evidence: [{ id: 'e1', text: 'Spatial-temporal corroboration between independent sources', weight: 1.5 }, { id: 'e2', text: 'Single-source, uncorroborated report', weight: 0.75 }], ratings: {} };
export function registerAch(router) {
  router.get('/api/ach/template', () => ({ ratings: RATINGS, example: TEMPLATE }));
  router.post('/api/ach/evaluate', (c) => {
    const { hypotheses, evidence, ratings } = c.body;
    if (!Array.isArray(hypotheses) || !hypotheses.length) throw new ApiError(400, 'hypotheses[] required');
    if (!Array.isArray(evidence) || !evidence.length) throw new ApiError(400, 'evidence[] required');
    for (const h of hypotheses) if (!h?.id) throw new ApiError(400, 'each hypothesis needs an id');
    for (const e of evidence) if (!e?.id) throw new ApiError(400, 'each evidence item needs an id');
    return { ...computeACH({ hypotheses, evidence, ratings: ratings || {} }), method: 'Heuer Analysis of Competing Hypotheses: ranks by least *inconsistent* evidence, not most support.' };
  });
}
