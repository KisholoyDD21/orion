/** Minimal event bus + a small reactive settings object. No framework: this app is a few thousand entities
 *  rendered as Cesium primitives, updated on SSE events — a virtual-DOM layer would fight the renderer, not help it. */
export function createBus() {
  const m = new Map();
  return {
    on(ev, fn) { (m.get(ev) || m.set(ev, new Set()).get(ev)).add(fn); return () => m.get(ev)?.delete(fn); },
    emit(ev, payload) { for (const fn of m.get(ev) || []) fn(payload); },
  };
}
export const bus = createBus();
export const settings = {
  layersOn: new Set(['air', 'maritime', 'space', 'seismic', 'hazard', 'media', 'cyber', 'vuln']),
  minPriority: 0, showSynthetic: true, terminator: true, labels: true, selectedId: null, mode: 'loading',
};

/** Case builder: a small set of entity ids the person is assembling into a case, shared across panels. */
export const caseBuilder = {
  ids: new Set(),
  add(id) { this.ids.add(id); bus.emit('case:changed', this.size()); },
  remove(id) { this.ids.delete(id); bus.emit('case:changed', this.size()); },
  has(id) { return this.ids.has(id); },
  size() { return this.ids.size; },
  list() { return [...this.ids]; },
  clear() { this.ids.clear(); bus.emit('case:changed', 0); },
};
