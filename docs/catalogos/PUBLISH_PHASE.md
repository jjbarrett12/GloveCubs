# Publish Phase: Approved Staged → Live Catalog

When a staged product is approved, it becomes a live product with synced attributes and supplier offers, and powers storefront filtering.

## Architecture Overview

```
supplier_products_normalized (approved)
         │
         ▼ buildPublishInputFromStaged()
    PublishInput
         │
         ▼ runPublish()
    ┌────┴────┐
    │ publishSafe │  ← blocks if required attributes missing
    └────┬────┘
         │
         ├─► products (create or update master)
         ├─► product_attributes (sync filter attributes; upsert by product_id + attribute_definition_id)
         ├─► supplier_offers (upsert by supplier_id + product_id + supplier_sku)
         └─► publish_events (insert audit row)
```

- **Idempotency**: Re-publish updates the same product and offer; no duplicate attribute rows or offers.
- **Traceability**: Each supplier_offer stores raw_id and normalized_id; publish_events links normalized_id → product_id.
- **Attribute sync**: Single-select = one row per (product, attribute), overwrite. Multi-select = one row, value_text comma-separated; overwrite (no stale rows).
- **Validation**: Required attributes block publish (publishSafe). Strongly preferred missing only add warnings.

## File Changes

| Area | File | Purpose |
|------|------|---------|
| Publish | `src/lib/publish/publish-service.ts` | runPublish, buildPublishInputFromStaged; publishSafe + stageSafe warnings |
| Publish | `src/lib/publish/product-attribute-sync.ts` | syncProductAttributesFromStaged; getAttributeDefinitionIds(ByKey) |
| Publish | `src/lib/publish/types.ts` | PublishInput, PublishResult |
| Review | `src/app/actions/review.ts` | approveMatch, createNewMasterProduct, mergeWithStaged, publishStagedToLive; all call runPublish when publishToLive |
| Storefront | `src/lib/catalog/query.ts` | listLiveProducts, getFilteredProductIds, getProductBySlug |
| Storefront | `src/lib/catalog/facets.ts` | getFacetCounts, getPriceBounds |
| Storefront | `src/lib/catalog/types.ts` | StorefrontFilterParams, LiveProductItem, ProductListPayload, FacetCounts |
| Storefront | `src/lib/catalog/filter-ui-contract.ts` | StorefrontFilterUIContract |
| API | `src/app/api/catalog/products/route.ts` | GET list with filters, pagination, sort |
| API | `src/app/api/catalog/facets/route.ts` | GET facets + price_bounds + facet_definitions |
| API | `src/app/api/catalog/route.ts` | GET combined: products + facets + selected_filters + pagination + price_bounds |

## Attribute Sync Rules

- **Single-select**: One row per (product_id, attribute_definition_id). Upsert overwrites value_text/value_number/value_boolean.
- **Multi-select** (e.g. industries, compliance_certifications): Same one row; value_text = comma-separated list. Upsert overwrites, so no stale values.
- Values must be in attribute_definitions / attribute_allowed_values for the product’s category (enforced at staging/validation). Publish does not re-validate allowed values; sync writes what’s in staged filter_attributes.
- **Publish fails** if required attributes are missing (publishSafe). **Strongly preferred** missing only produce warnings in PublishResult.

## Review Integration

- **Approve to existing master**: Sets status approved, master_product_id; if `publishToLive` → runPublish(masterProductId).
- **Create new master**: Inserts product, sets master_product_id on normalized row; if `publishToLive` → runPublish(masterProductId) (update product, sync attributes, upsert offer).
- **Merge**: Sets status merged, master_product_id; if `publishToLive` → runPublish(masterProductId).
- **Re-publish after edit**: `publishStagedToLive(normalizedId)` builds input from current row and runs runPublish; idempotent.

## Storefront Query Layer

- **listLiveProducts(params)**: Applies category + all filter attributes (product_attributes), price_min/max (supplier_offers.cost), pagination, sort (price_asc, price_desc, newest). Returns items with best_price and supplier_count per product.
- **getFilteredProductIds(params)**: Returns Set of product IDs matching all filters (used by listLiveProducts and getFacetCounts).
- **getFacetCounts(params)**: Counts per attribute value for the current filtered result set; excludes thickness_mil = "7_plus".
- **getPriceBounds(params)**: Min/max cost from supplier_offers for filtered products.

## API Contract

- **GET /api/catalog/products**: Query params → StorefrontFilterParams. Returns ProductListPayload (items, total, page, limit, total_pages).
- **GET /api/catalog/facets**: Same params. Returns { facets, price_bounds, facet_definitions }.
- **GET /api/catalog**: Same params. Returns full StorefrontFilterUIContract: products, selected_filters, available_facets, price_bounds, pagination (and optional facet_definitions).

## Hardening

- **Duplicate product_attributes**: Prevented by upsert on (product_id, attribute_definition_id).
- **Duplicate supplier_offers**: Prevented by upsert on (supplier_id, product_id, supplier_sku).
- **Traceability**: supplier_offers.raw_id, normalized_id; publish_events.normalized_id, product_id.
- **Re-publish**: Same input → same product and offer; attributes overwritten; event row added each time.

## Performance and indexing

- **product_attributes**: Index on (attribute_definition_id, value_text) for filter queries; index on (product_id) for per-product fetch. Unique (product_id, attribute_definition_id) for upsert.
- **supplier_offers**: Index on (product_id), (supplier_id), (is_active) WHERE is_active = true. Unique (supplier_id, product_id, supplier_sku) for upsert.
- **products**: Index on (category_id), (is_active), (published_at DESC) for listing and sort.
- **Facet counts**: getFacetCounts runs one query per attribute key over product_attributes filtered by getFilteredProductIds; for large catalogs consider materialized views or cached facet counts per filter state.
- **Price sort**: listLiveProducts fetches min cost per product for filtered IDs then sorts in memory; scale by limiting filter result size or pre-aggregating best price per product.
