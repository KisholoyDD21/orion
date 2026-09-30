// Admiralty / NATO source-reliability & information-credibility grading (STANAG 2511 / AJP-2.1 style).
export const RELIABILITY = Object.freeze({
  A: { label: 'Completely reliable', p: 0.95 }, B: { label: 'Usually reliable', p: 0.85 }, C: { label: 'Fairly reliable', p: 0.70 },
  D: { label: 'Not usually reliable', p: 0.50 }, E: { label: 'Unreliable', p: 0.30 }, F: { label: 'Reliability cannot be judged', p: 0.50 }
});
export const CREDIBILITY = Object.freeze({
  1: { label: 'Confirmed by other independent sources', p: 0.95 }, 2: { label: 'Probably true', p: 0.80 }, 3: { label: 'Possibly true', p: 0.60 },
  4: { label: 'Doubtful', p: 0.40 }, 5: { label: 'Improbable', p: 0.20 }, 6: { label: 'Truth cannot be judged', p: 0.50 }
});
export const grade = (r, c) => `${r}${c}`;
export const parseGrade = (g) => ({ reliability: String(g)[0], credibility: String(g)[1] });
export const reliabilityP = (r) => (RELIABILITY[r] || RELIABILITY.F).p;
export const credibilityP = (c) => (CREDIBILITY[c] || CREDIBILITY[6]).p;
/** Credibility number from corroboration / contradiction counts (documented in docs/METHODOLOGY.md §4). */
export function credibilityFrom({ independentAgree = 0, contradicts = 0, judgeable = true }) {
  if (!judgeable) return 6;
  if (contradicts > independentAgree) return contradicts > independentAgree + 1 ? 5 : 4;
  if (independentAgree >= 2) return 1;
  if (independentAgree === 1) return 2;
  return 3;
}
