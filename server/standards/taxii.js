// A read-only TAXII 2.1-shaped surface: discovery + one API root + collections whose objects are backed by the
// live entity store via standards/stix.js. This is enough to demonstrate the shape of a real TAXII server against
// a TAXII client; it is not a persistent, spec-complete TAXII implementation (no filtering by added_after, no
// pagination cursors, no write endpoints).
export function discovery(baseUrl) {
  return { title: 'ORION Intelligence Fabric (TAXII-shaped, read-only prototype)', description: 'Demonstration discovery document. See docs/METHODOLOGY.md for scope and limitations.', default: `${baseUrl}/api/taxii/`, api_roots: [`${baseUrl}/api/taxii/`] };
}
export function apiRootInfo() { return { title: 'ORION collections', description: 'One collection per ORION layer', versions: ['application/taxii+json;version=2.1'], max_content_length: 25_000_000 }; }
export function collectionsFor(layers) {
  return { collections: layers.map((l) => ({ id: `col-${l.id}`, title: `ORION ${l.id}`, description: `Live ${l.id} entities as STIX 2.1 (see /api/stix/export?layer=${l.id})`, can_read: true, can_write: false, media_types: ['application/stix+json;version=2.1'] })) };
}
