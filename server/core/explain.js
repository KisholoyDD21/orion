// Human-readable explanation of a fused score: what drove it, what limited it, and what would change it.
import { explain, HALF_LIFE_S } from '../../shared/scoring.js';
import { RELIABILITY, CREDIBILITY, parseGrade } from '../../shared/admiralty.js';
const pct = (x) => `${Math.round(x * 100)}%`;
const dur = (s) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`);
function severityText(e) {
  const a = e.attrs || {};
  switch (e.type) {
    case 'seismic': return `magnitude ${a.mag}${a.tsunami ? ', tsunami flag' : ''}${a.alert ? `, PAGER ${a.alert}` : ''}`;
    case 'air': return a.squawk && a.squawk !== '1200' && ['7500', '7600', '7700'].includes(a.squawk) ? `transponder code ${a.squawk}` : e.subtype === 'mil' ? 'military-tagged aircraft' : 'routine traffic';
    case 'maritime': return a.navStat != null ? `AIS status: ${a.navStatLabel || a.navStat}` : 'routine traffic';
    case 'hazard': return `${a.category || e.subtype}${a.magnitude != null ? `, ${a.magnitude} ${a.magnitudeUnit || ''}` : ''}`;
    case 'media': return `${a.count} mentions in 24 h (${a.theme})`;
    case 'cyber': return `${a.malware || 'botnet'} C2, ${a.status}`;
    case 'vuln': return a.kev ? `known exploited${a.ransomware === 'Known' ? ', ransomware use' : ''}` : `CVSS ${a.cvss}`;
    default: return 'source-defined severity';
  }
}
export function factorRows(e) {
  const f = e.fusion; if (!f) return [];
  const { reliability, credibility } = parseGrade(f.admiralty), hl = HALF_LIFE_S[e.hl || (e.type === 'vuln' ? 'vulnerability' : e.type === 'seismic' || e.type === 'hazard' ? 'event' : e.type)] ?? HALF_LIFE_S.default;
  const ctx = f.context, near = [];
  if (ctx?.nuclear && ctx.nuclear.km <= 150) near.push(`${ctx.nuclear.name} nuclear plant ${ctx.nuclear.km} km`);
  if (ctx?.airport && ctx.airport.km <= 60) near.push(`${ctx.airport.iata || ctx.airport.icao} airport ${ctx.airport.km} km`);
  if (ctx?.place && ctx.place.km <= 100) near.push(`${ctx.place.name} (pop ${(ctx.place.pop / 1e6).toFixed(1)}M) ${ctx.place.km} km`);
  return [
    { key: 'S', label: 'Severity', value: f.factors.S, note: severityText(e), group: 'impact' },
    { key: 'Y', label: 'Criticality', value: f.factors.Y, note: near.length ? `near ${near.join('; ')}` : e.type === 'vuln' ? 'exploitation likelihood proxy (KEV, EPSS)' : 'no critical infrastructure nearby', group: 'impact' },
    { key: 'R', label: 'Source reliability', value: f.factors.R, note: `grade ${reliability}, ${RELIABILITY[reliability]?.label.toLowerCase()}`, group: 'quality' },
    { key: 'C', label: 'Credibility', value: f.factors.C, note: `grade ${credibility}, ${CREDIBILITY[credibility]?.label.toLowerCase()}`, group: 'quality' },
    { key: 'F', label: 'Freshness', value: f.factors.F, note: `observed ${dur(f.ageSec)} ago; half-life ${dur(hl)}`, group: 'quality' },
    { key: 'K', label: 'Corroboration', value: f.factors.K, note: f.corroborators.length ? `${new Set(f.corroborators.map((c) => c.source)).size} independent source(s)` : 'no independent corroboration', group: 'quality' },
  ];
}
export function narrate(e) {
  const f = e.fusion; if (!f) return '';
  const x = explain(f.factors), lim = { reliability: 'source reliability', credibility: 'credibility', freshness: 'freshness', corroboration: 'a lack of corroboration' }[x.limitingFactor];
  const lines = [`Priority ${f.priority.toFixed(1)} (${f.band}): impact ${f.impact.toFixed(2)} × quality ${f.quality.toFixed(2)}.`, `Impact comes from severity (${severityText(e)}) and criticality ${pct(f.factors.Y)}.`, `The evidence is limited mainly by ${lim}.`];
  if (f.rules.length) lines.push(`Rules fired: ${f.rules.map((r) => r.label).join('; ')}.`);
  lines.push(`Estimative language: the report is ${f.term} to be accurate (indicative only: Admiralty grades are conventions, see the benchmark's calibration check), with ${f.confidenceLevel} analytic confidence. Priority ranks attention; it is not a finding of intent.`);
  return lines.join(' ');
}
