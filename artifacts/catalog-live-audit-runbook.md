# Catalog live-data audit runbook (WS02)

**Date:** 2026-07-17  
**Source:** Production `https://www.glovecubs.com/store` (browser inventory) + remediation plan Gate 1  
**Base branch:** `remediate/quote-first-pilot`

## Live inventory snapshot (production)

| Observation | Count / examples | Action |
|---|---|---|
| Published listings | ~9 | Curate to credible set (≥20 preferred) or keep thin but clean |
| Launch SKUs (`GLV-LAUNCH-*`) | Multiple (e.g. `GLV-LAUNCH-JVOLXUM`, `GLV-LAUNCH-JVOB2RXL`) | **Unpublish** or renumber to real distributor SKUs before pilot |
| `SKU · UNKNOWN` | ≥1 (PE embossed grip S / parent `GLV-LAUNCH-JVMLXY`) | **Unpublish** until variant SKU set |
| Duplicate cards | Blue 4 mil M appears twice (distinct launch parents) | Dedupe / unpublish duplicate |
| Empty industry facets | Many industries at count 0 | Code hides zeros (WS03); do not imply coverage |
| Brands on live grid | Safety Zone® dominant; ProWorks (1) | OK if intentional |

## Required fields per published product

- Customer-credible variant SKU (not launch/unknown)
- Case quantity (`units_per_case`)
- UOM / unit noun
- Price state (list or request-pricing)
- Image (or explicit no-image policy)
- Brand + category

## Operator steps

1. Admin → Products → filter `status=active`.
2. For each launch/`UNKNOWN` SKU: set status `draft` (unpublish) OR replace SKU and re-run publish readiness.
3. Re-check `/store` — zero `GLV-LAUNCH` / `UNKNOWN` on cards.
4. Sign off sample of 5–10 products at 375px and 1440px.

## Code companion (WS03)

Storefront listing filters non-credible SKUs via `storefront-sku-credibility.ts` so residual bad rows cannot appear even if ops lag.
