// ORION fusion scoring model (documented in docs/METHODOLOGY.md).
// priority   = 100 · impact · quality        (how much analyst attention an item deserves)
// confidence = quality                        (how much the *evidence* deserves to be trusted)
// The two are kept separate on purpose: a severe but poorly evidenced item is not the same as a mild, well-evidenced one.
import { Rng, hashSeed } from './prng.js';
import { quantile, sd } from './stats.js';
export const MODEL_VERSION = 'orion-score/2.0';
export const DEFAULT_WEIGHTS = Object.freeze({ wSeverity: 0.7, wCriticality: 0.3, a: 0.30, b: 0.30, c: 0.25, d: 0.15 });
export const HALF_LIFE_S = Object.freeze({ air: 120, maritime: 900, space: 259200, event: 21600, fire: 43200, cyber: 86400, vulnerability: 2592000, media: 21600, infrastructure: 3.15e7, default: 3600 });
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const fl = (x) => Math.max(1e-6, clamp01(x));
export const freshness = (ageSec, type = 'default') => Math.pow(2, -Math.max(0, ageSec) / (HALF_LIFE_S[type] ?? HALF_LIFE_S.default));
export const noisyOr = (ps) => 1 - ps.reduce((acc, p) => acc * (1 - clamp01(p)), 1);

/** factors: S severity, Y criticality, R reliability prior, C credibility prior, F freshness, K corroboration — all in [0,1]. */
export function scoreFactors(f, w = DEFAULT_WEIGHTS) {
  const wi = w.wSeverity + w.wCriticality || 1, ws = w.a + w.b + w.c + w.d || 1;
  const impact = clamp01((w.wSeverity * f.S + w.wCriticality * f.Y) / wi);
  const quality = Math.exp((w.a * Math.log(fl(f.R)) + w.b * Math.log(fl(f.C)) + w.c * Math.log(fl(f.F)) + w.d * Math.log(fl(0.5 + 0.5 * f.K))) / ws);
  return { impact, quality, priority: Math.round(1000 * impact * quality) / 10, confidence: quality };
}
export function perturbWeights(w, rng, spread = 0.25) {
  const out = {}; for (const k of Object.keys(w)) out[k] = w[k] * (1 + spread * (2 * rng.next() - 1)); return out;
}
/** Monte-Carlo weight-perturbation band (seeded by `key`, so the same item always gets the same band). */
export function sensitivity(f, { n = 200, spread = 0.25, key = 'x', weights = DEFAULT_WEIGHTS } = {}) {
  const rng = new Rng(hashSeed(String(key))), xs = [];
  for (let i = 0; i < n; i++) xs.push(scoreFactors(f, perturbWeights(weights, rng, spread)).priority);
  return { p05: quantile(xs, 0.05), p50: quantile(xs, 0.5), p95: quantile(xs, 0.95), sd: sd(xs), n, spread };
}
export function explain(f, w = DEFAULT_WEIGHTS) {
  const r = scoreFactors(f, w), ws = w.a + w.b + w.c + w.d || 1;
  const contrib = { reliability: (w.a / ws) * Math.log(fl(f.R)), credibility: (w.b / ws) * Math.log(fl(f.C)), freshness: (w.c / ws) * Math.log(fl(f.F)), corroboration: (w.d / ws) * Math.log(fl(0.5 + 0.5 * f.K)) };
  const worst = Object.entries(contrib).sort((a, b) => a[1] - b[1])[0];
  return { ...r, logContrib: contrib, limitingFactor: worst[0] };
}
