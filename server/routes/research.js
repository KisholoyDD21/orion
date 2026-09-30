import { ApiError, clampInt } from '../lib/validate.js';
import { runAll, runBenchmark, SCENARIOS } from '../research/benchmark.js';
import { mean, sd } from '../../shared/stats.js';

export function registerResearch(router, d) {
  const { store, ledger, fusion, config } = d; const cache = new Map();
  const series = []; // per-minute layer counts, used for a simple z-score anomaly indicator
  const sample = () => { const c = {}; for (const e of store.byId.values()) c[e.layer] = (c[e.layer] || 0) + 1; series.push({ t: Date.now(), c }); if (series.length > 240) series.shift(); };
  const timer = setInterval(sample, 60_000); timer.unref?.(); setTimeout(sample, 4000).unref?.();

  router.get('/api/research/benchmark', (c) => {
    const seeds = clampInt(c.query.seeds, 30, 5, 100), n = clampInt(c.query.n, 600, 100, 3000), key = `${seeds}:${n}:${c.query.scenario || 'all'}`;
    if (c.query.scenario) { if (!SCENARIOS[c.query.scenario]) throw new ApiError(400, 'unknown scenario'); return cache.get(key) || (cache.set(key, runBenchmark({ seeds, n, scenario: c.query.scenario })), cache.get(key)); }
    return cache.get(key) || (cache.set(key, runAll({ seeds, n })), cache.get(key));
  });
  router.get('/api/research/metrics', () => {
    const ents = [...store.byId.values()], now = Date.now();
    const ages = ents.map((e) => (now - Date.parse(e.observedAt)) / 3.6e6).filter(Number.isFinite), pri = ents.map((e) => e.fusion?.priority ?? 0);
    const hist = (xs, edges) => edges.slice(0, -1).map((lo, i) => xs.filter((x) => x >= lo && x < edges[i + 1]).length);
    const anomalies = [];
    if (series.length >= 8) { const last = series.at(-1), prev = series.slice(-31, -1); for (const layer of Object.keys(last.c)) { const xs = prev.map((s) => s.c[layer] || 0), m = mean(xs), s = sd(xs); if (s > 0 && Math.abs(last.c[layer] - m) / s > 3) anomalies.push({ layer, now: last.c[layer], mean: +m.toFixed(1), z: +((last.c[layer] - m) / s).toFixed(1) }); } }
    return {
      generatedAt: new Date().toISOString(), mode: config.mode, entities: ents.length, priorityHistogram: { edges: [0, 10, 25, 40, 60, 101], counts: hist(pri, [0, 10, 25, 40, 60, 101]) }, ageHoursHistogram: { edges: [0, 1, 6, 24, 72, 1e9], counts: hist(ages, [0, 1, 6, 24, 72, 1e9]) },
      fusion: { ...fusion.stats, model: 'orion-score/2.0' }, sources: ledger.all().map((s) => ({ id: s.id, state: s.state, records: s.records, latencyMs: s.latencyMs, failures: s.failures, calls: s.calls, lastSuccessAt: s.lastSuccessAt, lastError: s.lastError })),
      series: series.slice(-60), anomalies, note: 'Anomaly flag = |z| > 3 against the previous 30 one-minute samples of per-layer entity counts; a coarse indicator, not a detector.',
    };
  });
}
