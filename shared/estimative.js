// ICD 203-style terms of estimative probability and confidence levels.
export const TERMS = Object.freeze([
  { term: 'almost no chance', lo: 0.01, hi: 0.05 }, { term: 'very unlikely', lo: 0.05, hi: 0.20 }, { term: 'unlikely', lo: 0.20, hi: 0.45 },
  { term: 'roughly even chance', lo: 0.45, hi: 0.55 }, { term: 'likely', lo: 0.55, hi: 0.80 }, { term: 'very likely', lo: 0.80, hi: 0.95 },
  { term: 'almost certain', lo: 0.95, hi: 0.99 }
]);
export const CONFIDENCE_LEVELS = Object.freeze(['low', 'moderate', 'high']);
export function termFor(p) { const x = Math.min(0.99, Math.max(0.01, p)); return (TERMS.find((t) => x >= t.lo && x <= t.hi) || TERMS[3]).term; }
export function rangeFor(term) { const t = TERMS.find((x) => x.term === term); return t ? [t.lo, t.hi] : null; }
/** Map an evidence-quality score in [0,1] to an ICD-203-style analytic confidence level. */
export function confidenceLevel(q) { return q >= 0.75 ? 'high' : q >= 0.5 ? 'moderate' : 'low'; }
