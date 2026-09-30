# Benchmark

`GET /api/research/benchmark` (`server/research/benchmark.js`) is a **synthetic, seeded regression test** of
the fusion model in `shared/scoring.js` — a software-engineering check that the model behaves as designed, not
an empirical claim about real-world detection accuracy. Full methodology in `docs/METHODOLOGY.md §10`.

## What it generates

For each of several random seeds, a population of entities with a known **latent ground-truth priority**, each
observed through simulated noise, occasional duplicate/corroborating reports, and unrelated distractor events —
across five scenarios:

| Scenario | What it stresses |
|---|---|
| `nominal` | baseline conditions |
| `sparseCorroboration` | most reports never independently corroborated |
| `unreliableSources` | lower average Admiralty reliability |
| `highNoise` | severity/observation noise increased |
| `combinedStrain` | all of the above at once |

## What it reports, per scenario

- **AUROC** and **precision@20**, with bootstrap confidence intervals, for five rankers: `orion` (the real
  model), `severity`-only, `recency`-only, `impact`-only, and `additive` (same six factors, arithmetic instead
  of geometric mean).
- A **paired** ORION-vs-additive mean delta — the specific question of whether the geometric-mean design
  (`docs/METHODOLOGY.md §2`) earns its added complexity over the simpler arithmetic alternative.
- An **ablation**: rerunning ORION with each of reliability/credibility/freshness/corroboration individually
  zeroed out, to show that factor's marginal contribution to ranking quality.
- **Calibration**: a bucketed reliability curve and Expected Calibration Error (ECE) comparing each item's
  `pReal` (derived from Admiralty reliability × credibility) against its planted ground-truth probability.

## Reading the numbers

An AUROC around 0.5 is chance; ORION should sit well above every single-factor baseline in every scenario, and
its advantage over `additive` should be small in `nominal` but should widen as scenarios get harder (that's the
geometric mean's "punish the weakest link" property in `docs/METHODOLOGY.md §2` actually mattering, not just a
theoretical claim). Numbers are reproducible for a given seed set but are not comparable to any published,
real-world CTI benchmark, and should never be quoted outside that context.
