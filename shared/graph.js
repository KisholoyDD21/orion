// Property-graph store with the analytics used by the investigation view (shortest path, PageRank, communities).
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export class Graph {
  constructor() { this.nodes = new Map(); this.edges = []; this.adj = new Map(); this._seen = new Set(); }
  addNode(n) {
    if (!n?.id) throw new Error('node id required');
    const ex = this.nodes.get(n.id);
    if (ex) { for (const [k, v] of Object.entries(n)) if (v !== undefined) ex[k] = v; return ex; }
    const node = { ...n }; this.nodes.set(n.id, node); this.adj.set(n.id, new Map()); return node;
  }
  addEdge(a, b, label = 'related-to', weight = 1, attrs = {}) {
    if (!this.nodes.has(a) || !this.nodes.has(b) || a === b) return null;
    const key = `${a}\u0000${b}\u0000${label}`;
    if (this._seen.has(key)) return null;
    this._seen.add(key);
    const e = { id: `e${this.edges.length}`, a, b, label, weight: clamp(weight, 0, 1), ...attrs };
    this.edges.push(e);
    for (const [x, y] of [[a, b], [b, a]]) { const m = this.adj.get(x); (m.get(y) || m.set(y, []).get(y)).push(e); }
    return e;
  }
  neighbors(id) { return [...(this.adj.get(id)?.keys() || [])]; }
  degree(id) { return this.adj.get(id)?.size || 0; }
  shortestPath(from, to, { weighted = false } = {}) {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
    const dist = new Map([[from, 0]]), prev = new Map(), done = new Set(), q = [[0, from]];
    while (q.length) {
      q.sort((x, y) => x[0] - y[0]); const [d, u] = q.shift();
      if (done.has(u)) continue; done.add(u);
      if (u === to) break;
      for (const [v, es] of this.adj.get(u)) {
        const w = weighted ? 1 + (1 - Math.max(...es.map((e) => e.weight))) : 1, nd = d + w;
        if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); q.push([nd, v]); }
      }
    }
    if (!dist.has(to)) return null;
    const path = [to]; while (path[0] !== from) path.unshift(prev.get(path[0]));
    return { nodes: path, hops: path.length - 1, cost: dist.get(to), edges: path.slice(1).map((v, i) => this.adj.get(path[i]).get(v)[0]) };
  }
  pagerank({ d = 0.85, iter = 60 } = {}) {
    const ids = [...this.nodes.keys()], n = ids.length; if (!n) return new Map();
    let pr = new Map(ids.map((i) => [i, 1 / n]));
    const out = new Map(ids.map((i) => [i, [...this.adj.get(i)].reduce((s, [, es]) => s + Math.max(...es.map((e) => e.weight || 0.01)), 0)]));
    for (let k = 0; k < iter; k++) {
      const next = new Map(ids.map((i) => [i, (1 - d) / n]));
      let dangling = 0; for (const i of ids) if (!out.get(i)) dangling += pr.get(i);
      for (const u of ids) for (const [v, es] of this.adj.get(u)) next.set(v, next.get(v) + (d * pr.get(u) * Math.max(...es.map((e) => e.weight || 0.01))) / (out.get(u) || 1));
      for (const i of ids) next.set(i, next.get(i) + (d * dangling) / n);
      pr = next;
    }
    return pr;
  }
  components() {
    const seen = new Set(), comps = [];
    for (const s of this.nodes.keys()) { if (seen.has(s)) continue; const c = [], st = [s]; seen.add(s); while (st.length) { const u = st.pop(); c.push(u); for (const v of this.neighbors(u)) if (!seen.has(v)) { seen.add(v); st.push(v); } } comps.push(c); }
    return comps.sort((a, b) => b.length - a.length);
  }
  communities({ maxIter = 25 } = {}) {                        // deterministic label propagation
    const ids = [...this.nodes.keys()].sort(), label = new Map(ids.map((i) => [i, i]));
    for (let it = 0; it < maxIter; it++) {
      let changed = false;
      for (const u of ids) {
        const tally = new Map();
        for (const [v, es] of this.adj.get(u)) tally.set(label.get(v), (tally.get(label.get(v)) || 0) + Math.max(...es.map((e) => e.weight || 0.01)));
        if (!tally.size) continue;
        const best = [...tally.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
        if (best !== label.get(u)) { label.set(u, best); changed = true; }
      }
      if (!changed) break;
    }
    const groups = new Map(); for (const [id, l] of label) (groups.get(l) || groups.set(l, []).get(l)).push(id);
    return [...groups.values()].sort((a, b) => b.length - a.length);
  }
  subgraph(root, depth = 2) {
    const g = new Graph(), seen = new Map([[root, 0]]), q = [root];
    while (q.length) { const u = q.shift(), d = seen.get(u); if (d >= depth) continue; for (const v of this.neighbors(u)) if (!seen.has(v)) { seen.set(v, d + 1); q.push(v); } }
    for (const id of seen.keys()) g.addNode({ ...this.nodes.get(id) });
    for (const e of this.edges) if (seen.has(e.a) && seen.has(e.b)) g.addEdge(e.a, e.b, e.label, e.weight, { ...e, id: undefined, a: undefined, b: undefined, label: undefined, weight: undefined });
    return g;
  }
  metrics() {
    const n = this.nodes.size, m = this.edges.length, comps = this.components();
    return { nodes: n, edges: m, density: n > 1 ? (2 * m) / (n * (n - 1)) : 0, avgDegree: n ? (2 * m) / n : 0, components: comps.length, largestComponent: comps[0]?.length || 0 };
  }
  toJSON() { return { nodes: [...this.nodes.values()], edges: this.edges.map((e) => ({ ...e })) }; }
  static fromJSON(j) { const g = new Graph(); for (const n of j?.nodes || []) g.addNode(n); for (const e of j?.edges || []) g.addEdge(e.a, e.b, e.label, e.weight, e); return g; }
  toGraphML() {
    const x = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n<key id="label" for="node" attr.name="label" attr.type="string"/><key id="type" for="node" attr.name="type" attr.type="string"/><key id="rel" for="edge" attr.name="label" attr.type="string"/><key id="w" for="edge" attr.name="weight" attr.type="double"/>\n<graph id="orion" edgedefault="directed">\n${[...this.nodes.values()].map((n) => `<node id="${x(n.id)}"><data key="label">${x(n.label)}</data><data key="type">${x(n.type)}</data></node>`).join('\n')}\n${this.edges.map((e) => `<edge source="${x(e.a)}" target="${x(e.b)}"><data key="rel">${x(e.label)}</data><data key="w">${e.weight}</data></edge>`).join('\n')}\n</graph></graphml>\n`;
  }
}
