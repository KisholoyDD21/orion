# Changelog

## 2.0.0 — Research Edition rebuild

A ground-up rebuild. The v1.5 single-file server and canvas-drawn globe are replaced entirely; nothing from
v1.5's runtime code is reused, though its research framing and documentation tone carry forward.

### Added
- Twelve live public data adapters (USGS, NASA EONET, airplanes.live/adsb.lol/adsb.one, OpenSky, Digitraffic
  Marine AIS, CelesTrak, GDELT, abuse.ch Feodo Tracker, CISA KEV, NIST NVD, FIRST EPSS) plus a deterministic
  synthetic scenario for offline/demo/CI use — each with its own license, caveats, and health telemetry.
- A real CesiumJS 3D globe: NASA GIBS true-colour imagery, real day/night lighting plus an explicit
  `shared/sun.js`-driven terminator overlay, real SGP4 satellite propagation and ground tracks
  (`shared/orbit.js`, reused byte-for-byte on server and client), a hand-rolled force-directed analysis graph,
  and canvas-drawn, colour-vision-deficiency-safe entity glyphs (shape = layer, ring = priority band).
- A rewritten fusion engine (`orion-score/2.0`): six explicit factors, geometric-mean quality score, Admiralty
  NATO STANAG 2511 grading, ICD 203 estimative language, spatial-temporal corroboration rules, a Monte-Carlo
  sensitivity band per entity, and full per-factor explainability. Full derivation in `docs/METHODOLOGY.md`.
- A from-scratch Sigma-syntax detection engine and YAML reader (differentially verified against PyYAML on all
  3,144 public SigmaHQ rules), 14 ORION-authored rules cross-checked against the real MITRE ATT&CK Enterprise
  dataset (697 techniques, replacing v1.5's static 8-technique list).
- Real STIX 2.1 SDOs (indicator, vulnerability, malware, location, sighting, relationship) and a TAXII
  2.1-shaped read-only discovery/collections surface, replacing v1.5's generic `x-orion-entity` bundle.
- An ACH (Analysis of Competing Hypotheses) workbench, a live analysis graph (PageRank, communities, shortest
  path), a case builder, and a passive-only recon panel (RDAP, crt.sh, DoH, Shodan InternetDB), all backed by
  new, SSRF-safe server modules (`server/lib/validate.js`'s `isPublicIP`/`normalizeDomain`).
- A real synthetic benchmark (`server/research/benchmark.js`): five stress scenarios, five rankers, AUROC,
  precision@20, bootstrap CIs, a paired significance test, ablations, and calibration (ECE) — replacing v1.5's
  fixed-metric benchmark stub.
- A complete UI rebuild: a purpose-built "intelligence workstation" layout (no template/dashboard-kit look),
  11 panels (Alerts, Detail, Timeline, Graph, Sources, ACH, Detection/ATT&CK, Briefing, Recon, Case, Research),
  live via one Server-Sent-Events stream.
- `docs/METHODOLOGY.md` (new), `.vscode/` launch/task/extension configs, a repo-wide syntax-check script, and a
  smoke test rewritten to exercise the full new API surface end to end.
- Server hardening: strict CSP, SSRF-safe IP/domain validation, path-traversal-safe static serving, per-host
  outbound rate limiting (politeness to free public APIs), per-client inbound rate limiting, and a source-health
  ledger with automatic exponential backoff on failure.

### Changed
- Renamed the old `/api/ai/analyze` and `/api/ai/briefing` endpoints to `GET /api/briefing`: it was always a
  deterministic template, not a language-model call, and now says so explicitly in its own response
  (`method: "deterministic-template"`) instead of being filed under "ai".
- `/api/recon/passive` now takes `{ target }` (auto-classified as domain/IP) rather than `{ kind, indicator }`.

### Known gaps carried into this release
See `docs/SYSTEM_CARD.md` for the full list — no durable database, no auth/RBAC, no signed evidence, provider
APIs can change or rate-limit without notice, fusion weights are hand-chosen rather than fit to labelled data.

## 1.5.0 — Research Edition

- Rebuilt command surface around a common operating picture
- Added provenance-aware observation schema
- Added freshness / source reliability / corroboration fusion score
- Added source catalog and health telemetry
- Added passive recon provider adapters
- Added relationship graph and traceable case workflow
- Added ATT&CK coverage matrix and Sigma-inspired rule lab
- Added NVD / CISA KEV endpoints
- Added STIX 2.1-style export and TAXII-shaped discovery metadata
- Added synthetic benchmark and research methodology docs
- Added local analyst brief and AI caveats
- Added public demo script and publication brief
- Added stronger mobile/responsive console styling
