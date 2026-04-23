# CatalogOS Attribute Dictionary Wiring — Audit Notes

## Overview

The attribute dictionary (attribute_definitions, attribute_allowed_values, category_attribute_requirements, attribute_value_synonyms) is now wired into ingestion, review, publish, and storefront paths. This document summarizes integration points and edge cases.

---

## 1. Ingestion

- **Source of truth:** `runNormalization()` uses `extractDisposableGloveAttributes` / `extractWorkGloveAttributes` with optional `synonymMap` from `loadSynonymMap()` (DB).
- **Synonym layer:** In-memory fallback (`synonym-normalize.ts`) is used when DB map has no entry; DB synonyms are loaded once per batch and passed to all rows.
- **Unmapped values:** Never silently accepted; recorded in `unmapped` and surfaced as `unmapped_value` review flags.
- **Category validation:** `validateAttributesByCategory()` runs before staging; missing required → error flags, missing strongly preferred → warning flags.
- **Staging payload:** `buildStagingPayload()` produces Zod-validated payload with `filter_attributes`, `review_flags`, and legacy `name`/`sku`/`cost` for the review UI.

### Edge cases

- **Empty synonym map:** If DB has no synonyms or query fails, `loadSynonymMap()` returns `{}`; in-memory synonyms still apply.
- **Category hint:** When category is ambiguous, `categoryHint` (e.g. `"disposable_gloves"`) drives which extractor runs; inference can still override for clear work-glove signals.
- **Brand:** Free text; not validated against allowed values; required for disposable/work gloves per validation.

---

## 2. Review

- **Required vs preferred:** `getAttributeRequirementsForStaged(normalizedId)` loads requirement levels from `category_attribute_requirements`; StagedProductDetail shows "Required" / "Preferred" badges per attribute.
- **Edit validation:** `updateNormalizedAttributes()` loads `getReviewDictionaryForCategory(categoryId)` and validates each attribute value against `allowedByKey`; invalid value returns clear error (e.g. "Invalid value for material: 'silk'. Allowed: nitrile, latex, …").
- **Multi-select:** `isMultiSelectAttribute(key)` identifies industries/compliance_certifications; validation checks each array element against allowed values; stored as comma-separated in DB and in `filter_attributes`.
- **Category resolution:** Category for requirements is resolved from `master_product_id` → product.category_id, or from `normalized_data.category_slug` / `category` via `getCategoryIdBySlug()`.

### Edge cases

- **No category:** If staged row has no category_slug and no master product, requirement payload returns empty arrays; no badges shown; attribute updates are not validated against dictionary (allowed to support legacy rows).
- **Brand edits:** Brand is not in allowedByKey; validation skips it (free text).

---

## 3. Publish

- **Required check:** `runPublish()` calls `loadRequirementsForCategory(categoryId)` and checks that `stagedFilterAttributes` has a non-empty value for every required attribute; if any missing, returns `{ success: false, error: "Cannot publish: missing required attributes for …: material, size. Set them in review before publishing." }`.
- **Attribute sync:** `syncProductAttributesFromStaged()` uses `getAttributeDefinitionIds(categoryId, keys)` so only attributes defined for that category are synced; single-select overwrites; multi-select stored as comma-separated in one row.

### Edge cases

- **Category slug missing:** Default `disposable_gloves` used for categoryId resolution; if category not in DB, `categoryId` is null and required check is skipped (publish can proceed; attribute sync may still resolve definitions by key elsewhere).
- **Stale product_attributes:** If an attribute is removed from staged payload and republished, the existing product_attribute row is not deleted (by design; avoids deleting attributes added by other suppliers). Future enhancement: optional "replace all attributes for this product" mode.

---

## 4. Storefront

- **Facet counts:** `getFacetCounts()` uses `product_attributes` and `getAttributeDefinitionIdsByKey()`; counts reflect current filtered result set.
- **Facet definitions:** GET `/api/catalog/facets` returns `facet_definitions` from `loadFacetDefinitionsForCategory(categoryId)` (display_group, sort_order, cardinality) so the UI can order and group filters.
- **Brand / price:** Brand is a special case (free text; facet counts from product_attributes or brand table as implemented). Price range uses `getPriceBounds()` from supplier_offers.

### Edge cases

- **Multiple categories in result:** When no category filter is applied, facet_definitions are for default category (e.g. disposable_gloves); mixed-category catalogs may need multi-category facet metadata in a future iteration.
- **Empty result set:** Facet counts and price_bounds are for the filtered set; if no products match, counts are empty and price_bounds may be { min: 0, max: 0 }.

---

## 5. Synonym / normalization source of truth

- **DB first:** `loadSynonymMap()` loads `attribute_value_synonyms` joined with `attribute_definitions` to key by attribute_key; cached 1 minute.
- **Merge:** Call sites pass DB map into `lookupAllowed(…, synonymMap)`; `normalizeAttributeValue(attributeKey, rawValue, dbSynonymMap)` uses DB map first, then in-memory `IN_MEMORY_SYNONYM_MAP`.
- **Single source of truth:** DB is authoritative when present; in-memory map is fallback and for tests. To add synonyms, insert into `attribute_value_synonyms`; run `invalidateDictionaryCache()` if needed to force reload.

### Edge cases

- **Duplicate keys across categories:** Synonym map is keyed by attribute_key only (all categories merged); same key (e.g. "size") shares one map. No conflict as long as normalized values are in the shared allowed set.
- **Cache invalidation:** After admin changes to attribute_value_synonyms or attribute_definitions, call `invalidateDictionaryCache()` so next request gets fresh data.

---

## 6. Tests

- **normalization-engine.test.ts:** Covers synonym lookup (including optional synonymMap), extraction (disposable and work gloves), unmapped flags, required validation, runNormalization, staging payload.
- **New:** Tests for `lookupAllowed` with optional DB synonymMap and `extractDisposableGloveAttributes(row, { synonymMap })` to ensure dictionary path is exercised.

---

## Summary

| Path           | Dictionary usage                                                                 | Blocking vs warning                          |
|----------------|-----------------------------------------------------------------------------------|----------------------------------------------|
| Ingestion      | Synonyms (DB + in-memory), allowed values, required/strongly preferred validation | Missing required → error flags               |
| Review         | Requirements for badges; allowed values for edit validation                       | Invalid edit → error response                |
| Publish        | Required attributes check; attribute_definitions for sync                         | Missing required → publish fails with message |
| Storefront     | attribute_definitions for facet defs; product_attributes for counts               | N/A                                          |

All paths use the same DB tables; no parallel dictionary system. Naming is consistent (attribute_key, requirement_level, display_group, sort_order). Disposable gloves and reusable work gloves are the primary supported categories.
