# GloveCubs production hardening checklist

This document maps **critical flows** to **safeguards**, **logging**, **validation**, and **automated tests**. Use it for release gates, on-call playbooks, and incremental hardening work.

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Automated test coverage exists (see path) |
| 🔧 | Partial coverage or manual verification required |
| 📋 | Documented expectation; implement monitoring/alerts |

---

## 1. Supplier import idempotency

| Check | Safeguard | Logging / errors | Tests |
|-------|-----------|------------------|-------|
| Raw row identity within a batch | `external_id` derived from stable fields (`id`, `sku`, `item_number`, …) or row index; DB uniqueness per batch if enforced | Invalid/missing batch or empty rows: `insertRawRows` returns early + `logValidationFailure` | ✅ `catalogos/src/lib/ingestion/external-id.test.ts` |
| Re-import same feed | New batch → new raw rows (immutability). Same `external_id` in **same** batch should rely on DB unique constraint + surfaced error | `logIngestionFailure` on insert failures in pipeline callers | 🔧 Add integration test with test DB when available |
| Offer upsert | `(supplier_id, product_id, supplier_sku)` upsert; skip if existing offer tied to **newer** batch | `logOfferUpsertFailure` on DB error | 🔧 `offer-service` (see code + future integration test) |
| Catalog expansion promotion | Idempotent when already promoted (`promotion-service`) | — | ✅ `catalogos/src/lib/catalog-expansion/promotion-service.test.ts` |

**Operator actions:** On duplicate-key storms, inspect `import_batches` + `supplier_products_raw.external_id` for collisions.

---

## 2. Normalization correctness

| Check | Safeguard | Tests |
|-------|-----------|-------|
| Attribute extraction | Rules + schema alignment | ✅ `catalogos/src/lib/normalization/normalization-engine.test.ts`, `normalization-utils` usage |
| Category / dictionary | `parse_safe` / `stage_safe` / `publish_safe` | ✅ `catalogos/src/lib/catalogos/validation-modes.test.ts` |
| Thickness / migration edge cases | — | ✅ `catalogos/src/lib/migrations/thickness-7-plus.test.ts` |

---

## 3. Product matching

| Check | Safeguard | Tests |
|-------|-----------|-------|
| Scoring thresholds | Matcher configuration + review queue for low confidence | ✅ `catalogos/src/lib/product-matching/scoring.test.ts` |
| Candidate persistence | Upsert match candidates | 🔧 Integration |

---

## 4. Variant resolution

| Check | Safeguard | Tests |
|-------|-----------|-------|
| Family inference | `family_group_key`, base SKU / size | ✅ `catalogos/src/lib/variant-family/family-inference.test.ts` |
| Resolution graph | Approve/reject candidates | 🔧 E2E optional |

---

## 5. Publish workflow

| Check | Safeguard | Logging | Tests |
|-------|-----------|---------|-------|
| Dictionary + case-cost | `publishSafe`, case-only sell rule | `logPublishFailure` in pipeline | ✅ `publish-service.test.ts`, `validation-modes.test.ts` |
| Pre-flight (admin) | `evaluatePublishReadiness` before `runPublish` | — | ✅ `catalogos/src/lib/review/publish-guards.test.ts` |
| Staging blocked heuristic | `isPublishBlocked` for bulk UI | — | ✅ `publish-blocked.test.ts` |
| API route | Auth / validation | — | ✅ `catalogos/src/app/api/publish/route.test.ts` |
| Attribute sync | No orphan attrs | ✅ `product-attribute-sync.test.ts` |

---

## 6. Search / filter queries

| Check | Safeguard | Tests |
|-------|-----------|-------|
| Review queue text search | Bounded fetch + in-memory filter (caps) | ✅ `catalogos/src/lib/review/staging-search.test.ts` |
| Catalog query builders | Param sanitization | ✅ `catalogos/src/lib/catalog/query.test.ts`, `catalogos/src/lib/catalog/search.test.ts` |
| Storefront search | — | ✅ `storefront/src/lib/catalog/search-query.test.ts`, `productSearch.test.ts` |

**Operator actions:** Watch review page latency when `q=` is used; tune `fetchLimit` in `getStagingRows` if needed.

---

## 7. Price calculations

| Check | Safeguard | Tests |
|-------|-----------|-------|
| Case cost normalization | Flags for inconsistent case qty | ✅ `catalogos/src/lib/pricing/case-cost-normalization.test.ts` |
| Publish input cost | `normalized_case_cost` vs legacy fields | ✅ `publish-service.test.ts` |

---

## 8. Inventory updates

| Check | Safeguard | Notes |
|-------|-----------|--------|
| `stock_status` in normalization | Extracted to normalized payload | 📋 No live stock decrement in CatalogOS path today; treat as **display / feed** field |
| Supplier portal commercial | Admin filters `in_stock` | 🔧 Align with `storefront` admin commercial queries |

**When inventory becomes transactional:** add optimistic locking, `logRpcFailure` on RPC, and integration tests for quantity deltas.

---

## 9. Cart and order (quote) creation

| Check | Safeguard | Logging / validation | Tests |
|-------|-----------|----------------------|-------|
| Quote basket quantities | Integer, clamped min/max, merge caps | localStorage parse rejects bad rows | ✅ `catalogos/src/lib/quotes/basket-store.test.ts` |
| Submit payload | Zod `submitQuoteRequestSchema` | — | ✅ `schemas.test.ts`, `quote-submit.test.ts` |
| Idempotency key | Passed to `create_quote_with_lines` RPC | — | ✅ `quote-submit.test.ts` |
| Rate limit | Per-email hourly cap | — | Service + 📋 monitor breaches |
| RPC failure | `logRpcFailure` before throw | — | 🔧 Assert log side effect in unit test optional |

**Orders:** If true checkout is added, mirror idempotency + payment webhook verification (not in CatalogOS quote flow today).

---

## 10. Admin edits

| Check | Safeguard | Logging | Tests |
|-------|-----------|---------|-------|
| Supplier offer patch | UUID validation + numeric bounds (`commerce-validation`) | `logAdminActionFailure` on bad input | ✅ `catalogos/src/lib/admin/commerce-validation.test.ts` |
| Publish / unpublish | Readiness + stale `updated_at` optional check | `admin_catalog_audit` + structured logs | 🔧 API contract tests |
| Attribute edits | Dictionary validation in `updateNormalizedAttributes` | — | Existing review action paths |

---

## 11. Cross-cutting: logging & telemetry

| Layer | Mechanism | Categories |
|-------|-----------|------------|
| CatalogOS server | `catalogos/src/lib/observability.ts` | `ingestion_failure`, `publish_failure`, `validation_failure`, `rpc_failure`, `api_failure`, `auth_failure`, `admin_action_failure`, `offer_upsert_failure` |
| Storefront | `storefront/src/lib/hardening/telemetry.ts` + tests | Ingestion / AI / recommendation errors |
| Sentry | High-severity paths | Wired from observability (best-effort) |

**Checklist:** 📋 Ensure production env has `NODE_ENV=production` for JSON logs; 📋 alert on error_telemetry rate by category.

---

## 12. Error handling & validation patterns

- **Never trust client input:** Zod at API boundaries (`quotes/schemas`, admin forms).
- **DB errors:** Map to stable user messages; log full detail server-side only.
- **Idempotency:** Prefer RPCs or unique constraints with clear conflict handling.
- **Retries:** Only for safe reads; writes should be idempotent or deduped by key.

---

## 13. Release gate (minimal)

Before production deploy:

1. `cd catalogos && npx vitest run` (fix failures in touched areas).
2. `cd storefront && npx vitest run` (same).
3. Run DB migrations; confirm `catalogos.admin_catalog_audit` (and RLS) if using admin audit.
4. Smoke: single-row import → normalize → match → publish → storefront visibility.
5. Smoke: quote submit with duplicate idempotency key returns same reference.

---

## 14. File index (quick reference)

| Area | Primary code |
|------|----------------|
| Raw insert / external id | `catalogos/src/lib/ingestion/raw-service.ts`, `ingestion/external-id.ts` |
| Offers | `catalogos/src/lib/ingestion/offer-service.ts` |
| Publish | `catalogos/src/lib/publish/publish-service.ts`, `publish-guards.ts` |
| Review data | `catalogos/src/lib/review/data.ts`, `staging-search.ts` |
| Quotes | `catalogos/src/lib/quotes/service.ts`, `schemas.ts`, `basket-store.ts` |
| Admin commerce validation | `catalogos/src/lib/admin/commerce-validation.ts` |

---

*Last updated: production hardening pass (tests + checklist). Extend this file when new subsystems ship.*
