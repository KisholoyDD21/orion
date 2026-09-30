# Architecture

```text
              LIVE PUBLIC SOURCES (12) + synthetic scenario
  USGS  EONET  ADS-B  OpenSky  Digitraffic  CelesTrak  GDELT  Feodo  KEV  NVD  EPSS
        \      |       |         |            |         |      |    |    |   /
         +-----+---+---+----+----+-----+------+----+-----+-----+----+---+
                             server/adapters/*.js
                    (each: meta, parse() pure+testable, run(ctx))
                                    |
                          server/core/entity.js
                        (one canonical shape for everything)
                                    |
                          server/core/store.js
                (in-memory, per-source replace, versioned per layer, position history)
                                    |
                +-------------------+--------------------+
                |                                         |
        server/core/fusion.js                    server/core/reference.js
   (6-factor score, corroboration,                 (Natural Earth / OurAirports /
    Admiralty grade, docs/METHODOLOGY.md)           WRI power plants, spatial index)
                |
        server/core/alerts.js  ── ranked, deduplicated, human-readable "why"
                |
  +---------+---+----+------------+-----------+-------------+
  |         |        |            |           |             |
detection  standards  routes/*.js (~40 REST endpoints)   lib/sse.js
(Sigma-    (STIX/TAXII)                                  (live push:
syntax                                                    layer/alert/
engine)                                                   fused/source)
                |
        client/js/  (Cesium globe + 11 panels, vanilla ES modules)
```

## Canonical entity

Every adapter's output, after `makeEntity()` (`server/core/entity.js`):

```json
{
  "id": "usgs:us7000abcd", "type": "seismic", "layer": "seismic", "source": "usgs",
  "name": "M5.9 - 32km SSE of Fukushima, Japan", "lat": 37.35, "lon": 141.4, "altM": -10000,
  "observedAt": "2026-09-24T04:10:00Z", "fetchedAt": "2026-09-24T04:12:03Z",
  "synthetic": false, "precision": "exact", "rel": "A", "credHint": 2,
  "severity": 0.61, "attrs": { "mag": 5.9, "tsunami": false, "status": "reviewed" },
  "refs": [{ "label": "USGS event page", "url": "https://..." }], "tags": [],
  "fusion": { "priority": 47.2, "band": "high", "admiralty": "A2", "term": "highly likely", "...": "…" }
}
```

`fusion` is attached in place by the fusion engine on every re-score pass; it is the only field on an entity
that mutates after ingestion.

## Module map

| Path | Responsibility |
|---|---|
| `shared/` | Pure, dependency-free functions used **identically** on server and browser: `scoring.js`, `admiralty.js`, `estimative.js`, `geo.js`, `sun.js`, `orbit.js`, `graph.js`, `ach.js`, `stats.js`, `prng.js`, `taxonomy.js`. Unit-tested in `test/shared.test.js`. |
| `server/lib/` | Infrastructure with no domain logic: config, logging, outbound HTTP client (timeouts/retry/size-caps), per-host politeness + per-client rate limiting, TTL/disk cache, SSRF-safe validation, the static file server, SSE hub, source-health ledger, a tiny router. |
| `server/core/` | `entity.js` (normalization), `store.js` (in-memory state), `fusion.js` (scoring), `alerts.js`, `reference.js` (static geo/infra data + spatial index), `scheduler.js` (per-adapter cadence + backoff), `explain.js` (turns a fusion result into prose), `graph-build.js`. |
| `server/adapters/` | One file per data source; see the table in `README.md`. |
| `server/detection/` | The Sigma-syntax YAML reader and condition-grammar engine (`docs/METHODOLOGY.md §7`). |
| `server/standards/` | STIX 2.1 bundle builder, TAXII 2.1-shaped discovery/collections. |
| `server/recon/` | On-demand passive lookups (RDAP, crt.sh, DoH, Shodan InternetDB) — never contacts the target directly. |
| `server/routes/` | REST handlers, grouped by topic; wired once in `server/app.js`. |
| `data/reference/` | Built once by `scripts/build-reference-data.mjs` from public sources; see `MANIFEST.json` for provenance/licenses. |
| `data/rules/` | ORION-authored Sigma-syntax detection rules. |
| `client/js/` | `globe.js` (Cesium bootstrap), `layers.js` (bulk entity rendering), `track.js` (selection overlays), `panels/*.js` (11 independent UI panels), `main.js` (wiring). No framework, no bundler — plain ES modules served as-is. |

## Data flow at runtime

1. `server/core/scheduler.js` runs each adapter on its own cadence (with jitter and exponential backoff on
   failure), replacing that source's slice of the store.
2. Any store change schedules a debounced fusion pass (`fusion.schedule()`), which re-scores every entity and
   recomputes corroboration.
3. Fusion completion feeds the alert centre and broadcasts `layer` / `fused` / `alert` events over one SSE
   connection (`GET /api/stream`).
4. The client holds no separate data store: it renders directly from `GET /api/layer/:id` responses and
   re-fetches only the layers an SSE event says changed.

## Production evolution (not implemented here — see docs/THREAT_MODEL.md)

A durable database and message bus, authentication/RBAC, signed evidence and immutable audit logs, a real
(write-capable, persistent) TAXII server, secrets management, and a formally evaluated (not synthetic-only)
scoring model.
