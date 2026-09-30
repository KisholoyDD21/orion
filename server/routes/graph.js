import { ApiError, clampInt, safeId } from '../lib/validate.js';
import { buildGraph, summarize } from '../core/graph-build.js';
export function registerGraph(router, d) {
  const { store, ref, fusion } = d; let cache = { key: '', at: 0, g: null };
  const graph = (includeSources) => {
    const key = `${store.version}.${fusion.stats.runs}.${includeSources}`;
    if (cache.key === key && Date.now() - cache.at < 15_000) return cache.g;
    cache = { key, at: Date.now(), g: buildGraph({ store, ref, includeSources }) }; return cache.g;
  };
  router.get('/api/graph/overview', (c) => {
    const g = graph(false), s = summarize(g), limit = clampInt(c.query.limit, 90, 10, 300);
    const keep = new Set(s.nodes.filter((n) => n.degree > 0).sort((a, b) => b.pagerank - a.pagerank).slice(0, limit).map((n) => n.id));
    return { ...s, nodes: s.nodes.filter((n) => keep.has(n.id)), edges: s.edges.filter((e) => keep.has(e.a) && keep.has(e.b)) };
  });
  router.get('/api/graph/entity/:id', (c) => {
    const id = safeId(c.params.id), g = graph(true); if (!id || !g.nodes.has(id)) throw new ApiError(404, 'entity is not in the analysis graph');
    return summarize(g.subgraph(id, clampInt(c.query.depth, 2, 1, 3)));
  });
  router.get('/api/graph/path', (c) => {
    const a = safeId(c.query.from), b = safeId(c.query.to), g = graph(true); if (!a || !b) throw new ApiError(400, 'from and to required');
    const p = g.shortestPath(a, b, { weighted: c.query.weighted === '1' });
    return p ? { found: true, hops: p.hops, nodes: p.nodes.map((id) => g.nodes.get(id)), edges: p.edges.map((e) => ({ a: e.a, b: e.b, label: e.label, weight: e.weight })) } : { found: false };
  });
}
