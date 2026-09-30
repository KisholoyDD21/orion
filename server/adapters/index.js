import * as usgs from './usgs.js';
import * as eonet from './eonet.js';
import * as adsb from './adsb.js';
import * as opensky from './opensky.js';
import * as digitraffic from './digitraffic.js';
import * as celestrak from './celestrak.js';
import * as gdelt from './gdelt.js';
import * as kev from './kev.js';
import * as nvd from './nvd.js';
import * as epss from './epss.js';
import * as feodo from './feodo.js';
import * as synthetic from './synthetic.js';
export const LIVE_ADAPTERS = [usgs, eonet, adsb, digitraffic, celestrak, gdelt, feodo, kev, nvd, epss, opensky];
export const ALL_ADAPTERS = [...LIVE_ADAPTERS, synthetic];
export { synthetic };
/** Adapters that should run for this configuration. Offline mode runs only the synthetic scenario. */
export function activeAdapters(config) {
  const list = LIVE_ADAPTERS.filter((a) => config.enabled(a.id, a.meta.defaultEnabled) || (a.id === 'opensky' && config.keys.openskyId && config.enabled(a.id, true)));
  if (config.syntheticEnabled) list.push(synthetic);
  return list;
}
export function catalog(config) {
  const active = new Set(activeAdapters(config).map((a) => a.id));
  return ALL_ADAPTERS.map((a) => ({ id: a.id, ...a.meta, refreshMs: typeof a.refreshMs === 'function' ? a.refreshMs(config) : a.meta.refreshMs, enabled: active.has(a.id), enrichment: !!a.enrichment }));
}
