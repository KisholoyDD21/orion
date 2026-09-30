// Shared vocabulary: entity types, map layers, priority bands. Colours are chosen for colour-vision-deficiency safety
// (Okabe & Ito 2008 hue set, lightened for a dark basemap) and every layer also has a distinct glyph shape, so colour is never the only channel.
export const LAYERS = Object.freeze({
  air:      { label: 'Aircraft',            type: 'air',      color: '#5FC4FF', glyph: 'chevron', order: 1 },
  maritime: { label: 'Vessels (AIS)',       type: 'maritime', color: '#2FD3A0', glyph: 'diamond', order: 2 },
  space:    { label: 'Satellites',          type: 'space',    color: '#B79CFF', glyph: 'cross',   order: 3 },
  seismic:  { label: 'Earthquakes',         type: 'seismic',  color: '#FF7A3D', glyph: 'ring',    order: 4 },
  hazard:   { label: 'Natural hazards',     type: 'hazard',   color: '#FFC247', glyph: 'hex',     order: 5 },
  media:    { label: 'Media attention',     type: 'media',    color: '#F3E96B', glyph: 'square',  order: 6 },
  cyber:    { label: 'Botnet C2 (country)', type: 'cyber',    color: '#FF5FA8', glyph: 'octagon', order: 7 },
  vuln:     { label: 'Vulnerabilities',     type: 'vuln',     color: '#FF9DB8', glyph: 'square',  order: 8, noGeo: true },
  recon:    { label: 'Recon results',       type: 'recon',    color: '#8FE3FF', glyph: 'target',  order: 9 },
});
export const TYPES = Object.freeze(Object.fromEntries(Object.entries(LAYERS).map(([k, v]) => [k, { label: v.label, color: v.color, glyph: v.glyph }])));
export const BANDS = Object.freeze([
  { id: 'critical', min: 60, label: 'Critical' }, { id: 'high', min: 40, label: 'High' },
  { id: 'elevated', min: 25, label: 'Elevated' }, { id: 'routine', min: 0, label: 'Routine' },
]);
export const bandOf = (priority) => (BANDS.find((b) => priority >= b.min) || BANDS.at(-1)).id;
export const AIS_NAV_STATUS = ['Under way (engine)', 'At anchor', 'Not under command', 'Restricted manoeuvrability', 'Constrained by draught', 'Moored', 'Aground', 'Fishing', 'Under way (sailing)', 'Reserved', 'Reserved', 'Towing astern', 'Pushing / towing alongside', 'Reserved', 'AIS-SART / MOB / EPIRB active', 'Undefined'];
export function shipTypeLabel(code) {
  const c = Number(code); if (!Number.isFinite(c)) return 'Unknown';
  const t = { 30: 'Fishing', 31: 'Towing', 32: 'Towing (large)', 33: 'Dredging', 34: 'Diving ops', 35: 'Military ops', 36: 'Sailing', 37: 'Pleasure craft', 50: 'Pilot', 51: 'Search & rescue', 52: 'Tug', 53: 'Port tender', 54: 'Anti-pollution', 55: 'Law enforcement', 58: 'Medical', 59: 'Non-combatant' };
  if (t[c]) return t[c];
  const d = Math.floor(c / 10);
  return { 2: 'Wing-in-ground', 4: 'High-speed craft', 6: 'Passenger', 7: 'Cargo', 8: 'Tanker', 9: 'Other' }[d] || 'Unknown';
}
export const SQUAWK_MEANING = Object.freeze({ '7500': 'Unlawful interference (hijack code)', '7600': 'Radio failure', '7700': 'General emergency' });
