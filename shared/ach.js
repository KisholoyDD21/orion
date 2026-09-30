// Analysis of Competing Hypotheses (Heuer, 1999): rank hypotheses by *inconsistent* evidence, not by support.
export const RATINGS = Object.freeze({
  CC: { label: 'Very consistent', penalty: 0, support: 2 }, C: { label: 'Consistent', penalty: 0, support: 1 }, N: { label: 'Neutral / not applicable', penalty: 0, support: 0 },
  I: { label: 'Inconsistent', penalty: 1, support: 0 }, II: { label: 'Very inconsistent', penalty: 2, support: 0 }
});
function scoreAll(hypotheses, evidence, ratings, skip) {
  return hypotheses.map((h) => {
    let inc = 0, sup = 0;
    for (const e of evidence) {
      if (e.id === skip) continue;
      const r = RATINGS[ratings?.[e.id]?.[h.id]] || RATINGS.N, w = Number(e.weight) || 1;
      inc += w * r.penalty; sup += w * r.support;
    }
    return { hypId: h.id, inconsistency: inc, support: sup };
  });
}
const order = (rows) => [...rows].sort((a, b) => a.inconsistency - b.inconsistency || b.support - a.support || (a.hypId < b.hypId ? -1 : 1));
export function computeACH({ hypotheses = [], evidence = [], ratings = {} }) {
  if (!hypotheses.length || !evidence.length) return { rows: [], diagnosticity: [], leader: null, margin: 0, fragileEvidence: [], unrated: 0 };
  const rows = order(scoreAll(hypotheses, evidence, ratings)), maxInc = evidence.reduce((s, e) => s + 2 * (Number(e.weight) || 1), 0) || 1;
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1, supportIndex: 1 - r.inconsistency / maxInc }));
  const diagnosticity = evidence.map((e) => {
    const pen = hypotheses.map((h) => (RATINGS[ratings?.[e.id]?.[h.id]] || RATINGS.N).penalty), range = Math.max(...pen) - Math.min(...pen);
    return { evId: e.id, range, diagnostic: range > 0 };
  });
  const fragile = evidence.filter((e) => { const alt = order(scoreAll(hypotheses, evidence, ratings, e.id)); return alt[0]?.hypId !== ranked[0].hypId; }).map((e) => e.id);
  let unrated = 0; for (const e of evidence) for (const h of hypotheses) if (!ratings?.[e.id]?.[h.id]) unrated++;
  return { rows: ranked, diagnosticity, leader: ranked[0].hypId, margin: ranked[1] ? ranked[1].inconsistency - ranked[0].inconsistency : 0, fragileEvidence: fragile, unrated };
}
