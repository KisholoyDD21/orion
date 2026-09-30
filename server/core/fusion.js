// Fusion engine (documented in docs/METHODOLOGY.md). For every entity it derives the six factors of the scoring model
// (severity S, criticality Y, reliability R, credibility C, freshness F, corroboration K), records which rules fired, and
// emits graph links. Everything is deterministic and explainable: no hidden state, no learned weights.
import { scoreFactors, freshness, noisyOr, MODEL_VERSION, DEFAULT_WEIGHTS } from '../../shared/scoring.js';
import { reliabilityP, credibilityP, credibilityFrom, grade } from '../../shared/admiralty.js';
import { termFor, confidenceLevel } from '../../shared/estimative.js';
import { GeoIndex, haversineKm } from '../../shared/geo.js';
import { bandOf } from '../../shared/taxonomy.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const hlType = (e) => e.hl || (e.type === 'hazard' && e.subtype === 'wildfires' ? 'fire' : e.type === 'seismic' || e.type === 'hazard' ? 'event' : e.type === 'vuln' ? 'vulnerability' : e.type === 'recon' ? 'cyber' : e.type);
const popFactor = (pop) => (pop ? clamp01((Math.log10(pop) - 4) / 3) : 0);
const odds = (p) => { const q = Math.min(0.999, Math.max(0.001, p)); return q / (1 - q); };
const GEO_CONTEXT_TYPES = new Set(['seismic', 'hazard', 'media', 'cyber', 'recon', 'synthetic']);

/** Spatial-temporal corroboration rules between *different* sources. Symmetric. */
export const CORROBORATION_RULES = Object.freeze([
  { id: 'R-CORR-QUAKE-HAZARD', a: 'seismic', b: 'hazard', km: 150, hours: 72, label: 'Earthquake near a reported natural-hazard event' },
  { id: 'R-CORR-QUAKE-MEDIA', a: 'seismic', b: 'media', km: 250, hours: 48, label: 'Earthquake near media attention (hazard theme)', theme: 'hazard' },
  { id: 'R-CORR-HAZARD-MEDIA', a: 'hazard', b: 'media', km: 200, hours: 72, label: 'Hazard event near media attention (hazard theme)', theme: 'hazard' },
]);

export function createFusion({ store, ref, state = {}, log }) {
  const stats = { runs: 0, lastMs: 0, lastAt: null, lastCount: 0, byBand: {} };
  function fuse(now = Date.now()) {
    const t0 = performance.now();
    const all = store.all();
    // 1. indexes
    const eventIdx = new GeoIndex(2), keyMap = new Map();
    const eventLike = (e) => e.lat !== null && (e.type === 'seismic' || e.type === 'hazard' || e.type === 'media');
    for (const e of all) {
      if (eventLike(e)) eventIdx.insert(e, e.lat, e.lon);
      for (const k of e.corrKeys || []) (keyMap.get(k) || keyMap.set(k, []).get(k)).push(e);
    }
    // 2. corroborators
    const corr = new Map(); const add = (e, o, rule, extra = {}) => { const l = corr.get(e.id) || corr.set(e.id, []).get(e.id); if (!l.some((c) => c.id === o.id)) l.push({ id: o.id, source: o.source, rel: o.rel, rule: rule.id, label: rule.label, ...extra }); };
    for (const e of all) {
      if (!eventLike(e)) continue;
      for (const rule of CORROBORATION_RULES) {
        const other = rule.a === e.type ? rule.b : rule.b === e.type ? rule.a : null; if (!other || rule.a === rule.b) continue;
        for (const { item, km } of eventIdx.within(e.lat, e.lon, rule.km)) {
          if (item.type !== other || item.source === e.source || item.id === e.id) continue;
          if (rule.theme && ((item.type === 'media' ? item : e).attrs?.theme !== rule.theme)) continue;
          const hours = Math.abs(Date.parse(item.observedAt) - Date.parse(e.observedAt)) / 3.6e6; if (hours > rule.hours) continue;
          add(e, item, rule, { km: Math.round(km), hours: Math.round(hours) });
        }
      }
    }
    for (const [key, list] of keyMap) {
      if (list.length < 2) continue;
      for (const e of list) for (const o of list) if (o.id !== e.id && o.source !== e.source) add(e, o, { id: 'R-CORR-KEY', label: `Same indicator reported by another source (${key})` });
    }
    // 3. per-entity scoring
    const byBand = {};
    for (const e of all) {
      const rules = [], links = [];
      const ageSec = Math.max(0, (now - (Date.parse(e.observedAt) || now)) / 1000);
      const F = freshness(ageSec, hlType(e));
      const R = reliabilityP(e.rel);
      const cs = corr.get(e.id) || [];
      const agree = new Set(cs.map((c) => c.source)).size;
      let credNum = credibilityFrom({ independentAgree: agree, contradicts: e.attrs?.contradicts || 0, judgeable: !(e.type === 'media' && agree === 0) });
      if (credNum <= 3 && e.credHint) credNum = Math.min(credNum, e.credHint);
      const C = credibilityP(credNum);
      const K = cs.length ? noisyOr(cs.map((c) => reliabilityP(c.rel))) : 0;
      for (const c of cs) { rules.push({ id: c.rule, label: c.label, detail: c.km != null ? `${c.id}, ${c.km} km, ${c.hours} h apart` : c.id }); links.push({ to: c.id, rel: 'corroborates', weight: 0.9 }); }
      // criticality
      let ctx = null;
      const attention = e.severity >= 0.2 || GEO_CONTEXT_TYPES.has(e.type) || e.subtype === 'mil';
      if (e.lat !== null && attention && e.type !== 'space') ctx = ref.context(e.lat, e.lon);
      let Y = 0.12;
      if (e.criticalityHint != null) Y = e.criticalityHint;
      else if (e.type === 'vuln') {
        const ep = state.epss?.get?.(e.attrs?.cve); const p = ep ? ep.percentile : 0;
        Y = e.attrs?.kev ? 0.55 + 0.35 * p : 0.15 + 0.6 * p;
        if (ep) rules.push({ id: 'R-VULN-EPSS', label: 'EPSS exploitation-probability enrichment', detail: `EPSS ${(ep.epss * 100).toFixed(1)}%, percentile ${(p * 100).toFixed(0)}` });
        if (e.attrs?.kev) rules.push({ id: 'R-VULN-KEV', label: 'Listed in CISA Known Exploited Vulnerabilities', detail: e.attrs.ransomware === 'Known' ? 'known ransomware campaign use' : 'exploitation observed in the wild' });
      } else if (ctx) {
        const nearPop = ctx.place && ctx.place.km <= 100 ? popFactor(ctx.place.pop) * (1 - ctx.place.km / 150) : 0;
        Y = 0.15 + 0.35 * nearPop;
        if (ctx.nuclear && ctx.nuclear.km <= 150 && e.type !== 'cyber') {
          Y += 0.35 * (1 - ctx.nuclear.km / 150); rules.push({ id: 'R-INFRA-NUCLEAR', label: 'Near a nuclear power plant', detail: `${ctx.nuclear.name}, ${ctx.nuclear.mw} MW, ${ctx.nuclear.km} km` });
          links.push({ to: `infra:${ctx.nuclear.id}`, rel: 'near', weight: 1 - ctx.nuclear.km / 150, km: ctx.nuclear.km });
        }
        if (ctx.airport && ctx.airport.size === 'L' && ctx.airport.km <= 60 && e.type !== 'cyber') {
          Y += 0.1; rules.push({ id: 'R-INFRA-AIRPORT', label: 'Near a major airport', detail: `${ctx.airport.iata || ctx.airport.icao}, ${ctx.airport.km} km` });
          links.push({ to: `infra:${ctx.airport.icao}`, rel: 'near', weight: 0.6, km: ctx.airport.km });
        }
        if (e.subtype === 'mil') Y += 0.15;
      } else if (e.type === 'space') Y = 0.1; else if (e.subtype === 'mil') Y = 0.3;
      Y = clamp01(Y);
      if (ctx?.country) links.push({ to: `country:${ctx.country.a2}`, rel: 'located-in', weight: 0.5 });
      const f = { S: clamp01(e.severity), Y, R, C, F, K };
      const sc = scoreFactors(f);
      const pReal = odds(R) * odds(C) / (1 + odds(R) * odds(C));
      const band = bandOf(sc.priority); byBand[band] = (byBand[band] || 0) + 1;
      e.fusion = {
        model: MODEL_VERSION, factors: f, impact: +sc.impact.toFixed(3), quality: +sc.quality.toFixed(3), priority: sc.priority, confidence: +sc.confidence.toFixed(3), band,
        admiralty: grade(e.rel, credNum), pReal: +pReal.toFixed(3), term: termFor(pReal), confidenceLevel: confidenceLevel(sc.confidence),
        ageSec: Math.round(ageSec), corroborators: cs, rules, links, context: ctx,
      };
    }
    stats.runs++; stats.lastMs = +(performance.now() - t0).toFixed(1); stats.lastAt = new Date().toISOString(); stats.lastCount = all.length; stats.byBand = byBand;
    return stats;
  }
  let timer = null;
  const schedule = (delayMs = 400, after) => { if (timer) return; timer = setTimeout(() => { timer = null; try { fuse(); after?.(); } catch (e) { log?.error(`fusion failed: ${e.stack || e}`); } }, delayMs); timer.unref?.(); };
  return { fuse, schedule, stats, weights: DEFAULT_WEIGHTS };
}
