# 6-Minute Demo Script

## 00:00 — framing
"ORION fuses twelve live public data sources into one picture on a real globe, and every fused score is fully
explainable — six named factors, an Admiralty grade, a plain-English reason."

## 00:45 — the globe
Rotate the globe. Point out real day/night lighting and the explicit terminator line, live aircraft and
vessels, and satellites on real SGP4-propagated orbits. Toggle a layer off/on in the left dock.

## 01:30 — Detail panel
Click a high-priority alert (a KEV-listed vulnerability with confirmed ransomware use is usually near the top).
Open **Detail**: walk through the six factor bars, the Admiralty grade, the estimative-language probability,
and the plain-English narrative underneath. Click "Add to case."

## 02:30 — Detection & ATT&CK
Open **Detection**. Show the ATT&CK coverage matrix (real technique counts per tactic) and click "Evaluate
rules against live data" to run the Sigma-syntax engine live.

## 03:15 — Graph
Open **Graph**. Point out an earthquake linked to a media-attention cluster (spatial-temporal corroboration),
and a military aircraft linked to a nuclear plant (criticality proximity) — drag a node, mention this is a
hand-rolled force layout, no charting library.

## 04:00 — ACH workbench
Open **ACH**. Rate one piece of evidence against two hypotheses, hit Evaluate, and show that the model ranks by
*least inconsistency*, not by raw support — the Heuer method, not a popularity count.

## 04:45 — Recon (passive only)
Open **Recon**, look up a domain. Show RDAP, certificate-transparency subdomains, and DNS results. State
explicitly: public registries only, nothing is ever sent to the target.

## 05:20 — Research credibility
Open **Research**, run the benchmark live. Read the AUROC and calibration numbers off the screen and note
they're a seeded synthetic regression test of the model, not a field result.

## 05:50 — close
Open **Case**, export the JSON, and close with what a real deployment would still need: authentication, durable
storage, signed evidence, and a formal evaluation against real labelled data (`docs/THREAT_MODEL.md`,
`docs/SYSTEM_CARD.md`).
