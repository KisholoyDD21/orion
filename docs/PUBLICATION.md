# Public Presentation Brief

## Title

**ORION Intelligence Fabric: An Explainable, Live-Data Multi-Domain OSINT Fusion Workstation**

## Abstract

ORION fuses twelve live public data sources — aircraft, vessels, satellites, seismicity, natural hazards,
media attention, botnet infrastructure, and vulnerabilities — into one prioritized picture on a real 3D globe,
while keeping every fused score fully decomposed into six named, auditable factors with NATO Admiralty grading
and Intelligence-Community estimative language. It adds a from-scratch Sigma-syntax detection engine (its
parser differentially verified against the entire public SigmaHQ rule corpus), real STIX 2.1/TAXII 2.1 export,
an Analysis-of-Competing-Hypotheses workbench, and a synthetic benchmark reporting AUROC, calibration, and
ablations for its own scoring model. The central design decision throughout is to separate *observation* from
*assessment*: nothing is presented as a finding without showing the evidence and confidence behind it.

## What makes it interesting

1. **Real data, not a mockup.** Twelve live public sources with their own licenses, refresh cadences, and
   documented caveats — visible live in the Sources panel, not just claimed in a README.
2. **An auditable score, not a black box.** Six named factors, a geometric-mean design chosen specifically to
   punish weak evidence (explained and benchmarked, not just asserted), a sensitivity band, and estimative
   language on every single entity.
3. **Standards that are actually earned.** The Sigma YAML parser is validated against 3,144 real rules with
   zero divergence; ATT&CK tags are checked against the real, current technique list at load time; STIX objects
   use real SDO types wherever the schema genuinely maps, with everything else clearly labelled as an
   extension.
4. **Research reproducibility.** A deterministic, seeded synthetic benchmark with bootstrap CIs, a paired
   significance test, ablations, and calibration — shipped as a runnable endpoint, not a static claim in a doc.
5. **Honesty about limits.** No external AI calls anywhere (the "Briefing" panel says exactly what it is: a
   deterministic template); no claim of real-world detection efficacy; every synthetic entity is visibly
   marked as such.

## Suggested demo sequence

1. Open the globe. Point out real day/night terminator, real satellite ground tracks, live aircraft/vessels.
2. Click a KEV-listed, ransomware-flagged vulnerability alert; open **Detail** and walk through all six factors,
   the Admiralty grade, and the plain-English narrative.
3. Open **Detection** — show the real ATT&CK coverage matrix and run the rule engine live.
4. Open **Graph** — show corroboration and infrastructure-proximity links between unrelated sources.
5. Open **ACH** — rate a few hypotheses against evidence, show the least-inconsistency ranking.
6. Open **Recon**, look up a domain, show RDAP/crt.sh/DNS results — passive only, and say so.
7. Open **Research**, run the benchmark live, and read the AUROC/calibration numbers off the screen.
8. Export **STIX** from the Case panel; note what's a real SDO and what's a labelled extension.

## Recommended framing

> "This fuses real public data sources into one picture, and every fused score comes with the evidence and the
> confidence behind it — none of it is a black box."

> "The benchmark numbers are a seeded synthetic regression test of the model design, not a real-world detection
> claim — and the code says so in its own output."

Avoid presenting this as an operational SOC/CTI replacement, an autonomous attribution engine, or a source of
classified intelligence — see `docs/SYSTEM_CARD.md`.

## References

- MITRE ATT&CK — https://attack.mitre.org/
- SigmaHQ — https://github.com/SigmaHQ/sigma
- OASIS STIX 2.1 / TAXII 2.1 — https://docs.oasis-open.org/cti/
- CISA KEV — https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- R. J. Heuer Jr., *Psychology of Intelligence Analysis*, 1999
