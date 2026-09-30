// Selected-entity overlays: recent position history for aircraft/vessels, ground track for satellites, and a
// dashed selection ring that follows whatever is currently selected — all as a handful of proper Cesium Entities
// (the Entity API is the right tool here: at most one selection at a time, not thousands of points).
import Cesium from './cesium-global.js';
import { api } from './api.js';
import { selectionRingCanvas } from './glyphs.js';

export function createTrackLayer(viewer) {
  let pathEntity = null, ringEntity = null, token = 0;
  function clear() { if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; } if (ringEntity) { viewer.entities.remove(ringEntity); ringEntity = null; } }
  function ringAt(lon, lat, height) {
    if (lon == null || lat == null) return;
    const pos = Cesium.Cartesian3.fromDegrees(lon, lat, height || 0);
    if (!ringEntity) ringEntity = viewer.entities.add({ position: pos, billboard: { image: selectionRingCanvas(), verticalOrigin: Cesium.VerticalOrigin.CENTER } });
    else ringEntity.position = pos;
  }
  async function showFor(entity) {
    clear(); const my = ++token;
    ringAt(entity.lon, entity.lat, entity.altM);
    try {
      if (entity.layer === 'air' || entity.layer === 'maritime') {
        const t = await api.entityTrack(entity.id); if (my !== token || t.points.length < 2) return;
        const positions = t.points.map((p) => Cesium.Cartesian3.fromDegrees(p[2], p[1], (p[3] ?? 0) > 0 ? p[3] : 8000));
        pathEntity = viewer.entities.add({ polyline: { positions, width: 2, material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString('#7fd8e6').withAlpha(0.85), dashLength: 8 }) } });
      } else if (entity.layer === 'space' && entity.attrs?.norad) {
        const p = await api.orbitPath(entity.attrs.norad, {}); if (my !== token || !p.points?.length) return;
        const positions = p.points.map((pt) => Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, Math.max(0, pt.altKm) * 1000));
        pathEntity = viewer.entities.add({ polyline: { positions, width: 1.5, material: Cesium.Color.fromCssColorString('#b79cff').withAlpha(0.75) } });
      }
    } catch (e) { console.warn('[orion] track/orbit path unavailable:', e.message); }
  }
  return { showFor, clear };
}
