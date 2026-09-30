// Synthetic ground-truth benchmark for the fusion/scoring model (docs/BENCHMARKS.md).
// The generator is deliberately *not* the scoring formula: ground-truth harm uses different weights/functional forms, actionability decays logistically
// (the model uses an exponential half-life), and label noise is added. Scenarios stress model mismatch. It validates behaviour under stated assumptions,
// it does not prove real-world effectiveness (see "threats to validity" in the output).
import { Rng, hashSeed } from '../../shared/prng.js';
import { scoreFactors, freshness, noisyOr, DEFAULT_WEIGHTS, MODEL_VERSION } from '../../shared/scoring.js';
import { reliabilityP, credibilityP, credibilityFrom } from '../../shared/admiralty.js';
import { auroc, ece, bootstrapCI, mean } from '../../shared/stats.js';

const SOURCES = [
  { cls: 'A', name: 'authoritative sensor network', accuracy: 0.97, sevNoise: 0.05, weight: 0.30 },
  { cls: 'B', name: 'community sensor network', accuracy: 0.88, sevNoise: 0.10, weight: 0.30 },
  { cls: 'C', name: 'machine-extracted media', accuracy: 0.68, sevNoise: 0.20, weight: 0.25 },
  { cls: 'D', name: 'anonymous tips', accuracy: 0.42, sevNoise: 0.30, weight: 0.15 },
];
export const SCENARIOS = Object.freeze({
  nominal: { label: 'Nominal', accDelta: 0, echo: 0.25, ageMeanH: 6, harm: 'weighted' },
  degraded: { label: 'Degraded sources (accuracy −0.15)', accDelta: -0.15, echo: 0.25, ageMeanH: 6, harm: 'weighted' },
  echo: { label: 'Echo chamber (dependent corroboration of false reports)', accDelta: 0, echo: 1.3, ageMeanH: 6, harm: 'weighted' },
  stale: { label: 'Stale-heavy feed (mean age 14 h)', accDelta: 0, echo: 0.25, ageMeanH: 14, harm: 'weighted' },
  worstOf: { label: 'Model mismatch (ground-truth harm = max(severity, criticality))', accDelta: 0, echo: 0.25, ageMeanH: 6, harm: 'max' },
});
const beta = (rng, a, b) => { const g = (k) => { let x = 0; for (let i = 0; i < k; i++) x -= Math.log(1 - rng.next()); return x; }; const x = g(a), y = g(b); return x / (x + y); };
const poisson = (rng, lambda) => { const L = Math.exp(-lambda); let k = 0, p = 1; do { k++; p *= rng.next(); } while (p > L && k < 12); return k - 1; };
const clip = (x) => Math.max(0, Math.min(1, x));
const pickSource = (rng) => { let u = rng.next(); for (const s of SOURCES) { if ((u -= s.weight) <= 0) return s; } return SOURCES.at(-1); };
const odds = (p) => { const q = Math.min(0.999, Math.max(0.001, p)); return q / (1 - q); };

export function generateWorld(seed, n, sc) {
  const rng = new Rng(hashSeed(`bench:${seed}`)), items = [];
  for (let i = 0; i < n; i++) {
    const src = pickSource(rng), real = rng.next() < Math.max(0.05, src.accuracy + sc.accDelta);
    const sTrue = real ? beta(rng, 2, 3) : beta(rng, 2, 2), yTrue = beta(rng, 2, 4);
    const harm = sc.harm === 'max' ? Math.max(sTrue, yTrue) : 0.6 * sTrue + 0.4 * yTrue + 0.15 * sTrue * yTrue;
    const ageH = -Math.log(1 - rng.next()) * sc.ageMeanH, pAct = 1 / (1 + Math.exp((ageH - 10) / 3));
    const relevant = real && harm >= 0.42 && rng.next() < pAct;
    const nCorr = real ? poisson(rng, 1.6) : poisson(rng, sc.echo);
    const corrRel = Array.from({ length: Math.min(4, nCorr) }, () => reliabilityP(pickSource(rng).cls));
    const S = clip(real ? sTrue + rng.normal(0, src.sevNoise) : sTrue), Y = clip(yTrue + rng.normal(0, 0.1));
    const R = reliabilityP(src.cls), agree = corrRel.length;
    const C = credibilityP(credibilityFrom({ independentAgree: agree, contradicts: 0, judgeable: true })), K = agree ? noisyOr(corrRel) : 0;
    items.push({ real, relevant, harm: relevant ? harm : 0, f: { S, Y, R, C, F: freshness(ageH * 3600, 'event'), K } });
  }
  return items;
}
const impactOnly = (f, w = DEFAULT_WEIGHTS) => w.wSeverity * f.S + w.wCriticality * f.Y;
export const RANKERS = {
  random: { label: 'Random', fn: (f, r) => r.next() },
  severity: { label: 'Severity only', fn: (f) => f.S },
  recency: { label: 'Recency only', fn: (f) => f.F },
  impact: { label: 'Impact only (no evidence quality)', fn: (f) => impactOnly(f) },
  additive: { label: 'Additive (equal-weight sum of six factors)', fn: (f) => (f.S + f.Y + f.R + f.C + f.F + f.K) / 6 },
  orion: { label: MODEL_VERSION, fn: (f) => scoreFactors(f).priority },
};
export const ABLATIONS = { noR: (f) => ({ ...f, R: 1 }), noC: (f) => ({ ...f, C: 1 }), noF: (f) => ({ ...f, F: 1 }), noK: (f) => ({ ...f, K: 0 }) };
function ndcg(scores, gains, k) {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
  const dcg = (order) => order.slice(0, k).reduce((s, i, r) => s + gains[i] / Math.log2(r + 2), 0);
  const ideal = gains.map((g, i) => i).sort((a, b) => gains[b] - gains[a]);
  const d = dcg(ideal); return d ? dcg(idx) / d : NaN;
}
const precisionAt = (scores, rel, k) => { const idx = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]).slice(0, k); return idx.filter((i) => rel[i]).length / k; };
function evaluate(items, seed) {
  const rel = items.map((x) => x.relevant), gains = items.map((x) => x.harm), out = {}, rng = new Rng(hashSeed(`rank:${seed}`));
  const run = (fn, tf = (f) => f) => { const s = items.map((x) => fn(tf(x.f), rng)); return { auroc: auroc(s, rel), p20: precisionAt(s, rel, 20), ndcg50: ndcg(s, gains, 50) }; };
  for (const [k, r] of Object.entries(RANKERS)) out[k] = run(r.fn);
  for (const [k, tf] of Object.entries(ABLATIONS)) out[`orion:${k}`] = run(RANKERS.orion.fn, tf);
  const pReal = items.map((x) => { const o = odds(x.f.R) * odds(x.f.C); return o / (1 + o); });
  out.calibration = { ece: ece(pReal, items.map((x) => x.real)), pReal, real: items.map((x) => x.real) };
  out.prevalence = mean(rel.map(Number));
  return out;
}
const ci = (vals) => { const c = bootstrapCI(vals, { B: 1000 }); return { mean: +c.mean.toFixed(4), lo: +c.lo.toFixed(4), hi: +c.hi.toFixed(4) }; };
export function runBenchmark({ seeds = 30, n = 600, scenario = 'nominal' } = {}) {
  const sc = SCENARIOS[scenario]; if (!sc) throw new Error('unknown scenario');
  const per = []; for (let s = 1; s <= seeds; s++) per.push(evaluate(generateWorld(s, n, sc), s));
  const metrics = ['auroc', 'p20', 'ndcg50'], rankers = {};
  for (const k of [...Object.keys(RANKERS), ...Object.keys(ABLATIONS).map((a) => `orion:${a}`)]) rankers[k] = Object.fromEntries(metrics.map((m) => [m, ci(per.map((p) => p[k][m]))]));
  const paired = (a, b, m = 'auroc') => ci(per.map((p) => p[a][m] - p[b][m]));
  // reliability diagram pooled over seeds
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (const p of per) p.calibration.pReal.forEach((x, i) => { const b = bins[Math.min(9, Math.floor(x * 10))]; b.n++; b.p += x; b.y += p.calibration.real[i] ? 1 : 0; });
  return {
    scenario, label: sc.label, seeds, n, prevalence: ci(per.map((p) => p.prevalence)),
    rankers: Object.fromEntries(Object.entries(rankers).map(([k, v]) => [k, { label: RANKERS[k]?.label || `${MODEL_VERSION} without ${k.split(':')[1].slice(2)}`, ...v }])),
    paired: { orionVsAdditive: paired('orion', 'additive'), orionVsSeverity: paired('orion', 'severity'), orionVsImpact: paired('orion', 'impact') },
    ablation: Object.fromEntries(Object.keys(ABLATIONS).map((a) => [a, paired(`orion:${a}`, 'orion')])),
    calibration: { ece: ci(per.map((p) => p.calibration.ece)), bins: bins.map((b, i) => ({ bin: i, n: b.n, predicted: b.n ? +(b.p / b.n).toFixed(3) : null, observed: b.n ? +(b.y / b.n).toFixed(3) : null })) },
  };
}
export function runAll(opts = {}) {
  const t0 = performance.now(), scenarios = Object.fromEntries(Object.keys(SCENARIOS).map((k) => [k, runBenchmark({ ...opts, scenario: k })]));
  return {
    model: MODEL_VERSION, generatedAt: new Date().toISOString(), ms: Math.round(performance.now() - t0), params: { seeds: opts.seeds ?? 30, n: opts.n ?? 600 }, scenarios,
    sources: SOURCES.map(({ cls, name, accuracy }) => ({ cls, name, trueAccuracy: accuracy, assumedP: reliabilityP(cls) })),
    threatsToValidity: [
      'Synthetic data: the generator encodes assumptions about sources, harm and staleness; results show the implementation behaves as designed under those assumptions, not that it beats analysts on real feeds.',
      'Circularity risk: ground-truth harm and actionability use different functional forms from the model, and the "worstOf" scenario changes the harm rule entirely, but both are still authored by the same team.',
      'Independence: the model treats corroborating sources as independent; the echo scenario shows what happens when they are not.',
      'Admiralty probabilities are conventions, not calibrated frequencies; the reliability diagram shows the resulting calibration error.',
    ],
  };
}
