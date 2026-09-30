// STIX 2.1 bundle export. Real STIX Domain Objects where ORION's schema maps cleanly (indicator, observed-data,
// vulnerability, malware, location, identity, relationship, sighting); everything else is exposed as a
// custom SCO/SDO name-spaced x-orion-* extension per the STIX 2.1 extension-definition convention, clearly
// marked as such. Deterministic UUIDv5-style ids (SHA-1 of a namespace + value) so re-exporting the same
// entity twice yields the same STIX id, which is what STIX expects for update semantics.
import crypto from 'node:crypto';
const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // STIX's own example namespace UUID, reused as our deterministic-id seed
const uuidFromHash = (hex) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
export function deterministicId(type, value) { const h = crypto.createHash('sha1').update(NS + String(value)).digest('hex'); return `${type}--${uuidFromHash(h)}`; }
const identity = (name, cls = 'system') => ({ type: 'identity', spec_version: '2.1', id: deterministicId('identity', name), name, identity_class: cls });

function objectsFor(e, created) {
  const out = [], src = identity(e.source), a = e.attrs || {};
  out.push(src);
  const obs = { type: 'observed-data', spec_version: '2.1', id: deterministicId('observed-data', e.id), created, modified: e.fusion?.fetchedAt || created, first_observed: e.firstSeenAt, last_observed: e.observedAt, number_observed: 1, created_by_ref: src.id, object_refs: [] };
  if (e.type === 'vuln') {
    const vuln = { type: 'vulnerability', spec_version: '2.1', id: deterministicId('vulnerability', a.cve || e.id), created, modified: created, name: a.cve || e.name, description: a.description || e.name, external_references: [{ source_name: a.kev ? 'CISA KEV' : 'NVD', external_id: a.cve, url: `https://nvd.nist.gov/vuln/detail/${a.cve}` }], x_orion: { kev: !!a.kev, cvss: a.cvss ?? null, ransomware: a.ransomware || null, priority: e.fusion?.priority ?? null } };
    out.push(vuln); obs.object_refs.push(vuln.id);
    if (a.malware || e.type === 'cyber') { /* no-op: separate branch below */ }
  } else if (e.type === 'cyber') {
    const ind = { type: 'indicator', spec_version: '2.1', id: deterministicId('indicator', `${a.ip}:${a.port}`), created, modified: created, name: e.name, indicator_types: ['malicious-activity'], pattern_type: 'stix', pattern: `[ipv4-addr:value = '${a.ip}' AND network-traffic:dst_port = ${a.port}]`, valid_from: e.firstSeenAt, confidence: Math.round((e.fusion?.confidence ?? 0.5) * 100), labels: [a.malware || 'c2'].filter(Boolean) };
    out.push(ind); obs.object_refs.push(ind.id);
    if (a.malware) { const mal = { type: 'malware', spec_version: '2.1', id: deterministicId('malware', a.malware), created, modified: created, name: a.malware, is_family: true, malware_types: ['unknown'] }; out.push(mal, { type: 'relationship', spec_version: '2.1', id: deterministicId('relationship', `${ind.id}|indicates|${mal.id}`), created, modified: created, relationship_type: 'indicates', source_ref: ind.id, target_ref: mal.id }); }
    if (e.lat !== null) { const loc = { type: 'location', spec_version: '2.1', id: deterministicId('location', `${e.lat.toFixed(2)},${e.lon.toFixed(2)}`), created, modified: created, latitude: e.lat, longitude: e.lon, precision: 50000, country: a.country || undefined, x_orion_precision: e.precision }; out.push(loc, { type: 'relationship', spec_version: '2.1', id: deterministicId('relationship', `${ind.id}|located-at|${loc.id}`), created, modified: created, relationship_type: 'located-at', source_ref: ind.id, target_ref: loc.id }); }
  } else {
    const x = { type: `x-orion-${e.type}`, spec_version: '2.1', id: deterministicId(`x-orion-${e.type}`, e.id), created, modified: created, name: e.name, x_orion_layer: e.layer, x_orion_subtype: e.subtype, x_orion_severity: e.severity, x_orion_priority: e.fusion?.priority ?? null, x_orion_band: e.fusion?.band ?? null, x_orion_synthetic: !!e.synthetic, x_orion_attrs: a };
    out.push(x); obs.object_refs.push(x.id);
    if (e.lat !== null) { const loc = { type: 'location', spec_version: '2.1', id: deterministicId('location', `${e.id}:loc`), created, modified: created, latitude: e.lat, longitude: e.lon, precision: e.precision === 'exact' ? 1000 : e.precision === 'approx' ? 50000 : 250000 }; out.push(loc, { type: 'relationship', spec_version: '2.1', id: deterministicId('relationship', `${x.id}|located-at|${loc.id}`), created, modified: created, relationship_type: 'located-at', source_ref: x.id, target_ref: loc.id }); }
  }
  if (obs.object_refs.length) out.push(obs);
  const sighting = { type: 'sighting', spec_version: '2.1', id: deterministicId('sighting', e.id), created, modified: e.observedAt, sighting_of_ref: out.find((o) => o.type !== 'identity' && o.type !== 'observed-data' && o.type !== 'location' && o.type !== 'relationship')?.id, observed_data_refs: obs.object_refs.length ? [obs.id] : [], where_sighted_refs: [src.id], count: 1, description: `Admiralty ${e.fusion?.admiralty || 'F6'}; ${e.fusion?.term || 'cannot be judged'}` };
  if (sighting.sighting_of_ref) out.push(sighting);
  return out;
}
export function buildBundle(entities, { limit = 200 } = {}) {
  const created = new Date().toISOString(), seen = new Map();
  for (const e of entities.slice(0, limit)) for (const o of objectsFor(e, created)) seen.set(o.id, o); // dedupe shared identities/locations
  return { type: 'bundle', id: deterministicId('bundle', created + Math.random()), objects: [...seen.values()] };
}
export const EXTENSION_NOTE = 'Objects typed x-orion-* are custom STIX 2.1 extensions (indicator, vulnerability, malware, location, identity, observed-data, relationship and sighting are standard SDOs/SCOs). Validate with a STIX 2.1 library before production interoperability use.';
