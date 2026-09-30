# Methodology

This is the technical reference for what `shared/` and `server/core/` actually compute. Everything below is
implemented and unit-tested (`test/`) or exercised end to end by `scripts/smoke-test.mjs`; nothing here describes
a future feature. Where a term is a term of art (Admiralty grading, ICD 203, ACH), the source is cited.

## 1. Canonical entity model

Every adapter (`server/adapters/*.js`) parses its source's native format and calls `makeEntity()`
(`server/core/entity.js`), which is the *only* path into the store. It validates required fields, clamps
severity/criticality to `[0,1]`, trims and caps string/array sizes, and stamps a `credHint` (an Admiralty
credibility ceiling the source can plausibly support — e.g. a raw C2 IP list can't claim "confirmed by multiple
independent sources" on its own). This is what makes 12 unrelated sources produce one consistent shape.

## 2. The six-factor score

`shared/scoring.js` combines six factors, each normalized to `[0,1]`:

| Factor | Meaning | Computed by |
|---|---|---|
| **S** severity | how bad this particular observation looks, in its own domain's terms (magnitude, CVSS, squawk code, AIS nav status, mention count…) | each adapter's `parse()` |
| **Y** criticality | how much it would matter if true — proximity to a nuclear plant or major airport, population density, EPSS/KEV for vulnerabilities | `server/core/fusion.js`, using `server/core/reference.js` |
| **R** reliability | how trustworthy the *source* is, independent of this one report (Admiralty A–F) | `shared/admiralty.js` |
| **C** credibility | how trustworthy *this report* is, given corroboration and internal consistency (Admiralty 1–6) | `shared/admiralty.js` |
| **F** freshness | exponential decay from observation time, half-life chosen per entity type (aircraft: 2 min; vulnerabilities: 30 days; a nuclear plant's existence: ~1 year) | `freshness()`, `HALF_LIFE_S` |
| **K** corroboration | probability at least one independent source agrees, combined via noisy-OR | `noisyOr()` over `CORROBORATION_RULES` matches |

Two outputs, kept deliberately separate:

```
impact     = (wS·S + wY·Y) / (wS+wY)                                   — weighted arithmetic mean, default 0.7/0.3
quality    = exp( (a·ln R + b·ln C + c·ln F + d·ln(0.5+0.5K)) / (a+b+c+d) )   — weighted GEOMETRIC mean, default .30/.30/.25/.15
priority   = round(100 · impact · quality, 1 dp)
confidence = quality
```

`impact` and `confidence` are reported *separately* — a severe, poorly-evidenced report and a mild,
well-evidenced one are not the same thing, and collapsing them into one number would hide exactly the
distinction an analyst needs. `quality` is a **geometric**, not arithmetic, mean deliberately: it punishes a
single very weak factor much harder than an average would (a stale report from an unreliable source should not
be rescued by strong corroboration alone), which matches how working analysts actually discount evidence.
Corroboration `K` is folded in as `0.5+0.5K` rather than `K` directly so that zero corroboration (very common —
most reports are never independently seen twice) doesn't collapse quality to its floor; it costs half the
term's weight, not all of it.

`sensitivity()` runs a seeded 200-sample Monte Carlo perturbation of the weights (±25%) and reports the p05/p50/p95
band a given item's priority would take under plausible alternative weightings — exposed per-entity as
`fusion.sensitivity` via `GET /api/entity/:id`, so "how much does this ranking depend on my chosen weights"
is an answerable, inspectable question rather than a hidden assumption.

## 3. Admiralty grading (NATO STANAG 2511 / FM 2-22.3)

`shared/admiralty.js` implements the standard 6×6 reliability (A–F) × credibility (1–6) matrix used across
NATO and most Western intelligence services, converting each grade to a probability via a monotone table
(`RELIABILITY`, `CREDIBILITY`) rather than treating the letters/numbers as already-numeric. `credibilityFrom()`
derives a credibility grade from how many independent sources agree and whether anything contradicts.

## 4. Estimative language (ICD 203)

`shared/estimative.js` maps a combined probability to the standard US Intelligence Community wording
("almost certainly", "roughly even chance", "remote"…) per Intelligence Community Directive 203, so a number
is never presented without the calibrated word an analyst would actually write.

## 5. Criticality enrichment

`server/core/reference.js` builds spatial indexes (`shared/geo.js`'s `GeoIndex`, a uniform-grid nearest-neighbour
structure) over Natural Earth countries/places, OurAirports, and the WRI Global Power Plant Database. For any
event location, `context(lat, lon)` returns the nearest large airport, nuclear plant, populated place and the
containing country, each with distance — this is what lets a rule say "near a nuclear plant" instead of every
event getting a flat criticality score. Vulnerabilities use EPSS probability and CISA KEV status instead of
geography, since a CVE has no location.

## 6. Corroboration

`CORROBORATION_RULES` in `fusion.js` link entities of *different types from different sources* that agree in
space and time (e.g. an earthquake within 150 km / 72 h of a hazard-category EONET event; a hazard-themed GDELT
media cluster within 200 km / 72 h of either). A second, type-agnostic rule links any two entities carrying the
same normalized indicator key (same CVE, same IP) regardless of source. Corroborators feed `K` via `noisyOr`
over their Admiralty reliabilities, and every corroboration also becomes a graph edge (§8).

## 7. Detection engine (Sigma-syntax, ORION schema)

`server/detection/engine.js` is a from-scratch Sigma-syntax condition compiler: named `detection` selections
(field/value maps, `|contains` `|startswith` `|endswith` `|re`, plus ORION's own numeric `|gte` `|lte` `|gt` `|lt`
extension — base Sigma has no range modifier) combined by a `condition` string supporting `and` / `or` / `not`
/ parentheses / `1 of` / `all of`. The YAML reader it depends on (`server/detection/yaml.js`) was differentially
tested against Python's PyYAML across all 3,144 rules in the public SigmaHQ rule repository (`sigmahq/sigma`),
byte-for-byte, with zero divergences — so the *parser* is genuinely Sigma-compatible. The 14 rules that ship in
`data/rules/` are **ORION-authored**, against ORION's own entity fields, not against Windows/EDR log fields —
real SigmaHQ community rules will parse cleanly here but will not usefully match this data, and nothing in this
project claims otherwise. Rules that tag `attack.tXXXX` are checked at load time against the real, current
MITRE ATT&CK Enterprise dataset in `data/attack/`; an unrecognized technique ID is surfaced, not silently
accepted.

## 8. Graph analytics

`shared/graph.js` is a small, dependency-free graph (adjacency-list, undirected-weighted) with Dijkstra shortest
path, power-iteration PageRank, and connected-components-based community detection. `server/core/graph-build.js`
builds it from the current store: entities as nodes; edges from fusion links (corroboration, "near" a plant or
airport, "located in" a country), plus indicator-derived edges (shared ASN, malware family, CVE vendor/CWE).

## 9. Analysis of Competing Hypotheses (Heuer)

`shared/ach.js` implements Richards Heuer's ACH method (*Psychology of Intelligence Analysis*, CIA CSI, 1999):
score each piece of evidence against each hypothesis on a Consistent/Inconsistent scale, then rank hypotheses
by **least total inconsistency** — deliberately not by how much evidence "supports" them, since evidence
consistent with everything is diagnostically worthless. `computeACH()` also reports each hypothesis pair's
margin and which evidence is "fragile" (removing it would flip the leader), so the ranking's robustness is
visible, not just the ranking itself.

## 10. Benchmark methodology

`GET /api/research/benchmark` (`server/research/benchmark.js`) generates seeded synthetic ground truth —
entities with a known latent "true" priority plus noise, duplicate/corroborating records, and distractors —
across five scenarios (nominal, sparse corroboration, unreliable sources, high noise, and a *combined* strain).
It ranks the same items with five rankers (`orion`, `severity`-only, `recency`-only, `impact`-only,
`additive` — the same six factors, but combined by arithmetic rather than geometric mean) and reports **AUROC**
and **precision@20** per ranker per scenario with bootstrap confidence intervals, a paired ORION-vs-additive
delta (to isolate whether the geometric-mean design in §2 actually earns its complexity), an **ablation** that
zeroes each of R/C/F/K in turn to show its marginal contribution, and **calibration** (bucketed reliability
curve + Expected Calibration Error) comparing each item's `pReal` against its planted ground truth. All of this
is synthetic self-evaluation, not a claim of real-world accuracy — see the caveats in `docs/RESEARCH.md`.

## 11. Known limitations

- Fusion weights (`DEFAULT_WEIGHTS`) are hand-chosen, not fit to labelled data — there is no labelled real-world
  ground truth to fit them to. The sensitivity band (§2) and the benchmark ablations (§10) are offered so the
  choice is at least auditable.
- Corroboration rules are spatial-temporal heuristics with fixed radii/windows; they will miss slower-moving or
  more distant genuine correlations and will occasionally link unrelated coincidences.
- The detection engine's condition grammar covers the common core of Sigma, not every construct in the spec
  (e.g. Sigma's newer top-level `correlation:` block for cross-event rules is not implemented — ORION's
  cross-source linking lives in the fusion engine's `CORROBORATION_RULES` instead, a different mechanism).
- `credHint` and severity heuristics per source (§1) are judgment calls documented inline in each adapter, not
  derived from a labelled dataset.
