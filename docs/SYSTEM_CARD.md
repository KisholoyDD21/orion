# ORION System Card

## Intended use

Portfolio/research demonstration of OSINT data fusion, spatial visualization, explainable scoring, and
standards-oriented (STIX/TAXII/ATT&CK/Sigma) CTI tooling. Learning and prototyping only.

## Not intended for

Operational intelligence decisions, covert surveillance of individuals, unauthorized reconnaissance,
autonomous attribution, or any use that violates a data source's own terms (see `README.md`'s source table and
`data/reference/MANIFEST.json`).

## Data

Twelve live public sources plus a deterministic synthetic scenario (see `README.md`). Every entity carries
`synthetic: true/false`; the UI marks synthetic entities visibly (dashed badge, dimmed glyph) rather than mixing
them indistinguishably with live data. When a live source is unreachable, its previous data simply ages (and
its fusion `freshness` factor decays accordingly) — nothing is silently replaced with fabricated data to make
the map look populated.

## Analytic engine

Fully deterministic and inspectable: a weighted combination of six named factors (`docs/METHODOLOGY.md`), a
Sigma-syntax rule engine, and a template-based briefing generator explicitly labelled
`"method": "deterministic-template"` and `"modelUsed": null` in its own API response — **ORION calls no
external AI/LLM API anywhere in this codebase.** Nothing here should be described as "AI-powered" without that
qualification.

## Risk score ("priority")

A prioritization heuristic — impact (severity × criticality) times evidence quality (source reliability ×
credibility × freshness × corroboration, combined geometrically). It is not a probability of attack, not a
finding, and not proof of malicious intent; every entity's `fusion.term` states the calibrated confidence in
Intelligence-Community estimative language (ICD 203) alongside the number, and `fusion.sensitivity` shows how
much the ranking would move under different (still plausible) factor weights.

## Known limitations

- No durable database — an in-memory store, reset on restart.
- No authentication, RBAC, or multi-user isolation.
- No signed or tamper-evident evidence chain.
- No production-grade (persistent, write-capable) TAXII server — the TAXII surface is read-only and demonstrative.
- No formal STIX 2.1 conformance validation of the exported bundle (validate against a real STIX library before
  any interoperability use).
- Fusion weights are hand-chosen, not fit to a labelled real-world dataset — see the benchmark ablations and
  sensitivity band for how much this matters to a given ranking (`docs/METHODOLOGY.md §2, §10`).
- Free public source APIs can change shape, rate-limit, or disappear without notice; each adapter's `meta.caveats`
  documents source-specific known issues.
- Corroboration is spatial-temporal-heuristic, not causal inference.

## Evaluation

`GET /api/research/benchmark` is a deterministic synthetic regression test of the scoring model (AUROC,
calibration, ablations across five stress scenarios) — a software-engineering check that the model behaves as
designed, not an empirical claim about real-world detection performance. See `docs/BENCHMARKS.md`.
