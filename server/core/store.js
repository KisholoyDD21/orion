// In-memory entity store: per-source replacement semantics, per-layer versions (cheap client cache validation), short position history.
import { haversineKm } from '../../shared/geo.js';
export class EntityStore {
  constructor({ historyLen = 14 } = {}) {
    this.bySource = new Map(); this.byId = new Map(); this.layerVersion = new Map(); this.layerUpdatedAt = new Map();
    this.version = 0; this.history = new Map(); this.historyLen = historyLen; this.listeners = new Set();
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  replaceSource(sourceId, entities) {
    const old = this.bySource.get(sourceId) || new Map(), next = new Map(), touched = new Set();
    const nowIso = new Date().toISOString();
    for (const e of entities) {
      const prev = old.get(e.id);
      e.firstSeenAt = prev?.firstSeenAt || e.firstSeenAt || nowIso;
      if (prev?.fusion && !e.fusion) e.fusion = prev.fusion;          // keep last score until the next fusion pass
      next.set(e.id, e); this.byId.set(e.id, e); touched.add(e.layer);
      if (e.lat !== null && (e.type === 'air' || e.type === 'maritime')) this._track(e);
    }
    for (const [id, e] of old) if (!next.has(id)) { this.byId.delete(id); this.history.delete(id); touched.add(e.layer); }
    this.bySource.set(sourceId, next);
    this.version++;
    for (const l of touched) { this.layerVersion.set(l, (this.layerVersion.get(l) || 0) + 1); this.layerUpdatedAt.set(l, nowIso); }
    for (const fn of this.listeners) { try { fn({ sourceId, layers: [...touched], count: next.size }); } catch { /* listener errors must not break ingestion */ } }
    return next.size;
  }
  _track(e) {
    let h = this.history.get(e.id); if (!h) this.history.set(e.id, (h = []));
    const last = h.at(-1), t = Date.parse(e.observedAt) || Date.now();
    if (last && last[0] >= t) return;
    if (last && haversineKm(last[1], last[2], e.lat, e.lon) < 0.03) return;
    h.push([t, +e.lat.toFixed(5), +e.lon.toFixed(5), e.altM == null ? null : Math.round(e.altM)]);
    if (h.length > this.historyLen) h.shift();
  }
  track(id) { return this.history.get(id) || []; }
  get(id) { return this.byId.get(id) || null; }
  all() { return [...this.byId.values()]; }
  layer(layerId) { const out = []; for (const e of this.byId.values()) if (e.layer === layerId) out.push(e); return out; }
  layers() {
    const m = new Map();
    for (const e of this.byId.values()) { const l = m.get(e.layer) || { id: e.layer, count: 0, synthetic: 0, sources: new Set() }; l.count++; if (e.synthetic) l.synthetic++; l.sources.add(e.source); m.set(e.layer, l); }
    return [...m.values()].map((l) => ({ id: l.id, count: l.count, syntheticCount: l.synthetic, sources: [...l.sources], version: this.layerVersion.get(l.id) || 0, updatedAt: this.layerUpdatedAt.get(l.id) || null }));
  }
  query({ layers = null, minPriority = 0, limit = 50, includeSynthetic = true, sort = 'priority', bbox = null } = {}) {
    let out = [];
    for (const e of this.byId.values()) {
      if (layers && !layers.includes(e.layer)) continue;
      if (!includeSynthetic && e.synthetic) continue;
      const p = e.fusion?.priority ?? 0; if (p < minPriority) continue;
      if (bbox && (e.lat === null || e.lat < bbox[1] || e.lat > bbox[3] || e.lon < bbox[0] || e.lon > bbox[2])) continue;
      out.push(e);
    }
    if (sort === 'priority') out.sort((a, b) => (b.fusion?.priority ?? 0) - (a.fusion?.priority ?? 0));
    else if (sort === 'time') out.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
    return out.slice(0, limit);
  }
  clearSource(id) { return this.replaceSource(id, []); }
}
