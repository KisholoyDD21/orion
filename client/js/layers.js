// Bulk entity rendering. One shared BillboardCollection for every geolocated layer (fast at the scale ORION
// operates at — hundreds to a few thousand points) with diffed add/update/remove, so a refresh never rebuilds
// primitives it doesn't have to. Glyph SHAPE encodes layer identity; a thin ring encodes priority BAND — see glyphs.js.
import Cesium from './cesium-global.js';
import { LAYERS } from '/shared/taxonomy.js';
import { glyphCanvas } from './glyphs.js';
import { settings } from './state.js';

const bandOf = (p) => (p >= 60 ? 'critical' : p >= 40 ? 'high' : p >= 25 ? 'elevated' : 'routine');

export function createLayerManager(viewer) {
  const billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
  const byId = new Map();   // entity id -> Cesium Billboard
  const raw = new Map();    // layer id -> Map(entity id -> compact record)

  const heightFor = (layerId, rec) => (layerId === 'space' ? Math.max(150_000, rec.h ?? 400_000) : layerId === 'air' ? Math.max(0, rec.h ?? 0) : 12_000);
  const passesFilter = (layerId, rec) => settings.layersOn.has(layerId) && (settings.showSynthetic || !rec.f?.includes('x')) && (rec.p ?? 0) >= settings.minPriority;

  function upsert(layerId, rec) {
    const def = LAYERS[layerId]; if (!def || rec.a == null || rec.o == null) return;
    const band = bandOf(rec.p || 0), dim = !!rec.f?.includes('x'), image = glyphCanvas(def.glyph, def.color, band, { dim });
    const position = Cesium.Cartesian3.fromDegrees(rec.o, rec.a, heightFor(layerId, rec));
    const scale = 0.62 + Math.min(0.55, (rec.p || 0) / 100), show = passesFilter(layerId, rec);
    let bb = byId.get(rec.i);
    if (!bb) { bb = billboards.add({ position, image, scale, id: rec.i, show, alignedAxis: Cesium.Cartesian3.UNIT_Z, verticalOrigin: Cesium.VerticalOrigin.CENTER }); bb.layerId = layerId; byId.set(rec.i, bb); }
    else { bb.position = position; bb.image = image; bb.scale = scale; bb.show = show; }
    if (rec.k != null) bb.rotation = Cesium.Math.toRadians(-rec.k); else bb.rotation = 0;
  }
  function remove(id) { const bb = byId.get(id); if (bb) { billboards.remove(bb); byId.delete(id); } }

  /** items: array of compact records from GET /api/layer/:id. */
  function applyLayer(layerId, items) {
    const map = raw.get(layerId) || raw.set(layerId, new Map()).get(layerId), seen = new Set();
    for (const rec of items) { seen.add(rec.i); map.set(rec.i, rec); upsert(layerId, rec); }
    for (const id of map.keys()) if (!seen.has(id)) { map.delete(id); remove(id); }
    viewer.scene.requestRender?.();
  }
  /** Re-apply current filters (layer on/off, min priority, synthetic) without refetching data. */
  function refilter() { for (const [layerId, map] of raw) for (const rec of map.values()) upsert(layerId, rec); }
  function getRecord(id) { for (const map of raw.values()) if (map.has(id)) return map.get(id); return null; }
  function counts() { const out = {}; for (const [layerId, map] of raw) out[layerId] = map.size; return out; }
  function flashSelected(id) { /* selection ring is drawn by track.js as a separate overlay entity, kept decoupled from the billboard collection */ }

  return { applyLayer, refilter, getRecord, counts };
}
