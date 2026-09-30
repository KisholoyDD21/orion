// Alert centre: converts fused entities into a de-duplicated, ranked alert list. Alerts carry their reasons so an analyst can audit them.
import { SQUAWK_MEANING } from '../../shared/taxonomy.js';
const LEVEL = (p) => (p >= 60 ? 'critical' : p >= 40 ? 'high' : 'elevated');
export class AlertCenter {
  constructor({ max = 300, minPriority = 25, onAlert = null } = {}) { this.list = []; this.max = max; this.min = minPriority; this.seen = new Map(); this.onAlert = onAlert; this.n = 0; this.primed = false; }
  consider(entities) {
    const fresh = [];
    for (const e of entities) {
      const f = e.fusion; if (!f) continue;
      const special = e.type === 'air' && e.attrs?.squawk && SQUAWK_MEANING[e.attrs.squawk];
      if (f.priority < this.min && !special) continue;
      const level = special && f.priority < 40 ? 'high' : LEVEL(f.priority);
      const key = `${e.id}|${level}`;
      if (this.seen.has(key)) { const a = this.seen.get(key); a.priority = f.priority; continue; }
      const a = {
        id: `al-${++this.n}`, at: new Date().toISOString(), entityId: e.id, type: e.type, layer: e.layer, level, priority: f.priority, confidence: f.confidence, admiralty: f.admiralty,
        title: special ? `${e.name}: squawk ${e.attrs.squawk}, ${SQUAWK_MEANING[e.attrs.squawk]}` : e.name,
        why: [...f.rules.slice(0, 3).map((r) => r.label), `limiting factor: ${Object.entries(f.factors).filter(([k]) => ['R', 'C', 'F'].includes(k)).sort((x, y) => x[1] - y[1])[0][0] === 'F' ? 'freshness' : 'evidence quality'}`],
        synthetic: e.synthetic, lat: e.lat, lon: e.lon, seeded: !this.primed,
      };
      this.seen.set(key, a); this.list.unshift(a); fresh.push(a);
    }
    if (this.list.length > this.max) { for (const gone of this.list.splice(this.max)) this.seen.delete(`${gone.entityId}|${gone.level}`); }
    if (this.primed) for (const a of fresh) this.onAlert?.(a);
    return fresh;
  }
  prime() { this.primed = true; }
  top(limit = 50) { return [...this.list].sort((a, b) => b.priority - a.priority).slice(0, limit); }
  recent(limit = 50) { return this.list.slice(0, limit); }
}
