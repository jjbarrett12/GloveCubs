# CatalogOS Publish + Storefront Filter — Staff Engineer Audit

## 1. Duplicate product_attributes

**Verdict: PASS**

- **Risk:** None. Upsert uses `onConflict: "product_id,attribute_definition_id"`; constraint `uq_product_attributes_product_attr` enforces uniqueness.
- **Patch:** None.

---

## 2. Incorrect multi-select sync

**Verdict: PASS**

- **Risk:** None. Arrays are stored as comma-separated `value_text`; one row per (product_id, attribute_definition_id); upsert overwrites.
- **Patch:** None.

---

## 3. Stale facet counts

**Verdict: PASS** (logic) / **WARN** (scale)

- **Risk:** Facet counts are computed from `getFilteredProductIds(params)` then `product_attributes` filtered by those IDs — so counts match the current result set. Logic is correct. At scale, `query.in("product_id", [...productIds])` with 10k+ IDs can hit URL/body limits or slow queries.
- **Patch (scale):** Prefer a single RPC or raw SQL that computes facet counts in-database for the same filter predicate, or paginate facet computation (e.g. by attribute key) and/or cap product ID set size for the IN clause.

---

## 4. Filter query correctness

**Verdict: FAIL** (multi-select)

- **Risk:** For multi-select, filter uses `value_text.ilike.%${v}%`. That matches substrings: e.g. `"car"` matches `"automotive"` or `"healthcare"`; `"car"` in industries could false-positive. Values are from the dictionary, but if a value is ever a substring of another, results are wrong.
- **Patch:** Match multi-select values as whole segments in the comma-separated list (e.g. `value_text = 'v' OR value_text LIKE 'v,%' OR value_text LIKE '%,v,%' OR value_text LIKE '%,v'`), or use a Postgres array and `&&`. Exact patch below.

---

## 5. Price range bugs

**Verdict: PASS**

- **Risk:** Price filter uses min(cost) per product and intersects with attribute-filtered IDs. Products with no offers are excluded from the catalog (no row in supplier_offers); that’s consistent. No bug found.
- **Patch:** None.

---

## 6. Duplicate supplier offers

**Verdict: PASS**

- **Risk:** None. Upsert uses `onConflict: "supplier_id,product_id,supplier_sku"`; constraint `uq_supplier_offers_supplier_product_sku` enforces uniqueness.
- **Patch:** None.

---

## 7. Non-idempotent publish behavior

**Verdict: PASS**

- **Risk:** Re-publish updates the same product, same offer (upsert), same attribute rows (upsert). No duplicate product_attributes or supplier_offers; publish_events append. Idempotent.
- **Patch:** None.

---

## 8. Review approvals that do not actually publish

**Verdict: FAIL**

- **Risk:** `ReviewActionModal` calls `approveMatch(normalizedId, masterProductId)` and `createNewMasterProduct(normalizedId, {...})` with no third argument. So `options?.publishToLive` is always undefined and publish never runs. Approving in the UI never publishes to live.
- **Patch:** Add a “Publish to live catalog” checkbox (or default) and pass `{ publishToLive: true }` when checked. Exact patch below.

---

## 9. Missing traceability

**Verdict: PASS**

- **Risk:** `supplier_offers` has `raw_id`, `normalized_id`; `publish_events` has `normalized_id`, `product_id`, `published_by`. Traceability from live product back to staged and raw is present.
- **Patch:** None.

---

## 10. Performance problems with faceted filtering at scale

**Verdict: FAIL** (sort) / **WARN** (filter + facets)

- **Risk:**
  - **Sort:** `price_asc` / `price_desc` are applied in-memory to the current page of products only. Total count and page offsets are based on DB order (e.g. newest). So “page 2” is not the second page of price-sorted results; sort is wrong for price.
  - **Filter:** `getFilteredProductIds` does one round-trip per filter key (getAttributeDefinitionIdsByKey + productIdsForFilter). With 5 filters that’s 10+ queries before the main products query. At scale this is slow.
  - **Facets:** As in (3), large `IN (product_id list)` can be slow or hit limits.
- **Patch:** (1) For price sort: resolve best price per product in DB (subquery or join), order by that in the main query, then paginate. (2) Consider a single RPC that accepts filter JSON and returns product IDs (and optionally facet counts) in one round-trip.

---

## Summary

| # | Area | Verdict | Action |
|---|------|---------|--------|
| 1 | Duplicate product_attributes | PASS | — |
| 2 | Multi-select sync | PASS | — |
| 3 | Stale facet counts | PASS / WARN | Optional: RPC or limit IN size |
| 4 | Filter query correctness | FAIL → **PATCHED** | Multi-select: segment match (eq + like with comma boundaries) |
| 5 | Price range | PASS | — |
| 6 | Duplicate supplier offers | PASS | — |
| 7 | Idempotent publish | PASS | — |
| 8 | Review → publish | FAIL → **PATCHED** | UI: "Publish to live catalog" checkbox; pass `{ publishToLive, publishedBy }` |
| 9 | Traceability | PASS | — |
| 10 | Performance (sort + scale) | FAIL → **PATCHED** | Price sort: full ID list sorted by min(cost), then paginate and fetch page |

## Patches applied

1. **lib/catalog/query.ts** — `productIdsForFilter`: for multi-select, use segment match (value_text.eq.v, value_text.like.v,%, value_text.like.%,v,%, value_text.like.%,v) instead of ilike.%v%.
2. **components/review/ReviewActionModal.tsx** — Added `publishToLive` state (default true), checkbox "Publish to live catalog", and pass `{ publishToLive, publishedBy: "admin" }` to approveMatch, createNewMasterProduct, mergeWithStaged.
3. **lib/catalog/query.ts** — When sort is price_asc/price_desc: resolve full filtered ID list, get min cost per product, sort IDs by cost, slice page, then fetch products for that page so pagination is correct.
