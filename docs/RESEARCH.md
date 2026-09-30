# Research Basis & Methodology

## Research question

Can a lightweight, single-operator workstation fuse heterogeneous live public sources into one prioritized,
explainable picture — preserving provenance and calibrated confidence — without a durable backend or a paid
API?

## Design principles

### 1. Entity-centred fusion
Every source is normalized to one canonical entity shape (`server/core/entity.js`) before anything else touches
it. A raw observation is not automatically treated as a finding.

### 2. Provenance-first
Every entity keeps its source, observation time, and fetch time. ORION separates *observation* (what a source
reported) from *assessment* (the fused priority/confidence) — the two are never collapsed into one number
without the breakdown remaining one click away (`GET /api/entity/:id`).

### 3. Confidence is not truth
The fusion score (`docs/METHODOLOGY.md`) combines source reliability, report credibility, freshness,
independent corroboration, severity, and criticality. It is an analytic-prioritization aid, not proof of intent
— every score ships with Intelligence-Community estimative language (ICD 203) and a sensitivity band, not a
bare percentage.

### 4. Standards-oriented interoperability
STIX 2.1, TAXII 2.1, MITRE ATT&CK, and Sigma are used where they genuinely fit the data (real SDOs, real
technique IDs, a real differentially-tested YAML reader) — and clearly labelled as extensions or prototypes
where they don't, rather than gesturing at standards compliance without earning it.

### 5. Passive-first investigation
The recon panel enriches from public registries and databases only. No code path in this repository sends a
probe, request, or packet to the thing being investigated.

## Evaluation plan

A rigorous evaluation of a system like this would measure:

1. **Coverage** — fraction of relevant real-world events actually surfaced by the twelve live sources.
2. **Freshness** — median entity age at the moment it crosses the alert threshold.
3. **Provenance completeness** — fraction of entities with a complete source/time/confidence chain (currently:
   all of them, by construction of `makeEntity()`).
4. **Ranking quality** — AUROC / precision@k against real, labelled ground truth (currently only measured
   against *synthetic* ground truth — see `docs/BENCHMARKS.md`).
5. **Resilience** — behaviour under real source failure, rate-limiting, and partial timeouts (`server/lib/ledger.js`
   tracks this live; it has not been evaluated under adversarial conditions).
6. **Calibration** — agreement between stated confidence and real-world correctness (currently measured only
   against synthetic ground truth; see limitation below).
7. **Analyst efficiency** — task completion and context-switching in a controlled user study (not run).

## What's actually been measured vs. what would need a real study

Implemented and measured: parser correctness against real external data (the Sigma YAML reader against all
3,144 SigmaHQ rules; reference-data spatial lookups spot-checked against known real coordinates), and the
synthetic benchmark's AUROC/calibration/ablations (`docs/BENCHMARKS.md`). **Not** implemented: any evaluation
against real-world labelled ground truth, and no formal human-subject study of analyst efficiency. Both would
be required before any claim of operational validity.

## Limitations

- Public sources are heterogeneous, rate-limited, and can change shape or disappear without notice.
- The synthetic scenario (offline mode) is clearly marked `synthetic: true` throughout and never presented as
  live data.
- The briefing generator is a deterministic template (`method: "deterministic-template"`), not a language model
  — ORION makes no external AI API calls anywhere.
- No formal human-subject experiment has been run.
- No claim is made that this is operationally equivalent to a licensed enterprise CTI platform.

## Reference standards and projects

- OASIS STIX 2.1 — https://docs.oasis-open.org/cti/stix/v2.1/stix-v2.1.html
- OASIS TAXII 2.1 — https://docs.oasis-open.org/cti/taxii/v2.1/taxii-v2.1.html
- MITRE ATT&CK — https://attack.mitre.org/
- SigmaHQ — https://github.com/SigmaHQ/sigma
- ICD 203 (Analytic Standards) — https://www.dni.gov/files/documents/ICD/ICD%20203%20Analytic%20Standards.pdf
- NATO STANAG 2511 / Admiralty System — source reliability & information credibility grading
- R. J. Heuer Jr., *Psychology of Intelligence Analysis*, CIA Center for the Study of Intelligence, 1999
- CISA KEV — https://www.cisa.gov/known-exploited-vulnerabilities-catalog
