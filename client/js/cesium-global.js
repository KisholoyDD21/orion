// node_modules/cesium/Build/Cesium/Cesium.js is CesiumJS's bundled UMD distributable (a global-variable script,
// the form Cesium's own docs recommend for non-bundler setups) — not a native ES module: it has no top-level
// `export` statements, only bundled third-party CommonJS wrappers inside it. index.html loads it as a classic
// <script> (before this module graph runs), which sets window.Cesium; this file just re-exports that global so
// the rest of the client can `import Cesium from './cesium-global.js'` like any other module dependency.
const Cesium = window.Cesium;
if (!Cesium) throw new Error('window.Cesium is missing — /vendor/cesium/Cesium.js must load via a classic <script> tag before any module that needs it.');
export default Cesium;
