import { Graph } from '../../shared/graph.js';
import { reliabilityP } from '../../shared/admiralty.js';
/** Builds the analysis graph from the current store. Nodes: entities, infrastructure, countries, ASNs, malware families, vendors, sources. */
export function buildGraph({ store, ref, includeSources = false, maxEntities = 1200 }) {
  const g = new Graph(), airports = new Map(ref.airports.map((a) => [a.icao, a])), plants = new Map(ref.plants.map((p) => [p.id, p]));
  const keep = store.all().filter((e) => {
    if (e.type === 'space') return false;
    if (e.type === 'air' || e.type === 'maritime') return (e.fusion?.priority ?? 0) >= 20 || ['emergency', 'mil', 'distress'].includes(e.subtype);
    return true;
  }).sort((a, b) => (b.fusion?.priority ?? 0) - (a.fusion?.priority ?? 0)).slice(0, maxEntities);
  for (const e of keep) g.addNode({ id: e.id, label: e.name, kind: e.type, layer: e.layer, priority: e.fusion?.priority ?? 0, synthetic: e.synthetic, lat: e.lat, lon: e.lon });
  const ensure = (id, label, kind, extra = {}) => { if (!g.nodes.has(id)) g.addNode({ id, label, kind, priority: 0, ...extra }); return id; };
  for (const e of keep) {
    for (const l of e.fusion?.links || []) {
      let to = l.to;
      if (to.startsWith('infra:')) { const k = to.slice(6), p = plants.get(k), a = airports.get(k); if (p) ensure(to, p.name, 'infra', { lat: p.lat, lon: p.lon, sub: `${p.fuel} ${p.mw} MW` }); else if (a) ensure(to, `${a.iata || a.icao} ${a.name}`, 'infra', { lat: a.lat, lon: a.lon, sub: 'airport' }); else continue; }
      else if (to.startsWith('country:')) { const c = ref.countryByA2.get(to.slice(8)); if (!c) continue; ensure(to, c.n, 'country'); }
      else if (!g.nodes.has(to)) continue;
      g.addEdge(e.id, to, l.rel, l.weight ?? 0.5, { km: l.km });
    }
    const a = e.attrs || {};
    if (e.type === 'cyber') {
      if (a.asn) g.addEdge(e.id, ensure(`asn:${a.asn}`, `AS${a.asn} ${a.asName || ''}`.trim(), 'asn'), 'operated-in', 0.7);
      if (a.malware) g.addEdge(e.id, ensure(`malware:${a.malware.toLowerCase()}`, a.malware, 'malware'), 'uses-malware', 0.9);
      if (a.country && ref.countryByA2.has(a.country)) g.addEdge(e.id, ensure(`country:${a.country}`, ref.countryByA2.get(a.country).n, 'country'), 'hosted-in', 0.4);
    }
    if (e.type === 'vuln') {
      if (a.vendor) g.addEdge(e.id, ensure(`vendor:${String(a.vendor).toLowerCase()}`, a.vendor, 'vendor'), 'affects', 0.8);
      for (const w of a.cwes || []) g.addEdge(e.id, ensure(`cwe:${w}`, w, 'cwe'), 'weakness', 0.6);
    }
    if (includeSources) g.addEdge(e.id, ensure(`source:${e.source}`, e.source, 'source'), 'reported-by', reliabilityP(e.rel));
  }
  return g;
}
export function summarize(g, limit = 80) {
  const pr = g.pagerank(), comms = g.communities(), commOf = new Map(); comms.forEach((c, i) => c.forEach((id) => commOf.set(id, i)));
  const nodes = [...g.nodes.values()].map((n) => ({ ...n, degree: g.degree(n.id), pagerank: +(pr.get(n.id) * g.nodes.size).toFixed(3), community: commOf.get(n.id) }));
  return { nodes, edges: g.edges, communities: comms.slice(0, 12).map((c, i) => ({ id: i, size: c.length, top: c.slice(0, 5) })), components: g.components().length, size: { nodes: g.nodes.size, edges: g.edges.length } };
}
