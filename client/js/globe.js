// Cesium viewer bootstrap. No Ion dependency by default: base imagery is Cesium's bundled offline NaturalEarthII
// tileset, with NASA GIBS true-color MODIS imagery layered on top for real recent-imagery detail (falls back
// silently to the base layer alone if GIBS is unreachable). World terrain + OSM Buildings are added only if the
// person supplies their own Cesium ion token (see .env.example / the settings panel).
import Cesium from './cesium-global.js';
import { subsolarPoint } from '/shared/sun.js';
import { destination } from '/shared/geo.js';
import { bus, settings } from './state.js';

window.CESIUM_BASE_URL = '/vendor/cesium/';

const DARK = Cesium.Color.fromCssColorString('#04070a');

async function addBaseImagery(viewer) {
  try {
    const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'));
    viewer.imageryLayers.addImageryProvider(provider);
  } catch (e) { console.warn('[orion] base imagery unavailable:', e.message); }
}
async function addGibsImagery(viewer) {
  try {
    const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10); // yesterday UTC: avoids gaps in still-processing same-day tiles
    const provider = new Cesium.WebMapTileServiceImageryProvider({
      url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${day}/GoogleMapsCompatible_Level9/{TileMatrix}/{TileRow}/{TileCol}.jpg`,
      layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', style: 'default', format: 'image/jpeg', tileMatrixSetID: 'GoogleMapsCompatible_Level9', maximumLevel: 9,
      credit: new Cesium.Credit('Imagery: NASA EOSDIS GIBS / MODIS Corrected Reflectance, ' + day, false),
    });
    const layer = viewer.imageryLayers.addImageryProvider(provider);
    provider.errorEvent?.addEventListener?.(() => {}); // GIBS 404s outside coverage/date range are expected at some zooms; swallow rather than spam the console
    return layer;
  } catch (e) { console.warn('[orion] GIBS imagery unavailable:', e.message); return null; }
}
async function addTerrainAndBuildings(viewer, token) {
  if (!token) return;
  try {
    Cesium.Ion.defaultAccessToken = token;
    viewer.terrainProvider = await Cesium.createWorldTerrainAsync({ requestWaterMask: true });
    viewer.scene.primitives.add(await Cesium.createOsmBuildingsAsync());
  } catch (e) { console.warn('[orion] Cesium ion assets unavailable (check CESIUM_ION_TOKEN):', e.message); }
}

export async function createGlobe(container, { cesiumIonToken } = {}) {
  const viewer = new Cesium.Viewer(container, {
    baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false, infoBox: false,
    selectionIndicator: false, shadows: false, skyBox: false, msaaSamples: 2,
    creditContainer: document.getElementById('credit-container'), creditViewport: document.getElementById('credit-container'),
    contextOptions: { webgl: { alpha: false, powerPreference: 'high-performance' } },
  });
  viewer.scene.globe.baseColor = DARK; viewer.scene.backgroundColor = DARK;
  viewer.scene.globe.enableLighting = true; viewer.scene.globe.dynamicAtmosphereLighting = true;
  viewer.scene.globe.showGroundAtmosphere = true; viewer.scene.skyAtmosphere.hueShift = -0.03; viewer.scene.skyAtmosphere.saturationShift = -0.2;
  viewer.scene.fog.enabled = true; viewer.scene.highDynamicRange = false;
  viewer.clock.shouldAnimate = true; viewer.clock.multiplier = 60; // real-time UTC clock, advanced enough to animate the terminator visibly
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 300; viewer.scene.screenSpaceCameraController.maximumZoomDistance = 30_000_000;
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(0, 15, 22_000_000) });
  viewer.scene.postProcessStages.fxaa.enabled = true;

  addBaseImagery(viewer); addTerrainAndBuildings(viewer, cesiumIonToken);
  const gibsLayer = await addGibsImagery(viewer);
  function setImageryVisible(v) { if (gibsLayer) gibsLayer.show = v; }

  // Manual picking: bulk entity layers are raw primitive collections (for scale), not the Entity API, so Cesium's
  // built-in selection widget (disabled above anyway) would not see them. One handler covers every layer.
  viewer.screenSpaceEventHandler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    const id = picked?.id?.orionId ?? (typeof picked?.id === 'string' ? picked.id : null);
    bus.emit('globe:click', id || null);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  viewer.screenSpaceEventHandler.setInputAction(() => {}, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK); // don't fight our own flyTo

  // --- terminator overlay: an explicit day/night line + subsolar marker, independent of the globe's own ambient shading
  const terminatorPts = new Array(73).fill(0).map((_, i) => i);
  const terminatorEntity = viewer.entities.add({
    polyline: { positions: new Cesium.CallbackProperty(() => computeTerminator(viewer.clock.currentTime), false), width: 1.4, material: Cesium.Color.fromCssColorString('#7fd8e6').withAlpha(0.55), clampToGround: false, arcType: Cesium.ArcType.NONE },
  });
  const subsolarEntity = viewer.entities.add({
    position: new Cesium.CallbackProperty((time) => { const s = subsolarPoint(Cesium.JulianDate.toDate(time)); return Cesium.Cartesian3.fromDegrees(s.lon, s.lat); }, false),
    point: { pixelSize: 5, color: Cesium.Color.fromCssColorString('#ffd76a'), outlineColor: Cesium.Color.BLACK, outlineWidth: 1 },
    label: { text: '☉ subsolar', font: '10px sans-serif', pixelOffset: new Cesium.Cartesian2(10, 0), fillColor: Cesium.Color.fromCssColorString('#ffd76a'), showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('#05080bcc'), horizontalOrigin: Cesium.HorizontalOrigin.LEFT },
  });
  function computeTerminator(time) {
    const s = subsolarPoint(Cesium.JulianDate.toDate(time)), pts = [];
    for (let b = 0; b <= 360; b += 5) { const [lat, lon] = destination(s.lat, s.lon, b, 10007.5); pts.push(lon, lat); }
    return Cesium.Cartesian3.fromDegreesArray(pts);
  }
  function setTerminatorVisible(v) { terminatorEntity.show = v; subsolarEntity.show = v; }
  setTerminatorVisible(settings.terminator);

  function flyTo(lon, lat, heightM = 400_000) { viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, heightM), duration: 1.4 }); }
  function reset() { viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(0, 15, 22_000_000), duration: 1.2 }); }

  return { viewer, flyTo, reset, setTerminatorVisible, setImageryVisible, Cesium };
}
