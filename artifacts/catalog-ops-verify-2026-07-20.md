# WS-R2 — Production catalog verify (2026-07-20)

**URL:** https://www.glovecubs.com/store  
**Method:** Read-only browser inventory (no admin mutations)  
**Code tip with filters:** `0f73f3b` on `remediate/quote-first-pilot` — **not yet deployed to production**

## Result: FAIL — operator unpublish still required

| Check | Expected for Gate 1 | Observed on production |
|-------|---------------------|------------------------|
| Zero `GLV-LAUNCH*` on cards | Yes | **FAIL** — multiple cards (e.g. `GLV-LAUNCH-JVOLXUM`, `JVOB2RXL`, `JVO0Q8XS`, `JVNQV9XL`, `JVN6E2M`, `JVNGAGXL`) |
| Zero `SKU · UNKNOWN` | Yes | **FAIL** — PE embossed grip S shows `SKU · UNKNOWN` (parent `GLV-LAUNCH-JVMLXY`) |
| Empty industry facets hidden | Yes (after tip deploy) | **FAIL** — industries with count `0` still listed (e.g. Veterinary 0, Home Use 0) |
| Listing count | Thin OK if clean | 9 listings; ~7 launch/demo SKUs still visible |
| Credible samples | ≥5 clean SKUs | Only partial: orange Safety Zone + ProWorks look cleaner; majority are launch SKUs |

## Gate 1 status

**CONDITIONAL** — code companion on remediation branch; **ops PENDING**.

Production still serves pre-filter storefront. Even after tip deploy, residual published launch/`UNKNOWN` rows should be unpublished per runbook so admin catalog truth matches buyer experience.

## Operator actions (unchanged from runbook)

1. Admin → Products → active → unpublish or fix every `GLV-LAUNCH*` / `UNKNOWN` row.
2. After tip is deployed: re-verify `/store` shows zero launch/UNKNOWN and no zero-count industry facets.
3. Visual QA ≥5 SKUs at 375px and 1440px.

## Agent scope note

This workstream is **verify + status** only. Remote unpublish requires operator admin session; not performed by agent.
