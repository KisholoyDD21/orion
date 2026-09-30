# Threat Model

## Assets

- Analyst state built during a session: case entities, ACH workbooks, saved priorities
- Provenance/evidence fields on every entity (source, timestamp, confidence)
- Outbound API credentials, if configured (`NVD_API_KEY`, `OPENSKY_CLIENT_ID/SECRET`, `CESIUM_ION_TOKEN`)
- Source availability, freshness, and the integrity of the fusion score derived from them

## Trust boundaries

1. Browser ↔ ORION's own HTTP API (same-origin only; CORS is not opened to other origins)
2. ORION server ↔ 12 public data providers (untrusted network responses)
3. ORION server ↔ user-supplied recon targets (`POST /api/recon/passive`, `GET /api/cve/:id`)
4. Analyst-entered ACH/case content ↔ what gets exported (STIX bundle, case JSON)

## Threats considered and how they're addressed

| Threat | Mitigation | Where |
|---|---|---|
| SSRF via a recon target that's actually an internal address | `isPublicIPv4`/`isPublicIPv6` reject loopback/private/link-local/CGNAT/documentation ranges; the user's target is always a *query value* on a fixed trusted host, never a URL host | `server/lib/validate.js`, `server/recon/passive.js` |
| Path traversal via crafted static-asset URLs | Decode-then-resolve-then-verify-containment on every static request; dotfiles denied | `server/lib/static.js` |
| Malicious/oversized upstream responses | Size-capped streaming reads, timeouts, retry-with-backoff only on 5xx/timeout | `server/lib/http.js` |
| A single misbehaving/looping client | Per-client fixed-window rate limiting (stricter for recon), capped SSE client count | `server/lib/ratelimit.js`, `server/lib/sse.js` |
| XSS via untrusted feed content rendered in the UI (GDELT snippets, vessel names, etc.) | Every panel escapes text via `escapeHtml()` before interpolation; a strict CSP is the backstop | `client/js/format.js`, `server/app.js` |
| CSRF-style cross-origin writes | Non-GET requests reject an `Origin` header that doesn't match `Host` | `server/app.js` |
| Upstream feed poisoning, staleness, or an outright outage | Source-health ledger tracks state per source; freshness decays the fusion score automatically; stale-if-error disk cache for a few adapters | `server/lib/ledger.js`, `server/core/scheduler.js`, `shared/scoring.js` |
| Over-trusting a single fused number | Priority is always shown with its six named factors, an Admiralty grade, and estimative-language probability — never as a bare number | `server/core/explain.js`, client Detail panel |
| Active scanning of a target | Never implemented anywhere in this codebase — recon is passive-only by construction (public registries/databases), not a design promise layered on top of a scanner | `server/recon/passive.js` |

## Explicitly out of scope for this prototype

Authentication/authorization, encryption at rest, signed/tamper-evident evidence, a real persistent TAXII
server, multi-tenant isolation, and secrets management beyond "read from environment variables." None of
these are simulated or faked — they are simply absent, and nothing in the UI implies otherwise.

## If you deployed this for real

You would need, at minimum: TLS termination and auth in front of it, a secrets manager rather than `.env`,
durable storage in place of the in-memory store, egress allowlisting for the outbound adapters, and a security
review of every third-party dependency (`cesium`, `satellite.js`) and every live data source's own terms of use.
