// Small, dependency-free statistics helpers used by the benchmark and research views.
import { Rng } from './prng.js';
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export const variance = (a) => { if (a.length < 2) return 0; const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };
export const sd = (a) => Math.sqrt(variance(a));
export function quantile(a, q) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
export function bootstrapCI(values, { B = 2000, alpha = 0.05, seed = 7 } = {}) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return { mean: mean(v), lo: mean(v), hi: mean(v), sd: 0, n: v.length };
  const rng = new Rng(seed), means = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < v.length; i++) s += v[rng.int(0, v.length - 1)]; means.push(s / v.length); }
  return { mean: mean(v), lo: quantile(means, alpha / 2), hi: quantile(means, 1 - alpha / 2), sd: sd(v), n: v.length };
}
function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
  return r;
}
export function pearson(x, y) {
  const mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return dx && dy ? n / Math.sqrt(dx * dy) : 0;
}
export const spearman = (x, y) => (x.length < 2 ? 1 : pearson(ranks(x), ranks(y)));
export function kendallTau(x, y) {
  let c = 0, d = 0;
  for (let i = 0; i < x.length; i++) for (let j = i + 1; j < x.length; j++) { const s = Math.sign(x[i] - x[j]) * Math.sign(y[i] - y[j]); if (s > 0) c++; else if (s < 0) d++; }
  return c + d ? (c - d) / (c + d) : 1;
}
/** Area under the ROC curve via the Mann-Whitney U statistic (ties get half credit). */
export function auroc(scores, labels) {
  const pos = [], neg = [];
  scores.forEach((s, i) => (labels[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return NaN;
  let u = 0;
  for (const p of pos) for (const n of neg) u += p > n ? 1 : p === n ? 0.5 : 0;
  return u / (pos.length * neg.length);
}
/** Expected calibration error with equal-width bins. */
export function ece(probs, labels, bins = 10) {
  const B = Array.from({ length: bins }, () => ({ n: 0, p: 0, y: 0 }));
  probs.forEach((p, i) => { const b = B[Math.min(bins - 1, Math.floor(p * bins))]; b.n++; b.p += p; b.y += labels[i] ? 1 : 0; });
  const N = probs.length || 1;
  return B.reduce((s, b) => s + (b.n ? (b.n / N) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0);
}
export function prf(tp, fp, fn) {
  const precision = tp + fp ? tp / (tp + fp) : 1, recall = tp + fn ? tp / (tp + fn) : 1;
  return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
}
